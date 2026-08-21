/**
 * Phase 8.2 — validation, security and error-handling test suite.
 *
 * This is an ADVERSARIAL suite. It applies the full M01–M24 migration set to a
 * real PostgreSQL (PGlite) and then actively attacks the saved-service system
 * as a logged-in tenant, a rival tenant, and an anonymous visitor — through
 * both the RPC surface AND direct table access (the PostgREST path).
 *
 * A test only passes when the attack is REJECTED.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const THEMES = [
  'barber_mens_grooming',
  'hair_studio_color_bar',
  'beauty_skin_spa',
  'family_full_service',
  'nail_lash_studio',
];

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, phone text,
    raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text not null unique,
    public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
  create table if not exists storage.objects (id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id), name text not null, owner_id text,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique (bucket_id, name));
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable strict as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
`);
for (const file of migrationFiles) {
  await db.exec(await readFile(join(migrationsDir, file), 'utf8'));
}

const ids = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  outsider: '00000000-0000-4000-8000-0000000000c1',
  businessA: '10000000-0000-4000-8000-0000000000a1',
  businessB: '10000000-0000-4000-8000-0000000000b1',
};

await db.query(
  `insert into auth.users (id, email) values ($1,'a@t.test'), ($2,'b@t.test'), ($3,'c@t.test')`,
  [ids.ownerA, ids.ownerB, ids.outsider],
);
await db.query(
  `insert into public.businesses (id,name,business_type,phone,whatsapp,email,created_by) values
    ($1,'Salon A','salon','+911111111111','+911111111111','a@t.test',$2),
    ($3,'Salon B','salon','+912222222222','+912222222222','b@t.test',$4)`,
  [ids.businessA, ids.ownerA, ids.businessB, ids.ownerB],
);

// Tracks the active session so catalogLookup can restore it after a
// temporary service_role read.
const currentJwt = { value: '', role: '' };

const asRole = async (role, userId, fn) => {
  const prev = { ...currentJwt };
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec(`set role ${role}`);
  currentJwt.value = userId;
  currentJwt.role = role;
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    currentJwt.value = prev.value;
    currentJwt.role = prev.role;
  }
};
const asUser = (userId, fn) => asRole('authenticated', userId, fn);
const asServiceRole = (fn) => asRole('service_role', '', fn);

/** Asserts an operation is rejected. Returns the error message. */
const mustReject = async (label, fn, pattern) => {
  let error;
  try {
    await fn();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `SECURITY HOLE: ${label} was ALLOWED but must be rejected`);
  if (pattern) assert.match(error.message, pattern, `${label}: unexpected reason`);
  return error.message;
};

/** Asserts a statement matched zero rows (silently filtered by RLS). */
const mustAffectNoRows = async (label, sql, params) => {
  const result = await db.query(sql, params);
  assert.equal(result.rows.length, 0, `SECURITY HOLE: ${label} affected rows`);
};

let passed = 0;
const test = async (label, fn) => {
  await fn();
  passed += 1;
  console.log(`PASS ${label}`);
};

// Catalog lookups used to BUILD a test case run with full visibility, so that
// deactivating a theme (which correctly hides its rows from tenants via RLS)
// does not break the harness itself.
const catalogLookup = async (sql, params) => {
  const savedUser = currentJwt.value;
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec('set role service_role');
  try {
    return (await db.query(sql, params)).rows[0];
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [savedUser]);
    if (currentJwt.role) await db.exec(`set role ${currentJwt.role}`);
  }
};

const catalogLookupAll = async (sql, params) => {
  const savedUser = currentJwt.value;
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec('set role service_role');
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [savedUser]);
    if (currentJwt.role) await db.exec(`set role ${currentJwt.role}`);
  }
};

const categoryOf = async (themeId) => (await catalogLookup(
  `select c.id from public.service_categories c
   join public.themes t on t.id = c.theme_id
   where t.theme_id = $1 order by c.sort_order limit 1`, [themeId],
)).id;

const predefinedOf = async (themeId) => await catalogLookup(
  `select ps.id, ps.theme_id, ps.category_id, ps.name
   from public.predefined_services ps
   join public.themes t on t.id = ps.theme_id
   where t.theme_id = $1 and ps.is_active
   order by ps.sort_order limit 1`, [themeId],
);

