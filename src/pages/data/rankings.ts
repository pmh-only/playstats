import type { APIRoute } from "astro";
import { getRankings, type RankingType } from "../../lib/explore";
import { statsPeriods, type StatsPeriod } from "../../lib/stats";

export const GET: APIRoute = async ({ url }) => {
  const type = url.searchParams.get("type") as RankingType;
  const period = url.searchParams.get("period") as StatsPeriod;
  if (!["songs", "artists", "albums"].includes(type) || !statsPeriods.includes(period)) {
    return Response.json({ error: "Invalid ranking request." }, { status: 400 });
  }
  try {
    const result = await getRankings(
      type,
      period,
      url.searchParams.get("token") ?? undefined,
      url.searchParams.get("timezone") ?? undefined,
    );
    return result
      ? Response.json(result, { headers: { "Cache-Control": "private, max-age=60" } })
      : Response.json({ error: "Listening history was not found." }, { status: 404 });
  } catch (cause) {
    console.error("Failed to load rankings", cause);
    return Response.json({ error: "Rankings are temporarily unavailable." }, { status: 500 });
  }
};
