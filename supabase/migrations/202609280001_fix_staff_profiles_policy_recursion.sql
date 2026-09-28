-- La policy "Workspace staff can read clinic professional profiles" (4k de
-- 202609250001) consultaba clinic_professionals desde una policy de profiles,
-- y una policy de clinic_professionals consulta profiles: Postgres cortaba con
-- "infinite recursion detected in policy for relation clinic_professionals"
-- (por ejemplo, al agregar un profesional al equipo).
--
-- Se pasa la condición a una función security definer, que no aplica RLS al
-- leer clinic_professionals y corta el ciclo. Mismo alcance que antes: el staff
-- de una clínica lee el perfil de los profesionales vinculados a esa clínica.

begin;

create or replace function public.is_profile_visible_to_clinic_staff(target_profile_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.clinic_professionals
    where clinic_professionals.professional_id = target_profile_id
      and public.is_workspace_staff(public.get_clinic_workspace_id(clinic_professionals.clinic_id))
  );
$function$;

drop policy if exists "Workspace staff can read clinic professional profiles" on public.profiles;
create policy "Workspace staff can read clinic professional profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_profile_visible_to_clinic_staff(id));

commit;
