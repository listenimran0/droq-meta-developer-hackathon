-- Allow drop creators to contribute without a discovery row
drop policy if exists "Discovered users can contribute" on public.drop_contributions;

create policy "Discovered users or creators can contribute"
  on public.drop_contributions for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and (
      exists (
        select 1 from public.drop_discoveries dd
        where dd.drop_id = drop_id and dd.user_id = (select auth.uid())
      )
      or exists (
        select 1 from public.drops d
        where d.id = drop_id and d.creator_id = (select auth.uid())
      )
    )
  );
