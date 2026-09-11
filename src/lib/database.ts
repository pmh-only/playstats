import { MongoClient, type Db, type ObjectId } from "mongodb";

interface StatsUser {
  _id: ObjectId;
  publicToken?: string | null;
  settings?: {
    timezone?: string;
  };
}

export interface SpotifyUser {
  _id: ObjectId;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresIn?: number;
}

let clientPromise: Promise<MongoClient> | undefined;

export async function getDatabase(): Promise<Db> {
  const endpoint = process.env.MONGO_ENDPOINT;
  if (!endpoint) {
    throw new Error("MONGO_ENDPOINT is not configured");
  }

  clientPromise ??= new MongoClient(endpoint).connect().catch((error) => {
    clientPromise = undefined;
    throw error;
  });
  return (await clientPromise).db();
}

export async function findStatsUser(
  database: Db,
  publicToken?: string,
): Promise<StatsUser | null> {
  const users = database.collection<StatsUser>("users");
  const projection = { _id: 1, "settings.timezone": 1 };

  if (publicToken) {
    return users.findOne({ publicToken }, { projection });
  }

  const matches = await users.find({}, { projection }).limit(2).toArray();
  return matches.length === 1 ? matches[0] : null;
}

export async function findSpotifyUser(
  database: Db,
  publicToken?: string,
): Promise<SpotifyUser | null> {
  const users = database.collection<SpotifyUser & { publicToken?: string | null }>(
    "users",
  );
  const projection = {
    _id: 1,
    accessToken: 1,
    refreshToken: 1,
    expiresIn: 1,
  };

  if (publicToken) {
    return users.findOne({ publicToken }, { projection });
  }

  const matches = await users.find({}, { projection }).limit(2).toArray();
  return matches.length === 1 ? matches[0] : null;
}
