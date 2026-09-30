import { faqRepository } from "@/lib/db/faq.repository";

/* ===============================================================
   🛡️ FAQ SERVICE — Global Site Frequently Asked Questions
   ===============================================================
   Pattern: rule-item.service / price-include-item.service ile
   aynı architectural feel — master CRUD; ancak FAQ "global"
   olduğu için villa-bağımsız (parent yok).

   USE CASES:
     - Admin /maki-admin/faqs sayfası: getFaqsForAdmin → form
       → replaceFaqs (DELETE+INSERT atomic pattern)
     - Public homepage: getFaqs (cached via getCachedFaqs)
       → accordion render
     - JSON-LD (SEO): aynı data buildFaqJsonLd'a verilir

   CACHE:
     - getFaqs sonuçları `getCachedFaqs` (cache.helpers) ile tag
       "faqs" altında cache'lenir
     - Admin replaceFaqs sonrası revalidateFaqs() invalidate eder

   BACKWARD-COMPAT:
     - Yeni tablo, eski sistem etkilenmez
     - Boş tabloda getFaqs → [] döner, homepage FAQ section
       render edilmez (caller `if (faqs.length === 0)`)
   =============================================================== */

/** Public/admin'in tükettiği minimum FAQ shape. */
export type Faq = {
  id: string;
  question: string;
  answer: string;
};

/** Admin form input.
 *  🛡️ `id` OPSİYONEL ve YENİ: mevcut bir satırın id'si gönderilirse o
 *  satır KORUNUR (güncellenir); gönderilmezse yeni satır eklenir.
 *  Gerekçe için `replaceFaqs` üstündeki "ID-KORUYAN SENKRON" notuna
 *  bakınız. `id` verilmeyen çağrılar (eski davranış) ÇALIŞMAYA DEVAM
 *  EDER — her satır yeni kayıt olarak eklenir. */
export type FaqInput = {
  id?: string | null;
  question: string;
  answer: string;
};

const MAX_FAQS = 15;

/* ---------------------------------------------------------------
   📦 GET (public) — yalnız aktif FAQ'lar, sort_order ASC
   ---------------------------------------------------------------
   Homepage cached read path'i. getCachedFaqs bu fonksiyonu sarar.
*/
export async function getFaqs(): Promise<Faq[]> {
  /* FAZ 40: faqRepository delege. */
  const { data, error } = await faqRepository.findActive();

  if (error) {
    console.error("[faq.get] failed:", error.message);
    return [];
  }
  type Row = { id: string; question: string; answer: string };
  return ((data || []) as Row[]).map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
  }));
}

/* ---------------------------------------------------------------
   📦 GET (admin) — tüm FAQ'lar (is_active filtre yok)
   ---------------------------------------------------------------
   Admin formu burada yönetir. Şu an is_active için UI toggle
   yok — replaceFaqs hepsini is_active=true yazıyor. İleride
   "Pasifleştir" toggle'ı eklenirse bu fonksiyon dokunulmaz.
*/
export async function getFaqsForAdmin(): Promise<Faq[]> {
  /* FAZ 40: faqRepository delege. */
  const { data, error } = await faqRepository.findAllForAdmin();

  if (error) {
    console.error("[faq.adminGet] failed:", error.message);
    return [];
  }
  type Row = { id: string; question: string; answer: string };
  return ((data || []) as Row[]).map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
  }));
}

