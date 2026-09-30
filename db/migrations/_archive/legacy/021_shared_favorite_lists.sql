-- ============================================================================
-- Migration 021 — Shared Favorite Lists (Faz 37)
-- ============================================================================
-- AMAÇ:
--   Guest favorites sistemine "paylaşılabilir liste" katmanı eklemek.
--   Kullanıcı localStorage'daki favori villalarını tek tıkla snapshot'lar;
--   üretilen kısa token URL'i (`/favoriler/paylas/[token]`) ile paylaşır.
--   Liste IMMUTABLE — paylaşıldıktan sonra orijinalden bağımsızdır.
--
-- TASARIM KARARLARI:
--   • token text UNIQUE — kısa (~12 hex char), guess edilemez, URL-safe.
--     Application layer: crypto.randomUUID().replace(/-/g,"").slice(0,12).
--   • villa_ids uuid[] — atomik snapshot. Read tarafı `.in("id", ids)`
--     ile mevcut visibility filter (is_active, deleted_at) zaten uygular.
--   • expires_at NULLABLE — şu an "süresiz" varsayım. İleride TTL UI
--     eklenirse bu kolonun değeri set edilir; getter `now() < expires_at`
--     kontrolünü uygular.
--   • Yeniden çalıştırılabilir (idempotent) — `if not exists` guard'lar.
--
-- BACKWARD-COMPATIBILITY:
--   • Yeni tablo — mevcut sistemlere etkisi yok
--   • Mevcut localStorage-based favorites sistemi DOKUNULMADI; bu yalnız
--     ek katman
--   • Reservation engine, pricing, availability, review system, private
--     URL system — sıfır etkilenme
--
-- ROLLBACK (gerekirse, ayrı transaction'da):
--   drop table if exists public.shared_favorite_lists;
-- ============================================================================

create table if not exists public.shared_favorite_lists (
  id          uuid primary key default gen_random_uuid(),
  token       text not null,
  villa_ids   uuid[] not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  /* villa_ids minimum 1, maksimum 50 — application layer'da
     da enforce edilir; DB-level defansif guard. */
  constraint shared_favorite_lists_villa_ids_size
    check (array_length(villa_ids, 1) between 1 and 50)
);

-- Unique token — partial yerine tam unique (token NOT NULL).
create unique index if not exists shared_favorite_lists_token_idx
  on public.shared_favorite_lists (token);

-- created_at desc (admin/diagnostic; query patternde kullanılabilir)
create index if not exists shared_favorite_lists_created_at_idx
  on public.shared_favorite_lists (created_at desc);

comment on table public.shared_favorite_lists is
  'Guest favorite list snapshots (Faz 37). Paylaşılabilir kısa token '
  'URL altında immutable villa.id dizisi tutar. localStorage-based '
  'favorites sistemini etkilemez; ek katman. Snapshot immutable: '
  'oluşturulduktan sonra güncellenmez/silinmez.';

comment on column public.shared_favorite_lists.token is
  'URL-safe short token (~12 hex chars). Application layer üretir: '
  'crypto.randomUUID().replace(/-/g, "").slice(0, 12). Unique index ile '
  'collision koruması.';

comment on column public.shared_favorite_lists.villa_ids is
  'Snapshot at create time. Read path mevcut visibility filter '
  '(is_active=true, deleted_at IS NULL) uygular; silinmiş/pasif villalar '
  'paylaşımdan otomatik düşer.';

comment on column public.shared_favorite_lists.expires_at is
  'NULL = süresiz. Gelecek TTL feature için reserved.';