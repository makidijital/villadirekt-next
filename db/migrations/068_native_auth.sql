-- ===============================================================
-- 🛡️ FAZ 1 (NATIVE AUTH) — 068 · ADDITIVE, NON-BREAKING
-- ===============================================================
-- KAPSAM:
--   1) admin_users → native auth kolonları (password_hash + login
--      state alanları). TAMAMEN nullable / default'lu → mevcut satırlar
--      ETKİLENMEZ, mevcut native auth yolu bu kolonları OKUMAZ.
--   2) admin_sessions → native refresh/session tablosu (yeni).
--
-- ⚠️ NEDEN GÜVENLİ (canlıyı bozmaz):
--   • Tüm ALTER'lar `IF NOT EXISTS` + nullable/default → idempotent,
--     yeniden çalıştırılabilir, veri kaybı yok.
--   • `admin_sessions` YENİ tablo; hiçbir mevcut obje değişmez.
--   • native auth hâlâ `auth.users`'ı kullanıyor; bu kolonlar/tablo
--     yalnız native yol AKTİF olduğunda (FAZ 3 cutover) devreye girer.
--
-- ⚠️ RLS YOK (bilinçli):
--   Native provider tek app-rolü ile çalışır (RLS bypass; yetki
--   uygulama katmanında). Ayrıca hedef Hetzner PostgreSQL'de anon/
--   authenticated/service_role rolleri YOK → RLS + role-grant eklemek
--   vanilla PG'de ERROR üretir. Bu tablo yalnız server-only native
--   repo'dan yazılır/okunur.
--
-- ROLLBACK (gerekirse):
--   drop table if exists public.admin_sessions;
--   alter table public.admin_users
--     drop column if exists password_hash,
--     drop column if exists failed_attempts,
--     drop column if exists locked_until,
--     drop column if exists last_login_at,
--     drop column if exists password_changed_at;
-- ===============================================================

-- ---------------------------------------------------------------
-- 1) admin_users — native auth kolonları (ADDITIVE)
-- ---------------------------------------------------------------
alter table public.admin_users
  add column if not exists password_hash        text,
  add column if not exists failed_attempts      integer     not null default 0,
  add column if not exists locked_until         timestamptz,
  add column if not exists last_login_at        timestamptz,
  add column if not exists password_changed_at  timestamptz;

comment on column public.admin_users.password_hash is
  'Native auth şifre hash''i (self-describing prefix: $scrypt$… / gelecekte $argon2id$… / legacy $2a$… bcrypt). NULL = henüz native şifre atanmadı (native auth yolu kullanılıyor).';
comment on column public.admin_users.failed_attempts is
  'Ardışık başarısız login sayacı (brute-force koruması). Başarılı login sıfırlar.';
comment on column public.admin_users.locked_until is
  'Bu zamana kadar login kilitli (rate-limit). NULL = kilitli değil.';

-- ---------------------------------------------------------------
-- 2) admin_sessions — native refresh/session tablosu (YENİ)
-- ---------------------------------------------------------------
create table if not exists public.admin_sessions (
  id                 uuid        primary key default gen_random_uuid(),
  admin_id           uuid        not null
                       references public.admin_users (id) on delete cascade,
  -- Refresh token'ın HAM hali DB'de TUTULMAZ; yalnız SHA-256 hash'i.
  refresh_token_hash text        not null,
  user_agent         text,
  ip                 text,
  -- remember-me: true → kalıcı (expires_at uzun), false → oturumluk.
  remember           boolean     not null default false,
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz not null default now(),
  expires_at         timestamptz not null,
  -- İptal (logout / admin pasifleştirme). NULL = aktif.
  revoked_at         timestamptz
);

comment on table public.admin_sessions is
  'Native auth refresh/session kayıtları. Server-only native repo yazar. Refresh token yalnız SHA-256 hash olarak saklanır. admin_users silinince CASCADE.';

-- Refresh lookup (aktif session doğrulama) — hash benzersiz.
create unique index if not exists uq_admin_sessions_refresh_hash
  on public.admin_sessions (refresh_token_hash);

-- Admin bazlı toplu iptal (pasifleştirme / "tüm oturumları kapat").
create index if not exists idx_admin_sessions_admin_id
  on public.admin_sessions (admin_id);

-- Süresi geçmiş session temizliği (cleanup job / expiry filtresi).
create index if not exists idx_admin_sessions_expires_at
  on public.admin_sessions (expires_at);