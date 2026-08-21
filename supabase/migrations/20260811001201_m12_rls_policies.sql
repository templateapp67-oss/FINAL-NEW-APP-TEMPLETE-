-- M12 (DRAFT): tenant-isolated RLS and role-aware access policies
-- Public website data is exposed only by get_public_website_by_slug(); there is
-- no anonymous table SELECT and no anonymous booking/payment write policy.
-- NOT applied to any database. M02 must be finalized first.

begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'businesses', 'business_members', 'business_owners',
    'services', 'packages', 'package_services', 'staff_members', 'staff_services',
    'staff_skills', 'staff_schedules', 'staff_permissions', 'business_media',
    'social_profiles', 'social_videos', 'business_locations', 'business_hours',
    'contact_settings', 'booking_settings', 'booking_day_settings',
    'website_settings', 'website_content', 'onboarding_progress', 'business_draft_state',
    'customers', 'bookings', 'booking_status_history', 'booking_slot_holds',
    'payment_orders', 'payments', 'balance_collections', 'referral_codes',
    'referral_events', 'notification_settings', 'notifications', 'business_activity',
    'website_events', 'business_plans'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end
$$;

grant insert on public.website_events to anon;

-- Identity and tenant root.
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated
  using (id = auth.uid());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists businesses_select_member on public.businesses;
create policy businesses_select_member on public.businesses for select to authenticated
  using (public.is_business_member(id));
drop policy if exists businesses_insert_owner on public.businesses;
create policy businesses_insert_owner on public.businesses for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists businesses_update_admin on public.businesses;
create policy businesses_update_admin on public.businesses for update to authenticated
  using (public.has_business_role(id, array['owner_admin', 'manager']::public.nexora_access_role[]))
  with check (public.has_business_role(id, array['owner_admin', 'manager']::public.nexora_access_role[]));

drop policy if exists business_members_select on public.business_members;
create policy business_members_select on public.business_members for select to authenticated
  using (user_id = auth.uid() or public.has_business_role(business_id, array['owner_admin']::public.nexora_access_role[]));
drop policy if exists business_members_insert_admin on public.business_members;
create policy business_members_insert_admin on public.business_members for insert to authenticated
  with check (public.has_business_role(business_id, array['owner_admin']::public.nexora_access_role[]));
drop policy if exists business_members_update_admin on public.business_members;
create policy business_members_update_admin on public.business_members for update to authenticated
  using (public.has_business_role(business_id, array['owner_admin']::public.nexora_access_role[]))
  with check (public.has_business_role(business_id, array['owner_admin']::public.nexora_access_role[]));

-- Public-facing operational/config rows: member read, owner/manager write.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'business_owners', 'business_media', 'social_profiles',
    'social_videos', 'business_locations', 'business_hours', 'contact_settings',
    'booking_day_settings', 'website_settings', 'website_content'
  ] loop
    execute format('drop policy if exists member_select on public.%I', table_name);
    execute format(
      'create policy member_select on public.%I for select to authenticated using (public.is_business_member(business_id))',
      table_name
    );
    execute format('drop policy if exists admin_insert on public.%I', table_name);
    execute format(
      'create policy admin_insert on public.%I for insert to authenticated with check (public.has_business_role(business_id, array[''owner_admin'', ''manager'']::public.nexora_access_role[]))',
      table_name
    );
    execute format('drop policy if exists admin_update on public.%I', table_name);
    execute format(
      'create policy admin_update on public.%I for update to authenticated using (public.has_business_role(business_id, array[''owner_admin'', ''manager'']::public.nexora_access_role[])) with check (public.has_business_role(business_id, array[''owner_admin'', ''manager'']::public.nexora_access_role[]))',
      table_name
    );
  end loop;
end
$$;

-- Catalog reads follow the role matrix; providers see only assigned services.
drop policy if exists services_role_select on public.services;
create policy services_role_select on public.services for select to authenticated
  using (
    public.has_business_role(business_id, array['owner_admin', 'manager', 'receptionist']::public.nexora_access_role[])
    or exists (
      select 1 from public.staff_members sm
      join public.staff_services ss on ss.staff_id = sm.id
      where ss.service_id = services.id and sm.auth_user_id = auth.uid()
    )
  );
drop policy if exists services_admin_insert on public.services;
create policy services_admin_insert on public.services for insert to authenticated
  with check (public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]));
drop policy if exists services_admin_update on public.services;
create policy services_admin_update on public.services for update to authenticated
  using (public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]))
  with check (public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]));

drop policy if exists packages_role_select on public.packages;
create policy packages_role_select on public.packages for select to authenticated
  using (public.has_business_role(business_id, array['owner_admin', 'manager', 'receptionist']::public.nexora_access_role[]));
drop policy if exists packages_admin_insert on public.packages;
create policy packages_admin_insert on public.packages for insert to authenticated
  with check (public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]));
