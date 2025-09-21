import { Pool } from 'pg';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// PostgreSQL connection pool
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis client
export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

// Database initialization
export async function initDatabase() {
  try {
    // Test PostgreSQL connection
    const pgClient = await pgPool.connect();
    console.log('✅ PostgreSQL connected successfully');
    pgClient.release();

    // Connect to Redis
    await redisClient.connect();
    console.log('✅ Redis connected successfully');

    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabase() {
  try {
    await pgPool.end();
    await redisClient.quit();
    console.log('✅ Database connections closed');
  } catch (error) {
    console.error('❌ Error closing database connections:', error);
  }
}

// Health check
export async function checkDatabaseHealth(): Promise<{
  postgres: boolean;
  redis: boolean;
}> {
  const health = {
    postgres: false,
    redis: false,
  };

  try {
    const pgClient = await pgPool.connect();
    await pgClient.query('SELECT 1');
    pgClient.release();
    health.postgres = true;
  } catch (error) {
    console.error('PostgreSQL health check failed:', error);
  }

  try {
    await redisClient.ping();
    health.redis = true;
  } catch (error) {
    console.error('Redis health check failed:', error);
  }

  return health;
}