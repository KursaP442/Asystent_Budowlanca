alter table public.construction_jobs
  add column requirements text not null default '' check (char_length(requirements) <= 2000),
  add column acceptance_criteria text not null default '' check (char_length(acceptance_criteria) <= 2000),
  add column report_summary text not null default '' check (char_length(report_summary) <= 12000);

update public.construction_jobs
set postal_code = '00-001'
where postal_code = '';

update public.construction_jobs
set start_date = current_date
where start_date is null;

update public.construction_jobs
set requirements = coalesce(nullif(requirements, ''), 'Wymagania zostaną doprecyzowane przy edycji zlecenia.'),
    acceptance_criteria = coalesce(nullif(acceptance_criteria, ''), 'Kryteria odbioru zostaną doprecyzowane przy edycji zlecenia.'),
    report_summary = coalesce(nullif(report_summary, ''), 'Raport oczekuje na aktualizację zlecenia.')
where requirements = '' or acceptance_criteria = '' or report_summary = '';

alter table public.construction_jobs
  alter column start_date set not null;

alter table public.construction_jobs
  drop constraint if exists construction_jobs_postal_code_check;
alter table public.construction_jobs
  add constraint construction_jobs_postal_code_check check (postal_code ~ '^[0-9]{2}-[0-9]{3}$');

create or replace function public.validate_job_work_details()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if btrim(new.postal_code) !~ '^[0-9]{2}-[0-9]{3}$' then
    raise exception 'Postal code is required' using errcode = '23514';
  end if;
  if new.start_date is null then
    raise exception 'Start date is required' using errcode = '23514';
  end if;
  if btrim(new.requirements) = '' or btrim(new.acceptance_criteria) = '' or btrim(new.report_summary) = '' then
    raise exception 'Request report fields are required' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and
    row(new.building_type,new.floors,new.basement,new.rooms,new.existing_condition,new.work_category,new.plot_area_m2,new.start_date,new.postal_code,new.requirements,new.acceptance_criteria,new.report_summary)
    is not distinct from
    row(old.building_type,old.floors,old.basement,old.rooms,old.existing_condition,old.work_category,old.plot_area_m2,old.start_date,old.postal_code,old.requirements,old.acceptance_criteria,old.report_summary)
  then return new;
  end if;

  if new.building_type in ('house','extension') then
    if new.floors is null or new.basement is null or new.rooms <> '' or new.work_category <> '' then
      raise exception 'Invalid building parameters' using errcode = '23514';
    end if;
  else
    if new.floors is not null or new.basement is not null or new.plot_area_m2 is not null then
      raise exception 'Building parameters do not apply' using errcode = '23514';
    end if;
    if new.building_type = 'renovation' and (btrim(new.rooms) = '' or btrim(new.existing_condition) = '') then
      raise exception 'Rooms and existing condition are required' using errcode = '23514';
    end if;
    if new.building_type = 'other' and btrim(new.work_category) = '' then
      raise exception 'Work category is required' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop policy if exists jobs_market_read on public.construction_jobs;
create policy jobs_market_read on public.construction_jobs for select to authenticated
  using (
    status = 'open'
    and not public.employee_password_required()
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and account_type in ('contractor','store')
    )
  );

grant insert(postal_code,requirements,acceptance_criteria,report_summary,start_date)
  on public.construction_jobs to authenticated;
grant update(postal_code,requirements,acceptance_criteria,report_summary,start_date)
  on public.construction_jobs to authenticated;