// Owner A saves one service per theme; Owner B saves one, as the victim set.
const ownerAServices = {};
for (const themeId of THEMES) {
  ownerAServices[themeId] = await asUser(ids.ownerA, async () => {
    const predefined = await predefinedOf(themeId);
    const r = await db.query(
      `select public.create_saved_service($1,$2,$3,'Owner A private copy',100000,30,$4,'active') as d`,
      [themeId, predefined.category_id, predefined.name, predefined.id],
    );
    return r.rows[0].d;
  });
}
const ownerBService = await asUser(ids.ownerB, async () => {
  const cat = await categoryOf('nail_lash_studio');
  return (await db.query(
    `select public.create_saved_service('nail_lash_studio',$1,'Owner B private','secret',50000,20,null,'active') as d`,
    [cat],
  )).rows[0].d;
});

// ===========================================================================
// AUTHORIZATION
// ===========================================================================

await test('AUTH-1 — a user cannot VIEW another salon\'s saved services', async () => {
  await asUser(ids.ownerB, async () => {
    for (const themeId of THEMES) {
      const victim = ownerAServices[themeId];
      // RPC read returns only Owner B's own tenant rows.
      const rpc = await db.query('select public.get_saved_services_for_theme($1) as d', [themeId]);
      assert.equal(rpc.rows[0].d.business_id, ids.businessB);
      assert.equal(
        rpc.rows[0].d.services.some((s) => s.id === victim.id), false,
        'another salon service leaked through the RPC',
      );
      // Direct table read is filtered by RLS.
      const direct = await db.query('select id from public.services where id = $1', [victim.id]);
      assert.equal(direct.rows.length, 0, 'another salon service leaked through direct select');
    }
    // Owner B cannot see Owner A rows even with a broad scan.
    const scan = await db.query('select business_id from public.services');
    scan.rows.forEach((row) => assert.equal(row.business_id, ids.businessB));
  });
});

await test('AUTH-2 — a user cannot ADD services to another salon', async () => {
  await asUser(ids.ownerB, async () => {
    const cat = await categoryOf('barber_mens_grooming');
    // The RPC derives the tenant from auth.uid(); it cannot be told otherwise.
    const created = await db.query(
      `select public.create_saved_service('barber_mens_grooming',$1,'B tries A','x',1000,10,null,'active') as d`,
      [cat],
    );
    assert.equal(created.rows[0].d.business_id, ids.businessB,
      'RPC must always bind the row to the caller\'s own salon');

    // Direct insert naming another tenant is refused by the RLS WITH CHECK.
    await mustReject(
      'direct INSERT into another salon',
      () => db.query(
        `insert into public.services (business_id,name,price_paise,duration_minutes)
         values ($1,'Injected into A',1000,10)`,
        [ids.businessA],
      ),
      /row-level security/i,
    );
  });
});

await test('AUTH-3 — a user cannot EDIT another salon\'s services', async () => {
  await asUser(ids.ownerB, async () => {
    for (const themeId of THEMES) {
      const victim = ownerAServices[themeId];
      await mustReject('cross-salon update_saved_service',
        () => db.query(`select public.update_saved_service($1,'Hijacked',null,null,null,null)`, [victim.id]),
        /not found for your salon/i);
      await mustReject('cross-salon set_saved_service_status',
        () => db.query('select public.set_saved_service_status($1,$2)', [victim.id, 'archived']),
        /not found for your salon/i);
      await mustReject('cross-salon set_saved_service_active',
        () => db.query('select public.set_saved_service_active($1,false)', [victim.id]),
        /not found for your salon/i);
      // Direct update is silently filtered to zero rows by RLS.
      await mustAffectNoRows('cross-salon direct UPDATE',
        `update public.services set name='Direct hijack', price_paise=1 where id=$1 returning id`,
        [victim.id]);
    }
  });
  // Victim data is byte-identical afterwards.
  for (const themeId of THEMES) {
    const victim = ownerAServices[themeId];
    const row = await db.query(
      'select name, price_paise, status::text from public.services where id=$1', [victim.id],
    );
    assert.equal(row.rows[0].name, victim.name);
    assert.equal(Number(row.rows[0].price_paise), 100000);
    assert.equal(row.rows[0].status, 'active');
  }
});

