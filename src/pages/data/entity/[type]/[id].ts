import type { APIRoute } from "astro";
import { getEntityDetails } from "../../../../lib/explore";

export const GET: APIRoute = async ({ params, url }) => {
  const type = params.type as "song" | "artist" | "album";
  if (!params.id || !["song", "artist", "album"].includes(type)) {
    return Response.json({ error: "Invalid entity request." }, { status: 400 });
  }
  try {
    const result = await getEntityDetails(
      type,
      params.id,
      url.searchParams.get("token") ?? undefined,
      url.searchParams.get("timezone") ?? undefined,
    );
    return result?.entity
      ? Response.json(result, { headers: { "Cache-Control": "private, max-age=60" } })
      : Response.json({ error: "Archive item was not found." }, { status: 404 });
  } catch (cause) {
    console.error("Failed to load archive entity", cause);
    return Response.json({ error: "Archive details are temporarily unavailable." }, { status: 500 });
  }
};
