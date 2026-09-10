import type { Document } from "mongodb";
import { findStatsUser, getDatabase } from "./database";
import type { StatsPeriod } from "./stats";

export type RankingType = "songs" | "artists" | "albums";

const rangeUnits: Partial<Record<StatsPeriod, string>> = {
  today: "day",
  week: "week",
  month: "month",
  year: "year",
};

function validTimezone(timezone?: string): string {
  if (!timezone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return "UTC";
  }
}

function rangeMatch(period: StatsPeriod, timezone: string): Document[] {
  const unit = rangeUnits[period];
  if (!unit) return [];
  return [
    {
      $match: {
        $expr: {
          $gte: [
            "$played_at",
            {
              $dateTrunc: {
                date: "$$NOW",
                unit,
                timezone,
                ...(unit === "week" ? { startOfWeek: "monday" } : {}),
              },
            },
          ],
        },
      },
    },
  ];
}

export async function getRankings(
  type: RankingType,
  period: StatsPeriod,
  publicToken?: string,
  browserTimezone?: string,
) {
  const database = await getDatabase();
  const user = await findStatsUser(database, publicToken);
  if (!user) return null;
  const timezone = validTimezone(browserTimezone || user.settings?.timezone);
  const field =
    type === "songs" ? "$id" : type === "artists" ? "$primaryArtistId" : "$albumId";
  const collection =
    type === "songs" ? "tracks" : type === "artists" ? "artists" : "albums";
  const metadata = type === "songs" ? "track" : type === "artists" ? "artist" : "album";
  const results = await database
    .collection("infos")
    .aggregate([
      {
        $match: {
          owner: user._id,
          blacklistedBy: { $exists: false },
          played_at: { $type: "date" },
          [field.slice(1)]: { $type: "string" },
        },
      },
      ...rangeMatch(period, timezone),
      {
        $group: {
          _id: field,
          plays: { $sum: 1 },
          durationMs: { $sum: { $ifNull: ["$durationMs", 0] } },
          firstPlayedAt: { $min: "$played_at" },
          lastPlayedAt: { $max: "$played_at" },
        },
      },
      { $sort: { plays: -1, _id: 1 } },
      { $limit: 100 },
      {
        $lookup: {
          from: collection,
          localField: "_id",
          foreignField: "id",
          as: metadata,
        },
      },
      { $set: { [metadata]: { $first: `$${metadata}` } } },
      {
        $project: {
          plays: 1,
          durationMs: 1,
          firstPlayedAt: 1,
          lastPlayedAt: 1,
          name: `$${metadata}.name`,
          images: `$${metadata}.images`,
          albumId: `$${metadata}.album`,
          artistIds: `$${metadata}.artists`,
        },
      },
    ])
    .toArray();

  const artistIds = [
    ...new Set(results.flatMap((entry) => entry.artistIds ?? [])),
  ];
  const artists = await database
    .collection("artists")
    .find({ id: { $in: artistIds } }, { projection: { _id: 0, id: 1, name: 1 } })
    .toArray();
  const artistNames = new Map(artists.map((artist) => [artist.id, artist.name]));

  return {
    timezone,
    items: results.map((entry) => ({
      id: entry._id,
      name: entry.name || `Unknown ${type.slice(0, -1)}`,
      artists: (entry.artistIds ?? [])
        .map((id: string) => artistNames.get(id))
        .filter(Boolean),
      image: [...(entry.images ?? [])].sort(
        (left, right) => (right.width ?? 0) - (left.width ?? 0),
      )[0]?.url,
      plays: entry.plays,
      durationMs: entry.durationMs,
      firstPlayedAt: entry.firstPlayedAt,
      lastPlayedAt: entry.lastPlayedAt,
    })),
  };
}

