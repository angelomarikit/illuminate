-- Allow clinic staff to log session extra supplies via inventory_issues
-- (Receptionist finishing a session is not inventory_access-only.)
-- Safe to re-run.

drop policy if exists "inventory_access_issues" on public.inventory_issues;
create policy "inventory_access_issues"
  on public.inventory_issues for all to authenticated
  using (
    public.is_inventory_access()
    or public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  )
  with check (
    public.is_inventory_access()
    or public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );

drop policy if exists "inventory_access_issue_lines" on public.inventory_issue_lines;
create policy "inventory_access_issue_lines"
  on public.inventory_issue_lines for all to authenticated
  using (
    public.is_inventory_access()
    or public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  )
  with check (
    public.is_inventory_access()
    or public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff')
  );

-- Session extras also decrement on-hand stock from the clinic UI
drop policy if exists "clinic_update_inventory_stock" on public.inventory_items;
create policy "clinic_update_inventory_stock"
  on public.inventory_items for update to authenticated
  using (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff'))
  with check (public.current_app_role() in ('Owner', 'Admin', 'Receptionist', 'Staff'));
