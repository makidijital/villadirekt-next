-- ============================================================================
-- Migration 046 — VILLA ZIP LINKS expires_at INDEX
-- ============================================================================
-- AMAÇ:
--   043'te kurulan public.villa_zip_links tablosunda, opportunistic
--   self-cleaning için (`purgeStaleGlobal`) WHERE expires_at <= now()
--   filtresinin index-supported sub-ms çalışması için btree indeks.
--
-- KAPSAM (SADECE additive — başka HİÇBİR DDL):
--   • public.villa_zip_links (expires_at) btree indeks (idempotent).
--   • Tablo şeması DEĞİŞMEZ.
--   • RLS DEĞİŞMEZ (villa_zip_links_admin_only — 043'ten).
--   • consume_villa_zip_token RPC DEĞİŞMEZ.
--   • Mevcut indeksler DEĞİŞMEZ:
--       - villa_zip_links_token_idx (unique token)
--       - villa_zip_links_villa_created_idx (villa_id, created_at desc)
--
-- DOKUNULMAYAN (kanıt: bu dosyada DDL yalnız `create index if not exists`):
--   villa / reservations / mail_logs / settings / property_owners /
--   pages / menu / payment_accounts / payment_methods / activity_logs /
--   homepage_collections / shared_villa_lists / villa_reviews / faqs /
--   contact_messages / offer_requests / external_calendar_*.
--
-- ÖZELLİKLER:
--   • Idempotent: `create index if not exists` → tekrar çalışmada no-op.
--   • Concurrent yazma engellenmez: `if not exists` mutex'ı; ancak
--     CONCURRENTLY kullanılmadı (transaction içinde çalışabilmesi için)
--     — tablo küçük (admin-only feature; düşük satır sayısı), kısa
--     kilit kabul edilebilir. Büyük tablolar için CONCURRENTLY tercih
--     edilebilirdi; mevcut envanter için gereksiz karmaşıklık.
--   • Doğrulama: NOTICE + indeks varlığı assertion.
--
-- ROLLBACK (manuel):
--   drop index if exists public.villa_zip_links_expires_at_idx;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) INDEX — expires_at üzerinde btree (idempotent)
-- ----------------------------------------------------------------------------
create index if not exists villa_zip_links_expires_at_idx
  on public.villa_zip_links (expires_at);


-- ----------------------------------------------------------------------------
-- 2) DOĞRULAMA — indeks mevcut, başka indeks etkilenmedi
-- ----------------------------------------------------------------------------
do $verify$
declare
  v_new_idx       int;
  v_token_idx     int;
  v_villa_idx     int;
begin
  -- Yeni indeks kuruldu mu?
  select count(*) into v_new_idx
  from pg_indexes
  where schemaname = 'public'
    and tablename  = 'villa_zip_links'
    and indexname  = 'villa_zip_links_expires_at_idx';

  -- 043'ten gelen mevcut indeksler hâlâ yerinde mi?
  select count(*) into v_token_idx
  from pg_indexes
  where schemaname = 'public'
    and tablename  = 'villa_zip_links'
    and indexname  = 'villa_zip_links_token_idx';

  select count(*) into v_villa_idx
  from pg_indexes
  where schemaname = 'public'
    and tablename  = 'villa_zip_links'
    and indexname  = 'villa_zip_links_villa_created_idx';

  if v_new_idx <> 1 then
    raise exception
      '046: villa_zip_links_expires_at_idx kurulamadi (count=%)', v_new_idx;
  end if;
  if v_token_idx <> 1 then
    raise exception
      '046: villa_zip_links_token_idx YOK (043 ile kurulmus olmaliydi)';
  end if;
  if v_villa_idx <> 1 then
    raise exception
      '046: villa_zip_links_villa_created_idx YOK (043 ile kurulmus olmaliydi)';
  end if;

  raise notice
    '✅ 046 OK — villa_zip_links_expires_at_idx mevcut; 043 indeksleri korundu';
end
$verify$;

-- ============================================================================
-- ROLLBACK:
--   drop index if exists public.villa_zip_links_expires_at_idx;
-- ============================================================================
