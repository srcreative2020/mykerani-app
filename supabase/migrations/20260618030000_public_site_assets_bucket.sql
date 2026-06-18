insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

create policy "site_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'site-assets');

create policy "site_assets_hq_write"
  on storage.objects for insert
  with check (bucket_id = 'site-assets' and public.is_hq_user());

create policy "site_assets_hq_update"
  on storage.objects for update
  using (bucket_id = 'site-assets' and public.is_hq_user());

create policy "site_assets_hq_delete"
  on storage.objects for delete
  using (bucket_id = 'site-assets' and public.is_hq_user());