await test('AUTH-4 — a user cannot DELETE another salon\'s services', async () => {
  await asUser(ids.ownerB, async () => {
    for (const themeId of THEMES) {
      await mustReject('cross-salon delete_saved_service',
        () => db.query('select public.delete_saved_service($1)', [ownerAServices[themeId].id]),
        /not found for your salon/i);
      await mustAffectNoRows('cross-salon direct DELETE',
        'delete from public.services where id=$1 returning id', [ownerAServices[themeId].id]);
    }
  });
  const survived = await db.query(
    'select count(*)::int c from public.services where id = any($1::uuid[])',
    [Object.values(ownerAServices).map((s) => s.id)],
  );
  assert.equal(survived.rows[0].c, THEMES.length);
});

await test('AUTH-5 — a user with NO salon membership is fully locked out', async () => {
  await asUser(ids.outsider, async () => {
    await mustReject('outsider read', () => db.query(
      `select public.get_saved_services_for_theme('barber_mens_grooming')`), /no manageable salon/i);
    await mustReject('outsider add', async () => {
      const cat = await categoryOf('barber_mens_grooming');
      return db.query(
        `select public.create_saved_service('barber_mens_grooming',$1,'x','y',1000,10,null,'active')`, [cat]);
    }, /no manageable salon/i);
    await mustReject('outsider delete', () => db.query(
      'select public.delete_saved_service($1)', [ownerAServices.barber_mens_grooming.id]),
      /no manageable salon/i);
    const scan = await db.query('select count(*)::int c from public.services');
    assert.equal(scan.rows[0].c, 0, 'a non-member must not see any service row');
  });
});

await test('AUTH-6 — anonymous visitors get no tenant data and no write path', async () => {
  await asRole('anon', '', async () => {
    for (const fn of [
      () => db.query(`select public.get_saved_services_for_theme('barber_mens_grooming')`),
      () => db.query(`select public.create_saved_service('barber_mens_grooming',gen_random_uuid(),'x','y',1,1,null,'active')`),
      () => db.query(`select public.update_saved_service($1,'x',null,null,null,null)`, [ownerBService.id]),
      () => db.query('select public.delete_saved_service($1)', [ownerBService.id]),
      () => db.query('select public.set_saved_service_status($1,$2)', [ownerBService.id, 'archived']),
      () => db.query(`select public.save_predefined_services('barber_mens_grooming', array[gen_random_uuid()])`),
      () => db.query('select * from public.services'),
    ]) {
      await mustReject('anonymous access', fn, /permission denied/i);
    }
    // Internal helpers are not reachable either.
    await mustReject('anon helper', () => db.query('select public.nexora_current_manageable_business_id()'),
      /permission denied/i);
  });
});

// ===========================================================================
// RELATIONSHIP VALIDATION
// ===========================================================================

await test('REL-1 — theme_id must be a valid, ACTIVE theme', async () => {
  await asUser(ids.ownerA, async () => {
    const cat = await categoryOf('barber_mens_grooming');
    await mustReject('unknown theme key',
      () => db.query(`select public.create_saved_service('not_a_real_theme',$1,'x','y',1000,10,null,'active')`, [cat]),
      /no active service catalog exists/i);
    await mustReject('unknown theme read',
      () => db.query(`select public.get_saved_services_for_theme('not_a_real_theme')`),
      /no active service catalog exists/i);
    // A random UUID is not a theme.
    await mustReject('direct INSERT with a bogus theme_id',
      () => db.query(
        `insert into public.services (business_id,theme_id,name,price_paise,duration_minutes)
         values ($1,gen_random_uuid(),'x',1000,10)`, [ids.businessA]),
      /foreign key|violates|does not exist/i);
  });

  // Deactivating a theme closes it for new writes without touching saved rows.
  await asServiceRole(() => db.query(
    `update public.themes set is_active=false where theme_id='family_full_service'`));
  await asUser(ids.ownerA, async () => {
    const cat = await categoryOf('family_full_service');
    await mustReject('add under a deactivated theme',
      () => db.query(`select public.create_saved_service('family_full_service',$1,'x','y',1000,10,null,'active')`, [cat]),
      /no active service catalog exists/i);
    await mustReject('read a deactivated theme',
      () => db.query(`select public.get_saved_services_for_theme('family_full_service')`),
      /no active service catalog exists/i);
    const themeRow = await catalogLookup(
      `select id from public.themes where theme_id='family_full_service'`);
    await mustReject('direct INSERT under a deactivated theme',
      () => db.query(
        `insert into public.services (business_id,theme_id,category_id,name,price_paise,duration_minutes)
         values ($1,$2,$3,'x',1000,10)`, [ids.businessA, themeRow.id, cat]),
      /not active/i);
  });
  await asServiceRole(() => db.query(
    `update public.themes set is_active=true where theme_id='family_full_service'`));
});

