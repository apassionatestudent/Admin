import { neon, neonConfig, Pool, types } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

// => Postgres DATE columns (OID 1082) are parsed into JS Date objects by
//    default, built from local server time. When later JSON-serialized via
//    res.json(), that Date gets converted to UTC, which shifts the date
//    backward by one day for any positive UTC offset (Philippines is
//    UTC+8) - picking July 29 in a form comes back reading as July 28
//    everywhere the app displays it. Returning the raw 'YYYY-MM-DD' text
//    instead sidesteps the whole problem, and matches what the app's own
//    formatDate()/toDateInputValue() helpers already expect. Must run
//    before any query executes, so it sits here at module load, before
//    sql/pool are created below.
types.setTypeParser(1082, (val) => val);

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