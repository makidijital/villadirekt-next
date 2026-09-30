-- SEC-05 Phase 2 — READ-ONLY sınıflandırma. HAM DEĞER YAZDIRMAZ.
-- Çıktı: yalnız sayılar, uzunluk, md5 öneki, domain adları, boolean parmak izleri.
-- NOT: PostgreSQL ARE'de \y = kelime sınırı (\b değil).
-- Kullanım: psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f sec05_p2_readonly.sql
\pset pager off
\x on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';

-- 0) Satır sayısı
SELECT count(*) AS settings_rows FROM public.settings;

-- 1) Yapılandırılmış alanlar: yalnız dolu/boş + uzunluk + format
SELECT
  count(*) FILTER (WHERE nullif(btrim(gtm_container_id::text),'') IS NOT NULL)            AS gtm_filled,
  max(length(btrim(gtm_container_id::text)))                                             AS gtm_len,
  bool_and(btrim(gtm_container_id::text) ~ '^GTM-[A-Z0-9]{4,15}$')                        AS gtm_format_ok,
  count(*) FILTER (WHERE nullif(btrim(google_site_verification::text),'') IS NOT NULL)    AS gsv_filled,
  max(length(btrim(google_site_verification::text)))                                     AS gsv_len,
  bool_and(btrim(google_site_verification::text) ~ '^[A-Za-z0-9_-]{10,100}$')             AS gsv_is_bare_token,
  bool_or(google_site_verification::text ~* '<meta')                                     AS gsv_contains_meta_tag,
  count(*) FILTER (WHERE nullif(btrim(yandex_verification::text),'') IS NOT NULL)         AS yandex_filled,
  count(*) FILTER (WHERE nullif(btrim(bing_verification::text),'') IS NOT NULL)           AS bing_filled
FROM public.settings;

