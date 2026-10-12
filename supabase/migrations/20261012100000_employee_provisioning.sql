create function public.attach_employee_account(
  owner_id uuid, target_business_id uuid, employee_id uuid, employee_email text, employee_name text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  business_kind public.organization_kind;
begin
  select o.kind into business_kind from public.organizations o
    join public.business_profiles b on b.organization_id = o.id
    join public.memberships m on m.organization_id = o.id
    where o.id = target_business_id and m.user_id = owner_id and m.role = 'owner'
      and o.kind in ('contractor','store');
  if business_kind is null then
    raise exception 'Only the business owner can add employees' using errcode = '42501';
  end if;
  if exists(select 1 from public.memberships where user_id = employee_id) then
    raise exception 'Employee already has a membership' using errcode = '23514';
  end if;
  insert into public.employee_accounts(user_id,business_id,email,display_name)
    values(employee_id,target_business_id,lower(employee_email),btrim(employee_name));
  insert into public.memberships(organization_id,user_id,role)
    values(target_business_id,employee_id,'member');
  update public.profiles set account_type = business_kind where id = employee_id;
end;
$$;
revoke all on function public.attach_employee_account(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.attach_employee_account(uuid,uuid,uuid,text,text) to service_role;
