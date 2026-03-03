import * as schema from "../shared/schema";
import * as env from './config/env';

// Detect whether we're connecting to a Neon serverless instance
// (requires WebSocket driver) vs any standard Postgres (local, Railway, etc.)
const isNeonDb = env.DATABASE_URL.includes('neon.tech') ||
  env.DATABASE_URL.includes('neonhost');
const isLocalDb = env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1');

console.log('Initializing database connection for environment:', process.env.NODE_ENV || 'development');
console.log('Database connection string exists:', !!process.env.DATABASE_URL);
console.log('Using Neon driver:', isNeonDb);
console.log('Is local DB:', isLocalDb);

let pool: any;
let db: any;

if (isNeonDb) {
  // Neon serverless — requires WebSocket driver
  const { Pool: NeonPool, neonConfig } = require('@neondatabase/serverless');
  const { drizzle: drizzleNeon } = require('drizzle-orm/neon-serverless');
  const ws = require('ws');
  neonConfig.webSocketConstructor = ws;
  neonConfig.fetchConnectionCache = true;
  neonConfig.useSecureWebSocket = env.DATABASE_SSL;
  neonConfig.pipelineConnect = 'password';
  neonConfig.pipelineTLS = env.DATABASE_SSL;
  pool = new NeonPool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    maxUses: 5000,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: env.NODE_ENV === 'production' } : false,
  });
  db = drizzleNeon(pool, { schema });
} else {
  // Standard Postgres (local dev, Railway, or any non-Neon host)
  const { Pool: PgPool } = require('pg');
  const { drizzle: drizzlePg } = require('drizzle-orm/node-postgres');
  const sslConfig = isLocalDb ? false :
    (env.DATABASE_SSL ? { rejectUnauthorized: false } : false);
  pool = new PgPool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    ssl: sslConfig,
  });
  db = drizzlePg(pool, { schema });
}

export { pool, db };

// Add event listeners to the pool for better error tracking
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// Create a connection health check function
export async function checkDatabaseConnection() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  } finally {
    if (client) client.release();
  }
}

// Keep-alive ping — only for Neon serverless connections
if (isNeonDb) {
  const KEEP_ALIVE_INTERVAL = 120000;
  const runKeepAlivePing = async () => {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Keep-alive ping failed:', error);
    }
    setTimeout(runKeepAlivePing, KEEP_ALIVE_INTERVAL);
  };
  setTimeout(runKeepAlivePing, KEEP_ALIVE_INTERVAL);
}

// Expose a function to retry database operations with exponential backoff
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 300
): Promise<T> {
  let retries = 0;
  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      if (
        retries >= maxRetries ||
        // Don't retry on certain types of errors
        (error.code && ['23505', '23503', '42P01', '42703'].includes(error.code))
      ) {
        throw error;
      }
      const delay = initialDelay * Math.pow(2, retries);
      console.log(`Retrying database operation in ${delay}ms. Attempt ${retries + 1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      retries++;
    }
  }
}
