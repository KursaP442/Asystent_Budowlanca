create table public.construction_documentation_drafts (
  job_id uuid primary key references public.construction_jobs(id) on delete cascade,
  revision integer not null check (revision > 0),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload ->> 'version' = '1'
    and jsonb_typeof(payload -> 'modules') = 'object'
    and payload ->> 'step' ~ '^[a-zA-Z][a-zA-Z0-9-]{0,63}$'
    and octet_length(payload::text) <= 1000000
  )
);

alter table public.construction_documentation_drafts enable row level security;
revoke all on public.construction_documentation_drafts from anon, authenticated;
grant select on public.construction_documentation_drafts to authenticated;
create policy documentation_draft_read on public.construction_documentation_drafts for select to authenticated
  using (exists (
    select 1 from public.construction_jobs
    where id = job_id and client_id = (select auth.uid())
  ));

create function public.save_documentation_draft(target_job_id uuid, expected_revision integer, draft_payload jsonb)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  saved_revision integer;
begin
  if not exists (
    select 1 from public.construction_jobs
    where id = target_job_id and client_id = (select auth.uid())
  ) then
    raise exception 'Brak dostępu do dokumentacji tej budowy.' using errcode = '42501';
  end if;
  if expected_revision is null or expected_revision < 0 then
    raise exception 'Nieprawidłowa wersja dokumentacji.' using errcode = '22023';
  end if;
  if draft_payload is null
    or jsonb_typeof(draft_payload) <> 'object'
    or draft_payload ->> 'version' is distinct from '1'
    or jsonb_typeof(draft_payload -> 'modules') is distinct from 'object'
    or draft_payload ->> 'step' is null
    or draft_payload ->> 'step' !~ '^[a-zA-Z][a-zA-Z0-9-]{0,63}$'
    or octet_length(draft_payload::text) > 1000000 then
    raise exception 'Nieprawidłowy format dokumentacji roboczej.' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    insert into public.construction_documentation_drafts(job_id, revision, payload)
    values (target_job_id, 1, draft_payload)
    on conflict (job_id) do nothing
    returning revision into saved_revision;
  else
    update public.construction_documentation_drafts
    set revision = revision + 1, payload = draft_payload
    where job_id = target_job_id and revision = expected_revision
    returning revision into saved_revision;
  end if;
  if saved_revision is null then
    raise exception 'Dokumentację zmieniono w innej karcie. Wczytaj aktualną wersję przed zapisem.' using errcode = '40001';
  end if;
  return saved_revision;
end;
$$;
revoke all on function public.save_documentation_draft(uuid, integer, jsonb) from public, anon;
grant execute on function public.save_documentation_draft(uuid, integer, jsonb) to authenticated;
