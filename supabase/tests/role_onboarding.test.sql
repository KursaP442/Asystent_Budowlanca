begin;
select no_plan();

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','client1@onboarding.test','{}','{}'),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','client2@onboarding.test','{}','{}'),
 ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','owner@onboarding.test','{}','{}'),
 ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','employee@onboarding.test','{}','{}'),
 ('10000000-0000-4000-8000-000000000005','authenticated','authenticated','store@onboarding.test','{}','{}');
update public.profiles set account_type = 'client' where id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
update public.profiles set account_type = 'contractor' where id = '10000000-0000-4000-8000-000000000003';
update public.profiles set account_type = 'store' where id = '10000000-0000-4000-8000-000000000005';

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select lives_ok(
 $$insert into public.construction_jobs(title,city,address,postal_code,description,building_type,area_m2,floors,basement,requirements,acceptance_criteria,report_summary,start_date)
 values('First house','Krakow','Plot 1','30-001','Build a house','house',120,2,false,'Scope','Acceptance','Report','2026-12-01')$$,
 'Client creates the first construction without an organization'
);
select is((select count(*)::integer from public.organizations),0,'Client onboarding does not create an organization');
select is((select count(*)::integer from public.construction_jobs),1,'Client reads their first construction');
select lives_ok(
 $$insert into public.construction_jobs(title,city,address,postal_code,description,building_type,area_m2,floors,basement,requirements,acceptance_criteria,report_summary,start_date)
 values('Second house','Krakow','Plot 2','30-001','Another house','house',90,1,false,'Scope','Acceptance','Report','2026-12-15')$$,
 'Client adds subsequent construction'
);
select is((select count(*)::integer from public.construction_jobs),2,'Subsequent client login has saved jobs');
select lives_ok($$update public.construction_jobs set status='open' where title='First house'$$,'Client publishes a saved job');
select is((select status from public.construction_jobs where title='First house'),'open','Published status persists');
select throws_ok(
 $$insert into public.construction_jobs(title,city,address,postal_code,description,building_type,area_m2,floors,basement,requirements,acceptance_criteria,report_summary,start_date)
 values('Invalid','Krakow','Plot','30-001','House','house',-1,1,false,'Scope','Acceptance','Report','2026-12-01')$$,
 '23514',null,'Database rejects invalid construction measurements'
);
select throws_ok(
 $$select public.complete_business_profile('Wrong','5260250995','Krakow','Street','30-001','123456789','Industry','Region',50,'About')$$,
 '23514',null,'Client cannot complete a business profile'
);

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.construction_jobs),0,'Another client cannot read construction jobs');
update public.construction_jobs set title='Hacked' where title='First house';
reset role;
select is((select title from public.construction_jobs where title='First house'),'First house','Another client cannot edit construction');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select lives_ok(
 $$select public.complete_business_profile('Builder','5260250995','Krakow','Street 1','30-001','123456789','Building houses','Malopolskie',50,'Local builder')$$,
 'Contractor completes business onboarding'
);
select is((select count(*)::integer from public.construction_jobs where status='open'),1,'Contractor can read published client jobs in market view');
select is((select count(*)::integer from public.business_profiles),1,'Contractor profile is visible to owner');
select is((select role::text from public.memberships where user_id=auth.uid()),'owner','Business creator becomes owner internally');
select is((select service_area from public.business_profiles),'Malopolskie','Service area persists');
select lives_ok(
 $$select public.complete_business_profile('Builder','5260250995','Krakow','Street 2','30-001','123456789','Foundations','Krakow',60,'Updated builder')$$,
 'Owner can update profile without duplicate business'
);
select is((select count(*)::integer from public.business_profiles),1,'Repeated onboarding remains idempotent');
select throws_ok(
 $$insert into public.construction_jobs(title,city,address,postal_code,description,building_type,area_m2,floors,basement,requirements,acceptance_criteria,report_summary,start_date)
 values('Wrong','Krakow','Plot','30-001','House','house',120,1,false,'Scope','Acceptance','Report','2026-12-01')$$,
 '42501',null,'Contractor cannot create client construction'
);
select throws_ok(
 $$insert into public.employee_accounts(user_id,business_id,email,display_name)
 select '10000000-0000-4000-8000-000000000004',organization_id,'employee@onboarding.test','Employee' from public.business_profiles$$,
 '42501',null,'Owner cannot bypass the employee server endpoint'
);
select throws_ok(
 $$select public.attach_employee_account(auth.uid(),(select id from public.organizations limit 1),'10000000-0000-4000-8000-000000000004','employee@onboarding.test','Employee')$$,
 '42501',null,'Employee attachment RPC is service-role only'
);

