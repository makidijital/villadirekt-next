/* ===============================================================
   🛡️ PHASE 11 — 🔴 CACHE LOCALE İZOLASYONU (KRİTİK)
   ===============================================================
   İDDİA: Locale'e bağlı tek cache'lenen veri SSS'tir ve her locale
   İÇİN AYRI bir `unstable_cache` örneği kurulur; cache key'e locale
   AÇIKÇA gömülür. Böylece EN çevirisi TR isteğine (veya tersi) ASLA
   servis edilemez — bu bir konfigürasyon değil, YAPISAL garantidir.

   Ayrıca: TTL ve tag DEĞİŞMEDİ (3600 / "faqs") → admin `replaceFaqs`
   sonrası `revalidateFaqs()` üç locale cache'ini birden temizler.

   `unstable_cache` mock'lanır; gerçek Next cache'i KULLANILMAZ.
=============================================================== */

import { describe, it, expect, vi } from "vitest";

type CacheCall = { keyParts: string[]; opts: { tags?: string[]; revalidate?: number } };
const cacheCalls: CacheCall[] = [];

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...a: unknown[]) => unknown,
    keyParts: string[],
    opts: { tags?: string[]; revalidate?: number }
  ) => {
    cacheCalls.push({ keyParts, opts });
    return fn;
  },
}));

/* Ağır veri katmanını devre dışı bırak — yalnız cache KURULUMU test edilir. */
vi.mock("@/app/services/faq.service", () => ({ getFaqs: async () => [] }));
vi.mock("@/lib/i18n/get-faq-translations.server", () => ({
  applyFaqTranslations: async (f: unknown[]) => f,
}));

describe("SSS cache — locale başına AYRI key", () => {
  it("1) tr/en/de için ÜÇ AYRI cache örneği kurulur", async () => {
    await import("@/lib/cache.helpers");
    const faqCaches = cacheCalls.filter((c) => c.keyParts[0] === "faqs:get");
    expect(faqCaches).toHaveLength(3);
  });

  it("2) her cache key'i locale'i AÇIKÇA içerir", async () => {
    await import("@/lib/cache.helpers");
    const faqCaches = cacheCalls.filter((c) => c.keyParts[0] === "faqs:get");
    expect(faqCaches.map((c) => c.keyParts)).toEqual([
      ["faqs:get", "tr"],
      ["faqs:get", "en"],
      ["faqs:get", "de"],
    ]);
  });

  it("3) key'ler BİRBİRİNDEN FARKLI (çapraz-dil sızıntısı imkânsız)", async () => {
    await import("@/lib/cache.helpers");
    const keys = cacheCalls
      .filter((c) => c.keyParts[0] === "faqs:get")
      .map((c) => c.keyParts.join("|"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("4) TTL ve tag DEĞİŞMEDİ — 3600 / 'faqs'", async () => {
    await import("@/lib/cache.helpers");
    for (const c of cacheCalls.filter((x) => x.keyParts[0] === "faqs:get")) {
      expect(c.opts.revalidate).toBe(3600);
      expect(c.opts.tags).toEqual(["faqs"]);
    }
  });

  it("5) getCachedFaqs() — locale verilmezse TR", async () => {
    const mod = await import("@/lib/cache.helpers");
    expect(typeof mod.getCachedFaqs).toBe("function");
    await expect(mod.getCachedFaqs()).resolves.toEqual([]);
    await expect(mod.getCachedFaqs("de")).resolves.toEqual([]);
  });
});
