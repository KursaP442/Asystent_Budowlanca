create policy organizations_employee_insert_guard
  on public.organizations as restrictive for insert to authenticated
  with check (not exists(select 1 from public.employee_accounts where user_id = (select auth.uid())));

create policy organizations_employee_update_guard
  on public.organizations as restrictive for update to authenticated
  using (not public.employee_password_required())
  with check (not public.employee_password_required());
