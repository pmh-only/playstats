import type { APIRoute } from "astro";
import { getNowPlaying } from "../../lib/spotify";

const headers = { "Cache-Control": "private, no-store" };

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get("token") ?? undefined;

  try {
    const playback = await getNowPlaying(token);
    if (playback === undefined) {
      return Response.json(
        {
          error: token
            ? "No Spotify account was found for this token."
            : "A public listening token is required for multi-user libraries.",
        },
        { status: 404, headers },
      );
    }
    if (playback === null) {
      return Response.json(
        { error: "The Spotify account is not connected." },
        { status: 503, headers },
      );
    }

    return Response.json(playback, { headers });
  } catch (cause) {
    console.error("Failed to load current Spotify playback", cause);
    return Response.json(
      { error: "Current Spotify playback is temporarily unavailable." },
      { status: 502, headers },
    );
  }
};
