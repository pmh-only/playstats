import type { Db, Document, ObjectId } from "mongodb";
import { findStatsUser, getDatabase } from "./database";

export const statsPeriods = ["today", "week", "month", "year", "all"] as const;
export type StatsPeriod = (typeof statsPeriods)[number];

export interface PeriodStats {
  totals: {
    plays: number;
    durationMs: number;
    tracks: number;
    artists: number;
  };
  timeline: Array<{
    date: string;
    plays: number;
    durationMs: number;
    tracks: number;
    artists: number;
  }>;
  hours: Array<{
    hour: number;
    plays: number;
  }>;
  weekdays: Array<{
    day: number;
    plays: number;
    durationMs: number;
  }>;
  topArtists: Array<{
    id: string;
    name: string;
    plays: number;
    durationMs: number;
  }>;
  topTracks: Array<{
    id: string;
    name: string;
    plays: number;
    durationMs: number;
  }>;
}

export interface PlayStats {
  timezone: string;
  periods: Record<StatsPeriod, PeriodStats>;
  race: Array<{
    date: string;
    items: Array<{ id: string; name: string; plays: number }>;
  }>;
}

interface RawPeriodStats {
  summary: Array<{
    plays: number;
    durationMs: number;
    tracks: number;
    artists: number;
  }>;
  timeline: Array<{
    _id: Date;
    plays: number;
    durationMs: number;
    tracks: number;
    artists: number;
  }>;
  hours: Array<{ _id: number; plays: number }>;
  weekdays: Array<{ _id: number; plays: number; durationMs: number }>;
  topArtists: Array<{
    _id: string;
    name: string;
    plays: number;
    durationMs: number;
  }>;
  topTracks: Array<{
    _id: string;
    name: string;
    plays: number;
    durationMs: number;
  }>;
}

interface StatsCacheDocument {
  owner: ObjectId;
  timezone: string;
  version: number;
  stats?: PlayStats;
  requestedAt: Date;
  updatedAt?: Date;
}

const statsCacheVersion = 2;
let cacheIndexesPromise: Promise<string> | undefined;

const periodConfig: Record<
  StatsPeriod,
  { rangeUnit?: "day" | "week" | "month" | "year"; bucketUnit: string }
> = {
  today: { rangeUnit: "day", bucketUnit: "hour" },
  week: { rangeUnit: "week", bucketUnit: "day" },
  month: { rangeUnit: "month", bucketUnit: "day" },
  year: { rangeUnit: "year", bucketUnit: "month" },
  all: { bucketUnit: "year" },
};

