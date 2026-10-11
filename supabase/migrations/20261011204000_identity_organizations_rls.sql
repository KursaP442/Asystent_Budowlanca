create type public.organization_kind as enum ('client', 'contractor', 'store');
create type public.membership_role as enum ('owner', 'admin', 'member');

create function public.is_valid_polish_nip(nip text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when nip !~ '^[0-9]{10}$' then false
    else (
      substring(nip from 1 for 1)::integer * 6
      + substring(nip from 2 for 1)::integer * 5
      + substring(nip from 3 for 1)::integer * 7
      + substring(nip from 4 for 1)::integer * 2
      + substring(nip from 5 for 1)::integer * 3
      + substring(nip from 6 for 1)::integer * 4
      + substring(nip from 7 for 1)::integer * 5
      + substring(nip from 8 for 1)::integer * 6
      + substring(nip from 9 for 1)::integer * 7
    ) % 11 = substring(nip from 10 for 1)::integer
  end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  kind public.organization_kind not null,
  nip text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint organizations_nip_format check (
    nip is null or public.is_valid_polish_nip(nip)
  ),
  constraint organizations_business_nip_required check (
    kind = 'client' or nip is not null
  )
);

create unique index organizations_nip_unique
  on public.organizations (nip)
  where nip is not null;

create table public.memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
  );
$$;

create function public.has_organization_role(
  target_organization_id uuid,
  allowed_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.role = any (allowed_roles)
  );
$$;

create function public.add_organization_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.memberships (organization_id, user_id, role)
  values (new.id, new.created_by, 'owner');

  return new;
end;
$$;

create trigger on_organization_created
  after insert on public.organizations
  for each row execute function public.add_organization_creator_as_owner();

create function public.prevent_organization_creator_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'Organization creator cannot be changed'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger prevent_organization_creator_update
  before update of created_by on public.organizations
  for each row execute function public.prevent_organization_creator_change();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

create policy profiles_select_self
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy organizations_select_member
  on public.organizations for select to authenticated
  using (public.is_organization_member(id));

create policy organizations_insert_creator
  on public.organizations for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy organizations_update_admin
  on public.organizations for update to authenticated
  using (
    public.has_organization_role(
      id,
      array['owner', 'admin']::public.membership_role[]
    )
  )
  with check (
    public.has_organization_role(
      id,
      array['owner', 'admin']::public.membership_role[]
    )
  );

create policy memberships_select_member
  on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_organization_member(organization_id)
  );

revoke all on public.profiles, public.organizations, public.memberships
  from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.organizations to authenticated;
grant insert (name, kind, nip) on public.organizations to authenticated;
grant update (name, kind, nip) on public.organizations to authenticated;
grant select on public.memberships to authenticated;

revoke all on function public.is_valid_polish_nip(text) from public, anon, authenticated;
grant execute on function public.is_valid_polish_nip(text) to authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.is_organization_member(uuid) from public, anon, authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
revoke all on function public.has_organization_role(uuid, public.membership_role[])
  from public, anon, authenticated;
grant execute on function public.has_organization_role(uuid, public.membership_role[])
  to authenticated;
revoke all on function public.add_organization_creator_as_owner() from public, anon, authenticated;
revoke all on function public.prevent_organization_creator_change() from public, anon, authenticated;
