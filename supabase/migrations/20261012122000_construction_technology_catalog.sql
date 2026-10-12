alter table public.construction_jobs
  drop constraint if exists construction_jobs_materials_check,
  add constraint construction_jobs_materials_check
    check (char_length(materials) <= 12000);
