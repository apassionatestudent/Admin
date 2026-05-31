import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

const connectionString = `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}/${PGDATABASE}?sslmode=require&channel_binding=require`;

// => sql is used for all simple one-off queries throughout the app
export const sql = neon(connectionString, {
  fullResults: true,  // => Returns full { rows: [...] } instead of raw arrays
  arrayMode:   false  // => Object mode (not array mode)
});

// => pool uses WebSockets instead of HTTP - required for multi-step transactions
// => sql.transaction() uses HTTP and has a strict timeout that 12 sequential inserts can exceed
// => Pool from @neondatabase/serverless is the same package, no extra dependencies needed
export const pool = new Pool({ connectionString });