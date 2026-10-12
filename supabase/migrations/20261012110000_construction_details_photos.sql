alter table public.construction_jobs
  alter column floors drop not null,
  alter column basement drop not null,
  alter column roof set default 'other',
  add column postal_code text not null default '' check (postal_code ~ '^$|^[0-9]{2}-[0-9]{3}$'),
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  add column plot_area_m2 numeric check (plot_area_m2 > 0 and plot_area_m2 <= 10000000),
  add column existing_area_m2 numeric check (existing_area_m2 > 0 and existing_area_m2 <= 100000),
  add column rooms text not null default '' check (char_length(rooms) <= 500),
  add column existing_condition text not null default '' check (char_length(existing_condition) <= 2000),
  add column work_category text not null default '' check (char_length(work_category) <= 120),
  add column site_access text not null default '' check (char_length(site_access) <= 1000),
  add column utilities text not null default '' check (char_length(utilities) <= 1000),
  add constraint job_coordinate_pair check ((latitude is null) = (longitude is null));

-- Preserve historical jobs; new writes must match the selected work type.
alter table public.construction_jobs add constraint job_work_details check (
  (building_type in ('house','extension') and floors is not null and basement is not null)
  or (building_type in ('renovation','other') and floors is null and basement is null)
) not valid;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 10485760, array['image/jpeg','image/png','image/webp']);

create function public.owns_job_photo(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.construction_jobs
    where client_id = (select auth.uid())
      and split_part(object_name, '/', 1) = client_id::text
      and split_part(object_name, '/', 2) = id::text
  );
$$;
revoke all on function public.owns_job_photo(text) from public, anon;
grant execute on function public.owns_job_photo(text) to authenticated;
create policy job_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and public.owns_job_photo(name));
create policy job_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and public.owns_job_photo(name));
create policy job_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and public.owns_job_photo(name));
