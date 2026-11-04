-- Allow users to remove their own Found history rows.
-- Deleting a discovery makes that Drop eligible for nearby again for this user.

drop policy if exists "Users can delete own discoveries" on public.drop_discoveries;
create policy "Users can delete own discoveries"
  on public.drop_discoveries
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
