create table public.reinforcement_shape_templates (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null check (category in ('bend','stirrup')),
  shape jsonb not null check (
    jsonb_typeof(shape) = 'object'
    and jsonb_typeof(shape -> 'bends') = 'array'
    and jsonb_array_length(shape -> 'bends') between 1 and 200
    and octet_length(shape::text) <= 100000
  ),
  created_at timestamptz not null default now(),
  primary key (user_id,id)
);

create unique index reinforcement_shape_templates_user_name_unique
  on public.reinforcement_shape_templates(user_id,lower(btrim(name)));

alter table public.reinforcement_shape_templates enable row level security;
revoke all on public.reinforcement_shape_templates from anon,authenticated;
grant select,insert,update,delete on public.reinforcement_shape_templates to authenticated;

create policy reinforcement_shape_templates_read on public.reinforcement_shape_templates
  for select to authenticated
  using (user_id=(select auth.uid()) and not public.employee_password_required());

create policy reinforcement_shape_templates_insert on public.reinforcement_shape_templates
  for insert to authenticated
  with check (user_id=(select auth.uid()) and not public.employee_password_required());

create policy reinforcement_shape_templates_update on public.reinforcement_shape_templates
  for update to authenticated
  using (user_id=(select auth.uid()) and not public.employee_password_required())
  with check (user_id=(select auth.uid()) and not public.employee_password_required());

create policy reinforcement_shape_templates_delete on public.reinforcement_shape_templates
  for delete to authenticated
  using (user_id=(select auth.uid()) and not public.employee_password_required());
