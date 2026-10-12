begin;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('30000000-0000-4000-8000-000000000001','authenticated','authenticated','draft1@example.test','{}','{}'),
 ('30000000-0000-4000-8000-000000000002','authenticated','authenticated','draft2@example.test','{}','{}');
update public.profiles set account_type='client' where id::text like '30000000%';
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
insert into public.construction_jobs(id,title,city,address,postal_code,description,building_type,area_m2,floors,basement,work_category,requirements,acceptance_criteria,report_summary,start_date)
 values('30000000-0000-4000-8000-000000000010','Dach','City','Address','30-001','Pokrycie dachu','other',80,null,null,'Dach','Project','Acceptance','Report','2026-11-20');
select is(public.save_documentation_draft('30000000-0000-4000-8000-000000000010',0,
 '{"version":1,"step":"roof","modules":{"roof":{"measurements":[""],"notes":""}}}'),1,'Initial draft starts at revision one');
select is(public.save_documentation_draft('30000000-0000-4000-8000-000000000010',1,
 '{"version":1,"step":"roof","modules":{"roof":{"measurements":["5000 mm"],"notes":"Draft"}}}'),2,'Owner saves next revision');
select throws_ok($$select public.save_documentation_draft('30000000-0000-4000-8000-000000000010',1,
 '{"version":1,"step":"roof","modules":{"roof":{"measurements":["old"],"notes":""}}}')$$,
 '40001',null,'Stale tab cannot overwrite new draft');
select is((select payload #>> '{modules,roof,measurements,0}' from public.construction_documentation_drafts
 where job_id='30000000-0000-4000-8000-000000000010'),'5000 mm','Conflict preserves current measurements');
select throws_ok($$select public.save_documentation_draft('30000000-0000-4000-8000-000000000010',2,
 '{"version":1,"step":"roof","modules":{"roof":{"measurements":[1000],"notes":""}}}')$$,
 '22023',null,'Numeric payload does not bypass the shared string measurement contract');
select throws_ok($$select public.save_documentation_draft('30000000-0000-4000-8000-000000000010',2,
 '{"version":1,"step":"foundation","modules":{"roof":{"measurements":[],"notes":""}}}')$$,
 '22023',null,'Current step must exist');
select throws_ok($$select public.save_documentation_draft('30000000-0000-4000-8000-000000000010',2,
 '{"version":"1","step":"roof","modules":{"roof":{"measurements":[],"notes":""}}}')$$,
 '22023',null,'Header version must be a number matching the shared schema');
select throws_ok($$update public.construction_documentation_drafts set revision=100$$,
 '42501',null,'Direct writes cannot bypass optimistic revisions');
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.construction_documentation_drafts),0,'Other client cannot read draft');
select throws_ok($$select public.save_documentation_draft('30000000-0000-4000-8000-000000000010',2,
 '{"version":1,"step":"roof","modules":{"roof":{"measurements":[],"notes":""}}}')$$,
 '42501',null,'Other client cannot update draft');
reset role;
select * from finish();
rollback;
