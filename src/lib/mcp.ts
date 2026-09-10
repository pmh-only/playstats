import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  getEntityDetails,
  getLongestSessions,
  getRankings,
} from "./explore";
import {
  getCachedPlayStats,
  statsPeriods,
  type StatsPeriod,
} from "./stats";

const periodSchema = z.enum(statsPeriods);
const timezoneSchema = z
  .string()
  .optional()
  .describe("IANA timezone name, such as America/New_York. Defaults to the user's timezone.");

function resultContent(result: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}

function notFoundContent() {
  return {
    content: [
      {
        type: "text" as const,
        text: "Listening history was not found. This server may require a public token in the MCP endpoint URL.",
      },
    ],
    isError: true,
  };
}

export function createPlaystatsMcpServer(publicToken?: string) {
  const server = new McpServer({ name: "playstats", version: "1.0.0" });

  server.registerTool(
    "get_listening_stats",
    {
      title: "Get listening statistics",
      description:
        "Get listening totals, timeline, listening hours and weekdays, and top artists and tracks for a time period.",
      inputSchema: {
        period: periodSchema.describe("Time period to summarize."),
        timezone: timezoneSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ period, timezone }) => {
      const stats = await getCachedPlayStats(publicToken, timezone);
      return stats
        ? resultContent({ timezone: stats.timezone, period, ...stats.periods[period] })
        : notFoundContent();
    },
  );

  server.registerTool(
    "get_rankings",
    {
      title: "Get listening rankings",
      description:
        "Get the most-played songs, artists, or albums for a time period, including play counts and listening duration.",
      inputSchema: {
        type: z.enum(["songs", "artists", "albums"]).describe("Entity type to rank."),
        period: periodSchema.describe("Time period to rank."),
        limit: z.number().int().min(1).max(100).default(25),
        timezone: timezoneSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ type, period, limit, timezone }) => {
      const rankings = await getRankings(
        type,
        period as StatsPeriod,
        publicToken,
        timezone,
      );
      return rankings
        ? resultContent({ ...rankings, items: rankings.items.slice(0, limit) })
        : notFoundContent();
    },
  );

  server.registerTool(
    "get_longest_sessions",
    {
      title: "Get longest listening sessions",
      description:
        "Get the five longest listening sessions for a time period. A session ends after a ten-minute gap.",
      inputSchema: {
        period: periodSchema.describe("Time period to search."),
        timezone: timezoneSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ period, timezone }) => {
      const sessions = await getLongestSessions(
        period as StatsPeriod,
        publicToken,
        timezone,
      );
      return sessions ? resultContent(sessions) : notFoundContent();
    },
  );

  server.registerTool(
    "get_entity_details",
    {
      title: "Get song, artist, or album details",
      description:
        "Get listening history and statistics for one Spotify song, artist, or album ID.",
      inputSchema: {
        type: z.enum(["song", "artist", "album"]),
        id: z.string().min(1).describe("Spotify entity ID."),
        timezone: timezoneSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ type, id, timezone }) => {
      const details = await getEntityDetails(
        type,
        id,
        publicToken,
        timezone,
      );
      return details ? resultContent(details) : notFoundContent();
    },
  );

  return server;
}