drop policy if exists packages_admin_update on public.packages;
create policy packages_admin_update on public.packages for update to authenticated
  using (public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]))
  with check (public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]));

-- Package composition follows the package tenant.
drop policy if exists package_services_select on public.package_services;
create policy package_services_select on public.package_services for select to authenticated
  using (exists (
    select 1 from public.packages p where p.id = package_id
      and public.has_business_role(p.business_id, array['owner_admin', 'manager', 'receptionist']::public.nexora_access_role[])
  ));
drop policy if exists package_services_write on public.package_services;
create policy package_services_write on public.package_services for all to authenticated
  using (exists (select 1 from public.packages p where p.id = package_id and public.has_business_role(p.business_id, array['owner_admin', 'manager']::public.nexora_access_role[])))
  with check (exists (select 1 from public.packages p where p.id = package_id and public.has_business_role(p.business_id, array['owner_admin', 'manager']::public.nexora_access_role[])));

-- Staff private columns are visible to owner/manager or the linked staff user.
drop policy if exists staff_members_select on public.staff_members;
create policy staff_members_select on public.staff_members for select to authenticated
  using (
    auth_user_id = auth.uid()
    or public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[])
  );
drop policy if exists staff_members_insert_admin on public.staff_members;
create policy staff_members_insert_admin on public.staff_members for insert to authenticated
  with check (public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]));
drop policy if exists staff_members_update on public.staff_members;
create policy staff_members_update on public.staff_members for update to authenticated
  using (auth_user_id = auth.uid() or public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]))
  with check (auth_user_id = auth.uid() or public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['staff_services', 'staff_skills', 'staff_schedules'] loop
    execute format('drop policy if exists staff_child_select on public.%I', table_name);
    execute format(
      'create policy staff_child_select on public.%I for select to authenticated using (exists (select 1 from public.staff_members sm where sm.id = staff_id and (sm.auth_user_id = auth.uid() or public.has_business_role(sm.business_id, array[''owner_admin'', ''manager'', ''receptionist'']::public.nexora_access_role[]))))',
      table_name
    );
    execute format('drop policy if exists staff_child_write on public.%I', table_name);
    execute format(
      'create policy staff_child_write on public.%I for all to authenticated using (exists (select 1 from public.staff_members sm where sm.id = staff_id and public.has_business_role(sm.business_id, array[''owner_admin'', ''manager'']::public.nexora_access_role[]))) with check (exists (select 1 from public.staff_members sm where sm.id = staff_id and public.has_business_role(sm.business_id, array[''owner_admin'', ''manager'']::public.nexora_access_role[])))',
      table_name
    );
  end loop;
end
$$;

drop policy if exists staff_permissions_private_select on public.staff_permissions;
create policy staff_permissions_private_select on public.staff_permissions for select to authenticated
  using (exists (
    select 1 from public.staff_members sm where sm.id = staff_id and (
      sm.auth_user_id = auth.uid()
      or public.has_business_role(sm.business_id, array['owner_admin', 'manager']::public.nexora_access_role[])
    )
  ));
drop policy if exists staff_permissions_admin_write on public.staff_permissions;
create policy staff_permissions_admin_write on public.staff_permissions for all to authenticated
  using (exists (
    select 1 from public.staff_members sm where sm.id = staff_id
      and public.has_business_role(sm.business_id, array['owner_admin', 'manager']::public.nexora_access_role[])
  ))
  with check (exists (
    select 1 from public.staff_members sm where sm.id = staff_id
      and public.has_business_role(sm.business_id, array['owner_admin', 'manager']::public.nexora_access_role[])
  ));

-- Owner-sensitive settings and draft state.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['booking_settings', 'onboarding_progress', 'business_draft_state'] loop
    execute format('drop policy if exists admin_select on public.%I', table_name);
    execute format(
      'create policy admin_select on public.%I for select to authenticated using (public.has_business_role(business_id, array[''owner_admin'', ''manager'']::public.nexora_access_role[]))',
      table_name
    );
    execute format('drop policy if exists admin_write on public.%I', table_name);
    execute format(
      'create policy admin_write on public.%I for all to authenticated using (public.has_business_role(business_id, array[''owner_admin'', ''manager'']::public.nexora_access_role[])) with check (public.has_business_role(business_id, array[''owner_admin'', ''manager'']::public.nexora_access_role[]))',
      table_name
    );
  end loop;
end
$$;

-- Front-desk booking/customer access; providers see only assigned bookings.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['customers', 'bookings'] loop
    execute format('drop policy if exists frontdesk_select on public.%I', table_name);
    if table_name = 'bookings' then
      execute 'create policy frontdesk_select on public.bookings for select to authenticated using (
        public.has_business_role(business_id, array[''owner_admin'', ''manager'', ''receptionist'']::public.nexora_access_role[])
        or exists (select 1 from public.staff_members sm where sm.id = staff_id and sm.auth_user_id = auth.uid())
      )';
    else
      execute 'create policy frontdesk_select on public.customers for select to authenticated using (
        public.has_business_role(business_id, array[''owner_admin'', ''manager'', ''receptionist'']::public.nexora_access_role[])
      )';
    end if;
    execute format('drop policy if exists frontdesk_insert on public.%I', table_name);
    execute format(
      'create policy frontdesk_insert on public.%I for insert to authenticated with check (public.has_business_role(business_id, array[''owner_admin'', ''manager'', ''receptionist'']::public.nexora_access_role[]))',
      table_name
    );
    execute format('drop policy if exists frontdesk_update on public.%I', table_name);
    execute format(
      'create policy frontdesk_update on public.%I for update to authenticated using (public.has_business_role(business_id, array[''owner_admin'', ''manager'', ''receptionist'']::public.nexora_access_role[])) with check (public.has_business_role(business_id, array[''owner_admin'', ''manager'', ''receptionist'']::public.nexora_access_role[]))',
      table_name
    );
  end loop;
