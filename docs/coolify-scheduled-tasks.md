# Coolify Scheduled Tasks — Kurulum Dokümanı

**Bağlam:** Deploy ortamı Hetzner VPS + Coolify. Cron işleri Coolify
"Scheduled Tasks" ile tetiklenir. Eski Vercel'e özgü `vercel.json` (`crons[]`)
Coolify tarafından okunmadığı için repodan kaldırıldı; zamanlamaların tek
kaynağı bu dokümandır.

> Bu yalnız operasyon dokümanıdır.

---

## 1. Repo'daki tüm cron endpoint'leri

| # | Endpoint | Method | Auth | Kaynak dosya |
|---|---|---|---|---|
| 1 | `/api/cron/external-calendar-sync` | GET | `Bearer $CRON_SECRET` | `app/api/cron/external-calendar-sync/route.ts` |
| 2 | `/api/cron/exchange-rates-refresh` | GET | `Bearer $CRON_SECRET` | `app/api/cron/exchange-rates-refresh/route.ts` |
| 3 | `/api/cron/mail-logs-cleanup` | GET | `Bearer $CRON_SECRET` | `app/api/cron/mail-logs-cleanup/route.ts` |
| 4 | `/api/cron/activity-logs-cleanup` | GET | `Bearer $CRON_SECRET` | `app/api/cron/activity-logs-cleanup/route.ts` |
| 5 | `/api/cron/short-gaps-refresh` | GET | `Bearer $CRON_SECRET` | **HENÜZ YOK — ÖN KOŞUL (bkz. §5)** |

Hepsi `lib/cron-auth.ts > authorizeCronRequest` ile doğrulanır:
`Authorization: Bearer <CRON_SECRET>` eşleşmezse **401**, `CRON_SECRET` env
tanımsızsa **503** (fail-closed).

---

## 2. Şu an otomatik çalışması gereken endpoint'ler

Dördü de otomatik çalışmalı (şu an çalışmıyorlar):

- **external-calendar-sync** — 4 saatte bir (iCal müsaitlik tazeliği; en kritik).
- **exchange-rates-refresh** — her gün (kur tablosu; fiyat dönüşümü buna bağlı).
- **mail-logs-cleanup** — her gün (tablo şişmesini önler).
- **activity-logs-cleanup** — her gün (tablo şişmesini önler).

5. (short-gaps) endpoint'i oluşturulduğunda o da otomatik çalışmalı.

---

## 3. Coolify Scheduled Tasks kurulum planı

**Nasıl çalışır:** Coolify'de uygulama (resource) → **Scheduled Tasks** →
**Add**. Her task şunları ister:
- **Name** — serbest etiket.
- **Command** — uygulama **container'ı içinde** çalışan komut.
- **Frequency** — cron expression.
- (Container seçilebiliyorsa) uygulamanın kendi container'ı.

Komut, endpoint'i `curl` ile çağırır ve `Authorization` header'ını container
env'indeki `$CRON_SECRET`'ten okur (secret task tanımına yazılmaz).

### Ön koşullar (bir kez)

1. **`CRON_SECRET` env'i Coolify'de uygulamaya ekli olmalı**
   (Environment Variables). Güçlü rastgele değer:
   `openssl rand -hex 32`. Ekledikten sonra **redeploy** gerekir.
2. Container'da `curl` olmalı. Next.js node image'larında genelde vardır;
   yoksa komutu `wget` ile değiştir (bkz. her task'ın altındaki not).
3. **Zaman dilimi:** Coolify cron'ları container TZ'sinde (genelde **UTC**)
   çalışır. Aşağıdaki saatler UTC değerleridir. Türkiye
   saati (UTC+3) istiyorsan saatleri 3 saat geri al (örn. TR 06:00 → UTC `0 3 * * *`).
4. **`DOMAIN`** = sitenin public host'u (`NEXT_PUBLIC_SITE_URL`). Aşağıda
   `https://DOMAIN` yerine onu yaz. Alternatif: container içinden
   `http://localhost:3000` (uygulamanın dahili portu) de çalışır.

### Komut kalıbı (tüm task'lar için ortak)

```bash
curl -fsS --max-time 300 \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://DOMAIN/api/cron/<ENDPOINT>
```

- `-f` → HTTP 4xx/5xx'te non-zero exit (Coolify task'ı "failed" işaretler).
- `-sS` → sessiz ama hata gösterir.
- `--max-time 300` → 5 dk timeout (iCal sync uzun sürebilir).
- `wget` alternatifi: `wget -qO- --timeout=300 --header="Authorization: Bearer $CRON_SECRET" https://DOMAIN/api/cron/<ENDPOINT>`

