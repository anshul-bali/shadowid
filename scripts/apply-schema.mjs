// Applies supabase/schema.sql to the Supabase Postgres instance.
// Usage: node scripts/apply-schema.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(root, '.env.local'), 'utf8');
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1];
if (!url) throw new Error('DATABASE_URL missing from .env.local');

const sql = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

await client.connect();
await client.query(sql);
const { rows } = await client.query(`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by table_name`);
console.log('Schema applied. Public tables:', rows.map((r) => r.table_name).join(', '));
const rls = await client.query(`
  select relname, relrowsecurity from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`);
for (const r of rls.rows) console.log(`  ${r.relname}: RLS ${r.relrowsecurity ? 'ON' : 'OFF'}`);
await client.end();
