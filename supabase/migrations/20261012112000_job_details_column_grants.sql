grant insert(id,postal_code,latitude,longitude,plot_area_m2,existing_area_m2,rooms,existing_condition,work_category,site_access,utilities)
  on public.construction_jobs to authenticated;
grant update(postal_code,latitude,longitude,plot_area_m2,existing_area_m2,rooms,existing_condition,work_category,site_access,utilities)
  on public.construction_jobs to authenticated;