reset role;
set local role service_role;
select throws_ok(
 $$select public.attach_employee_account('10000000-0000-4000-8000-000000000002',(select id from public.organizations where name='Builder'),'10000000-0000-4000-8000-000000000004','employee@onboarding.test','Employee')$$,
 '42501',null,'Employee attachment revalidates owner on the database'
);
select lives_ok(
 $$select public.attach_employee_account('10000000-0000-4000-8000-000000000003',(select id from public.organizations where name='Builder'),'10000000-0000-4000-8000-000000000004','employee@onboarding.test','Employee')$$,
 'Server attaches a new employee atomically'
);
select is((select role::text from public.memberships where user_id='10000000-0000-4000-8000-000000000004'),'member','Employee receives member role, not owner');
select is((select account_type::text from public.profiles where id='10000000-0000-4000-8000-000000000004'),'contractor','Employee inherits correct panel type');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select ok(public.employee_password_required(),'Employee must change temporary password');
select is((select count(*)::integer from public.business_profiles),0,'Temporary password does not expose business data');
select is((select count(*)::integer from public.organizations),0,'Temporary password does not expose business identity');
select is((select count(*)::integer from public.employee_accounts),1,'Employee can read only own login requirement');
select throws_ok(
 $$insert into public.organizations(name,kind) values('Employee shortcut','client')$$,
 '42501',null,'Employee cannot create their own owner context'
);
select throws_ok(
 $$update public.employee_accounts set password_change_required=false where user_id=auth.uid()$$,
 '42501',null,'Employee cannot clear password requirement from the browser'
);
select throws_ok(
 $$select public.complete_business_profile('Hijack','5260250995','Krakow','Street','30-001','123456789','Industry','Region',50,'About')$$,
 '42501',null,'Employee cannot use business owner onboarding'
);
select throws_ok(
 $$insert into public.construction_jobs(title,city,address,postal_code,description,building_type,area_m2,floors,basement,requirements,acceptance_criteria,report_summary,start_date)
 values('Employee shortcut','Krakow','Plot','30-001','House','house',120,1,false,'Scope','Acceptance','Report','2026-12-01')$$,
 '42501',null,'Employee cannot create a client job'
);

set local role service_role;
update public.employee_accounts set password_change_required=false where user_id='10000000-0000-4000-8000-000000000004';
set local role authenticated;
select ok(not public.employee_password_required(),'Server can unlock employee after password change');
select is((select count(*)::integer from public.business_profiles),1,'Activated employee reads employer profile');
update public.business_profiles set industry='Hijack';
reset role;
select is((select industry from public.business_profiles limit 1),'Foundations','Employee cannot edit employer data');
set local role authenticated;
select throws_ok(
 $$insert into public.memberships(organization_id,user_id,role)
 select organization_id,auth.uid(),'owner' from public.business_profiles$$,
 '42501',null,'Employee cannot grant themselves owner');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select lives_ok(
 $$select public.complete_business_profile('Store','5260250274','Warszawa','Shop 1','00-001','123456789','Materials','Mazowieckie',100,'Local store')$$,
 'Store completes separate business profile'
);
select is((select count(*)::integer from public.construction_jobs where status='open'),1,'Store can read published client jobs in market view');
select is((select count(*)::integer from public.business_profiles),1,'Store is isolated from contractor data');
select is((select count(*)::integer from public.employee_accounts),0,'Store cannot read another business employees');
select throws_ok(
 $$select public.complete_business_profile('Store','5260250274','Warszawa','Shop 1','bad','123456789','Materials','Mazowieckie',100,'Local store')$$,
 '23514',null,'Invalid profile update rolls back atomically'
);
select is((select postal_code from public.business_profiles),'00-001','Invalid profile update preserves saved data');

set local role anon;
select throws_ok($$select * from public.construction_jobs$$,'42501',null,'Anonymous users cannot read construction data');
select throws_ok($$select * from public.business_profiles$$,'42501',null,'Anonymous users cannot read business data');
select throws_ok($$select * from public.employee_accounts$$,'42501',null,'Anonymous users cannot read employee identities');

select * from finish();
rollback;
