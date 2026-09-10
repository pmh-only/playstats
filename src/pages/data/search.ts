import type { APIRoute } from "astro";
import { findStatsUser, getDatabase } from "../../lib/database";

export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get("q")?.trim();
  if (!query || query.length < 2) return Response.json({ results: [] });
  const database = await getDatabase();
  const user = await findStatsUser(
    database,
    url.searchParams.get("token") ?? undefined,
  );
  if (!user) return Response.json({ error: "Listening history was not found." }, { status: 404 });
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const definitions = [
    ["song", "tracks"],
    ["artist", "artists"],
    ["album", "albums"],
  ] as const;
  const groups = await Promise.all(
    definitions.map(async ([type, collection]) => {
      const matches = await database
        .collection(collection)
        .find({ name: expression }, { projection: { _id: 0, id: 1, name: 1, images: 1 } })
        .limit(8)
        .toArray();
      return matches.map((item) => ({
        type,
        id: item.id,
        name: item.name,
        image: [...(item.images ?? [])].sort(
          (left, right) => (right.width ?? 0) - (left.width ?? 0),
        )[0]?.url,
      }));
    }),
  );
  return Response.json({ results: groups.flat() }, { headers: { "Cache-Control": "private, max-age=60" } });
};
