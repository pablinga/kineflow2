drop policy if exists "Workspace treatment read access" on public.treatments;
create policy "Workspace treatment read access"
on public.treatments for select
to authenticated
using (
  owner_id = auth.uid()
  or public.can_access_workspace_treatment(id)
);
