begin;

select plan(20);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'owner@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Owner One"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'other@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Other User"}'::jsonb,
    now(),
    now()
  );

select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000001'),
  'Owner One',
  'Auth signup creates a profile from display name metadata'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000002'),
  'Other User',
  'Auth signup creates a separate profile for each user'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$insert into public.organizations (name, kind) values ('Owner company', 'client')$$,
  'Authenticated user can create an organization as themselves'
);
select is(
  (
    select count(*)::integer
    from public.memberships
    where organization_id = (
      select id from public.organizations where name = 'Owner company'
    )
      and user_id = '00000000-0000-4000-8000-000000000001'
      and role = 'owner'
  ),
  1,
  'Organization creator receives exactly one owner membership'
);
select is(
  (select count(*)::integer from public.organizations),
  1,
  'Organization owner can read their organization'
);
select is(
  (select count(*)::integer from public.profiles),
  1,
  'Authenticated user can read only their own profile'
);
select lives_ok(
  $$update public.profiles
    set account_type = 'client'
    where id = '00000000-0000-4000-8000-000000000001'$$,
  'Authenticated user can save their own account type'
);
select is(
  (
    select account_type::text
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000001'
  ),
  'client',
  'Saved account type is returned from the profile'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$insert into public.organizations (name, kind) values ('Other company', 'client')$$,
  'Second authenticated user can create their own organization'
);
select is(
  (select count(*)::integer from public.organizations),
  1,
  'Organization access is isolated between users'
);
select is(
  (select count(*)::integer from public.memberships),
  1,
  'Membership listing exposes only the current user organization'
);
select is(
  (select count(*)::integer from public.profiles),
  1,
  'Profile access is isolated between users'
);
select lives_ok(
  $$update public.profiles
    set account_type = 'contractor'
    where id = '00000000-0000-4000-8000-000000000001'$$,
  'RLS filters an attempted update to another user profile'
);
reset role;
select is(
  (
    select account_type::text
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000001'
  ),
  'client',
  'A user cannot change another account type'
);
set local role authenticated;

select throws_ok(
  $$insert into public.organizations (name, kind, created_by)
    values ('Impersonated company', 'client', '00000000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'User cannot create an organization for another account'
);
select throws_ok(
  $$insert into public.memberships (organization_id, user_id, role)
    select id, '00000000-0000-4000-8000-000000000002', 'owner'
    from public.organizations where name = 'Owner company'$$,
  '42501',
  null,
  'Authenticated users cannot directly grant memberships or roles'
);
select throws_ok(
  $$insert into public.organizations (name, kind)
    values ('Invalid contractor', 'contractor')$$,
  '23514',
  null,
  'Contractor organizations must provide a valid NIP'
);
select throws_ok(
  $$insert into public.organizations (name, kind, nip)
    values ('Invalid NIP contractor', 'contractor', '1234567890')$$,
  '23514',
  null,
  'Database rejects an invalid Polish NIP checksum'
);

set local role anon;
select throws_ok(
  $$select * from public.organizations$$,
  '42501',
  null,
  'Anonymous role cannot read organization data'
);
select throws_ok(
  $$select * from public.profiles$$,
  '42501',
  null,
  'Anonymous role cannot read profile data'
);

select * from finish();
rollback;
