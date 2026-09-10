import type { APIRoute } from "astro";
import { getRankings } from "../../lib/explore";

export const GET: APIRoute = async ({ url }) => {
  const first = url.searchParams.get("first") ?? undefined;
  const second = url.searchParams.get("second") ?? undefined;
  if (!first || !second) return Response.json({ matches: [] });
  const timezone = url.searchParams.get("timezone") ?? undefined;
  const [left, right] = await Promise.all([
    getRankings("artists", "all", first, timezone),
    getRankings("artists", "all", second, timezone),
  ]);
  if (!left || !right) return Response.json({ error: "Both public tokens must be valid." }, { status: 404 });
  const rightRanks = new Map(right.items.map((item, index) => [item.id, { item, rank: index + 1 }]));
  const matches = left.items
    .flatMap((item, index) => {
      const match = rightRanks.get(item.id);
      return match ? [{ item, leftRank: index + 1, right: match }] : [];
    })
    .sort((a, b) => a.leftRank + a.right.rank - (b.leftRank + b.right.rank))
    .slice(0, 20)
    .map((entry) => ({
      id: entry.item.id,
      name: entry.item.name,
      image: entry.item.image,
      firstRank: entry.leftRank,
      secondRank: entry.right.rank,
      combinedPlays: entry.item.plays + entry.right.item.plays,
    }));
  return Response.json({ matches });
};