export async function getLongestSessions(
  period: StatsPeriod,
  publicToken?: string,
  browserTimezone?: string,
) {
  const database = await getDatabase();
  const user = await findStatsUser(database, publicToken);
  if (!user) return null;
  const timezone = validTimezone(browserTimezone || user.settings?.timezone);
  const events = await database
    .collection("infos")
    .aggregate([
      {
        $match: {
          owner: user._id,
          blacklistedBy: { $exists: false },
          played_at: { $type: "date" },
          id: { $type: "string" },
        },
      },
      ...rangeMatch(period, timezone),
      { $sort: { played_at: 1 } },
      { $project: { _id: 0, id: 1, played_at: 1, durationMs: 1 } },
    ])
    .toArray();
  const sessions: Array<typeof events> = [];
  let current: typeof events = [];
  for (const event of events) {
    const previous = current[current.length - 1];
    if (
      previous &&
      event.played_at.getTime() - previous.played_at.getTime() > 10 * 60 * 1000
    ) {
      sessions.push(current);
      current = [];
    }
    current.push(event);
  }
  if (current.length > 0) sessions.push(current);
  const longest = sessions
    .filter((session) => session.length > 1)
    .sort(
      (left, right) =>
        right.reduce((sum, event) => sum + (event.durationMs ?? 0), 0) -
        left.reduce((sum, event) => sum + (event.durationMs ?? 0), 0),
    )
    .slice(0, 5);
  const trackIds = [...new Set(longest.flatMap((session) => session.map((event) => event.id)))];
  const tracks = await database
    .collection("tracks")
    .find({ id: { $in: trackIds } }, { projection: { _id: 0, id: 1, name: 1 } })
    .toArray();
  const trackNames = new Map(tracks.map((track) => [track.id, track.name]));

  return {
    timezone,
    sessions: longest.map((session) => ({
      start: session[0].played_at,
      end: session[session.length - 1].played_at,
      durationMs: session.reduce(
        (sum, event) => sum + (event.durationMs ?? 0),
        0,
      ),
      tracks: session.slice(0, 12).map((event) => ({
        id: event.id,
        name: trackNames.get(event.id) || "Unknown track",
      })),
      trackCount: session.length,
    })),
  };
}

export async function getEntityDetails(
  type: "song" | "artist" | "album",
  id: string,
  publicToken?: string,
  browserTimezone?: string,
) {
  const database = await getDatabase();
  const user = await findStatsUser(database, publicToken);
  if (!user) return null;
  const timezone = validTimezone(browserTimezone || user.settings?.timezone);
  const collection = type === "song" ? "tracks" : `${type}s`;
  const eventField = type === "song" ? "id" : type === "artist" ? "primaryArtistId" : "albumId";
  const entity = await database.collection(collection).findOne(
    { id },
    { projection: { _id: 0, id: 1, name: 1, images: 1, artists: 1 } },
  );
  if (!entity) return { timezone, entity: null };

  const [aggregation] = await database
    .collection("infos")
    .aggregate([
      {
        $match: {
          owner: user._id,
          blacklistedBy: { $exists: false },
          [eventField]: id,
          played_at: { $type: "date" },
        },
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                plays: { $sum: 1 },
                durationMs: { $sum: { $ifNull: ["$durationMs", 0] } },
                firstPlayedAt: { $min: "$played_at" },
                lastPlayedAt: { $max: "$played_at" },
                tracks: { $addToSet: "$id" },
                albums: { $addToSet: "$albumId" },
              },
            },
            {
              $project: {
                _id: 0,
                plays: 1,
                durationMs: 1,
                firstPlayedAt: 1,
                lastPlayedAt: 1,
                tracks: { $size: "$tracks" },
                albums: { $size: "$albums" },
              },
            },
          ],
          timeline: [
            {
              $group: {
                _id: {
                  $dateTrunc: {
                    date: "$played_at",
                    unit: "month",
                    timezone,
                  },
                },
                plays: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          tracks: [
            { $group: { _id: "$id", plays: { $sum: 1 } } },
            { $sort: { plays: -1 } },
            { $limit: 10 },
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
                name: {
                  $ifNull: [{ $first: "$track.name" }, "Unknown track"],
                },
              },
            },
          ],
        },
      },
    ])
    .toArray();
  const image = [...(entity.images ?? [])].sort(
    (left, right) => (right.width ?? 0) - (left.width ?? 0),
  )[0]?.url;

  return {
    timezone,
    entity: { id: entity.id, name: entity.name, image },
    summary: aggregation?.summary[0] ?? {
      plays: 0,
      durationMs: 0,
      tracks: 0,
      albums: 0,
    },
    timeline: (aggregation?.timeline ?? []).map((entry: Document) => ({
      date: entry._id,
      plays: entry.plays,
    })),
    tracks: (aggregation?.tracks ?? []).map((entry: Document) => ({
      id: entry._id,
      name: entry.name,
      plays: entry.plays,
    })),
  };
}
