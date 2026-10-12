create table public.business_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  city text not null check (char_length(btrim(city)) between 1 and 120),
  address text not null check (char_length(btrim(address)) between 1 and 240),
  postal_code text not null check (postal_code ~ '^[0-9]{2}-[0-9]{3}$'),
  phone text not null check (phone ~ '^\+?[0-9 ()-]{7,20}$'),
  industry text not null check (char_length(btrim(industry)) between 1 and 120),
  service_area text not null check (char_length(btrim(service_area)) between 1 and 500),
  radius_km integer not null check (radius_km between 0 and 1000),
  description text not null check (char_length(btrim(description)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.construction_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  city text not null check (char_length(btrim(city)) between 1 and 120),
  address text not null check (char_length(btrim(address)) between 1 and 240),
  description text not null check (char_length(btrim(description)) between 1 and 4000),
  building_type text not null check (building_type in ('house','extension','renovation','other')),
  area_m2 numeric not null check (area_m2 > 0 and area_m2 <= 100000),
  floors integer not null check (floors between 1 and 100),
  basement boolean not null,
  roof text not null check (roof in ('pitched','flat','other')),
  materials text not null default '' check (char_length(materials) <= 2000),
  start_date date,
  budget_pln numeric check (budget_pln > 0 and budget_pln <= 1000000000),
  status text not null default 'draft' check (status in ('draft','open','cancelled')),
  created_at timestamptz not null default now()
);
create index construction_jobs_client_idx on public.construction_jobs(client_id);

create table public.employee_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references public.business_profiles(organization_id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  password_change_required boolean not null default true,
  created_at timestamptz not null default now()
);
create index employee_accounts_business_idx on public.employee_accounts(business_id);

create function public.employee_password_required()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.employee_accounts
    where user_id = (select auth.uid()) and password_change_required
  );
$$;
revoke all on function public.employee_password_required() from public, anon;
grant execute on function public.employee_password_required() to authenticated;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select not public.employee_password_required() and exists (
    select 1 from public.memberships
    where organization_id = target_organization_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.has_organization_role(
  target_organization_id uuid, allowed_roles public.membership_role[]
)
returns boolean language sql stable security definer set search_path = ''
as $$
  select not public.employee_password_required() and exists (
    select 1 from public.memberships
    where organization_id = target_organization_id
      and user_id = (select auth.uid()) and role = any(allowed_roles)
  );
$$;

alter table public.business_profiles enable row level security;
alter table public.construction_jobs enable row level security;
alter table public.employee_accounts enable row level security;

create policy business_profiles_read on public.business_profiles for select to authenticated
  using (public.is_organization_member(organization_id));
create policy business_profiles_update on public.business_profiles for update to authenticated
  using (public.has_organization_role(organization_id, array['owner']::public.membership_role[]))
  with check (public.has_organization_role(organization_id, array['owner']::public.membership_role[]));
create policy jobs_read on public.construction_jobs for select to authenticated
  using (client_id = (select auth.uid()) and not public.employee_password_required());
create policy jobs_insert on public.construction_jobs for insert to authenticated
  with check (
    client_id = (select auth.uid())
    and exists(select 1 from public.profiles where id = (select auth.uid()) and account_type = 'client')
    and not exists(select 1 from public.employee_accounts where user_id = (select auth.uid()))
  );
create policy jobs_update on public.construction_jobs for update to authenticated
  using (client_id = (select auth.uid()) and not public.employee_password_required())
  with check (client_id = (select auth.uid()) and not public.employee_password_required());
create policy employee_accounts_read on public.employee_accounts for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_organization_role(business_id, array['owner']::public.membership_role[])
  );

revoke all on public.business_profiles, public.construction_jobs, public.employee_accounts from public, anon, authenticated;
grant select on public.business_profiles, public.construction_jobs, public.employee_accounts to authenticated;
grant update(city,address,postal_code,phone,industry,service_area,radius_km,description)
  on public.business_profiles to authenticated;
grant insert(title,city,address,description,building_type,area_m2,floors,basement,roof,materials,start_date,budget_pln)
  on public.construction_jobs to authenticated;
grant update(title,city,address,description,building_type,area_m2,floors,basement,roof,materials,start_date,budget_pln,status)
  on public.construction_jobs to authenticated;
grant all on public.business_profiles, public.construction_jobs, public.employee_accounts, public.memberships,
  public.profiles, public.organizations to service_role;

create function public.complete_business_profile(
  business_name text, business_nip text, business_city text, business_address text,
  business_postal_code text, business_phone text, business_industry text,
  business_service_area text, business_radius_km integer, business_description text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  selected_kind public.organization_kind;
  business_id uuid;
begin
  if auth.uid() is null or exists(select 1 from public.employee_accounts where user_id = auth.uid()) then
    raise exception 'Only business owners can complete onboarding' using errcode = '42501';
  end if;
  select account_type into selected_kind from public.profiles where id = auth.uid() for update;
  if selected_kind is null or selected_kind not in ('contractor', 'store') then
    raise exception 'Choose contractor or store first' using errcode = '23514';
  end if;
  select o.id into business_id from public.organizations o
    where o.created_by = auth.uid() and o.kind = selected_kind order by o.created_at limit 1;
  if business_id is null then
    insert into public.organizations(name,kind,nip,created_by)
      values(btrim(business_name),selected_kind,business_nip,auth.uid()) returning id into business_id;
  else
    update public.organizations set name = btrim(business_name), nip = business_nip where id = business_id;
  end if;
  insert into public.business_profiles(organization_id,city,address,postal_code,phone,industry,service_area,radius_km,description)
    values(business_id,btrim(business_city),btrim(business_address),business_postal_code,business_phone,
      btrim(business_industry),btrim(business_service_area),business_radius_km,btrim(business_description))
    on conflict(organization_id) do update set
      city=excluded.city,address=excluded.address,postal_code=excluded.postal_code,phone=excluded.phone,
      industry=excluded.industry,service_area=excluded.service_area,radius_km=excluded.radius_km,description=excluded.description;
  return business_id;
end;
$$;
revoke all on function public.complete_business_profile(text,text,text,text,text,text,text,text,integer,text)
  from public, anon;
grant execute on function public.complete_business_profile(text,text,text,text,text,text,text,text,integer,text)
  to authenticated;
