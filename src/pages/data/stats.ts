import type { APIRoute } from "astro";
import { getCachedPlayStats } from "../../lib/stats";

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get("token") ?? undefined;
  const timezone = url.searchParams.get("timezone") ?? undefined;

  try {
    const stats = await getCachedPlayStats(token, timezone);
    if (!stats) {
      return Response.json(
        {
          error: token
            ? "No listening history was found for this token."
            : "A public listening token is required for multi-user libraries.",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(stats, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (cause) {
    console.error("Failed to load browser-local listening statistics", cause);
    return Response.json(
      { error: "Listening statistics are temporarily unavailable." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
