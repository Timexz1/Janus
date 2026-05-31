-- THB-funded buys (Dime! Fast) + OCR screenshot storage.
--
-- 1) New transaction columns. A buy paid in THB is also a money-out-of-Thailand
--    event: fx_rate = THB per USD on the slip, thb_cost = total THB paid (the
--    principal sent abroad). image_path = Storage object path of the screenshot
--    the row was imported from. All nullable / additive — safe on existing rows.
alter table public.transactions
  add column if not exists fx_rate    numeric(30, 10),
  add column if not exists thb_cost   numeric(30, 2),
  add column if not exists image_path text;

-- 2) Private bucket for OCR screenshots. Objects are stored under "{user_id}/..."
--    so a single folder-prefix check enforces per-user isolation via RLS.
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;

create policy "screenshots_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "screenshots_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "screenshots_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
