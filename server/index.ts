
import express from "express";
import cors from "cors";
import path from "path";
import { registerRoutes } from "./routes";
import http from "http";
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import ws from 'ws';
import * as schema from '../shared/schema';
import { startAutoTuner } from './services/lesson-validation-tuner';

const app = express();
const PORT = Number(process.env.PORT || 5000);

// Run database migrations on startup
async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set, skipping migrations');
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
  const isNeon = dbUrl.includes('neon.tech') || dbUrl.includes('neonhost');

  if (isLocal) {
    return;
  }

  try {
    const migrationsFolder = path.resolve('drizzle', 'migrations');

    if (isNeon) {
      // Neon serverless — use WebSocket driver
      neonConfig.webSocketConstructor = ws;
      const neonPool = new Pool({ connectionString: dbUrl });
      const neonDb = drizzle(neonPool, { schema });
      await migrate(neonDb, { migrationsFolder });
      await neonPool.end();
    } else {
      // Standard Postgres (Railway, etc.) — use pg driver
      const { Pool: PgPool } = require('pg');
      const { drizzle: drizzlePg } = require('drizzle-orm/node-postgres');
      const { migrate: migratePg } = require('drizzle-orm/node-postgres/migrator');
      const pgPool = new PgPool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
      });
      const pgDb = drizzlePg(pgPool, { schema });
      await migratePg(pgDb, { migrationsFolder });
      await pgPool.end();
    }

  } catch (error) {
    console.error('Error applying migrations:', error);
  }
}

// Run migrations before starting server
runMigrations().catch((err) => {
  console.error('Migration check failed:', err);
});

// Middleware
// Enhanced CORS to specifically handle sunschool.xyz domain
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    // Define allowed origins
    const allowedOrigins = [
      'https://sunschool.xyz',
      'https://www.sunschool.xyz',
      'http://localhost:5000',
      'http://localhost:3000'
    ];
    
    // Check if the request origin is in our allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Sunschool-Auth']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Determine the correct client dist path based on environment
let clientDistPath;
if (process.env.NODE_ENV === 'production') {
  clientDistPath = path.join(process.cwd(), "client/dist");
} else {
  // For development, use the path relative to the project root
  clientDistPath = path.join(process.cwd(), "client/dist");
}

// Serve static files from the client dist folder
app.use(express.static(clientDistPath));

// Register API routes first
const server = registerRoutes(app);

// Serve React app for all other routes - this must come after API routes
app.use((req, res) => {
  const indexPath = path.join(clientDistPath, "index.html");
  res.sendFile(indexPath);
});

// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);

  // Start the lesson validation auto-tuner (runs every 15 minutes)
  startAutoTuner(15);
});