-- 2) Legacy alanlar: yapı analizi (ham değer YOK)
WITH src AS (
  SELECT 'custom_head_scripts' AS field, custom_head_scripts::text AS v, gtm_container_id::text AS gtm,
         google_site_verification::text AS gsv FROM public.settings
  UNION ALL
  SELECT 'analytics_script', analytics_script::text, gtm_container_id::text,
         google_site_verification::text FROM public.settings
)
SELECT
  field,
  CASE WHEN v IS NULL THEN 'NULL' WHEN btrim(v)='' THEN 'EMPTY' ELSE 'FILLED' END   AS state,
  length(v)                                                                        AS len,
  left(md5(coalesce(v,'')),12)                                                     AS md5_12,
  -- etiket sayıları
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<script\y', 'gi'))                          AS n_script,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<script\y[^>]*\ysrc\s*=', 'gi'))            AS n_script_external,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<script\y(?![^>]*\ysrc\s*=)[^>]*>\s*\S', 'gi')) AS n_script_inline_nonempty,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<script\y[^>]*type\s*=\s*["'']?application/ld\+json', 'gi')) AS n_jsonld,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<noscript\y', 'gi'))                        AS n_noscript,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<iframe\y', 'gi'))                          AS n_iframe,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<img\y', 'gi'))                             AS n_img,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<meta\y', 'gi'))                            AS n_meta,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<link\y', 'gi'))                            AS n_link,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<style\y', 'gi'))                           AS n_style,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<(div|span|a|p|button|form|input)\y', 'gi')) AS n_other_html,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<[a-z][^>]*\son[a-z]+\s*=', 'gi'))                     AS n_event_handler_attr,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), 'javascript:', 'gi'))                        AS n_js_url,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '\m(eval|Function)\s*\(|document\.write', 'g')) AS n_eval_like,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<!--', 'g'))                                AS n_html_comment,
  -- harici host'lar (domain adı gizli değildir)
  (SELECT string_agg(DISTINCT lower(m[1]), ', ' ORDER BY lower(m[1]))
     FROM regexp_matches(coalesce(v,''), '(?:https?:)?//([a-z0-9][a-z0-9.-]*\.[a-z]{2,})', 'gi') AS m) AS hosts,
  -- vendor parmak izleri (yalnız boolean / sayı)
  v ~* 'googletagmanager\.com/gtm\.js'                                                  AS fp_gtm_loader,
  (SELECT count(DISTINCT m[1]) FROM regexp_matches(coalesce(v,''), '(GTM-[A-Z0-9]{4,15})', 'g') AS m) AS n_gtm_ids,
  (gtm IS NOT NULL AND btrim(gtm)<>'' AND position(btrim(gtm) IN coalesce(v,''))>0)      AS gtm_same_as_field,
  v ~* 'googletagmanager\.com/gtag/js|gtag\s*\('                                        AS fp_gtag,
  (SELECT count(DISTINCT m[1]) FROM regexp_matches(coalesce(v,''), '\m(G-[A-Z0-9]{6,12})\M', 'g') AS m)  AS n_ga4_ids,
  (SELECT count(DISTINCT m[1]) FROM regexp_matches(coalesce(v,''), '\m(UA-[0-9]{4,10}-[0-9]{1,4})\M', 'g') AS m) AS n_ua_ids,
  (SELECT count(DISTINCT m[1]) FROM regexp_matches(coalesce(v,''), '\m(AW-[0-9]{6,12})\M', 'g') AS m)     AS n_google_ads_ids,
  v ~* 'connect\.facebook\.net|fbq\s*\('                                                AS fp_meta_pixel,
  (SELECT count(DISTINCT m[1]) FROM regexp_matches(coalesce(v,''), 'fbq\s*\(\s*[''"]init[''"]\s*,\s*[''"]?([0-9]{6,20})', 'g') AS m) AS n_pixel_ids,
  v ~* 'hotjar|_hjSettings|hjid'                                                        AS fp_hotjar,
  v ~* 'clarity\.ms|clarity\s*\('                                                       AS fp_clarity,
  v ~* 'mc\.yandex|ym\s*\(\s*[0-9]'                                                     AS fp_yandex_metrica,
  v ~* 'analytics\.tiktok\.com|ttq\.'                                                   AS fp_tiktok,
  v ~* 'snap\.licdn\.com|_linkedin_partner'                                             AS fp_linkedin,
  v ~* 'tawk\.to|jivosite|jivo|crisp\.chat|tidio|livechat|zopim|zendesk|intercom'       AS fp_chat_widget,
  v ~* 'wa\.me|whatsapp'                                                                AS fp_whatsapp,
  v ~* 'cookiebot|onetrust|cookieyes|consent'                                           AS fp_consent,
  v ~* 'fonts\.googleapis|fonts\.gstatic|typekit|use\.fontawesome'                      AS fp_fonts,
  v ~* 'name\s*=\s*["'']?google-site-verification'                                      AS fp_google_verif_meta,
  (gsv IS NOT NULL AND btrim(gsv)<>'' AND position(btrim(gsv) IN coalesce(v,''))>0)      AS gsv_same_as_field,
  v ~* 'name\s*=\s*["'']?(yandex-verification|msvalidate\.01|facebook-domain-verification|p:domain_verify|ahrefs-site-verification)' AS fp_other_verif_meta,
  v ~* 'dataLayer\.push'                                                                AS fp_datalayer_push,
  v ~* 'document\.cookie|localStorage|sessionStorage'                                   AS fp_storage_access,
  v ~* 'fetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket'                           AS fp_network_api
FROM src
ORDER BY field;

-- 3) Tanınmayan kalıntı: bilinen vendor bloklarının DIŞINDA kalan içerik var mı?
--    (bilinen script/noscript/meta/link bloklarını at, geriye kalan anlamlı karakter sayısı)
WITH src AS (
  SELECT 'custom_head_scripts' AS field, custom_head_scripts::text AS v FROM public.settings
  UNION ALL SELECT 'analytics_script', analytics_script::text FROM public.settings
), stripped AS (
  SELECT field, v,
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(v,''), '<!--.*?-->', '', 'gs'),
      '<(script|noscript|style)\y.*?</\1\s*>', '', 'gis'),
    '<(meta|link)\y[^>]*>', '', 'gi') AS rest
  FROM src
)
SELECT field,
  length(btrim(rest))                                                           AS leftover_len,
  (SELECT count(*) FROM regexp_matches(rest, '<[a-z]+\y', 'gi'))                AS leftover_tags,
  (SELECT string_agg(DISTINCT lower(m[1]), ', ') FROM regexp_matches(rest, '<([a-z]+)\y', 'gi') AS m) AS leftover_tag_names,
  (SELECT count(*) FROM regexp_matches(coalesce(v,''), '<script\y.*?</script\s*>', 'gis')) AS script_blocks,
  (SELECT string_agg(lpad(length(m[1])::text,5,' '), ',') FROM regexp_matches(coalesce(v,''), '<script\y[^>]*?>(.*?)</script\s*>', 'gis') AS m) AS inline_body_lengths
FROM stripped ORDER BY field;

-- 4) Son değişiklik izi (yalnız zaman)
SELECT updated_at FROM public.settings;
ROLLBACK;
