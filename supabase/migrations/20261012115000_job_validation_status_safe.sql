create or replace function public.validate_job_work_details()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and
    row(new.building_type,new.floors,new.basement,new.rooms,new.existing_condition,new.work_category,new.plot_area_m2,new.start_date,new.postal_code,new.requirements,new.acceptance_criteria,new.report_summary)
    is not distinct from
    row(old.building_type,old.floors,old.basement,old.rooms,old.existing_condition,old.work_category,old.plot_area_m2,old.start_date,old.postal_code,old.requirements,old.acceptance_criteria,old.report_summary)
  then return new;
  end if;

  if btrim(new.postal_code) !~ '^[0-9]{2}-[0-9]{3}$' then
    raise exception 'Postal code is required' using errcode = '23514';
  end if;
  if new.start_date is null then
    raise exception 'Start date is required' using errcode = '23514';
  end if;
  if btrim(new.requirements) = '' or btrim(new.acceptance_criteria) = '' or btrim(new.report_summary) = '' then
    raise exception 'Request report fields are required' using errcode = '23514';
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