await test('REL-2 — category_id must belong to theme_id', async () => {
  await asUser(ids.ownerA, async () => {
    for (const themeId of THEMES) {
      const foreignTheme = THEMES.find((t) => t !== themeId);
      const foreignCat = await categoryOf(foreignTheme);
      await mustReject(`${themeId}: category from ${foreignTheme}`,
        () => db.query(
          `select public.create_saved_service($1,$2,'Cross cat','y',1000,10,null,'active')`,
          [themeId, foreignCat]),
        /category does not belong to this theme/i);
      // Direct insert with a mismatched pair is refused too.
      const themeRow = await catalogLookup(
        'select id from public.themes where theme_id=$1', [themeId]);
      await mustReject(`${themeId}: direct INSERT mismatched category`,
        () => db.query(
          `insert into public.services (business_id,theme_id,category_id,name,price_paise,duration_minutes)
           values ($1,$2,$3,'x',1000,10)`, [ids.businessA, themeRow.id, foreignCat]),
        /foreign key|violates|does not belong to this theme/i);
    }
    // A category that does not exist at all.
    await mustReject('nonexistent category',
      () => db.query(
        `select public.create_saved_service('barber_mens_grooming',gen_random_uuid(),'x','y',1000,10,null,'active')`),
      /category does not belong to this theme/i);
  });
});

await test('REL-3 — predefined_service_id must belong to category_id + theme_id', async () => {
  await asUser(ids.ownerA, async () => {
    for (const themeId of THEMES) {
      const foreignTheme = THEMES.find((t) => t !== themeId);
      const own = await predefinedOf(themeId);
      const foreign = await predefinedOf(foreignTheme);

      // Predefined row from another theme.
      await mustReject(`${themeId}: predefined from ${foreignTheme}`,
        () => db.query(
          `select public.create_saved_service($1,$2,'x','y',1000,10,$3,'active')`,
          [themeId, own.category_id, foreign.id]),
        /does not belong to this theme and category/i);

      // Predefined row from this theme but paired with the wrong category.
      const otherCat = await catalogLookup(
        `select c.id from public.service_categories c
         join public.themes t on t.id=c.theme_id
         where t.theme_id=$1 and c.id <> $2 limit 1`, [themeId, own.category_id]);
      if (otherCat) {
        await mustReject(`${themeId}: predefined paired with the wrong category`,
          () => db.query(
            `select public.create_saved_service($1,$2,'x','y',1000,10,$3,'active')`,
            [themeId, otherCat.id, own.id]),
          /does not belong to this theme and category/i);
      }

      // Direct INSERT forging a cross-theme tuple.
      const themeRow = await catalogLookup(
        'select id from public.themes where theme_id=$1', [themeId]);
      await mustReject(`${themeId}: direct INSERT cross-theme predefined`,
        () => db.query(
          `insert into public.services (business_id,theme_id,category_id,predefined_service_id,name,price_paise,duration_minutes)
           values ($1,$2,$3,$4,'x',1000,10)`,
          [ids.businessA, themeRow.id, own.category_id, foreign.id]),
        /foreign key|violates|belongs to another theme/i);
    }
    // save_predefined_services enforces the same chain.
    const nail = await predefinedOf('nail_lash_studio');
    await mustReject('Add Selected with a cross-theme predefined id',
      () => db.query(
        `select public.save_predefined_services('barber_mens_grooming', array[$1::uuid])`, [nail.id]),
      /do not belong to the active theme/i);
  });
});

