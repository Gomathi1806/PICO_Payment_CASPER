import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

let databaseUrl = (process.env.DATABASE_URL || '').trim();

// Sanitization: Strip any surrounding double/single quotes that users often accidentally paste on Vercel
databaseUrl = databaseUrl.replace(/^["']|["']$/g, '');

// Validate if it is a valid database URL structure
const isValidUrl = databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://');

// Fallback to placeholder if URL is invalid or missing, to guarantee build compilation success on Vercel
if (!isValidUrl) {
  databaseUrl = 'postgresql://placeholder_user:placeholder_pass@localhost:5432/placeholder_db';
}

const sql = neon(databaseUrl);
export const db = drizzle(sql, { schema });
