-- ===============================================================
-- 🛡️ Migration 015 — contact_messages (iletişim form inbox)
-- ===============================================================
-- AMAÇ:
--   /iletisim public formundan gelen mesajları saklayan inbox.
--   Admin /maki-admin/messages üzerinden mesajları görür/yönetir.
--   Yeni reservation/availability/pricing'e DOKUNULMUYOR — bu
--   tablo izole bir CRM-lite katmanı.
--
-- IDEMPOTENT: tablo / index hepsi IF NOT EXISTS veya
--   DROP IF EXISTS + CREATE; N kere koşulabilir.
-- ===============================================================

-- 1) TABLO
CREATE TABLE IF NOT EXISTS contact_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  full_name   TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  message     TEXT NOT NULL,

  is_read     BOOLEAN NOT NULL DEFAULT FALSE,

  replied_at  TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,

  /* "iletisim" / "kiralik-villa/<slug>" gibi referrer ipucu */
  source_page TEXT
);

-- 2) INDEX'LER
CREATE INDEX IF NOT EXISTS contact_messages_created_idx
  ON contact_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS contact_messages_unread_idx
  ON contact_messages (is_read);

-- 3) ROW LEVEL SECURITY


