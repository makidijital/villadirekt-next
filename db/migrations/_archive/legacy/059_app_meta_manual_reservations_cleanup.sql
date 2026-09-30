-- ============================================================================
-- Migration 059 — app_meta (key-value meta) + manual_reservations otomatik cleanup
-- ============================================================================
-- AMAÇ:
--   `manual_reservations` tablosunda checkout (end_date) tarihi geçmiş ve
--   üzerinden 7 günden fazla zaman geçmiş eski blokları otomatik silmek
--   (DB şişmesini önle, takvim/liste sorgularını hafiflet).
--
--   Tetikleme: admin `/maki-admin/manual-reservations` sayfası açıldığında
--   server route (GET /api/admin/manual-reservations) bu fonksiyonu çağırır.
--   Fonksiyon kendi içinde **24 saatlik throttle** uygular → her page-load'da
--   değil, son çalışmadan 24 saat geçtiyse bir kez temizler.
--
-- NEDEN AYRI app_meta TABLOSU:
--   "son cleanup zamanı" operasyonel metadata; site config DEĞİL.
--   settings tablosu KULLANILMADI çünkü mig 051 ile settings üzerinde
--   BEFORE UPDATE auto-touch trigger var ve settings.updated_at PUBLIC
--   homepage hero cache-bust anahtarı → oraya yazmak public cache'i
--   gereksiz invalidate ederdi. app_meta tamamen izole; public yüzey yok.
--
-- THROTTLE — ATOMİK (yarış-koşulsuz):
--   Tek statement'lık INSERT ... ON CONFLICT DO UPDATE ... WHERE (ran_at eski)
--   RETURNING. Satır dönerse o çağrı temizliği çalıştırır; dönmezse skip.
--   Eşzamanlı iki page-load'dan yalnız biri temizler.
--
-- GÜVENLİK:
--   • app_meta yalnız sunucu tarafı yönetim bağlantısı (dbAdmin) ile
--     okunur/yazılır. Public okuma/yazma yok.
--   • Fonksiyon yalnız `manual_reservations` tablosuna dokunur; reservations /
--     external_calendar_events / settings'e ASLA dokunmaz.
--   • security definer DEĞİL (mig 057 precedent); sunucu bağlantısı zaten
--     tam yetkilidir.
--
-- SİLME KURALI:
--   delete ... where end_date < (current_date - 7)
--   → checkout 7+ gün önce geçmiş bloklar. WHERE ZORUNLU (mig 055'teki
--     "DELETE requires a WHERE clause" / sql_safe_updates dersi).
--
-- İDEMPOTENT: create table if not exists / create or replace
--   tekrar çalıştırmaya güvenli.
--
-- ROLLBACK (gerekirse):
--   drop function if exists public.cleanup_past_manual_reservations();
--   drop table if exists public.app_meta;
-- ============================================================================

-- ---- 1) app_meta key-value meta tablosu ----
create table if not exists public.app_meta (
  key        text primary key,
  ran_at     timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_meta is
  'Operasyonel key-value metadata (site config DEĞİL). İlk kullanım: '
  'manual_reservations cleanup 24h throttle markeri. settings tablosundan '
  'kasıtlı olarak ayrı tutulur (public cache/hero etkisi olmasın).';


-- ---- 2) Throttle'lı cleanup fonksiyonu ----
create or replace function public.cleanup_past_manual_reservations()
returns integer
language plpgsql
as $$
declare
  ran           boolean;
  deleted_count integer;
begin
  -- Atomik 24h throttle: marker satırını ekle ya da (24 saat eskiyse) güncelle.
  insert into public.app_meta (key, ran_at, updated_at)
  values ('manual_reservations_cleanup', now(), now())
  on conflict (key) do update
    set ran_at = now(), updated_at = now()
    where app_meta.ran_at < now() - interval '24 hours'
  returning true into ran;

  -- Satır dönmediyse (24 saat dolmadı) → temizlik atlanır.
  if ran is null then
    return -1;
  end if;

  -- Yalnız manual_reservations: checkout 7+ gün önce geçmiş bloklar.
  delete from public.manual_reservations
   where end_date < (current_date - 7);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.cleanup_past_manual_reservations() is
  'manual_reservations: end_date < current_date-7 satırlarını siler. '
  'app_meta üzerinden atomik 24 saat throttle uygular (son çalışmadan 24 '
  'saat geçmediyse -1 döner, hiçbir şey silmez). Admin manual-reservations '
  'GET route''undan sunucu tarafı yönetim bağlantısıyla çağrılır; fail-safe.';