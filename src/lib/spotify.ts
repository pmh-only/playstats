import { findSpotifyUser, getDatabase, type SpotifyUser } from "./database";

export interface NowPlaying {
  isPlaying: boolean;
  progressMs: number | null;
  timestamp: number;
  item: {
    type: "track" | "episode";
    id: string;
    name: string;
    subtitle: string;
    album: string | null;
    imageUrl: string | null;
    durationMs: number;
    spotifyUrl: string | null;
  } | null;
}

interface SpotifyItem {
  type?: string;
  id?: string;
  name?: string;
  duration_ms?: number;
  external_urls?: { spotify?: string };
  artists?: Array<{ name?: string }>;
  album?: {
    name?: string;
    images?: Array<{ url?: string }>;
  };
  show?: {
    name?: string;
    images?: Array<{ url?: string }>;
  };
  images?: Array<{ url?: string }>;
}

interface SpotifyPlayback {
  is_playing?: boolean;
  progress_ms?: number | null;
  timestamp?: number;
  item?: SpotifyItem | null;
}

async function refreshAccessToken(user: SpotifyUser) {
  const clientId = process.env.SPOTIFY_PUBLIC;
  const clientSecret = process.env.SPOTIFY_SECRET;
  if (!clientId || !clientSecret || !user.refreshToken) {
    throw new Error("Spotify token refresh is not configured");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: user.refreshToken,
    }),
  });
  if (!response.ok) {
    throw new Error(`Spotify token refresh failed with ${response.status}`);
  }

  const token = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  const expiresIn = Date.now() + token.expires_in * 1000;
  const update: Record<string, string | number> = {
    accessToken: token.access_token,
    expiresIn,
  };
  if (token.refresh_token) update.refreshToken = token.refresh_token;

  const database = await getDatabase();
  await database.collection("users").updateOne({ _id: user._id }, { $set: update });
  user.accessToken = token.access_token;
  user.expiresIn = expiresIn;
  if (token.refresh_token) user.refreshToken = token.refresh_token;
  return token.access_token;
}

async function requestPlayback(accessToken: string) {
  return fetch(
    "https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export async function getNowPlaying(
  publicToken?: string,
): Promise<NowPlaying | null | undefined> {
  const database = await getDatabase();
  const user = await findSpotifyUser(database, publicToken);
  if (!user) return undefined;
  if (!user.accessToken) return null;

  let accessToken = user.accessToken;
  if (!user.expiresIn || user.expiresIn < Date.now() + 120_000) {
    accessToken = await refreshAccessToken(user);
  }

  let response = await requestPlayback(accessToken);
  if (response.status === 401 && user.refreshToken) {
    accessToken = await refreshAccessToken(user);
    response = await requestPlayback(accessToken);
  }
  if (response.status === 204) {
    return {
      isPlaying: false,
      progressMs: null,
      timestamp: Date.now(),
      item: null,
    };
  }
  if (!response.ok) {
    throw new Error(`Spotify playback request failed with ${response.status}`);
  }

  const playback = (await response.json()) as SpotifyPlayback;
  const item = playback.item;
  const type = item?.type === "episode" ? "episode" : "track";
  const images = type === "episode" ? item?.images ?? item?.show?.images : item?.album?.images;
  const subtitle =
    type === "episode"
      ? item?.show?.name ?? "Podcast episode"
      : item?.artists?.map((artist) => artist.name).filter(Boolean).join(", ") ||
        "Unknown artist";

  return {
    isPlaying: Boolean(playback.is_playing),
    progressMs: playback.progress_ms ?? null,
    timestamp: playback.timestamp ?? Date.now(),
    item:
      item?.id && item.name && typeof item.duration_ms === "number"
        ? {
            type,
            id: item.id,
            name: item.name,
            subtitle,
            album: type === "track" ? item.album?.name ?? null : null,
            imageUrl: images?.find((image) => image.url)?.url ?? null,
            durationMs: item.duration_ms,
            spotifyUrl: item.external_urls?.spotify ?? null,
          }
        : null,
  };
}
