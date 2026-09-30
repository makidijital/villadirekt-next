# Migration Arşivi

Bu klasördeki SQL dosyaları **artık uygulanmaz**. Salt tarihsel kayıttır:
bir kolonun/tablonun neden var olduğunu açıklayan şema soyağacı.

Projede **migration runner yoktur** (`package.json`'da migration script'i,
`schema_migrations` ledger tablosu veya CI adımı yok) — migration'lar elle
uygulanır. Bu nedenle bu dosyaların taşınmasının **runtime/deployment
etkisi sıfırdır**.

## `legacy/` — eski yönetilen-PostgreSQL dönemi (20 dosya)

Proje, yönetilen bir PostgreSQL sağlayıcısından **native PostgreSQL**'e
(Hetzner) geçti. O dönemin migration'ları eski sağlayıcıya özgü bir
yetkilendirme katmanı (satır-seviyesi politikalar + sağlayıcıya ait rol
adları + `auth` şeması) içeriyordu. Bu katman **bugünkü veritabanında
mevcut değildir**; ilgili ifadeler dosyalardan temizlenmiştir.

**Bu dosyalardaki tablo / index / trigger / fonksiyon tanımları hâlâ
geçerlidir** — yalnızca sağlayıcıya özgü yetkilendirme katmanı kaldırıldı.
Yetkilendirme artık uygulama katmanında yapılır (`authorizeAdminCaller`,
native JWT).

Kapsam: `015`–`067` arası numaralı dosyalar + numaralandırma öncesi
`2026_05_payment_methods_add_type.sql`.

## `pre-numbering/` — numaralandırma öncesi (1 dosya)

`db/migrations/NNN_*.sql` şeması benimsenmeden önce kök `migrations/`
klasöründe duran migration.

## Aktif migration'lar

`db/migrations/*.sql` (numaralı) — native PostgreSQL. Satır-seviyesi
politika, sağlayıcıya özgü rol adı veya `auth.*` şeması kullanmaz.

> ⚠️ Bilinen istisna: `070_reservation_share_links.sql` içindeki
> `public.is_active_admin()` fonksiyonu hâlâ `auth.uid()` çağırır.
> Fonksiyon uygulama kodundan **çağrılmaz** (yalnız arşivlenen
> politikalar kullanıyordu); vanilla PostgreSQL'de bu migration'ın
> yeniden çalıştırılması `auth.uid()` bulunamadığı için hata verir.
> Ayrı bir görevde temizlenmelidir.
