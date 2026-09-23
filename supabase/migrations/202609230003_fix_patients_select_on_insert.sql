-- El alta de pacientes hace INSERT ... RETURNING (supabase-js .insert().select()).
-- La policy de SELECT usaba solo can_access_workspace_patient(id), que busca el
-- paciente por id con una consulta nueva: esa consulta no ve la fila que se está
-- insertando, devuelve false y Postgres rechaza el RETURNING con
-- "new row violates row-level security policy" (403 en la app).
--
-- is_workspace_admin(workspace_id) se evalúa sobre la columna de la fila, así que
-- funciona también para la fila nueva. Es la misma primera condición que ya
-- evaluaba can_access_workspace_patient, por lo que el acceso a filas existentes
-- no cambia. (Mismo problema que 202608300001 para treatments.)
--
-- appointments tiene el mismo patrón con can_access_workspace_appointment(id);
-- se corrige igual, replicando sobre la fila sus dos primeras condiciones.

drop policy if exists "Users can read own patients" on public.patients;
create policy "Users can read own patients"
  on public.patients
  for select
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or public.can_access_workspace_patient(id)
  );

drop policy if exists "Users can read own appointments" on public.appointments;
create policy "Users can read own appointments"
  on public.appointments
  for select
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or (
      owner_id = auth.uid()
      and public.is_workspace_member(workspace_id)
    )
    or public.can_access_workspace_appointment(id)
  );
