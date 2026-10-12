begin;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('20000000-0000-4000-8000-000000000001','authenticated','authenticated','details1@example.test','{}','{}'),
 ('20000000-0000-4000-8000-000000000002','authenticated','authenticated','details2@example.test','{}','{}');
update public.profiles set account_type='client' where id::text like '20000000%';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select lives_ok($$insert into public.construction_jobs(id,title,city,address,postal_code,description,building_type,area_m2,floors,basement,rooms,existing_condition,requirements,acceptance_criteria,report_summary,start_date)
 values('20000000-0000-4000-8000-000000000010','Remont','City','Address','30-001','Scope','renovation',40,null,null,'Kitchen','Old tiles','Steps','Acceptance','Report','2026-11-20')$$,
 'Renovation saves rooms instead of building floors');
select throws_ok($$update public.construction_jobs set floors=2$$,'23514',null,'Renovation rejects building floors');
select throws_ok($$update public.construction_jobs set rooms=''$$,'23514',null,'Renovation requires room details');
select throws_ok($$update public.construction_jobs set postal_code=''$$,'23514',null,'Postal code is required');
select throws_ok($$update public.construction_jobs set start_date=null$$,'23514',null,'Start date is required');
select is(public.owns_job_photo('20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000010/image.png'),true,'Owner may access own job photo');
select lives_ok($$insert into storage.objects(bucket_id,name)
 values('job-photos','20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000010/image.png')$$,'Owner can register photo for own job');
select throws_ok($$insert into storage.objects(bucket_id,name)
 values('job-photos','20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000099/image.png')$$,'42501',null,'Photo needs an existing owned job');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from storage.objects where bucket_id='job-photos' and name like '20000000%'),0,'Another client cannot list private photos');
select throws_ok($$insert into storage.objects(bucket_id,name)
 values('job-photos','20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000010/foreign.png')$$,'42501',null,'Another client cannot upload to owned job');
select is(public.owns_job_photo('20000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000010/image.png'),false,'Delete policy ownership helper denies another client');
reset role;
select is((select count(*)::integer from storage.objects where bucket_id='job-photos' and name like '20000000%'),1,'Owner photo remains registered');
select is((select public from storage.buckets where id='job-photos'),false,'Photo bucket is private');
select is((select file_size_limit from storage.buckets where id='job-photos'),10485760::bigint,'Photo limit is 10 MB');

alter table public.construction_jobs disable trigger validate_job_work_details;
insert into public.construction_jobs(title,client_id,city,address,postal_code,description,building_type,area_m2,floors,basement,roof,start_date,requirements,acceptance_criteria,report_summary)
 values('Legacy renovation','20000000-0000-4000-8000-000000000001','City','Address','30-001','Scope','renovation',20,1,false,'pitched','2026-11-20','','','Legacy report');
alter table public.construction_jobs enable trigger validate_job_work_details;
select lives_ok($$update public.construction_jobs set status='open' where title='Legacy renovation'$$,'Historical jobs can still change status without rewriting old details');
select is((select roof from public.construction_jobs where title='Legacy renovation'),'pitched','Historical project roof is preserved');
select * from finish();
rollback;
