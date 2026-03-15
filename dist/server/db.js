"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.pool = void 0;
exports.checkDatabaseConnection = checkDatabaseConnection;
exports.withRetry = withRetry;
const serverless_1 = require("@neondatabase/serverless");
const neon_serverless_1 = require("drizzle-orm/neon-serverless");
const ws_1 = __importDefault(require("ws"));
const schema = __importStar(require("../shared/schema"));
const env = __importStar(require("./config/env"));
// Environment variables are accessed through the central config module
// Enhanced Neon configuration for better reliability and production readiness
serverless_1.neonConfig.webSocketConstructor = ws_1.default;
serverless_1.neonConfig.fetchConnectionCache = true;
serverless_1.neonConfig.useSecureWebSocket = env.DATABASE_SSL;
serverless_1.neonConfig.pipelineConnect = "password";
serverless_1.neonConfig.pipelineTLS = env.DATABASE_SSL;
// Add more logging for connection debugging
console.log('Initializing database connection for environment:', process.env.NODE_ENV || 'development');
console.log('Database connection string exists:', !!process.env.DATABASE_URL);
// Add exponential backoff to our retry logic in our custom withRetry function
// (We'll handle retries ourselves since connectionRetryLimit is not available)
// Configure the connection pool with more conservative settings and proper SSL for production
exports.pool = new serverless_1.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10, // Reduce max clients in pool to avoid connection issues
    idleTimeoutMillis: 60000, // Give idle clients more time (1 minute)
    connectionTimeoutMillis: 10000, // Allow more time for connection establishment
    maxUses: 5000, // Close connections after fewer uses
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: env.NODE_ENV === 'production' } : false, // TLS verification enabled in production
});
// Add event listeners to the pool for better error tracking
exports.pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
});
// Create a connection health check function
async function checkDatabaseConnection() {
    let client;
    try {
        client = await exports.pool.connect();
        await client.query('SELECT 1');
        console.log('Database connection successful');
        return true;
    }
    catch (error) {
        console.error('Database connection failed:', error);
        return false;
    }
    finally {
        if (client)
            client.release();
    }
}
// Set up a global keep-alive ping with better error handling
const KEEP_ALIVE_INTERVAL = 120000; // 2 minutes - reduce frequency to prevent connection issues
let keepAliveTimer;
const runKeepAlivePing = async () => {
    try {
        // Use a client from the pool directly with a short timeout
        const client = await exports.pool.connect();
        try {
            await client.query('SELECT 1');
            // Only log in development mode to reduce log noise in production
            if (process.env.NODE_ENV === 'development') {
                console.log('Keep-alive ping successful');
            }
        }
        finally {
            // Make sure we always release the client back to the pool
            client.release();
        }
    }
    catch (error) {
        console.error('Keep-alive ping failed:', error);
        // If we have a connection error, try to recover gracefully
        if (error.message && (error.message.includes('Connection terminated') ||
            error.message.includes('Connection ended') ||
            error.message.includes('Cannot read properties of null'))) {
            console.warn('Detected connection termination, attempting to recreate pool');
            try {
                // Wait a moment before trying to recreate the pool
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            catch (e) {
                console.error('Error in keep-alive recovery timer:', e);
            }
        }
    }
    // Schedule the next ping (even if this one failed)
    keepAliveTimer = setTimeout(runKeepAlivePing, KEEP_ALIVE_INTERVAL);
};
// Start the keep-alive process
keepAliveTimer = setTimeout(runKeepAlivePing, KEEP_ALIVE_INTERVAL);
// Initialize the Drizzle ORM with the pool
exports.db = (0, neon_serverless_1.drizzle)(exports.pool, { schema });
// Expose a function to retry database operations with exponential backoff
async function withRetry(operation, maxRetries = 3, initialDelay = 300) {
    let retries = 0;
    while (true) {
        try {
            return await operation();
        }
        catch (error) {
            if (retries >= maxRetries ||
                // Don't retry on certain types of errors
                (error.code && ['23505', '23503', '42P01', '42703'].includes(error.code))) {
                throw error;
            }
            const delay = initialDelay * Math.pow(2, retries);
            console.log(`Retrying database operation in ${delay}ms. Attempt ${retries + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, delay));
            retries++;
        }
    }
}
//# sourceMappingURL=db.js.map