/**
 * Database migration runner.
 *
 * Uses the standard `pg` driver for both local development and CI,
 * and falls back to the Neon serverless driver only when connecting
 * to a Neon-hosted database (URL contains "neon.tech").
 *
 * This avoids the WebSocket connection issues with @neondatabase/serverless
 * when running against a standard PostgreSQL instance.
 */

import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required');
  process.exit(1);
}

const isNeonDb =
  DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('neonhost');

async function main() {
  const migrationsFolder = path.resolve('drizzle', 'migrations');

  if (isNeonDb) {
    // ── Neon serverless path ───────────────────────────────────────────────
    const { Pool, neonConfig } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-serverless');
    const { migrate } = await import('drizzle-orm/neon-serverless/migrator');
    const ws = await import('ws');
    const schema = await import('../shared/schema');

    neonConfig.webSocketConstructor = ws.default;

    const pool = new Pool({ connectionString: DATABASE_URL });
    const db = drizzle(pool, { schema: schema as any });

    console.log('Running migrations on Neon database...');
    await migrate(db, { migrationsFolder });
    console.log('✓ Migrations applied successfully (Neon)');
    await pool.end();
  } else {
    // ── Standard PostgreSQL path (local dev, CI, Docker) ──────────────────
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const schema = await import('../shared/schema');

    const pool = new Pool({ connectionString: DATABASE_URL });
    const db = drizzle(pool, { schema: schema as any });

    console.log('Running migrations on PostgreSQL database...');
    await migrate(db, { migrationsFolder });
    console.log('✓ Migrations applied successfully (PostgreSQL)');
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error applying migrations:', err);
  process.exit(1);
});
