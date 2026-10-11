alter table public.profiles
  add column account_type public.organization_kind;

grant update (account_type) on public.profiles to authenticated;