/* ---------------------------------------------------------------
   💾 SAVE ALL — ID-KORUYAN SENKRON (eski adıyla "replace all")
   ---------------------------------------------------------------
   🛡️ NEDEN DEĞİŞTİ (kritik):
     Eski akış DELETE ALL + bulk INSERT idi; her kayıtta TÜM satırlar
     yeni UUID alıyordu. `faq_translations.faq_id` (migration 082) FK'si
     ON DELETE CASCADE olduğu için bu, HER ADMİN KAYDINDA tüm EN/DE
     çevirilerini SESSİZCE SİLERDİ. Çeviri desteği ancak id'ler
     korunursa mümkündür.

   🛡️ `faqs` TABLOSUNUN SONUÇ İÇERİĞİ AYNI:
     aynı satırlar, aynı `sort_order` (payload index), aynı
     `is_active=true`, aynı trim/boş-satır filtresi, aynı MAX_FAQS
     guard'ı ve aynı hata mesajları. DEĞİŞEN TEK ŞEY: mevcut satırların
     id'leri (ve dolayısıyla çevirileri) KORUNUR.

   SORGU SAYISI: 1 read + en fazla 1 delete + en fazla 1 upsert +
     en fazla 1 insert = ≤4 (eski: 1 delete + 1 insert = 2). Satır
     başına sorgu YOK.
   ---------------------------------------------------------------
   Admin save flow. Pattern villa relations'taki RPC pattern'inin
   JS-side eşdeğeri (FAQ global olduğu için parent_id RPC argümanı
   yok). Atomik DEĞİL (DELETE+INSERT iki ayrı statement); ancak:
     - Admin save frekansı çok düşük (günde 1-5)
     - Tek admin tek seferde yazıyor (concurrent risk minimal)
     - Worst case: DELETE OK + INSERT FAIL → tablo boş, admin
       retry'da düzeltir. UX'i bozar ama veri kaybı yok (admin
       form state'inde yine var).

   FİLTRELEME:
     - question / answer trim
     - Boş satırlar (her ikisi de boş veya tek tarafı boş) drop
     - Max 15 (UI'da da enforce edilir, defansif backend guard)

   sort_order: array index → DB'de doğal sıra
   is_active: true (UI'da toggle yok şu an)
*/
export async function replaceFaqs(
  items: FaqInput[]
): Promise<{ ok: boolean; error?: string; ids?: string[] }> {
  /* Sanitize + filter empty — ESKİ DAVRANIŞ BİREBİR
     (trim, her iki alan da dolu olmalı, MAX_FAQS guard'ı). */
  const clean = (items || [])
    .map((i) => ({
      id: (i?.id ?? "").toString().trim() || null,
      question: (i?.question ?? "").trim(),
      answer: (i?.answer ?? "").trim(),
    }))
    .filter((i) => i.question.length > 0 && i.answer.length > 0);

  if (clean.length > MAX_FAQS) {
    return {
      ok: false,
      error: `En fazla ${MAX_FAQS} SSS kaydedilebilir.`,
    };
  }

  /* 1) Mevcut id'ler — hangi satır güncellenecek, hangisi silinecek. */
  const { data: existingData, error: readErr } =
    await faqRepository.findAllForAdmin();
  if (readErr) {
    console.error("[faq.replace] read failed:", readErr.message);
    return { ok: false, error: readErr.message };
  }
  const existingIds = new Set(
    ((existingData || []) as Array<{ id: string }>).map((r) => r.id)
  );

  /* 2) Formdan ÇIKARILAN satırlar → sil (tek `IN (...)` sorgusu).
        Bu satırların çevirileri FK CASCADE ile birlikte düşer — satır
        gerçekten silindiği için İSTENEN davranış budur. */
  const keptIds = new Set(
    clean
      .map((c) => c.id)
      .filter((id): id is string => !!id && existingIds.has(id))
  );
  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
  if (removedIds.length > 0) {
    const { error: delErr } = await faqRepository.deleteByIds(removedIds);
    if (delErr) {
      console.error("[faq.replace] delete failed:", delErr.message);
      return { ok: false, error: delErr.message };
    }
  }

  /* 3) Mevcut satırlar → TEK upsert (`ON CONFLICT (id) DO UPDATE`).
        sort_order = payload index (ESKİ davranışla AYNI), is_active=true. */
  const updates = clean
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => !!c.id && existingIds.has(c.id as string))
    .map(({ c, idx }) => ({
      id: c.id as string,
      question: c.question,
      answer: c.answer,
      sort_order: idx,
      is_active: true,
    }));
  if (updates.length > 0) {
    const { error: upErr } = await faqRepository.upsertMany(updates);
    if (upErr) {
      console.error("[faq.replace] upsert failed:", upErr.message);
      return { ok: false, error: upErr.message };
    }
  }

  /* 4) Yeni satırlar → TEK bulk insert; dönen id'ler sıra korunarak
        payload pozisyonlarına eşlenir (RETURNING, INSERT sırasını izler). */
  const insertPositions: number[] = [];
  const inserts = clean
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => !(c.id && existingIds.has(c.id)))
    .map(({ c, idx }) => {
      insertPositions.push(idx);
      return {
        question: c.question,
        answer: c.answer,
        sort_order: idx,
        is_active: true,
      };
    });

  const idsByPosition = new Array<string | null>(clean.length).fill(null);
  clean.forEach((c, idx) => {
    if (c.id && existingIds.has(c.id)) idsByPosition[idx] = c.id;
  });

  if (inserts.length > 0) {
    const { data: insData, error: insErr } =
      await faqRepository.insertMany(inserts);
    if (insErr) {
      console.error("[faq.replace] insert failed:", insErr.message);
      return { ok: false, error: insErr.message };
    }
    const newIds = ((insData || []) as Array<{ id: string }>).map((r) => r.id);
    insertPositions.forEach((pos, i) => {
      if (typeof newIds[i] === "string") idsByPosition[pos] = newIds[i];
    });
  }

  /* `ids` payload SIRASINDA döner → caller (admin ekranı) her satırın
     çevirisini doğru faq_id ile yazabilir. Çözülemeyen pozisyon "" olur. */
  return { ok: true, ids: idsByPosition.map((x) => x ?? "") };
}

/* ---------------------------------------------------------------
   🗑 DELETE single — admin'in tek satır silmesi için (opsiyonel)
   ---------------------------------------------------------------
   replaceFaqs DELETE+INSERT pattern'i tek save'de tüm değişimleri
   yansıttığı için bu helper UI tarafından doğrudan çağrılmıyor;
   ancak future use cases (örn. "bulk delete" admin toolu) için
   service katmanında hazır.
*/
export async function deleteFaq(id: string): Promise<boolean> {
  if (!id) return false;
  const { error } = await faqRepository.deleteById(id);
  if (error) {
    console.error("[faq.delete] failed:", error.message);
    return false;
  }
  return true;
}