function buildPeriodFacets(
  period: StatsPeriod,
  timezone: string,
): Array<[string, Document[]]> {
  const { rangeUnit, bucketUnit } = periodConfig[period];
  const rangePipeline: Document[] = [];

  if (rangeUnit) {
    const dateTrunc: Document = {
      date: "$$NOW",
      unit: rangeUnit,
      timezone,
    };
    if (rangeUnit === "week") dateTrunc.startOfWeek = "monday";

    rangePipeline.push({
      $match: {
        $expr: {
          $gte: ["$played_at", { $dateTrunc: dateTrunc }],
        },
      },
    });
  }

  return [
    [
      `${period}Summary`,
      [
        ...rangePipeline,
        {
          $group: {
            _id: null,
            plays: { $sum: 1 },
            durationMs: { $sum: { $ifNull: ["$durationMs", 0] } },
            tracks: { $addToSet: "$id" },
            artists: { $addToSet: "$primaryArtistId" },
          },
        },
        {
          $project: {
            _id: 0,
            plays: 1,
            durationMs: 1,
            tracks: { $size: "$tracks" },
            artists: { $size: { $setDifference: ["$artists", [null]] } },
          },
        },
      ],
    ],
    [
      `${period}Timeline`,
      [
        ...rangePipeline,
        {
          $group: {
            _id: {
              $dateTrunc: {
                date: "$played_at",
                unit: bucketUnit,
                timezone,
                ...(bucketUnit === "week" ? { startOfWeek: "monday" } : {}),
              },
            },
            plays: { $sum: 1 },
            durationMs: { $sum: { $ifNull: ["$durationMs", 0] } },
            tracks: { $addToSet: "$id" },
            artists: { $addToSet: "$primaryArtistId" },
          },
        },
        {
          $project: {
            plays: 1,
            durationMs: 1,
            tracks: { $size: "$tracks" },
            artists: { $size: { $setDifference: ["$artists", [null]] } },
          },
        },
        { $sort: { _id: 1 } },
      ],
    ],
    [
      `${period}Weekdays`,
      [
        ...rangePipeline,
        {
          $group: {
            _id: { $isoDayOfWeek: { date: "$played_at", timezone } },
            plays: { $sum: 1 },
            durationMs: { $sum: { $ifNull: ["$durationMs", 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ],
    ],
    [
      `${period}Hours`,
      [
        ...rangePipeline,
        {
          $group: {
            _id: { $hour: { date: "$played_at", timezone } },
            plays: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ],
    ],
    [
      `${period}TopArtists`,
      [
        ...rangePipeline,
        { $match: { primaryArtistId: { $type: "string" } } },
        {
          $group: {
            _id: "$primaryArtistId",
            plays: { $sum: 1 },
            durationMs: { $sum: { $ifNull: ["$durationMs", 0] } },
          },
        },
        { $sort: { plays: -1, _id: 1 } },
        { $limit: 8 },
        {
          $lookup: {
            from: "artists",
            localField: "_id",
            foreignField: "id",
            as: "artist",
          },
        },
        {
          $project: {
            plays: 1,
            durationMs: 1,
            name: {
              $ifNull: [{ $first: "$artist.name" }, "Unknown artist"],
            },
          },
        },
      ],
    ],
    [
      `${period}TopTracks`,
      [
        ...rangePipeline,
        {
          $group: {
            _id: "$id",
            plays: { $sum: 1 },
            durationMs: { $sum: { $ifNull: ["$durationMs", 0] } },
          },
        },
        { $sort: { plays: -1, _id: 1 } },
        { $limit: 8 },
        {
          $lookup: {
            from: "tracks",
            localField: "_id",
            foreignField: "id",
            as: "track",
          },
        },
        {
          $project: {
            plays: 1,
            durationMs: 1,
            name: {
              $ifNull: [{ $first: "$track.name" }, "Unknown track"],
            },
          },
        },
      ],
    ],
  ];
}

function resolveTimezone(...candidates: Array<string | undefined>): string {
  let timezone = "UTC";
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
      timezone = candidate;
      break;
    } catch {
      // Ignore invalid client or persisted timezone names.
    }
  }
  return timezone;
}

async function calculatePlayStats(
  database: Db,
  owner: ObjectId,
  timezone: string,
): Promise<PlayStats> {
  const facets = {
    ...Object.fromEntries(
      statsPeriods.flatMap((period) => buildPeriodFacets(period, timezone)),
    ),
    race: [
      {
        $group: {
          _id: {
            date: {
              $dateTrunc: { date: "$played_at", unit: "month", timezone },
            },
            track: "$id",
          },
          plays: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ],
  };
  const result = await database
    .collection("infos")
    .aggregate<Record<string, Document[]>>([
      {
        $match: {
          owner,
          blacklistedBy: { $exists: false },
          played_at: { $type: "date" },
          id: { $type: "string" },
        },
      },
      { $facet: facets },
    ])
    .next();

  const periods = Object.fromEntries(
    statsPeriods.map((period) => {
      const data: RawPeriodStats = {
        summary: (result?.[`${period}Summary`] ?? []) as RawPeriodStats["summary"],
        timeline: (result?.[`${period}Timeline`] ?? []) as RawPeriodStats["timeline"],
        hours: (result?.[`${period}Hours`] ?? []) as RawPeriodStats["hours"],
        weekdays: (result?.[`${period}Weekdays`] ?? []) as RawPeriodStats["weekdays"],
        topArtists: (result?.[`${period}TopArtists`] ?? []) as RawPeriodStats["topArtists"],
        topTracks: (result?.[`${period}TopTracks`] ?? []) as RawPeriodStats["topTracks"],
      };
      const summary = data.summary[0];
      const playsByHour = new Map(
        data.hours.map((entry) => [entry._id, entry.plays]),
      );
      const playsByWeekday = new Map(
        data.weekdays.map((entry) => [entry._id, entry]),
      );

      return [
        period,
        {
          totals: {
            plays: summary?.plays ?? 0,
            durationMs: summary?.durationMs ?? 0,
            tracks: summary?.tracks ?? 0,
            artists: summary?.artists ?? 0,
          },
          timeline: data.timeline.map((entry) => ({
            date: entry._id.toISOString(),
            plays: entry.plays,
            durationMs: entry.durationMs,
            tracks: entry.tracks,
            artists: entry.artists,
          })),
          hours: Array.from({ length: 24 }, (_, hour) => ({
            hour,
            plays: playsByHour.get(hour) ?? 0,
          })),
          weekdays: Array.from({ length: 7 }, (_, index) => {
            const day = index + 1;
            const entry = playsByWeekday.get(day);
            return {
              day,
              plays: entry?.plays ?? 0,
              durationMs: entry?.durationMs ?? 0,
            };
          }),
          topArtists: data.topArtists.map((entry) => ({
            id: entry._id,
            name: entry.name,
            plays: entry.plays,
            durationMs: entry.durationMs,
          })),
          topTracks: data.topTracks.map((entry) => ({
            id: entry._id,
            name: entry.name,
            plays: entry.plays,
            durationMs: entry.durationMs,
          })),
        },
      ];
    }),
  ) as Record<StatsPeriod, PeriodStats>;

  const cumulative = new Map<string, number>();
  const raceIds = new Set<string>();
  const raceFrames: Array<{
    date: Date;
    items: Array<{ id: string; plays: number }>;
  }> = [];
  const groupedRace = new Map<string, Document[]>();
  for (const entry of result?.race ?? []) {
    const key = entry._id.date.toISOString();
    const entries = groupedRace.get(key) ?? [];
    entries.push(entry);
    groupedRace.set(key, entries);
  }
  for (const [date, entries] of groupedRace) {
    for (const entry of entries) {
      cumulative.set(
        entry._id.track,
        (cumulative.get(entry._id.track) ?? 0) + entry.plays,
      );
    }
    const items = [...cumulative]
      .map(([id, plays]) => ({ id, plays }))
      .sort((left, right) => right.plays - left.plays || left.id.localeCompare(right.id))
      .slice(0, 12);
    items.forEach((item) => raceIds.add(item.id));
    raceFrames.push({ date: new Date(date), items });
  }
  const raceTracks = await database
    .collection("tracks")
    .find(
      { id: { $in: [...raceIds] } },
      { projection: { _id: 0, id: 1, name: 1 } },
    )
    .toArray();
  const raceNames = new Map(
    raceTracks.map((track) => [track.id, track.name || "Unknown track"]),
  );
  const race = raceFrames.map((frame) => ({
    date: frame.date.toISOString(),
    items: frame.items.map((item) => ({
      ...item,
      name: raceNames.get(item.id) || "Unknown track",
    })),
  }));

  return { timezone, periods, race };
}

function ensureStatsCacheIndexes(database: Db): Promise<string> {
  cacheIndexesPromise ??= database
    .collection("playstatsStatsCache")
    .createIndex(
      { owner: 1, timezone: 1, version: 1 },
      { unique: true, name: "owner_timezone_version" },
    )
    .catch((error) => {
      cacheIndexesPromise = undefined;
      throw error;
    });
  return cacheIndexesPromise;
}

export async function getPlayStats(
  publicToken?: string,
  requestedTimezone?: string,
): Promise<PlayStats | null> {
  const database = await getDatabase();
  const user = await findStatsUser(database, publicToken);
  if (!user) return null;
  const timezone = resolveTimezone(
    requestedTimezone,
    user.settings?.timezone,
    "UTC",
  );
  return calculatePlayStats(database, user._id, timezone);
}

export async function getCachedPlayStats(
  publicToken?: string,
  requestedTimezone?: string,
): Promise<PlayStats | null> {
  const database = await getDatabase();
  const user = await findStatsUser(database, publicToken);
  if (!user) return null;
  const timezone = resolveTimezone(
    requestedTimezone,
    user.settings?.timezone,
    "UTC",
  );
  const cache = database.collection<StatsCacheDocument>("playstatsStatsCache");
  await ensureStatsCacheIndexes(database);

  const key = { owner: user._id, timezone, version: statsCacheVersion };
  const cached = await cache.findOne(key);
  await cache.updateOne(
    key,
    {
      $set: { requestedAt: new Date() },
      $setOnInsert: key,
    },
    { upsert: true },
  );
  if (cached?.stats) return cached.stats;

  const stats = await calculatePlayStats(database, user._id, timezone);
  await cache.updateOne(key, {
    $set: { stats, requestedAt: new Date(), updatedAt: new Date() },
  });
  return stats;
}

export async function refreshStatsCache(): Promise<number> {
  const database = await getDatabase();
  await ensureStatsCacheIndexes(database);
  const cache = database.collection<StatsCacheDocument>("playstatsStatsCache");
  const users = await database
    .collection<{
      _id: ObjectId;
      settings?: { timezone?: string };
    }>("users")
    .find({}, { projection: { _id: 1, "settings.timezone": 1 } })
    .toArray();
  const requestedSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const requested = await cache
    .find(
      { version: statsCacheVersion, requestedAt: { $gte: requestedSince } },
      { projection: { owner: 1, timezone: 1 } },
    )
    .toArray();
  const targets = new Map<string, { owner: ObjectId; timezone: string }>();

  for (const user of users) {
    for (const timezone of [
      process.env.TIMEZONE,
      user.settings?.timezone,
      "UTC",
    ]) {
      const resolved = resolveTimezone(timezone, "UTC");
      targets.set(`${user._id.toHexString()}:${resolved}`, {
        owner: user._id,
        timezone: resolved,
      });
    }
  }
  for (const entry of requested) {
    targets.set(`${entry.owner.toHexString()}:${entry.timezone}`, {
      owner: entry.owner,
      timezone: entry.timezone,
    });
  }

  for (const target of targets.values()) {
    const stats = await calculatePlayStats(
      database,
      target.owner,
      target.timezone,
    );
    const key = {
      owner: target.owner,
      timezone: target.timezone,
      version: statsCacheVersion,
    };
    await cache.updateOne(
      key,
      {
        $set: { stats, updatedAt: new Date() },
        $setOnInsert: { ...key, requestedAt: new Date() },
      },
      { upsert: true },
    );
  }

  return targets.size;
}
