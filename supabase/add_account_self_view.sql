-- Illuminate — Staff can view their own salary & incentives
-- Run in Supabase → SQL Editor (safe to re-run)
-- Requires: add_hr_role.sql

-- Own compensation (read-only for the employee)
drop policy if exists "own_read_staff_compensation" on public.staff_compensation;
create policy "own_read_staff_compensation"
  on public.staff_compensation for select to authenticated
  using (profile_id = auth.uid());

-- Own payroll rows
drop policy if exists "own_read_payroll_entries" on public.payroll_entries;
create policy "own_read_payroll_entries"
  on public.payroll_entries for select to authenticated
  using (
    profile_id = auth.uid()
    or lower(staff_name) = lower((
      select coalesce(full_name, '') from public.profiles where id = auth.uid()
    ))
  );

-- Own incentive payouts
drop policy if exists "own_read_incentive_payouts" on public.incentive_payouts;
create policy "own_read_incentive_payouts"
  on public.incentive_payouts for select to authenticated
  using (
    profile_id = auth.uid()
    or lower(staff_name) = lower((
      select coalesce(full_name, '') from public.profiles where id = auth.uid()
    ))
  );

-- Active incentive rules are visible to all authenticated clinic users (rates only)
drop policy if exists "authenticated_read_active_incentive_rules" on public.incentive_rules;
create policy "authenticated_read_active_incentive_rules"
  on public.incentive_rules for select to authenticated
  using (active = true or public.is_hr_access());