---

## 4. Task tanımları (cron · URL · header · beklenen response)

### Task 1 — iCal Sync
- **Frequency (cron):** `0 */4 * * *`  (her 4 saatte bir)
- **URL:** `https://DOMAIN/api/cron/external-calendar-sync`
- **Authorization:** `Bearer $CRON_SECRET`
- **Command:**
  ```bash
  curl -fsS --max-time 300 -H "Authorization: Bearer $CRON_SECRET" https://DOMAIN/api/cron/external-calendar-sync
  ```
- **Beklenen response (200):** `{ "ok": true, ... }` (kaynak bazlı sync sonuçları)
- **Hata:** 401 (yanlış secret) · 503 (CRON_SECRET yok) · 500 (liste/sync hatası)

### Task 2 — Exchange Rates Refresh
- **Frequency:** `0 6 * * *`  (her gün 06:00 UTC)
- **URL:** `https://DOMAIN/api/cron/exchange-rates-refresh`
- **Command:**
  ```bash
  curl -fsS --max-time 120 -H "Authorization: Bearer $CRON_SECRET" https://DOMAIN/api/cron/exchange-rates-refresh
  ```
- **Beklenen response (200):** `{ "ok": true, ... }` (TCMB → `exchange_rates` upsert)
- **Hata:** 401 · 503 · 502 (TCMB erişilemedi) · 500 (DB upsert hatası)

### Task 3 — Mail Logs Cleanup
- **Frequency:** `0 3 * * *`  (her gün 03:00 UTC)
- **URL:** `https://DOMAIN/api/cron/mail-logs-cleanup`
- **Command:**
  ```bash
  curl -fsS --max-time 120 -H "Authorization: Bearer $CRON_SECRET" https://DOMAIN/api/cron/mail-logs-cleanup
  ```
- **Beklenen response (200):** `{ "ok": true, "mode": "30d", "deleted": <n> }`
- **Hata:** 401 · 503 · 500

### Task 4 — Activity Logs Cleanup
- **Frequency:** `30 3 * * *`  (her gün 03:30 UTC)
- **URL:** `https://DOMAIN/api/cron/activity-logs-cleanup`
- **Command:**
  ```bash
  curl -fsS --max-time 120 -H "Authorization: Bearer $CRON_SECRET" https://DOMAIN/api/cron/activity-logs-cleanup
  ```
- **Beklenen response (200):** `{ "ok": true, "mode": "90d", "deleted": <n> }`
- **Hata:** 401 · 503 · 500

---

## 5. Short Gaps cron'u (Kısa Süreli Tarihler)

**ÖN KOŞUL:** `/api/cron/short-gaps-refresh` endpoint'i **henüz yok**. İki yol:

### Yol A (önerilen) — Endpoint ekle, sonra task tanımla
Mevcut 4 cron ile birebir aynı desende küçük bir route:
`authorizeCronRequest(req)` + `dbNative.rpc("refresh_villa_short_gaps")`.
Eklendikten sonra aşağıdaki task'ı kur:

- **Frequency:** `0 4 * * *`  (her gün 04:00 UTC — veri oturduktan sonra; ufku
  bir gün ileri kaydırır)
- **URL:** `https://DOMAIN/api/cron/short-gaps-refresh`
- **Command:**
  ```bash
  curl -fsS --max-time 120 -H "Authorization: Bearer $CRON_SECRET" https://DOMAIN/api/cron/short-gaps-refresh
  ```
- **Beklenen response (200):** `{ "ok": true, "count": <yazılan boşluk satırı> }`

**Tazelik için (opsiyonel):** iCal değişimi boşlukları etkilediğinden, ek bir
task ile iCal sync'ten ~30 dk sonra da çalıştır: `30 */4 * * *`.

### Yol B (endpoint istemiyorsan) — DB-direkt RPC
Coolify task'ı RPC'yi doğrudan çağırır (container'da `psql` + `DATABASE_URL`
gerekir):
```bash
psql "$DATABASE_URL" -c "select public.refresh_villa_short_gaps();"
```
- **Frequency:** `0 4 * * *`
- Not: Container'da `psql` ve `DATABASE_URL` yoksa Yol A daha temizdir.

