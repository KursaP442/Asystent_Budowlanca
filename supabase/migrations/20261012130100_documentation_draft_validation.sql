create or replace function public.validate_documentation_draft()
returns trigger language plpgsql set search_path = ''
as $$
declare
  item record;
  measurement jsonb;
begin
  if public.employee_password_required() then
    raise exception 'Najpierw zmień hasło tymczasowe.' using errcode = '42501';
  end if;
  if jsonb_typeof(new.payload) is distinct from 'object' then
    raise exception 'Nieprawidłowy format dokumentacji roboczej.' using errcode = '22023';
  end if;
  if new.payload -> 'version' is distinct from '1'::jsonb
    or jsonb_typeof(new.payload -> 'step') is distinct from 'string'
    or new.payload - array['version', 'step', 'modules'] <> '{}'::jsonb
    or jsonb_typeof(new.payload -> 'modules') is distinct from 'object' then
    raise exception 'Nieprawidłowy format dokumentacji roboczej.' using errcode = '22023';
  end if;
  if not (new.payload -> 'modules' ? (new.payload ->> 'step'))
    or (select count(*) from jsonb_object_keys(new.payload -> 'modules')) > 150 then
    raise exception 'Nieprawidłowe etapy dokumentacji.' using errcode = '22023';
  end if;
  for item in select * from jsonb_each(new.payload -> 'modules') loop
    if item.key !~ '^[a-zA-Z][a-zA-Z0-9-]{0,63}$'
      or jsonb_typeof(item.value) <> 'object'
      or item.value - array['measurements', 'notes'] <> '{}'::jsonb
      or jsonb_typeof(item.value -> 'notes') is distinct from 'string'
      or char_length(item.value ->> 'notes') > 4000
      or jsonb_typeof(item.value -> 'measurements') is distinct from 'array' then
      raise exception 'Nieprawidłowy format etapu dokumentacji.' using errcode = '22023';
    end if;
    if jsonb_array_length(item.value -> 'measurements') > 20 then
      raise exception 'Zbyt wiele pomiarów w etapie dokumentacji.' using errcode = '22023';
    end if;
    for measurement in select * from jsonb_array_elements(item.value -> 'measurements') loop
      if jsonb_typeof(measurement) <> 'string' or char_length(measurement #>> '{}') > 4000 then
        raise exception 'Nieprawidłowa treść pomiaru.' using errcode = '22023';
      end if;
    end loop;
  end loop;
  return new;
end;
$$;
revoke all on function public.validate_documentation_draft() from public, anon, authenticated;
create or replace trigger validate_documentation_draft before insert or update on public.construction_documentation_drafts
  for each row execute function public.validate_documentation_draft();
