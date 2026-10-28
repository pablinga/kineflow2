-- Órdenes médicas / autorizaciones de obra social y ART.
--
-- Una orden es de un paciente en un espacio: cobertura (obra social o ART con
-- su prestador), número de orden (en ART, el de siniestro), médico que deriva,
-- sesiones autorizadas, fecha y vencimiento opcional, y la foto o PDF.
--
-- Las sesiones usadas NO se guardan: la app las calcula con los turnos
-- (`src/lib/medical-orders.ts`). Solo descuenta "Asistió"; pasarse de la
-- orden no bloquea la atención, el turno queda "Fuera de orden".
--
-- Permisos: cargan y editan quienes administran pacientes del espacio
-- (kinesiólogo particular dueño, admin y recepción de la clínica); leen
-- además los profesionales con acceso al paciente.

begin;

create table if not exists public.medical_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  coverage_type text not null check (coverage_type in ('OBRA_SOCIAL', 'ART')),
  insurance_provider_id uuid references public.insurance_providers (id) on delete set null,
  art_provider_id uuid references public.art_providers (id) on delete set null,
  order_number text not null
    check (length(trim(order_number)) between 1 and 60),
  prescriber_name text check (prescriber_name is null or length(prescriber_name) <= 120),
  prescriber_license text check (prescriber_license is null or length(prescriber_license) <= 40),
  diagnosis text check (diagnosis is null or length(diagnosis) <= 300),
  authorized_sessions integer not null check (authorized_sessions between 1 and 200),
  issued_on date not null,
  expires_on date,
  treatment_id uuid references public.treatments (id) on delete set null,
  file_path text,
  file_name text,
  file_mime text,
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medical_orders_expiry_check check (expires_on is null or expires_on >= issued_on),
  -- El prestador puede quedar en null si se borra de Configuración; nunca
  -- el de la otra cobertura.
  constraint medical_orders_provider_check check (
    (coverage_type = 'OBRA_SOCIAL' and art_provider_id is null)
    or (coverage_type = 'ART' and insurance_provider_id is null)
  )
);

create index if not exists medical_orders_workspace_patient_idx
  on public.medical_orders (workspace_id, patient_id, issued_on);

-- El paciente, los prestadores y el tratamiento tienen que ser del mismo
-- espacio que la orden.
create or replace function public.validate_medical_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists (
    select 1 from public.patients
    where patients.id = new.patient_id and patients.workspace_id = new.workspace_id
  ) then
    raise exception 'El paciente no pertenece a este espacio.' using errcode = '23514';
  end if;

  if new.insurance_provider_id is not null and not exists (
    select 1 from public.insurance_providers
    where insurance_providers.id = new.insurance_provider_id
      and insurance_providers.workspace_id = new.workspace_id
  ) then
    raise exception 'La obra social no pertenece a este espacio.' using errcode = '23514';
  end if;

  if new.art_provider_id is not null and not exists (
    select 1 from public.art_providers
    where art_providers.id = new.art_provider_id
      and art_providers.workspace_id = new.workspace_id
  ) then
    raise exception 'La ART no pertenece a este espacio.' using errcode = '23514';
  end if;

  if new.treatment_id is not null and not exists (
    select 1 from public.treatments
    where treatments.id = new.treatment_id
      and treatments.patient_id = new.patient_id
  ) then
    raise exception 'El tratamiento no es de este paciente.' using errcode = '23514';
  end if;

  return new;
end;
$function$;

create or replace trigger validate_medical_order
  before insert or update on public.medical_orders
  for each row execute function public.validate_medical_order();

create or replace trigger enforce_medical_order_access_level
  before insert or update on public.medical_orders
  for each row execute function public.enforce_workspace_owned_access_level();

create or replace trigger set_medical_orders_updated_at
  before update on public.medical_orders
  for each row execute function public.set_updated_at();

alter table public.medical_orders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'medical_orders'
      and policyname = 'Users can read medical orders'
  ) then
    create policy "Users can read medical orders"
      on public.medical_orders
      for select
      to authenticated
      -- workspace_id sobre la propia fila: necesario para el INSERT ... RETURNING.
      using (
        public.is_workspace_staff(workspace_id)
        or public.can_access_workspace_patient(patient_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'medical_orders'
      and policyname = 'Staff can create medical orders'
  ) then
    create policy "Staff can create medical orders"
      on public.medical_orders
      for insert
      to authenticated
      with check (
        public.is_workspace_staff(workspace_id)
        and public.can_manage_workspace_patient(patient_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'medical_orders'
      and policyname = 'Staff can update medical orders'
  ) then
    create policy "Staff can update medical orders"
      on public.medical_orders
      for update
      to authenticated
      using (public.is_workspace_staff(workspace_id))
      with check (
        public.is_workspace_staff(workspace_id)
        and public.can_manage_workspace_patient(patient_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'medical_orders'
      and policyname = 'Staff can delete medical orders'
  ) then
    create policy "Staff can delete medical orders"
      on public.medical_orders
      for delete
      to authenticated
      using (public.is_workspace_staff(workspace_id));
  end if;
end $$;

grant select, insert, update, delete on public.medical_orders to authenticated;
revoke all on public.medical_orders from anon;

-- Foto o PDF de la orden: bucket privado, ruta <workspace_id>/<order_id>/<archivo>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ordenes-medicas',
  'ordenes-medicas',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_medical_order_storage_object(
  target_storage_path text,
  require_manage boolean
)
returns boolean
stable
language plpgsql
security definer
set search_path = public
as $function$
declare
  path_parts text[];
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  path_parts := string_to_array(target_storage_path, '/');

  if array_length(path_parts, 1) <> 3
    or path_parts[1] !~* uuid_pattern
    or path_parts[2] !~* uuid_pattern then
    return false;
  end if;

  return exists (
    select 1
    from public.medical_orders
    where medical_orders.id = path_parts[2]::uuid
      and medical_orders.workspace_id = path_parts[1]::uuid
      and (
        public.is_workspace_staff(medical_orders.workspace_id)
        or (
          not require_manage
          and public.can_access_workspace_patient(medical_orders.patient_id)
        )
      )
  );
end;
$function$;

-- Políticas en bloques "if not exists" (sin drop policy): el conector de
-- Supabase cancela las sentencias destructivas.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Medical order files read access'
  ) then
    create policy "Medical order files read access"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'ordenes-medicas'
      and public.can_access_medical_order_storage_object(name, false)
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Medical order files insert access'
  ) then
    create policy "Medical order files insert access"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'ordenes-medicas'
      and public.can_access_medical_order_storage_object(name, true)
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Medical order files delete access'
  ) then
    create policy "Medical order files delete access"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'ordenes-medicas'
      and public.can_access_medical_order_storage_object(name, true)
    );
  end if;
end $$;

commit;
