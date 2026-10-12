alter table public.construction_jobs drop constraint job_work_details;

create function public.validate_job_work_details()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and
    row(new.building_type,new.floors,new.basement,new.rooms,new.existing_condition,new.work_category,new.existing_area_m2,new.plot_area_m2)
    is not distinct from
    row(old.building_type,old.floors,old.basement,old.rooms,old.existing_condition,old.work_category,old.existing_area_m2,old.plot_area_m2)
  then return new;
  end if;
  if new.building_type in ('house','extension') then
    if new.floors is null or new.basement is null or new.rooms <> '' or new.work_category <> '' then
      raise exception 'Invalid building parameters' using errcode = '23514';
    end if;
    if new.building_type = 'extension' and new.existing_area_m2 is null then
      raise exception 'Existing building area is required' using errcode = '23514';
    end if;
  else
    if new.floors is not null or new.basement is not null or new.existing_area_m2 is not null or new.plot_area_m2 is not null then
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
create trigger validate_job_work_details before insert or update on public.construction_jobs
for each row execute function public.validate_job_work_details();
