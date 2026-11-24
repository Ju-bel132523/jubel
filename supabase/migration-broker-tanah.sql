-- JUBEL: model broker (tanah) - jalankan SEKALI di SQL Editor.

-- 1) Kolom khusus tanah + titik peta (publik)
alter table public.products
  add column if not exists land_area numeric check (land_area is null or land_area > 0),
  add column if not exists certificate_type text,
  add column if not exists road_width numeric check (road_width is null or road_width >= 0),
  add column if not exists map_lat numeric(9,6) check (map_lat is null or map_lat between -90 and 90),
  add column if not exists map_lng numeric(9,6) check (map_lng is null or map_lng between -180 and 180);

-- 2) Data privat penjual (HANYA admin yang bisa baca)
create table if not exists public.product_private (
  product_id uuid primary key references public.products(id) on delete cascade,
  seller_name text,
  seller_phone text,
  seller_min_price numeric check (seller_min_price is null or seller_min_price >= 0),
  notes text,
  updated_at timestamptz not null default now()
);

-- 3) Catatan peminat / pipeline
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  buyer_name text not null,
  buyer_phone text,
  status text not null default 'peminat'
    check (status in ('peminat','survei','nego','deal','komisi_dibayar','batal')),
  survey_date date,
  deal_price numeric check (deal_price is null or deal_price >= 0),
  commission numeric check (commission is null or commission >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_status_idx on public.leads (status, created_at desc);

drop trigger if exists private_touch on public.product_private;
create trigger private_touch before update on public.product_private
for each row execute function public.touch_updated_at();
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
for each row execute function public.touch_updated_at();

-- 4) Pindahkan nomor penjual lama ke tabel privat, lalu hapus dari tabel publik
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='products' and column_name='seller_whatsapp') then
    insert into public.product_private (product_id, seller_phone)
      select id, seller_whatsapp from public.products where seller_whatsapp is not null
      on conflict (product_id) do nothing;
    alter table public.products drop column seller_whatsapp;
  end if;
end $$;

-- 5) Keamanan: hanya admin
alter table public.product_private enable row level security;
alter table public.leads enable row level security;

drop policy if exists "admin kelola data privat" on public.product_private;
create policy "admin kelola data privat" on public.product_private
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin kelola leads" on public.leads;
create policy "admin kelola leads" on public.leads
  for all using (public.is_admin()) with check (public.is_admin());

-- 6) Hak akses (tanpa anon = pengunjung tidak bisa membaca sama sekali)
grant select, insert, update, delete on public.product_private to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