end
$$;

drop policy if exists booking_history_select on public.booking_status_history;
create policy booking_history_select on public.booking_status_history for select to authenticated
  using (exists (
    select 1 from public.bookings b
    left join public.staff_members sm on sm.id = b.staff_id
    where b.id = booking_id and (
      public.has_business_role(b.business_id, array['owner_admin', 'manager', 'receptionist']::public.nexora_access_role[])
      or sm.auth_user_id = auth.uid()
    )
  ));

drop policy if exists holds_frontdesk on public.booking_slot_holds;
create policy holds_frontdesk on public.booking_slot_holds for all to authenticated
  using (public.has_business_role(business_id, array['owner_admin', 'manager', 'receptionist']::public.nexora_access_role[]))
  with check (public.has_business_role(business_id, array['owner_admin', 'manager', 'receptionist']::public.nexora_access_role[]));

-- Financial rows: owner/admin only. Controlled service_role RPCs perform writes.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['payment_orders', 'payments', 'balance_collections'] loop
    execute format('drop policy if exists finance_owner_select on public.%I', table_name);
    execute format(
      'create policy finance_owner_select on public.%I for select to authenticated using (public.has_business_role(business_id, array[''owner_admin'']::public.nexora_access_role[]))',
      table_name
    );
  end loop;
end
$$;

-- Referral and audit data.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['referral_codes', 'business_activity'] loop
    execute format('drop policy if exists admin_select on public.%I', table_name);
    execute format(
      'create policy admin_select on public.%I for select to authenticated using (public.has_business_role(business_id, array[''owner_admin'', ''manager'']::public.nexora_access_role[]))',
      table_name
    );
    execute format('drop policy if exists admin_write on public.%I', table_name);
    execute format(
      'create policy admin_write on public.%I for all to authenticated using (public.has_business_role(business_id, array[''owner_admin'', ''manager'']::public.nexora_access_role[])) with check (public.has_business_role(business_id, array[''owner_admin'', ''manager'']::public.nexora_access_role[]))',
      table_name
    );
  end loop;
end
$$;

drop policy if exists referral_events_admin_select on public.referral_events;
create policy referral_events_admin_select on public.referral_events for select to authenticated
  using (public.has_business_role(source_business_id, array['owner_admin', 'manager']::public.nexora_access_role[]));

-- Notifications are user-private within the tenant.
drop policy if exists notification_settings_own on public.notification_settings;
create policy notification_settings_own on public.notification_settings for all to authenticated
  using (user_id = auth.uid() and public.is_business_member(business_id))
  with check (user_id = auth.uid() and public.is_business_member(business_id));
drop policy if exists notifications_own_select on public.notifications;
create policy notifications_own_select on public.notifications for select to authenticated
  using (user_id = auth.uid() and public.is_business_member(business_id));
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = auth.uid() and public.is_business_member(business_id))
  with check (user_id = auth.uid() and public.is_business_member(business_id));

-- Analytics: anonymous insert only for a published tenant; members cannot forge reads across tenants.
drop policy if exists website_events_member_select on public.website_events;
create policy website_events_member_select on public.website_events for select to authenticated
  using (public.has_business_role(business_id, array['owner_admin', 'manager']::public.nexora_access_role[]));
drop policy if exists website_events_public_insert on public.website_events;
create policy website_events_public_insert on public.website_events for insert to anon, authenticated
  with check (public.is_published_business(business_id));

-- Plan entitlements are readable by owners but writable only through trusted service code.
drop policy if exists business_plans_owner_select on public.business_plans;
create policy business_plans_owner_select on public.business_plans for select to authenticated
  using (public.has_business_role(business_id, array['owner_admin']::public.nexora_access_role[]));

commit;
