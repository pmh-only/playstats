import type { Document } from "mongodb";
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
  }>;
  hours: Array<{
    hour: number;
    plays: number;
  }>;
  topArtists: Array<{
    id: string;
    name: string;
    plays: number;
    durationMs: number;
  }>;
}

export interface PlayStats {
  timezone: string;
  periods: Record<StatsPeriod, PeriodStats>;
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
  }>;
  hours: Array<{ _id: number; plays: number }>;
  topArtists: Array<{
    _id: string;
    name: string;
    plays: number;
    durationMs: number;
  }>;
}

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
  ];
}

export async function getPlayStats(publicToken?: string): Promise<PlayStats | null> {
  const database = await getDatabase();
  const user = await findStatsUser(database, publicToken);
  if (!user) return null;

  const timezone = user.settings?.timezone || "UTC";
  const facets = Object.fromEntries(
    statsPeriods.flatMap((period) => buildPeriodFacets(period, timezone)),
  );
  const result = await database
    .collection("infos")
    .aggregate<Record<string, Document[]>>([
      {
        $match: {
          owner: user._id,
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
        topArtists: (result?.[`${period}TopArtists`] ?? []) as RawPeriodStats["topArtists"],
      };
      const summary = data.summary[0];
      const playsByHour = new Map(
        data.hours.map((entry) => [entry._id, entry.plays]),
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
          })),
          hours: Array.from({ length: 24 }, (_, hour) => ({
            hour,
            plays: playsByHour.get(hour) ?? 0,
          })),
          topArtists: data.topArtists.map((entry) => ({
            id: entry._id,
            name: entry.name,
            plays: entry.plays,
            durationMs: entry.durationMs,
          })),
        },
      ];
    }),
  ) as Record<StatsPeriod, PeriodStats>;

  return { timezone, periods };
}
