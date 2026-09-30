-- ===============================================================
-- 095 — site_popup (AÇILIŞ / KAMPANYA POPUP'I — tek satır ayar)
-- ===============================================================
-- AMAÇ:
--   Public sitede açılışta gösterilebilen kampanya popup'ının içeriği
--   ve davranışı admin panelinden (Ayarlar > Açılış Popup) yönetilir.
--
-- NEDEN `settings` TABLOSU DEĞİL:
--   Public taraf settings'i `get_public_settings()` SECURITY DEFINER
--   RPC'sinin kolon beyaz listesi üzerinden okur (migration 041/081).
--   Popup alanlarını settings'e eklemek bu RPC'nin TAMAMEN yeniden
--   tanımlanmasını gerektirirdi; 083/084/085 de aynı gerekçeyle RPC'ye
--   dokunmadı. Ayrı, tek satırlık tablo:
--     • settings / RPC / mevcut public payload'ı HİÇ ETKİLEMEZ,
--     • popup'ın kendi cache tag'i ("site-popup") ile invalidate edilir.
--
-- SINGLETON: id = 1 (CHECK). Uygulama yalnız bu satırı okur/günceller.
-- VARSAYILAN: is_enabled = false → migration uygulandığında public
--   sitede HİÇBİR görünür değişiklik olmaz (popup kapalı).
--
-- GÜVENLİK: Metin alanları düz metin olarak saklanır/render edilir
--   (HTML kabul edilmez — uygulama katmanında temizlenir). Uzunluk ve
--   enum kısıtları hem uygulama hem DB seviyesinde (çift kilit).
--
-- İDEMPOTENT: CREATE TABLE IF NOT EXISTS + INSERT … ON CONFLICT DO NOTHING.
-- GERİ ALINABİLİR: DROP TABLE public.site_popup;
-- BAĞIMLILIK: yok (yeni tablo; mevcut hiçbir tabloya FK/trigger yok).
-- ===============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.site_popup (
  id               smallint    PRIMARY KEY DEFAULT 1,
  is_enabled       boolean     NOT NULL DEFAULT false,
  image_path       text,
  title            text,
  description      text,
  highlight_text   text,
  stats            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  button_text      text,
  button_url       text,
  show_button      boolean     NOT NULL DEFAULT true,
  display_scope    text        NOT NULL DEFAULT 'home',
  dismiss_duration text        NOT NULL DEFAULT 'session',
  starts_at        timestamptz,
  ends_at          timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT site_popup_singleton        CHECK (id = 1),
  CONSTRAINT site_popup_display_scope    CHECK (display_scope IN ('home', 'all')),
  CONSTRAINT site_popup_dismiss_duration CHECK (dismiss_duration IN ('session', '1h', '1d', '7d', '30d')),
  CONSTRAINT site_popup_stats_is_array   CHECK (jsonb_typeof(stats) = 'array' AND jsonb_array_length(stats) <= 4),
  CONSTRAINT site_popup_date_order       CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at),
  CONSTRAINT site_popup_title_len        CHECK (title IS NULL OR char_length(title) <= 200),
  CONSTRAINT site_popup_description_len  CHECK (description IS NULL OR char_length(description) <= 600),
  CONSTRAINT site_popup_highlight_len    CHECK (highlight_text IS NULL OR char_length(highlight_text) <= 24),
  CONSTRAINT site_popup_button_text_len  CHECK (button_text IS NULL OR char_length(button_text) <= 60),
  CONSTRAINT site_popup_button_url_len   CHECK (button_url IS NULL OR char_length(button_url) <= 500),
  CONSTRAINT site_popup_image_path_len   CHECK (image_path IS NULL OR char_length(image_path) <= 500)
);

COMMENT ON TABLE public.site_popup IS
  'Açılış/kampanya popup ayarı (tek satır, id=1). Admin: Ayarlar > Açılış Popup. Varsayılan kapalı.';
COMMENT ON COLUMN public.site_popup.image_path IS
  'site-assets bucket-relative path (örn. popup/popup.webp) — resolveAssetUrl ile URL''e çevrilir.';
COMMENT ON COLUMN public.site_popup.stats IS
  'Alt bilgi satırları: en fazla 4 düz metin (örn. ["300.000+ misafir","4.9 misafir puanı","TÜRSAB 9117"]).';
COMMENT ON COLUMN public.site_popup.dismiss_duration IS
  'Kapatıldıktan sonra tekrar gösterme süresi: session (aynı ziyaret boyunca) | 1h | 1d | 7d | 30d.';

INSERT INTO public.site_popup (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- DOĞRULAMA:
--   SELECT id, is_enabled, display_scope, dismiss_duration FROM public.site_popup;
--   → 1 | false | home | session
