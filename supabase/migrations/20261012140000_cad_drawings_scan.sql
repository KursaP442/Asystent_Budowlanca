create table public.cad_drawings (
  job_id uuid not null references public.construction_jobs(id) on delete cascade,
  requirement_id text not null check (requirement_id ~ '^[a-zA-Z][a-zA-Z0-9-]{0,119}$'),
  revision integer not null check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 2000000),
  primary key (job_id, requirement_id)
);
alter table public.cad_drawings enable row level security;
revoke all on public.cad_drawings from anon, authenticated;
grant select on public.cad_drawings to authenticated;
create policy cad_drawings_read on public.cad_drawings for select to authenticated
  using (exists(select 1 from public.construction_jobs where id=job_id and client_id=(select auth.uid()))
    and not public.employee_password_required());

create function public.save_cad_drawing(owner_id uuid, target_job_id uuid, stage_id text,
  expected_revision integer, document_payload jsonb)
returns integer language plpgsql security definer set search_path=''
as $$
declare saved integer;
begin
  if not exists(select 1 from public.construction_jobs where id=target_job_id and client_id=owner_id)
    or exists(select 1 from public.employee_accounts where user_id=owner_id) then
    raise exception 'Brak dostępu do rysunku.' using errcode='42501';
  end if;
  if expected_revision is null or expected_revision < 0 or document_payload ->> 'status' is distinct from 'draft'
    or document_payload ->> 'projectId' is distinct from target_job_id::text
    or document_payload ->> 'requirementId' is distinct from stage_id
    or document_payload ->> 'revision' is distinct from expected_revision::text then
    raise exception 'Nieprawidłowy dokument CAD.' using errcode='22023';
  end if;
  if expected_revision = 0 then
    insert into public.cad_drawings(job_id, requirement_id, revision, payload)
      values(target_job_id, stage_id, 1, jsonb_set(document_payload,'{revision}','1'))
      on conflict do nothing returning revision into saved;
  else
    update public.cad_drawings set revision=revision+1,
      payload=jsonb_set(document_payload,'{revision}',to_jsonb(revision+1))
      where job_id=target_job_id and requirement_id=stage_id and revision=expected_revision returning revision into saved;
  end if;
  if saved is null then
    raise exception 'Rysunek zmieniono w innej karcie. Wczytaj aktualną wersję przed zapisem.' using errcode='40001';
  end if;
  return saved;
end;
$$;
revoke all on function public.save_cad_drawing(uuid,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_cad_drawing(uuid,uuid,text,integer,jsonb) to service_role;

create table public.ai_user_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_key text not null check (char_length(encrypted_key) <= 4000)
);
alter table public.ai_user_credentials enable row level security;
revoke all on public.ai_user_credentials from anon, authenticated;
grant all on public.ai_user_credentials to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('project-scans','project-scans',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy project_scans_read on storage.objects for select to authenticated
  using(bucket_id='project-scans' and public.owns_job_photo(name));
create policy project_scans_insert on storage.objects for insert to authenticated
  with check(bucket_id='project-scans' and public.owns_job_photo(name));
create policy project_scans_delete on storage.objects for delete to authenticated
  using(bucket_id='project-scans' and public.owns_job_photo(name));
