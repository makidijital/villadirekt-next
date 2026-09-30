-- ============================================================================
-- Migration 029 — External Calendar Sync (FAZ 56A)
-- ============================================================================
-- AMAÇ:
--   iCal IMPORT/EXPORT altyapısı. Airbnb / Booking / VRBO / vb. external
--   takvim feed'leri için iki yeni tablo. KRİTİK KURAL:
--   external event'ler `reservations` tablosuna ASLA insert edilmez —
--   ayrı bir lifecycle'a sahiptirler (payment/mail/status hiç çalışmaz).
--   Yalnız availability blocker olarak okunurlar.
--
-- AVAILABILITY KAYNAKLARI (sıralı):
--   1. reservations          (mevcut — guest booking, payment + mail)
--   2. manual_reservations   (mevcut — admin manuel blok)
--   3. external_calendar_events  (YENİ — Airbnb/Booking/VRBO ical import)
--   getBlockedVillaIds helper'ı (lib/availability.helper.ts) FAZ 56C'de
--   üçüncü kaynağı paralel SELECT olarak ekleyecek. Mevcut iki query'ye
--   3. paralel query EKLENİR; bu migration helper'a dokunmaz.
--
-- HALF-OPEN [start, end) KURALI:
--   Sisteminizin canonical kuralı (`lib/availability.validator.ts`):
--     existing.start_date < range.end
--     existing.end_date   > range.start
--   Adjacent valid: A:1-5, B:5-10 → çakışmaz (aynı gün checkout=checkin OK).
--
--   iCal RFC 5545 DTEND **exclusive** — bizim end_date semantiği ile
--   birebir aynı. ÖRNEK: DTSTART:20260701, DTEND:20260705 → 4 gece blok
--   (1,2,3,4 geceleri), 5 Temmuz girişe AÇIK. Import parser DTEND'i
--   AYNEN end_date'e yazacak (inclusive çevirme YOK).
--
--   CHECK constraint `start_date < end_date` zero-night kaydı bloklar.
--
-- DUPLICATE PROTECTION:
--   UNIQUE (villa_id, external_uid) — her sync UPSERT pattern'iyle
--   çalışır; aynı event ikinci kez insert edilemez. Yeni event görülmediği
--   sync'lerde is_active=false (soft toggle), HARD DELETE yapılmaz —
--   audit için stale event'ler korunur.
--
-- SYNC LOOP PROTECTION:
--   Export endpoint (FAZ 56D) her VEVENT'e
--     X-VILLAKIRALAMA-SOURCE: local
--   custom property ekler. Import parser (FAZ 56B) bu property'yi
--   gördüğü event'leri SKIP eder — kendi export'umuzu yeniden import
--   ederek sonsuz duplicate loop oluşmaz.
--
-- TIMEZONE:
--   Tüm tarihler `date` (YYYY-MM-DD); saat/zone YOK. Mevcut sistemin
--   date-only kuralı korunur. iCal parser DTSTART/DTEND'i date-only
--   `VALUE=DATE` form için doğrudan, `VALUE=DATE-TIME` form için UTC
--   normalize edip date'e dönüştürür (FAZ 56B parser sorumluluğu).
--
-- SOFT DELETE STRATEGY:
--   • Source silinince (admin "Kaldır") → ON DELETE CASCADE ile events
--     hard-delete (audit gereksinimi yok; admin bilinçli kaldırıyor).
--   • Sync sırasında görülmeyen event'ler → is_active=false (soft).
--     getBlockedVillaIds yalnız is_active=true okur → otomatik availability
--     kurtuluşu (Airbnb tarafında iptal edilen blok serbest kalır).
--   • Villa hard-delete (rare) → sources + events CASCADE.
--
-- SIDEBAR PERMISSION:
--   "external_calendars" key admin_users.sidebar_permissions'a idempotent
--   eklenir (mevcut faz 22/25/55B pattern parity).
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   DROP TABLE IF EXISTS public.external_calendar_events;
--   DROP TABLE IF EXISTS public.external_calendar_sources;
--   UPDATE admin_users SET sidebar_permissions =
--     sidebar_permissions - 'external_calendars' WHERE is_active = true;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE 1 — external_calendar_sources
-- Her villa için bağlı iCal URL kayıtları (Airbnb/Booking/VRBO/diğer).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_calendar_sources (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id          uuid NOT NULL REFERENCES public.villa(id) ON DELETE CASCADE,
  source_name       text NOT NULL,            -- "Airbnb", "Booking", "VRBO", ...
  source_type       text NOT NULL DEFAULT 'ical',
  ical_url          text NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  last_synced_at    timestamptz,              -- son sync denemesi (success veya fail)
  last_success_at   timestamptz,              -- son BAŞARILI sync
  last_error        text,                     -- son hata mesajı (success → NULL set'lenebilir)
  last_event_count  int,                      -- son sync'te toplam aktif event sayısı (UI)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz,
  CONSTRAINT external_calendar_sources_unique_per_villa
    UNIQUE (villa_id, source_name)
);

CREATE INDEX IF NOT EXISTS external_calendar_sources_villa_active_idx
  ON public.external_calendar_sources (villa_id, is_active);

CREATE INDEX IF NOT EXISTS external_calendar_sources_active_idx
  ON public.external_calendar_sources (is_active)
  WHERE is_active = true;  -- cron full-refresh için partial index

-- ----------------------------------------------------------------------------
-- TABLE 2 — external_calendar_events
-- Her sync sonrası UPSERT edilen event'ler. Source_id ile linklenir;
-- villa_id denormalize edilmiş (overlap query'sini hızlandırır).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_calendar_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid NOT NULL REFERENCES public.external_calendar_sources(id)
                       ON DELETE CASCADE,
  villa_id        uuid NOT NULL REFERENCES public.villa(id) ON DELETE CASCADE,
  external_uid    text NOT NULL,              -- iCal UID property (sync duplicate key)
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  summary         text,
  description     text,
  status          text,                       -- "CONFIRMED" | "TENTATIVE" | "CANCELLED"
  raw_ical        text,                       -- ham VEVENT bloğu (debug + audit)
  is_active       boolean NOT NULL DEFAULT true,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz,

  -- half-open [start, end) → zero-night = invalid
  CONSTRAINT external_calendar_events_date_order
    CHECK (start_date < end_date),

  -- duplicate protection: sync UPSERT key
  CONSTRAINT external_calendar_events_unique_per_villa_uid
    UNIQUE (villa_id, external_uid)
);

CREATE INDEX IF NOT EXISTS external_calendar_events_villa_active_idx
  ON public.external_calendar_events (villa_id, is_active);

-- Availability overlap query optimizasyonu (FAZ 56C):
--   WHERE villa_id IN (...) AND is_active AND start_date < range_end
--                                            AND end_date   > range_start
CREATE INDEX IF NOT EXISTS external_calendar_events_overlap_idx
  ON public.external_calendar_events (villa_id, start_date, end_date)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS external_calendar_events_source_idx
  ON public.external_calendar_events (source_id);

CREATE INDEX IF NOT EXISTS external_calendar_events_last_seen_idx
  ON public.external_calendar_events (last_seen_at);  -- stale cleanup queries

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

-- external_calendar_sources


-- external_calendar_events


-- Yazma yalnız sync pipeline üzerinden yapılır
-- (/api/admin/external-calendar/sync route'u). Admin arayüzünden
-- manuel mutation YOK; immutable contract sync pipeline'a kilitli.


-- ----------------------------------------------------------------------------
-- SIDEBAR PERMISSION GRANT — idempotent
-- ----------------------------------------------------------------------------
UPDATE public.admin_users
SET sidebar_permissions =
  CASE
    WHEN sidebar_permissions IS NULL THEN '["external_calendars"]'::jsonb
    ELSE sidebar_permissions || '["external_calendars"]'::jsonb
  END
WHERE is_active = true
  AND (
    sidebar_permissions IS NULL
    OR NOT (sidebar_permissions ? 'external_calendars')
  );

-- ----------------------------------------------------------------------------
-- DOCUMENTATION
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.external_calendar_sources IS
  'iCal sync source registry (FAZ 56A). Villa başına Airbnb/Booking/VRBO '
  'iCal URL kayıtları. UNIQUE (villa_id, source_name). Erişim uygulama '
  'katmanında yetkilendirilir. ON DELETE CASCADE: villa silinince '
  'source+events temizlenir.';

COMMENT ON TABLE public.external_calendar_events IS
  'External calendar event ledger (FAZ 56A). Reservations tablosundan AYRI '
  'lifecycle; payment/mail/status flow YOK. Yalnız availability blocker. '
  'UNIQUE (villa_id, external_uid) = sync UPSERT key, duplicate protection. '
  'CHECK (start_date < end_date) = half-open [) zero-night reddi. Yazma '
  'yalnız sync pipeline üzerinden; admin arayüzü salt-okuma. '
  'is_active=false soft toggle (sync''te görülmeyen event'').';

COMMENT ON COLUMN public.external_calendar_events.external_uid IS
  'iCal RFC 5545 UID property. Sync UPSERT key — aynı uid ile gelen event '
  'INSERT yerine UPDATE olur. Origin (Airbnb/Booking) iCal feed''i tarafından '
  'üretilen stable identifier.';

COMMENT ON COLUMN public.external_calendar_events.end_date IS
  'Half-open [start, end). iCal RFC 5545 DTEND EXCLUSIVE — aynı semantik. '
  'ÖRNEK: DTSTART:20260701, DTEND:20260705 → 1,2,3,4 geceleri blok, 5 Temmuz '
  'girişe açık. Parser inclusive çevirme YAPMAZ.';