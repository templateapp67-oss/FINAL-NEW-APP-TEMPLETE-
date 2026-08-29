// Codebase gap audit: applies the migration chain to PGlite and introspects the
// REAL resulting schema — RLS state, per-command policies, storage buckets and
// realtime publications. Read-only; writes nothing to the repository schema.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDir = join(root, 'supabase', 'migrations');

function splitStatements(sql) {
  const statements = [];
  let buffer = '';
  let i = 0;
  const push = () => { const t = buffer.trim(); if (t) statements.push(t); buffer = ''; };
  while (i < sql.length) {
    if (sql[i] === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i += 1; continue; }
    if (sql[i] === '/' && sql[i + 1] === '*') { i += 2; while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1; i += 2; continue; }
    if (sql[i] === '$') {
      let endTag = i + 1;
      while (endTag < sql.length && /[A-Za-z0-9_]/.test(sql[endTag])) endTag += 1;
      if (sql[endTag] === '$') {
        const tag = sql.slice(i, endTag + 1);
        const end = sql.indexOf(tag, endTag + 1);
        if (end < 0) throw new Error(`Unclosed dollar body ${tag}`);
        buffer += sql.slice(i, end + tag.length);
        i = end + tag.length;
        continue;
      }
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i]; buffer += sql[i++];
      while (i < sql.length) {
        buffer += sql[i];
        if (sql[i] === quote) { if (sql[i + 1] === quote) buffer += sql[i++]; else { i += 1; break; } }
        i += 1;
      }
      continue;
    }
    if (sql[i] === ';') { push(); i += 1; continue; }
    buffer += sql[i++];
  }
  push();
  return statements;
}

const stripTxn = (sql) => sql.replace(/^\s*begin\s*;\s*/im, '').replace(/\s*commit\s*;\s*$/im, '');

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(), email text, phone text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now());
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  create or replace function auth.jwt() returns jsonb language sql stable as $$
    select '{}'::jsonb $$;
  create or replace function auth.email() returns text language sql stable as $$ select null $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key, name text not null unique, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id),
    name text not null, owner_id text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique (bucket_id, name));
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;
  create schema if not exists extensions;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
`);

const files = (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort();
const failed = [];
for (const file of files) {
  try {
    for (const s of splitStatements(stripTxn(await readFile(join(migrationDir, file), 'utf8')))) {
      await db.exec(s);
    }
  } catch (err) {
    failed.push({ file, error: String(err.message).split('\n')[0] });
  }
}

const tables = (await db.query(`
  select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname`)).rows;

const policies = (await db.query(`
  select schemaname, tablename, policyname, cmd, roles::text as roles
  from pg_policies where schemaname = 'public' order by tablename, cmd`)).rows;

const byTable = {};
for (const p of policies) {
  byTable[p.tablename] ||= new Set();
  byTable[p.tablename].add(p.cmd === 'ALL' ? 'ALL' : p.cmd);
}

const covers = (set, cmd) => !!set && (set.has(cmd) || set.has('ALL'));

console.log(`MIGRATIONS: ${files.length} files, ${files.length - failed.length} applied cleanly, ${failed.length} failed`);
for (const f of failed) console.log(`  FAILED ${f.file} :: ${f.error}`);

console.log(`\nPUBLIC TABLES: ${tables.length}`);
const rlsOff = tables.filter((t) => !t.rls_enabled);
console.log(`RLS DISABLED (${rlsOff.length}): ${rlsOff.map((t) => t.table_name).join(', ') || 'none'}`);

console.log('\n=== PER-COMMAND POLICY COVERAGE (public tables) ===');
const gaps = [];
for (const t of tables) {
  const set = byTable[t.table_name];
  const missing = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].filter((c) => !covers(set, c));
  const have = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].filter((c) => covers(set, c));
  gaps.push({ table: t.table_name, rls: t.rls_enabled, have, missing });
}
const noPolicies = gaps.filter((g) => g.have.length === 0);
const partial = gaps.filter((g) => g.have.length > 0 && g.missing.length > 0);
const complete = gaps.filter((g) => g.missing.length === 0);
console.log(`  full SELECT/INSERT/UPDATE/DELETE coverage : ${complete.length}`);
console.log(`  partial coverage                          : ${partial.length}`);
console.log(`  NO policies at all                        : ${noPolicies.length}`);

console.log('\n--- tables with NO policies ---');
for (const g of noPolicies) console.log(`  ${g.table}  (rls_enabled=${g.rls})`);

console.log('\n--- tables with partial coverage ---');
for (const g of partial) console.log(`  ${g.table.padEnd(30)} have=[${g.have.join(',')}] missing=[${g.missing.join(',')}]`);

const buckets = (await db.query('select id, name, public from storage.buckets order by id')).rows;
console.log(`\nSTORAGE BUCKETS: ${buckets.length}`);
for (const b of buckets) console.log(`  ${b.id} (name=${b.name}, public=${b.public})`);

const pubs = (await db.query('select pubname from pg_publication')).rows;
console.log(`\nREALTIME PUBLICATIONS: ${pubs.length}`);
for (const p of pubs) console.log(`  ${p.pubname}`);
const pubTables = (await db.query(`
  select pubname, schemaname, tablename from pg_publication_tables order by 1,3`)).rows;
for (const p of pubTables) console.log(`  ${p.pubname} -> ${p.schemaname}.${p.tablename}`);

const fns = (await db.query(`
  select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private')`)).rows[0].n;
const secdef = (await db.query(`
  select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef`)).rows[0].n;
console.log(`\nFUNCTIONS: ${fns} total in public+private, ${secdef} SECURITY DEFINER`);

await db.close();
