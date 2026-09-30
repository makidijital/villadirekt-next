-- ============================================================================
-- Migration 035 — Shared Villa Lists (Admin Curator Share)
-- ============================================================================
-- AMAÇ:
--   Admin için "müşteriye gönderilecek özel villa seçkisi" katmanı.
--   Admin: public hero search mantığıyla filtre uygular, sonuçlardan
--   manuel villa seçer (curate), "Listeyi Paylaş" → kısa token URL
--   (`/liste/[token]`) üretir. Public sayfada müşteri normal listing
--   deneyimi görür — same VillaCard, same pricing UX, same currency.
--
-- TASARIM KARARLARI:
--   • token text UNIQUE — kısa (~12 hex char), guess edilemez, URL-safe.
--     Application layer: crypto.randomUUID().replace(/-/g,"").slice(0,12).
--     (021 shared_favorite_lists ile aynı pattern; entropy ~48-bit.)
--   • villa_ids uuid[] — manuel curate sonucu. Read tarafı `.in("id", ids)`
--     ile mevcut visibility filter (is_active=true, deleted_at IS NULL) uygular.
--     Aktif olmayan/silinmiş villalar otomatik düşer (snapshot stale-safe).
--   • search_params jsonb — admin filtre snapshot'ı (start, end, guests,
--     regions, categories, ...). Public sayfa pricing context'i (date range
--     ile total/gece/temizlik hesabı) için kullanır.
--     Schema:
--       { "start"?: "YYYY-MM-DD", "end"?: "YYYY-MM-DD", "guests"?: number,
--         "regions"?: uuid[], "categories"?: uuid[] }
--     Nullable; sadece pricing context için. Filter re-execute YAPILMAZ
--     (snapshot semantic).
--   • title text — opsiyonel display name ("Antalya 4 kişi sıcak villa seçkisi").
--   • note text — opsiyonel admin notu (müşteriye kısa mesaj).
--   • revoked_at timestamptz — soft revoke. Set ise public sayfa 404 verir;
--     admin yanlış link gönderdiğinde geri çekebilsin.
--   • expires_at timestamptz — opsiyonel TTL (gelecek; şu an unused).
--   • Yeniden çalıştırılabilir (idempotent) — `if not exists` guard'lar.
--
-- BACKWARD-COMPATIBILITY:
--   • Yeni tablo — mevcut sistemlere etkisi yok.
--   • shared_favorite_lists (021) ayrı kalır — favoriler share use-case'i
--     bağımsız.
--   • Reservation engine, pricing, availability, booking sidebar, review
--     system, private URL system — sıfır etkilenme.
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   drop table if exists public.shared_villa_lists;
-- ============================================================================

create table if not exists public.shared_villa_lists (
  id            uuid primary key default gen_random_uuid(),
  token         text not null,
  villa_ids     uuid[] not null,
  search_params jsonb,
  title         text,
  note          text,
  created_by    text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  /* Manuel curate output; minimum 1 villa, maksimum 50 — application layer'da
     da enforce edilir. Public liste 50'den fazla villa pratik anlamlı değil. */
  constraint shared_villa_lists_villa_ids_size
    check (array_length(villa_ids, 1) between 1 and 50)
);

-- Unique token — partial yerine tam unique (token NOT NULL).
create unique index if not exists shared_villa_lists_token_idx
  on public.shared_villa_lists (token);

-- created_at desc — admin listing/management için.
create index if not exists shared_villa_lists_created_at_idx
  on public.shared_villa_lists (created_at desc);

comment on table public.shared_villa_lists is
  'Admin curator share lists. Admin filtre uygular → villa subset seçer → '
  'kısa token URL ile müşteriye gönderir. Public sayfada VillaCard grid '
  '(arama UX) gösterilir. Token''i bilen okuyabilir; oluşturma/güncelleme/'
  'revoke yalnız admin tarafından yapılır (yetki uygulama katmanında).';

comment on column public.shared_villa_lists.token is
  'URL-safe short token (~12 hex chars). Application layer üretir: '
  'crypto.randomUUID().replace(/-/g, "").slice(0, 12). Unique index ile '
  'collision koruması; service retry handler ile 23505 fallback.';

comment on column public.shared_villa_lists.villa_ids is
  'Manuel curate snapshot at create time. Read path mevcut visibility filter '
  '(is_active=true, deleted_at IS NULL) uygular; silinmiş/pasif villalar '
  'public sayfadan otomatik düşer.';

comment on column public.shared_villa_lists.search_params is
  'Pricing context snapshot (start/end/guests/...). Public sayfa VillaCard '
  'date-bound total hesabı için kullanır. Filter re-execute YAPILMAZ; '
  'snapshot semantic.';

comment on column public.shared_villa_lists.revoked_at is
  'Soft revoke timestamp. NOT NULL ise public sayfa 404 verir. Admin '
  'yanlış link gönderdiğinde manuel set eder.';

comment on column public.shared_villa_lists.expires_at is
  'Opsiyonel TTL. NULL = süresiz. Gelecek expiry UI için reserved.';