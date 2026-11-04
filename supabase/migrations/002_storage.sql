-- Storage bucket + RLS for drop media
insert into storage.buckets (id, name, public)
values ('drop-media', 'drop-media', false)
on conflict (id) do nothing;

-- Users can upload into their own folder
create policy "Users upload own media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'drop-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can read media for drops they created or discovered
create policy "Read media for owned or discovered drops"
on storage.objects for select
to authenticated
using (
  bucket_id = 'drop-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.drops d
      left join public.drop_discoveries dd
        on dd.drop_id = d.id and dd.user_id = auth.uid()
      where d.media_path = name
        and (d.creator_id = auth.uid() or dd.id is not null)
    )
  )
);

create policy "Users delete own media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'drop-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
