begin;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
 ('40000000-0000-4000-8000-000000000001','authenticated','authenticated','cad1@example.test','{}','{}'),
 ('40000000-0000-4000-8000-000000000002','authenticated','authenticated','cad2@example.test','{}','{}');
update public.profiles set account_type='client' where id::text like '40000000%';
insert into public.construction_jobs(id,client_id,title,city,address,postal_code,description,building_type,area_m2,floors,basement,work_category,requirements,acceptance_criteria,report_summary,start_date)
 values('40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000001',
 'Dach','City','Address','30-001','Dach','other',80,null,null,'Dach','Project','Acceptance','Report','2026-11-20');
select is(public.save_cad_drawing('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000010','roof-drawing-0',0,
 '{"status":"draft","projectId":"40000000-0000-4000-8000-000000000010","requirementId":"roof-drawing-0","revision":0}'),1,'CAD initial revision');
select is(public.save_cad_drawing('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000010','roof-drawing-0',1,
 '{"status":"draft","projectId":"40000000-0000-4000-8000-000000000010","requirementId":"roof-drawing-0","revision":1}'),2,'CAD revision increases atomically');
select throws_ok($$select public.save_cad_drawing('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000010','roof-drawing-0',1,
 '{"status":"draft","projectId":"40000000-0000-4000-8000-000000000010","requirementId":"roof-drawing-0","revision":1}')$$,'40001',null,'Stale CAD autosave cannot overwrite another tab');
select throws_ok($$select public.save_cad_drawing('40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000010','roof-drawing-0',2,
 '{"status":"draft","projectId":"40000000-0000-4000-8000-000000000010","requirementId":"roof-drawing-0","revision":2}')$$,'42501',null,'RPC denies forged owner');
select throws_ok($$select public.save_cad_drawing('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000010','roof-drawing-0',2,
 '{"status":"approved","projectId":"40000000-0000-4000-8000-000000000010","requirementId":"roof-drawing-0","revision":2}')$$,'22023',null,'Draft RPC cannot approve structural design');
insert into public.ai_user_credentials(user_id,encrypted_key) values('40000000-0000-4000-8000-000000000001','encrypted-test-placeholder');
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.cad_drawings),1,'Owner reads own CAD');
select throws_ok($$select public.save_cad_drawing('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000010','roof-drawing-0',2,'{}')$$,
 '42501',null,'Client cannot bypass server schema validator');
select throws_ok($$select * from public.ai_user_credentials$$,'42501',null,'Encrypted keys are not client-readable');
select throws_ok($$select public.claim_plan_scan('40000000-0000-4000-8000-000000000001')$$,'42501',null,'Client cannot bypass scan budgeting');
select lives_ok($$insert into storage.objects(bucket_id,name) values('project-scans',
 '40000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000010/source.png')$$,'Owner may upload private stage scan');
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.cad_drawings),0,'Other client cannot read CAD');
select is((select count(*)::integer from storage.objects where bucket_id='project-scans'),0,'Other client cannot read scan');
select throws_ok($$insert into storage.objects(bucket_id,name) values('project-scans',
 '40000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000010/foreign.png')$$,'42501',null,'Other client cannot upload scan');
reset role;
select is((select public from storage.buckets where id='project-scans'),false,'Scan bucket is private');
do $$begin for i in 1..10 loop perform public.claim_plan_scan('40000000-0000-4000-8000-000000000001'); end loop; end$$;
select throws_ok($$select public.claim_plan_scan('40000000-0000-4000-8000-000000000001')$$,'P0001',null,'Eleventh analysis attempt is blocked');
select * from finish();
rollback;