await test('REL-4 — provenance cannot be MANIPULATED after creation (privilege escalation)', async () => {
  // This is the Phase 8.2 hardening: the M17 FKs alone would accept any
  // self-consistent tuple, letting a tenant re-point their own row onto a
  // different theme via a direct PostgREST UPDATE.
  await asUser(ids.ownerA, async () => {
    const victim = ownerAServices.barber_mens_grooming;
    const before = (await db.query(
      `select theme_id, category_id, predefined_service_id, business_id
       from public.services where id=$1`, [victim.id])).rows[0];
    const nail = await predefinedOf('nail_lash_studio');

    await mustReject('re-point provenance to another theme (consistent tuple)',
      () => db.query(
        `update public.services set theme_id=$1, category_id=$2, predefined_service_id=$3 where id=$4`,
        [nail.theme_id, nail.category_id, nail.id, victim.id]),
      /provenance is immutable/i);

    await mustReject('swap only predefined_service_id',
      () => db.query('update public.services set predefined_service_id=$1 where id=$2',
        [nail.id, victim.id]),
      /provenance is immutable/i);

    await mustReject('null out provenance to fake a custom service',
      () => db.query(
        `update public.services set theme_id=null, category_id=null, predefined_service_id=null where id=$1`,
        [victim.id]),
      /provenance is immutable/i);

    await mustReject('move the row to another tenant',
      () => db.query('update public.services set business_id=$1 where id=$2',
        [ids.businessB, victim.id]),
      /ownership is immutable/i);

    const after = (await db.query(
      `select theme_id, category_id, predefined_service_id, business_id
       from public.services where id=$1`, [victim.id])).rows[0];
    assert.deepEqual(after, before, 'provenance changed despite the guard');

    // Legitimate edits still work.
    await db.query('select public.update_saved_service($1,null,null,555500,66,null)', [victim.id]);
    const edited = (await db.query(
      `select price_paise, duration_minutes, theme_id, category_id, predefined_service_id
       from public.services where id=$1`, [victim.id])).rows[0];
    assert.equal(Number(edited.price_paise), 555500);
    assert.equal(edited.duration_minutes, 66);
    assert.equal(edited.theme_id, before.theme_id);
    assert.equal(edited.category_id, before.category_id);
    assert.equal(edited.predefined_service_id, before.predefined_service_id);
  });
});

await test('REL-5 — inactive predefined services cannot be linked', async () => {
  const target = await predefinedOf('beauty_skin_spa');
  await asServiceRole(() => db.query(
    'update public.predefined_services set is_active=false where id=$1', [target.id]));

  await asUser(ids.ownerA, async () => {
    await mustReject('RPC add with an inactive predefined service',
      () => db.query(
        `select public.create_saved_service('beauty_skin_spa',$1,'x','y',1000,10,$2,'active')`,
        [target.category_id, target.id]),
      /does not belong to this theme and category/i);
    await mustReject('Add Selected with an inactive predefined service',
      () => db.query(
        `select public.save_predefined_services('beauty_skin_spa', array[$1::uuid])`, [target.id]),
      /do not belong to the active theme/i);
    // Direct INSERT is now blocked by the M23 trigger (the FK alone allowed it).
    await mustReject('direct INSERT with an inactive predefined service',
      () => db.query(
        `insert into public.services (business_id,theme_id,category_id,predefined_service_id,name,price_paise,duration_minutes)
         values ($1,$2,$3,$4,'x',1000,10)`,
        [ids.businessA, target.theme_id, target.category_id, target.id]),
      /inactive/i);
  });

  await asServiceRole(() => db.query(
    'update public.predefined_services set is_active=true where id=$1', [target.id]));
});

