import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 3 — anon repo) — client-sever sonrası native
   provider'a alındı. Admin okuma/yazma artık faqs/faqs.action ("use
   server") üzerinden; public read cache.helpers/homepage (server) üzerinden.
   eski sağlayıcı importu tamamen kaldırıldı. `server-only` defansif sınır.
   Method yüzeyi + dönüş şekli AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ FAQ REPOSITORY (native)
   ===============================================================
   `faqs` tablosu — global SSS master. Replace-all pattern (DELETE
   + bulk INSERT) service'te orchestrate edilir; repository sadece
   raw query'leri yapar. `db` = native provider (`dbNative`); tek app
   rolü → RLS/session-DI YOK.

   ⚠️ KESIN KURAL:
     - Public path: is_active=true + sort_order ASC
     - Admin path: is_active filtre YOK + sort_order ASC
     - DELETE all: .not("id","is",null) predicate (= id IS NOT NULL)
     - is_active default true (replaceFaqs payload'da set edilir)
=============================================================== */

export const faqRepository = {
  /** Public — yalnız aktif FAQ'lar. */
  async findActive() {
    return await db
      .from("faqs")
      .select("id, question, answer")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
  },

  /** Admin — tüm FAQ'lar (is_active filtre YOK). */
  async findAllForAdmin() {
    return await db
      .from("faqs")
      .select("id, question, answer")
      .order("sort_order", { ascending: true });
  },

  /** Replace-all pattern step 1 — TÜM rowları DELETE.
   *  ⚠️ ARTIK `replaceFaqs` TARAFINDAN KULLANILMIYOR (bkz. faq.service.ts
   *  "ID-KORUYAN SENKRON" notu): `faq_translations.faq_id` FK'si
   *  ON DELETE CASCADE olduğu için tüm satırları silip yeniden
   *  eklemek HER KAYITTA çevirileri yok ederdi. Method yüzeyi
   *  geriye dönük uyumluluk için KALDIRILMADI. */
  async deleteAll() {
    return await db.from("faqs").delete().not("id", "is", null);
  },

  /** Bulk INSERT — YENİ satırlar için.
   *  🛡️ `.select("id")` EKLENDİ: yeni satırların id'leri, çeviri
   *  (`faq_translations`) yazımı için caller'a döner. Yazılan satır ve
   *  kolonlar DEĞİŞMEDİ. Aynı desen projede kanıtlı
   *  (external-calendar-source.repository.ts, menu.repository.server.ts). */
  async insertMany(
    rows: Array<{
      question: string;
      answer: string;
      sort_order: number;
      is_active: boolean;
    }>
  ) {
    return await db.from<{ id: string }>("faqs").insert(rows).select("id");
  },

  /** 🛡️ ID-KORUYAN SENKRON — mevcut satırları TEK sorguda günceller
   *  (`ON CONFLICT (id) DO UPDATE`). `faqs.id` PRIMARY KEY olduğu için
   *  onConflict hedefi "id"dir. Satır başına ayrı UPDATE atılmaz. */
  async upsertMany(
    rows: Array<{
      id: string;
      question: string;
      answer: string;
      sort_order: number;
      is_active: boolean;
    }>
  ) {
    return await db.from("faqs").upsert(rows, { onConflict: "id" });
  },

  /** Admin save sırasında formdan ÇIKARILAN satırlar — TEK sorguda
   *  (`IN (...)`). Çevirileri FK CASCADE ile birlikte düşer (istenen
   *  davranış: satır gerçekten siliniyor). */
  async deleteByIds(ids: readonly string[]) {
    return await db.from("faqs").delete().in("id", ids as string[]);
  },

  /** Single delete — admin tek-satır kullanım için. */
  async deleteById(id: string) {
    return await db.from("faqs").delete().eq("id", id);
  },
};
