import type { APIRoute } from "astro";
import { getLongestSessions } from "../../lib/explore";
import { statsPeriods, type StatsPeriod } from "../../lib/stats";

export const GET: APIRoute = async ({ url }) => {
  const period = url.searchParams.get("period") as StatsPeriod;
  if (!statsPeriods.includes(period)) {
    return Response.json({ error: "Invalid session request." }, { status: 400 });
  }
  try {
    const result = await getLongestSessions(
      period,
      url.searchParams.get("token") ?? undefined,
      url.searchParams.get("timezone") ?? undefined,
    );
    return result
      ? Response.json(result, { headers: { "Cache-Control": "private, max-age=60" } })
      : Response.json({ error: "Listening history was not found." }, { status: 404 });
  } catch (cause) {
    console.error("Failed to load sessions", cause);
    return Response.json({ error: "Sessions are temporarily unavailable." }, { status: 500 });
  }
};
