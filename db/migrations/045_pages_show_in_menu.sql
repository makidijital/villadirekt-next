-- ============================================================================
-- Migration 045 — pages.show_in_menu (manuel menü görünürlüğü)
-- ============================================================================
-- AMAÇ:
--   CMS sayfası oluşturmak ≠ menüye eklemek. Şu an getMenu() LEGACY
--   auto-include ile menü satırı tarafından referans verilmeyen TÜM aktif
--   sayfaları header menüsüne otomatik ekliyor. Yeni davranış: sayfa
--   oluşturulunca menüde GÖRÜNMESİN; yalnız admin `show_in_menu=true`
--   yaparsa görünsün.
--
-- ALAN:
--   pages.show_in_menu boolean NOT NULL DEFAULT false
--     - Yeni sayfalar → false (auto-include dışı).
--     - MEVCUT sayfalar → true (backfill; mevcut menü davranışı KORUNUR).
--
-- ⚠️ IDEMPOTENT + SAFE BACKFILL:
--   Backfill YALNIZ kolon ilk kez eklenirken çalışır (DO-block guard).
--   Migration re-run edilirse kolon zaten var → backfill ATLANIR →
--   admin'in sonradan false yaptığı sayfalar TEKRAR true OLMAZ. Kritik:
--   düz `update set true` re-run'da admin tercihlerini ezerdi.
--
-- DOKUNULMAYAN:
--   • pages RLS (026) — policy değişmez (sadece additive kolon).
--   • /p/[slug] route, SEO/canonical, sitemap (is_active ile çeker;
--     show_in_menu'den bağımsız → sayfa public + indexlenebilir kalır).
--   • Footer (hardcoded linkler — auto-include kullanmaz).
--   • menu tablosu / explicit menü satırları.
--
-- ROLLBACK: alter table public.pages drop column if exists show_in_menu;
-- ============================================================================

do $migrate$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pages'
      and column_name = 'show_in_menu'
  ) then
    -- Kolon yok → ekle (yeni satırlar default false)
    alter table public.pages
      add column show_in_menu boolean not null default false;

    -- BACKFILL (yalnız ilk eklemede): mevcut TÜM sayfalar auto-include
    -- ediliyordu → mevcut menüyü korumak için true.
    update public.pages set show_in_menu = true;

    raise notice 'OK: pages.show_in_menu eklendi + mevcut satırlar true (backfill).';
  else
    raise notice 'SKIP: pages.show_in_menu zaten var — backfill atlandı (admin tercihleri korundu).';
  end if;
end
$migrate$;