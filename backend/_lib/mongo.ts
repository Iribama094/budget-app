import { MongoClient } from 'mongodb';
import { requireEnv } from './env.js';

declare global {
  // eslint-disable-next-line no-var
  var __bfMongoClientPromise: Promise<MongoClient> | undefined;
}

export async function getMongoClient(): Promise<MongoClient> {
  const uri = requireEnv('MONGODB_URI');

  // Common Atlas copy/paste mistakes that otherwise surface as opaque 500s.
  if (/[<>]/.test(uri) || /USER:PASSWORD/i.test(uri) || /<password>/i.test(uri) || /<username>/i.test(uri)) {
    throw new Error(
      'Invalid MONGODB_URI: it still contains placeholder characters. Paste the full Atlas connection string and replace <username>/<password> without angle brackets.'
    );
  }

  if (!global.__bfMongoClientPromise) {
    // Fail fast in dev when Mongo isn't running; avoids hanging requests.
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    global.__bfMongoClientPromise = client.connect().catch((err) => {
      global.__bfMongoClientPromise = undefined;
      throw err;
    });
  }

  return global.__bfMongoClientPromise;
}

export async function getDb() {
  const client = await getMongoClient();
  const dbName = process.env.MONGODB_DB || 'budgetfriendly';
  return client.db(dbName);
}
