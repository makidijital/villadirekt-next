/* ===============================================================
   🛡️ CACHE INVALIDATION SÖZLEŞMESİ — revalidate.actions.ts
   ===============================================================
   BUG: 8 revalidation fonksiyonunun tamamı `revalidateTag(tag, "max")`
   çağırıyordu. Next.js 16.2.4'te bu İKİNCİ ARGÜMAN bir cacheLife
   profilidir ve `max.expire = 31536000` (365 gün):

     revalidation-utils.js:119-123  → durations = { expire: 31536000 }
     file-system-cache.js:63-65     → expired = now + 31536000*1000
     tags-manifest.external.js      → areTagsExpired:
                                      expiredAt <= now  →  FALSE
                                      ⇒ entry GEÇERSİZ SAYILMAZ

   Yani admin kaydettiğinde cache purge OLMUYOR, yalnız "stale"
   işaretleniyor; bir sonraki public istek ESKİ veriyi alıyor.

   DÜZELTME: `{ expire: 0 }` → `expired = now + 0 = now` → anında purge.
   Next'in argümansız (deprecated) çağrısıyla BİREBİR aynı son durum.

   Bu dosya 8 fonksiyonun TAMAMI için sözleşmeyi kilitler — tek bir
   tag düzeltilip diğerleri geride kalmasın diye.
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* `revalidateTag` mock'lanır — gerçek Next cache'i KULLANILMAZ.
   (Aynı desen: tests/unit/homepage-cache-locale.test.ts) */
const revalidateTagMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

/* 🛡️ SERVER ACTION AUTHZ — revalidate action'ları artık "aktif admin"
   şartı arıyor (permission YOK: bunlar yetkisi çoktan doğrulanmış bir
   mutation'dan SONRA çağrılan cache-purge yardımcıları; 10+ farklı
   permission bağlamından çağrılıyorlar). Test bunları request scope
   DIŞINDA doğrudan çağırdığı için `cookies()` erişimi mock'lanır.
   Tag sözleşmesi assertion'ları AYNEN korundu. */
vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminSession: async () => ({
    ok: true,
    caller: {
      id: "admin-1",
      authUserId: "auth-1",
      email: "admin@example.com",
      is_active: true,
    },
  }),
}));

/** tag ↔ fonksiyon sözleşmesi — lib/cache.helpers.ts ile eşleşir. */
const CONTRACT: Array<[fn: string, tag: string]> = [
  ["revalidateSettings", "settings"],
  ["revalidateMenu", "menu"],
  ["revalidateVillas", "villas"],
  ["revalidateTaxonomy", "taxonomy"],
  ["revalidateHomepage", "homepage"],
  ["revalidateDiscount", "discount"],
  ["revalidateFaqs", "faqs"],
  ["revalidateVillaReviews", "villa-reviews"],
];

const SRC = readFileSync(
  join(process.cwd(), "app/services/revalidate.actions.ts"),
  "utf-8"
);

/** Yorumları çıkarılmış kaynak — doküman bloklarındaki örnek çağrılar
 *  gerçek çağrı sayılmasın diye. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

beforeEach(() => {
  revalidateTagMock.mockClear();
});

describe("revalidate.actions — ANINDA purge sözleşmesi", () => {
  it.each(CONTRACT)(
    "%s() → revalidateTag('%s', { expire: 0 }) TAM 1 kez",
    async (fnName, tag) => {
      const mod = await import("@/app/services/revalidate.actions");
      const fn = (mod as unknown as Record<string, () => Promise<void>>)[
        fnName
      ];
      expect(typeof fn).toBe("function");

      await fn();

      expect(revalidateTagMock).toHaveBeenCalledTimes(1);
      expect(revalidateTagMock).toHaveBeenCalledWith(tag, { expire: 0 });
    }
  );

  it("🔒 hiçbir çağrı 'max' profilini KULLANMIYOR (regresyon kilidi)", () => {
    /* `"max"` → expire 1 yıl ileri → purge YOK. Bir daha girmesin. */
    expect(CODE).not.toMatch(/revalidateTag\([^)]*"max"/);
  });

  it("🔒 KOD'daki her çağrı { expire: 0 } taşıyor (argümansız/deprecated YOK)", () => {
    const calls = CODE.match(/revalidateTag\([^)]*\)/g) ?? [];
    expect(calls.length).toBe(CONTRACT.length);
    for (const c of calls) {
      expect(c, c).toMatch(/\{ expire: 0 \}/);
    }
  });

  it("🔒 tag isimleri DEĞİŞMEDİ — cache.helpers.ts ile eşleşiyor", () => {
    const helpers = readFileSync(
      join(process.cwd(), "lib/cache.helpers.ts"),
      "utf-8"
    );
    for (const [, tag] of CONTRACT) {
      expect(helpers, `"${tag}" tag'i cache.helpers.ts'te yok`).toContain(
        `"${tag}"`
      );
    }
  });

  it("🔒 updateTag KULLANILMIYOR (route handler bağlamında throw eder)", () => {
    expect(CODE).not.toMatch(/\bupdateTag\s*\(/);
  });

  it("🔒 8 fonksiyonun tamamı export ediliyor ve 'use server'", () => {
    expect(SRC.startsWith('"use server"')).toBe(true);
    for (const [fnName] of CONTRACT) {
      expect(CODE).toContain(`export async function ${fnName}(`);
    }
  });
});