await test('REL-6 — global catalog rows are never mutated or deleted by tenants', async () => {
  await asUser(ids.ownerA, async () => {
    for (const [label, sql] of [
      ['update theme', `update public.themes set name='hacked'`],
      ['delete theme', 'delete from public.themes'],
      ['update category', `update public.service_categories set name='hacked'`],
      ['delete category', 'delete from public.service_categories'],
      ['update predefined', `update public.predefined_services set name='hacked'`],
      ['delete predefined', 'delete from public.predefined_services'],
    ]) {
      await mustReject(`tenant tried to ${label}`, () => db.query(sql), /permission denied/i);
    }
  });
});

// ===========================================================================
// ERROR HANDLING & DATA VALIDATION
// ===========================================================================

await test('ERR-1 — duplicate services are rejected on every theme', async () => {
  await asUser(ids.ownerA, async () => {
    for (const themeId of THEMES) {
      const victim = ownerAServices[themeId];
      const predefined = await predefinedOf(themeId);
      // Same predefined service twice.
      await mustReject(`${themeId}: duplicate predefined`,
        () => db.query(
          `select public.create_saved_service($1,$2,'Different name','y',1000,10,$3,'active')`,
          [themeId, predefined.category_id, predefined.id]),
        /already saved/i);
      // Same custom name twice (case-insensitive).
      await mustReject(`${themeId}: duplicate name`,
        () => db.query(
          `select public.create_saved_service($1,$2,$3,'y',1000,10,null,'active')`,
          [themeId, predefined.category_id, victim.name.toUpperCase()]),
        /already saved/i);
      // Repeated Add Selected inserts nothing.
      const suggested = (await catalogLookupAll(
        `select ps.id from public.predefined_services ps
         join public.themes t on t.id=ps.theme_id
         where t.theme_id=$1 and ps.is_active and ps.is_suggested limit 2`, [themeId])).map((r) => r.id);
      await db.query(`select public.save_predefined_services($1,$2::uuid[])`, [themeId, suggested]);
      const again = await db.query(
        `select public.save_predefined_services($1,$2::uuid[]) as d`, [themeId, suggested]);
      assert.equal(again.rows[0].d.inserted_count, 0);
      assert.equal(again.rows[0].d.existing_count, suggested.length);
    }
  });
});

await test('ERR-2 — invalid field values are rejected with readable messages', async () => {
  await asUser(ids.ownerA, async () => {
    const victim = ownerAServices.hair_studio_color_bar;
    const cat = await categoryOf('hair_studio_color_bar');
    const cases = [
      ['blank name on add', `select public.create_saved_service('hair_studio_color_bar','${cat}','   ','y',1000,10,null,'active')`, /name is required/i],
      ['negative price on add', `select public.create_saved_service('hair_studio_color_bar','${cat}','Neg','y',-1,10,null,'active')`, /price cannot be negative/i],
      ['zero duration on add', `select public.create_saved_service('hair_studio_color_bar','${cat}','Zero','y',1000,0,null,'active')`, /duration must be positive/i],
      ['bad status on add', `select public.create_saved_service('hair_studio_color_bar','${cat}','Bad','y',1000,10,null,'deleted')`, /status must be active, inactive, or archived/i],
      ['blank name on edit', `select public.update_saved_service('${victim.id}','  ',null,null,null,null)`, /name is required/i],
      ['negative price on edit', `select public.update_saved_service('${victim.id}',null,null,-5,null,null)`, /price cannot be negative/i],
      ['zero duration on edit', `select public.update_saved_service('${victim.id}',null,null,null,0,null)`, /duration must be positive/i],
      ['bad status on edit', `select public.update_saved_service('${victim.id}',null,null,null,null,'nope')`, /status must be active, inactive, or archived/i],
      ['bad status change', `select public.set_saved_service_status('${victim.id}','removed')`, /status must be active, inactive, or archived/i],
    ];
    for (const [label, sql, pattern] of cases) {
      await mustReject(label, () => db.query(sql), pattern);
    }
    // Constraint-level protection remains for direct writes.
    await mustReject('direct INSERT negative price',
      () => db.query(
        `insert into public.services (business_id,name,price_paise,duration_minutes)
         values ($1,'x',-1,10)`, [ids.businessA]),
      /violates|check constraint/i);
  });
});

