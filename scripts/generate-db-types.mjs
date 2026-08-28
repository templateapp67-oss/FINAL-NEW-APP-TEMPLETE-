#!/usr/bin/env node
/**
 * Offline generated database types.
 *
 * Closes the audit FAIL "Generated database types are not checked in" without
 * requiring live Supabase credentials: the canonical Design-B migration chain
 * (M28 → latest) is replayed into PGlite and introspected, then emitted as
 * `src/types/database.generated.ts` in the familiar supabase gen-types shape.
 *
 * Run: npm run db:types:local
 * CI compares the committed file against a fresh generation (schema drift gate).
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRemediationDb } from './lib/remediationHarness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT_PATH = join(root, 'src', 'types', 'database.generated.ts');

const SCALAR_TYPES = {
  uuid: 'string',
  text: 'string',
  varchar: 'string',
  bpchar: 'string',
  citext: 'string',
  boolean: 'boolean',
  int2: 'number',
  int4: 'number',
  int8: 'number',
  float4: 'number',
  float8: 'number',
  numeric: 'number',
  json: 'Json',
  jsonb: 'Json',
  timestamptz: 'string',
  timestamp: 'string',
  date: 'string',
  time: 'string',
  timetz: 'string',
  inet: 'string',
  cidr: 'string',
  macaddr: 'string',
  interval: 'string',
  bytea: 'string',
  name: 'string',
};

function tsType(row) {
  const base = SCALAR_TYPES[row.udt_name] ?? SCALAR_TYPES[row.data_type] ?? 'string';
  let type = base;
  if (row.data_type === 'ARRAY') type = `${SCALAR_TYPES[row.udt_name.replace(/^_/, '')] ?? 'unknown'}[]`;
  if (row.is_nullable === 'YES') type = `${type} | null`;
  return type;
}

const { db } = await createRemediationDb();

const tables = (await db.query(`
  select c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname
`)).rows;

const lines = [];
lines.push(`/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Offline introspection of the canonical Design-B migration chain replayed in
 * PGlite (scripts/generate-db-types.mjs). Regenerate with:
 *
 *   npm run db:types:local
 *
 * CI regenerates and diffs this file so schema/type drift fails the build.
 * The canonical live project may contain additional manual hotfix objects;
 * reconcile those through a new migration (never by hand-editing here).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {`);

for (const table of tables) {
  const columns = (await db.query(`
    select column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = $1
    order by ordinal_position
  `, [table.table_name])).rows;

  const rowEntries = columns.map((col) => `      ${col.column_name}: ${tsType(col)};`);
  const insertEntries = columns.map((col) => {
    const hasDefault = col.column_default !== null || col.is_nullable === 'YES';
    const base = tsType(col).replace(/ \| null$/, '');
    const nullable = col.is_nullable === 'YES' ? ' | null' : '';
    return hasDefault ? `      ${col.column_name}?: ${base}${nullable};` : `      ${col.column_name}: ${base};`;
  });
  const updateEntries = columns.map((col) => `      ${col.column_name}?: ${tsType(col)};`);

  lines.push(`      ${table.table_name}: {
        Row: {
${rowEntries.join('\n')}
        };
        Insert: {
${insertEntries.join('\n')}
        };
        Update: {
${updateEntries.join('\n')}
        };
        Relationships: [];
      };`);
}

lines.push(`    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};`);

lines.push('');

const content = lines.join('\n');
await writeFile(OUT_PATH, content, 'utf8');
console.log(`wrote ${OUT_PATH} (${tables.length} public tables, ${content.length} bytes)`);
