import { findStatsUser, getDatabase } from "./database";

export interface TrackStats {
  id: string;
  name: string;
  artists: string[];
  playCount: number;
  durationMs: number;
  discNumber: number;
  trackNumber: number;
  explicit: boolean;
}

export interface AlbumStats {
  id: string;
  title: string;
  artists: string[];
  image: string;
  releaseDate: string;
  playCount: number;
  tracks: TrackStats[];
}

interface AlbumAggregate {
  _id: string;
  playCount: number;
  trackPlays: Array<{ id: string; playCount: number }>;
  album?: {
    name?: string;
    artists?: string[];
    images?: Array<{ url?: string; width?: number; height?: number }>;
    release_date?: string;
  };
  trackDocuments: Array<{
    id: string;
    name?: string;
    artists?: string[];
    duration_ms?: number;
    disc_number?: number;
    track_number?: number;
    explicit?: boolean;
  }>;
  artistDocuments: Array<{ id: string; name?: string }>;
}

export async function getTopAlbums(
  publicToken?: string,
): Promise<AlbumStats[]> {
  const database = await getDatabase();
  const user = await findStatsUser(database, publicToken);

  if (!user) {
    return [];
  }

  const albums = await database
    .collection("infos")
    .aggregate<AlbumAggregate>([
      {
        $match: {
          owner: user._id,
          blacklistedBy: { $exists: false },
          albumId: { $type: "string" },
          id: { $type: "string" },
        },
      },
      {
        $group: {
          _id: { albumId: "$albumId", trackId: "$id" },
          playCount: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.albumId",
          playCount: { $sum: "$playCount" },
          trackPlays: {
            $push: { id: "$_id.trackId", playCount: "$playCount" },
          },
        },
      },
      { $sort: { playCount: -1, _id: 1 } },
      { $limit: 100 },
      {
        $lookup: {
          from: "albums",
          localField: "_id",
          foreignField: "id",
          as: "album",
        },
      },
      { $set: { album: { $first: "$album" } } },
      {
        $lookup: {
          from: "tracks",
          let: { trackIds: "$trackPlays.id" },
          pipeline: [
            { $match: { $expr: { $in: ["$id", "$$trackIds"] } } },
            {
              $project: {
                _id: 0,
                id: 1,
                name: 1,
                artists: 1,
                duration_ms: 1,
                disc_number: 1,
                track_number: 1,
                explicit: 1,
              },
            },
          ],
          as: "trackDocuments",
        },
      },
      {
        $lookup: {
          from: "artists",
          localField: "trackDocuments.artists",
          foreignField: "id",
          pipeline: [{ $project: { _id: 0, id: 1, name: 1 } }],
          as: "artistDocuments",
        },
      },
      {
        $project: {
          playCount: 1,
          trackPlays: 1,
          album: {
            name: 1,
            artists: 1,
            images: 1,
            release_date: 1,
          },
          trackDocuments: 1,
          artistDocuments: 1,
        },
      },
    ])
    .toArray();

  return albums.map((entry) => {
    const artistNames = new Map(
      entry.artistDocuments.map((artist) => [
        artist.id,
        artist.name ?? "Unknown artist",
      ]),
    );
    const plays = new Map(
      entry.trackPlays.map((track) => [track.id, track.playCount]),
    );
    const tracks = entry.trackDocuments
      .map((track) => ({
        id: track.id,
        name: track.name ?? "Unknown track",
        artists: (track.artists ?? []).map(
          (artistId) => artistNames.get(artistId) ?? "Unknown artist",
        ),
        playCount: plays.get(track.id) ?? 0,
        durationMs: track.duration_ms ?? 0,
        discNumber: track.disc_number ?? 1,
        trackNumber: track.track_number ?? 0,
        explicit: track.explicit ?? false,
      }))
      .sort(
        (left, right) =>
          right.playCount - left.playCount ||
          left.discNumber - right.discNumber ||
          left.trackNumber - right.trackNumber,
      );

    const albumArtists = (entry.album?.artists ?? [])
      .map((artistId) => artistNames.get(artistId))
      .filter((artist): artist is string => Boolean(artist));
    const image = [...(entry.album?.images ?? [])].sort(
      (left, right) => (right.width ?? 0) - (left.width ?? 0),
    )[0]?.url;

    return {
      id: entry._id,
      title: entry.album?.name ?? "Unknown album",
      artists: albumArtists,
      image: image ?? "",
      releaseDate: entry.album?.release_date ?? "",
      playCount: entry.playCount,
      tracks,
    };
  });
}