await test('ERR-3 — operating on a missing/deleted service fails safely', async () => {
  await asUser(ids.ownerA, async () => {
    const ghost = '00000000-0000-4000-8000-00000000dead';
    await mustReject('edit a nonexistent service',
      () => db.query(`select public.update_saved_service($1,'x',null,null,null,null)`, [ghost]),
      /not found for your salon/i);
    await mustReject('status of a nonexistent service',
      () => db.query('select public.set_saved_service_status($1,$2)', [ghost, 'active']),
      /not found for your salon/i);
    await mustReject('delete a nonexistent service',
      () => db.query('select public.delete_saved_service($1)', [ghost]),
      /not found for your salon/i);

    // Deleting twice: the second attempt is a clean, readable failure.
    const cat = await categoryOf('barber_mens_grooming');
    const temp = (await db.query(
      `select public.create_saved_service('barber_mens_grooming',$1,'Temp del','y',1000,10,null,'active') as d`,
      [cat])).rows[0].d;
    assert.equal((await db.query('select public.delete_saved_service($1) as d', [temp.id])).rows[0].d, temp.id);
    await mustReject('double delete',
      () => db.query('select public.delete_saved_service($1)', [temp.id]),
      /not found for your salon/i);
  });
});

await test('ERR-4 — an INACTIVE saved service stays owner-visible but off the public site', async () => {
  await asUser(ids.ownerA, async () => {
    const victim = ownerAServices.nail_lash_studio;
    await db.query('select public.set_saved_service_status($1,$2)', [victim.id, 'inactive']);
    const load = await db.query(
      `select public.get_saved_services_for_theme('nail_lash_studio') as d`);
    const row = load.rows[0].d.services.find((s) => s.id === victim.id);
    assert.ok(row, 'the owner must still see and manage an inactive service');
    assert.equal(row.status, 'inactive');
    // Reactivating restores it.
    await db.query('select public.set_saved_service_active($1,true)', [victim.id]);
  });

  // Public website output only ever contains active services.
  await asServiceRole(async () => {
    await db.query(
      `insert into public.website_settings (business_id, template_id, slug, publish_status, published_at)
       values ($1,'barber','salon-a','published', now())
       on conflict (business_id) do update
         set slug = excluded.slug,
             publish_status = excluded.publish_status,
             published_at = excluded.published_at`,
      [ids.businessA]);
  });
  const victim = ownerAServices.beauty_skin_spa;
  await asUser(ids.ownerA, () => db.query(
    'select public.set_saved_service_status($1,$2)', [victim.id, 'inactive']));
  const site = await db.query(`select public.get_public_website_by_slug('salon-a') as d`);
  if (site.rows[0].d) {
    const names = (site.rows[0].d.services ?? []).map((s) => s.id);
    assert.equal(names.includes(victim.id), false,
      'an inactive service must not appear on the public website');
  }
  await asUser(ids.ownerA, () => db.query(
    'select public.set_saved_service_active($1,true)', [victim.id]));
});

await test('ERR-5 — empty saved-service list is a valid, non-error response', async () => {
  // Owner B has no barber services; the RPC must return an empty array, not null.
  await asUser(ids.ownerB, async () => {
    const r = await db.query(
      `select public.get_saved_services_for_theme('hair_studio_color_bar') as d`);
    assert.equal(r.rows[0].d.business_id, ids.businessB);
    assert.deepEqual(r.rows[0].d.services, []);
  });
  // Unknown themes return NULL from the catalog RPC so the UI can show a
  // dedicated "invalid theme" state rather than an empty catalog.
  const unknown = await db.query(
    `select public.get_theme_service_catalog('nope') as d`);
  assert.equal(unknown.rows[0].d, null);
});

