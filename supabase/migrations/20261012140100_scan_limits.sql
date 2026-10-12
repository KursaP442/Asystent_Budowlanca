create table public.plan_scan_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index plan_scan_attempts_user_time on public.plan_scan_attempts(user_id, attempted_at);
alter table public.plan_scan_attempts enable row level security;
revoke all on public.plan_scan_attempts from anon,authenticated;
create function public.claim_plan_scan(target_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text,0));
  if (select count(*) from public.plan_scan_attempts where user_id=target_user_id and attempted_at>now()-interval '1 hour') >= 10 then
    raise exception 'Limit analizy AI.';
  end if;
  insert into public.plan_scan_attempts(user_id) values(target_user_id);
end;
$$;
revoke all on function public.claim_plan_scan(uuid) from public,anon,authenticated;
grant execute on function public.claim_plan_scan(uuid) to service_role;
