import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const repository = process.env.NEXORA_MAIN_WEBSITE_PATH;
if (!repository) {
  console.error('Set NEXORA_MAIN_WEBSITE_PATH to the checked-out Main Website repository.');
  process.exit(2);
}
const migrationDir = join(repository, 'supabase', 'migrations');
const files = (await readdir(migrationDir)).filter((file) => file.endsWith('.sql')).sort();
const source = (await Promise.all(files.map((file) => readFile(join(migrationDir, file), 'utf8')))).join('\n');

const contracts = [
  ['canonical profile role', /profiles[\s\S]{0,500}platform_role/i],
  ['active canonical profiles', /profiles[\s\S]{0,500}is_active/i],
  ['organization membership owner role', /organization_members[\s\S]{0,500}(?:m|om)\.role\s*=\s*'owner'/i],
  ['active organization membership', /organization_members[\s\S]{0,500}(?:m|om)\.is_active\s*=\s*true/i],
  ['salon organization tenancy', /salons[\s\S]{0,500}organization_id/i],
  ['service salon tenancy', /(?:create table if not exists )?public\.services[\s\S]{0,500}salon_id/i],
  ['staff salon tenancy', /create table if not exists public\.staff[\s\S]{0,500}salon_id/i],
  ['booking salon/customer/start fields', /(?:create table if not exists )?public\.bookings[\s\S]{0,900}salon_id[\s\S]{0,500}customer_id[\s\S]{0,500}appointment_start/i],
  ['webhook exact ingress columns', /public\.payment_webhook_events[\s\S]{0,800}signature_verified[\s\S]{0,500}idempotency_key/i],
  ['historical webhook signature requiring replacement', /function public\.ingest_payment_webhook\([\s\S]{0,1200}p_webhook_secret/i],
];
for (const [label, pattern] of contracts) {
  assert.match(source, pattern, `Main Website contract missing: ${label}`);
  console.log(`PASS ${label}`);
}
console.log(`Main Website compatibility contracts: ${contracts.length}/${contracts.length} passed across ${files.length} migrations`);
