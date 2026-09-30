-- ============================================================================
-- Migration 070 — RESERVATION SHARE LINKS (native PostgreSQL 16)
-- ============================================================================
-- AMAÇ:
--   Admin panelden bir rezervasyon için süreli/iptal-edilebilir "güvenli
--   paylaşım linki" üretimi. Müşteri linke tıklayınca (/rezervasyon-kontrol
--   ?token=...) rezervasyonunun ONAY + ödeme özetini görür — kod+e-posta
--   girmeden. Mevcut `reservation_no + e-posta` sorgulama akışı AYNEN kalır;
--   bu tamamen ADDITIVE ikinci erişim kanalıdır.
--
--   Tablo `token_hash + expires_at + revoked_at + lazy 404` desenini izler.
--   Raw token DEĞİL, `token_hash` (sha256) saklanır (refresh-token deseni;
--   DB sızması linkleri açığa çıkarmaz).
--
--   EXPIRATION: caller `expires_at`'i rezervasyonun `end_date + 3 gün`
--   olarak set eder (uydurma sabit süre yok; rezervasyon semantiğinden türer).
--
--   MULTI-USE: müşteri linki defalarca açabilmeli → RPC sadece OKUR (counter
--   yok, tek-kullanım yok).
--
-- ⚠️ NATIVE AUTHZ MODELİ (068 ile aynı — RLS / role-grant YOK):
--   Hedef Hetzner PostgreSQL 16'da eski sağlayıcı-özgü public/JWT rolleri YOKTUR →
--   RLS + role-grant eklemek vanilla PG'de ERROR üretir.
--   Native provider tek ayrıcalıklı app-rolü ile çalışır; yetki UYGULAMA
--   KATMANINDA (admin yazma: authorizeAdminCaller; public resolve: server-only
--   native repo + aşağıdaki SECURITY DEFINER RPC). Tablo yalnız server-only
--   native repo'dan yazılır/okunur. Bu yüzden GRANT/REVOKE/RLS/POLICY YOK.
--
-- ÖZELLİKLER: idempotent · --single-transaction uyumlu · rollback-safe.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) is_active_admin() — mevcut migration'daki haliyle KORUNDU (idempotent).
--    (Native'de RLS'te kullanılmaz; app-layer helper olarak bırakıldı.)
-- ----------------------------------------------------------------------------
create index if not exists idx_admin_users_auth_user_id
  on public.admin_users (auth_user_id);


-- ----------------------------------------------------------------------------
-- 1) TABLO (idempotent)
-- ----------------------------------------------------------------------------
create table if not exists public.reservation_share_links (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  token_hash     text not null,
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid       -- admin_users.id (nullable; FK YOK — soft ref)
);

-- token_hash unique + O(1) lookup (raw token DB'de tutulmaz)
create unique index if not exists reservation_share_links_token_hash_idx
  on public.reservation_share_links (token_hash);
-- Admin listeleme / aktif link bulma: rezervasyon bazlı, yeni→eski
create index if not exists reservation_share_links_res_created_idx
  on public.reservation_share_links (reservation_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 2) RESOLVE RPC — token_hash doğrula → reservation_id döndür (MULTI-USE, OKUR)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER: tek satırı token_hash ile OKUR. Yalnız geçerli (revoked
-- değil + süresi dolmamış) token için reservation_id döner; aksi → null.
-- Counter YOK (çok-kullanımlık). Public resolve akışı (server-only native
-- repo) çağırır. Listeleme/enumerate YOK. Native tek app-rolü ile çalıştığı
-- için GRANT/REVOKE eklenmez (068 yaklaşımı).
create or replace function public.resolve_reservation_share_token(p_token_hash text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select reservation_id
    from public.reservation_share_links
   where token_hash = p_token_hash
     and revoked_at is null
     and expires_at > now()
   limit 1;
$$;


-- ----------------------------------------------------------------------------
-- DOĞRULAMA / ROLLBACK
-- ----------------------------------------------------------------------------
-- select public.resolve_reservation_share_token('<sha256_hash>');  -- reservation_id | null
-- ROLLBACK:
--   drop function if exists public.resolve_reservation_share_token(text);
--   drop table if exists public.reservation_share_links;
-- ============================================================================