await test('ERR-6 — a failed operation leaves no partial data behind', async () => {
  await asUser(ids.ownerA, async () => {
    const before = (await db.query(
      'select count(*)::int c from public.services where business_id=$1', [ids.businessA])).rows[0].c;
    const suggested = (await catalogLookupAll(
      `select ps.id from public.predefined_services ps
       join public.themes t on t.id=ps.theme_id
       where t.theme_id='hair_studio_color_bar' and ps.is_active limit 3`)).map((r) => r.id);
    const nail = await predefinedOf('nail_lash_studio');

    // One bad ID in the batch must abort the WHOLE Add Selected batch.
    await mustReject('mixed valid/invalid Add Selected batch',
      () => db.query(
        `select public.save_predefined_services('hair_studio_color_bar', $1::uuid[])`,
        [[...suggested, nail.id]]),
      /do not belong to the active theme/i);
    const after = (await db.query(
      'select count(*)::int c from public.services where business_id=$1', [ids.businessA])).rows[0].c;
    assert.equal(after, before, 'a rejected batch must insert nothing at all');
  });
});

await test('ERR-7 — tenant + custom (NULL provenance) rows survive all attacks intact', async () => {
  const custom = await asUser(ids.ownerA, async () => {
    const cat = await categoryOf('hair_studio_color_bar');
    return (await db.query(
      `select public.create_saved_service('hair_studio_color_bar',$1,'Untouchable Custom','mine',4200,55,null,'active') as d`,
      [cat])).rows[0].d;
  });
  assert.equal(custom.predefined_service_id, null);

  await asUser(ids.ownerB, async () => {
    await mustReject('rival edit', () => db.query(
      `select public.update_saved_service($1,'hacked',null,null,null,null)`, [custom.id]),
      /not found for your salon/i);
    await mustReject('rival delete', () => db.query(
      'select public.delete_saved_service($1)', [custom.id]), /not found for your salon/i);
  });
  await asUser(ids.ownerA, async () => {
    const nail = await predefinedOf('nail_lash_studio');
    await mustReject('convert a custom row into a predefined one',
      () => db.query('update public.services set predefined_service_id=$1 where id=$2',
        [nail.id, custom.id]),
      /provenance is immutable/i);
  });

  const row = (await db.query(
    `select name, price_paise, duration_minutes, predefined_service_id
     from public.services where id=$1`, [custom.id])).rows[0];
  assert.equal(row.name, 'Untouchable Custom');
  assert.equal(Number(row.price_paise), 4200);
  assert.equal(row.duration_minutes, 55);
  assert.equal(row.predefined_service_id, null);
});

await test('SEC-FINAL — the global catalog is byte-identical after every attack', async () => {
  const snapshot = await db.query(`
    select
      (select count(*)::int from public.themes) as themes,
      (select count(*)::int from public.service_categories) as categories,
      (select count(*)::int from public.predefined_services) as predefined,
      (select md5(string_agg(t.theme_id||t.name||t.is_active::text,'|' order by t.theme_id))
         from public.themes t) as theme_hash,
      (select md5(string_agg(c.id::text||c.name,'|' order by c.id))
         from public.service_categories c) as category_hash,
      (select md5(string_agg(p.id::text||p.name||coalesce(p.description,'')||p.is_active::text,'|' order by p.id))
         from public.predefined_services p) as predefined_hash
  `);
  assert.equal(snapshot.rows[0].themes, 5);
  assert.equal(snapshot.rows[0].categories, 17);
  assert.equal(snapshot.rows[0].predefined, 78);
  // Every theme and predefined service is active again after the toggles above.
  const inactive = await db.query(`
    select (select count(*)::int from public.themes where not is_active) as t,
           (select count(*)::int from public.predefined_services where not is_active) as p
  `);
  assert.equal(inactive.rows[0].t, 0);
  assert.equal(inactive.rows[0].p, 0);

  // Owner B still owns exactly its own rows; no cross-contamination occurred.
  const bRows = await db.query(
    'select count(*)::int c from public.services where business_id=$1', [ids.businessB]);
  assert.ok(bRows.rows[0].c >= 1);
  const orphans = await db.query(`
    select count(*)::int c from public.services s
    where s.predefined_service_id is not null
      and not exists (
        select 1 from public.predefined_services ps
        where ps.id = s.predefined_service_id
          and ps.theme_id = s.theme_id
          and ps.category_id = s.category_id)
  `);
  assert.equal(orphans.rows[0].c, 0, 'no saved row may hold a broken provenance chain');
});

console.log(`\nService security tests: ${passed}/20 passed`);
assert.equal(passed, 20);
await db.close();
