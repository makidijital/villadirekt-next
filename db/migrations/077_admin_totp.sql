-- ===============================================================
-- 🛡️ TOTP 2FA — 077 · ADDITIVE, NON-BREAKING
-- ===============================================================
-- KAPSAM:
--   1) admin_users → TOTP 2FA kolonları (secret + enabled + login-
--      state alanları). TAMAMEN nullable / default'lu → mevcut
--      satırlar ETKİLENMEZ, mevcut login akışı bu kolonları
--      totp_enabled=false olduğu sürece OKUMAZ/UYGULAMAZ.
--   2) admin_totp_recovery_codes → tek-kullanımlık kurtarma kodu
--      tablosu (yeni).
--
-- ⚠️ NEDEN GÜVENLİ (canlıyı bozmaz):
--   • Tüm ALTER'lar `IF NOT EXISTS` + nullable/default → idempotent,
--     yeniden çalıştırılabilir, veri kaybı yok.
--   • `totp_enabled` default `false` → mevcut hiçbir admin için
--     login akışı değişmez (native login.service.ts yalnız
--     totp_enabled=true olan adminler için ek adım uygular).
--   • `admin_totp_recovery_codes` YENİ tablo; hiçbir mevcut obje
--     değişmez.
--   • BACKFILL YOK — mevcut admin_users satırları bu migration'dan
--     sonra da totp_enabled=false, totp_secret=NULL kalır; her admin
--     2FA'yı kendi isteğiyle enroll eder.
--
-- ⚠️ RLS YOK (bilinçli):
--   `admin_sessions` (migration 068) ile aynı gerekçe: native
--   provider tek app-rolü ile çalışır (RLS bypass; yetki uygulama
--   katmanında). Hedef Hetzner PostgreSQL'de anon/authenticated/
--   service_role rolleri YOK. Bu tablo yalnız server-only native
--   repo'dan (`lib/db/admin-totp.repository.server.ts`) yazılır/okunur.
--
-- ⚠️ SECRET/KOD GÜVENLİĞİ:
--   • `totp_secret` PLAINTEXT DEĞİL — uygulama katmanında
--     AES-256-GCM ile şifrelenip yazılır (`TOTP_ENCRYPTION_SECRET`,
--     `lib/auth/native/totp.ts`). DB bu şifrelemeyi bilmez/uygulamaz.
--   • `admin_totp_recovery_codes.code_hash` — Argon2id hash (mevcut
--     `lib/auth/native/password.ts` reuse). Plaintext kurtarma kodu
--     HİÇBİR ZAMAN DB'ye yazılmaz.
--
-- ROLLBACK (gerekirse):
--   drop table if exists public.admin_totp_recovery_codes;
--   alter table public.admin_users
--     drop column if exists totp_secret,
--     drop column if exists totp_enabled,
--     drop column if exists totp_enrolled_at,
--     drop column if exists totp_failed_attempts,
--     drop column if exists totp_locked_until;
--
-- ⚠️ Bu migration PRODUCTION'da HENÜZ ÇALIŞTIRILMADI — yalnız
--   dosya olarak oluşturuldu (kullanıcı talimatı: "migration oluştur
--   ama production'da çalıştırma").
-- ===============================================================

-- ---------------------------------------------------------------
-- 1) admin_users — TOTP 2FA kolonları (ADDITIVE)
-- ---------------------------------------------------------------
alter table public.admin_users
  add column if not exists totp_secret          text,
  add column if not exists totp_enabled          boolean     not null default false,
  add column if not exists totp_enrolled_at      timestamptz,
  add column if not exists totp_failed_attempts  integer     not null default 0,
  add column if not exists totp_locked_until     timestamptz;

comment on column public.admin_users.totp_secret is
  'TOTP secret — AES-256-GCM ile şifrelenmiş (uygulama katmanı, TOTP_ENCRYPTION_SECRET). PLAINTEXT DEĞİL. NULL = TOTP henüz enroll edilmedi.';
comment on column public.admin_users.totp_enabled is
  'TOTP 2FA aktif mi. Yalnız enrollment confirm adımı (ilk doğru kod) başarılı olduktan SONRA true olur. Default false — mevcut adminler etkilenmez.';
comment on column public.admin_users.totp_enrolled_at is
  'TOTP''nin enabled=true olduğu an (audit). NULL = hiç enroll edilmedi veya reset/disable edildi.';
comment on column public.admin_users.totp_failed_attempts is
  'Ardışık başarısız TOTP doğrulama sayacı (brute-force koruması, login.service.ts''teki failed_attempts deseninin TOTP karşılığı). Başarılı doğrulama sıfırlar.';
comment on column public.admin_users.totp_locked_until is
  'Bu zamana kadar TOTP doğrulaması kilitli. NULL = kilitli değil.';

-- ---------------------------------------------------------------
-- 2) admin_totp_recovery_codes — kurtarma kodu tablosu (YENİ)
-- ---------------------------------------------------------------
create table if not exists public.admin_totp_recovery_codes (
  id          uuid        primary key default gen_random_uuid(),
  admin_id    uuid        not null
                references public.admin_users (id) on delete cascade,
  -- Kodun HAM hali DB'de TUTULMAZ; yalnız Argon2id hash'i.
  code_hash   text        not null,
  created_at  timestamptz not null default now(),
  -- Tek kullanımlık: kullanılınca set edilir. NULL = hâlâ kullanılabilir.
  used_at     timestamptz
);

comment on table public.admin_totp_recovery_codes is
  'TOTP 2FA tek-kullanımlık kurtarma kodları. Server-only native repo yazar/okur. Kod yalnız Argon2id hash olarak saklanır. admin_users silinince CASCADE.';

-- Admin bazlı lookup (enroll confirm'de toplu insert, verify'da unused sorgu).
create index if not exists idx_admin_totp_recovery_codes_admin_id
  on public.admin_totp_recovery_codes (admin_id);