> 053 migration'ı zaten deploy'da bir kez backfill çalıştırır; cron yalnız
> tabloyu güncel/ufku ileri tutmak içindir. Cron kurulana kadar tablo manuel
> `SELECT refresh_villa_short_gaps();` ile tazelenebilir.

---

## 6. Doğrulama — curl komutları

> Gerçek `CRON_SECRET` değerini ve gerçek `DOMAIN`'i kullan. Bu komutları
> kendi makinenden veya VPS shell'inden çalıştır.

### 6.1 Endpoint'ler gerçekten çalışıyor mu? (manuel tetikleme)

```bash
# Değişkenler
export CRON_SECRET='...gerçek-secret...'
export DOMAIN='https://...gerçek-domain...'

# 1) iCal sync
curl -i -H "Authorization: Bearer $CRON_SECRET" "$DOMAIN/api/cron/external-calendar-sync"

# 2) Exchange rates
curl -i -H "Authorization: Bearer $CRON_SECRET" "$DOMAIN/api/cron/exchange-rates-refresh"

# 3) Mail logs cleanup
curl -i -H "Authorization: Bearer $CRON_SECRET" "$DOMAIN/api/cron/mail-logs-cleanup"

# 4) Activity logs cleanup
curl -i -H "Authorization: Bearer $CRON_SECRET" "$DOMAIN/api/cron/activity-logs-cleanup"

# 5) Short gaps (endpoint eklendiyse)
curl -i -H "Authorization: Bearer $CRON_SECRET" "$DOMAIN/api/cron/short-gaps-refresh"
```

**Beklenen:** `HTTP/1.1 200 OK` + `{ "ok": true, ... }`.

### 6.2 Auth davranışı doğru mu? (negatif testler)

```bash
# Header yok → 401
curl -i "$DOMAIN/api/cron/exchange-rates-refresh"

# Yanlış secret → 401
curl -i -H "Authorization: Bearer yanlis" "$DOMAIN/api/cron/exchange-rates-refresh"
```
`403/401` dönüyorsa auth çalışıyor. **503** dönüyorsa → `CRON_SECRET` env
deploy'da tanımsız (önce onu ekle + redeploy).

### 6.3 "Gerçekten çalıştı mı?" — veri yan etkisi (PostgreSQL SQL)

Cron'un kalıcı run-log'u yok; veri sinyaliyle doğrula:

```sql
-- Exchange rates bugün güncellendi mi?
SELECT max(updated_at) FROM exchange_rates;

-- iCal sync son ne zaman event gördü?
SELECT max(last_seen_at) FROM external_calendar_events;

-- Short gaps tablosu dolu/taze mi?
SELECT max(computed_at) AS son_hesap, count(*) AS satir
FROM villa_short_gaps;
```
`max(...)` değerleri bayatsa (örn. kur > 24 saat eski) → ilgili cron
tetiklenmiyor demektir.

---

## Özet kurulum sırası

1. Coolify → uygulama → **Environment**: `CRON_SECRET` ekle → **Redeploy**.
2. §6.1 + §6.2 curl ile endpoint'leri ve auth'u manuel doğrula.
3. Coolify → **Scheduled Tasks**: §4'teki 4 task'ı ekle (cron + curl komutu).
4. (Opsiyonel/ön koşullu) §5 short-gaps endpoint'ini ekleyip 5. task'ı tanımla.
5. 1 gün sonra §6.3 SQL sinyalleriyle otomatik çalıştıklarını teyit et.

| Task | Cron (UTC) | Endpoint |
|---|---|---|
| iCal Sync | `0 */4 * * *` | `/api/cron/external-calendar-sync` |
| Exchange Rates | `0 6 * * *` | `/api/cron/exchange-rates-refresh` |
| Mail Logs Cleanup | `0 3 * * *` | `/api/cron/mail-logs-cleanup` |
| Activity Logs Cleanup | `30 3 * * *` | `/api/cron/activity-logs-cleanup` |
| Short Gaps Refresh* | `0 4 * * *` | `/api/cron/short-gaps-refresh` *(endpoint ön koşul)* |
