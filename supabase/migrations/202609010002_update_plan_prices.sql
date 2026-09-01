update public.plans
set price = 20000, updated_at = now()
where code = 'INDEPENDIENTE';

update public.plans
set price = 40000, updated_at = now()
where code = 'CONSULTORIO';
