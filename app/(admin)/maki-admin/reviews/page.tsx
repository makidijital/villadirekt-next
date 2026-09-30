import ReviewAdminList from "./ReviewAdminList";

/* ===============================================================
   🛡️ FAZ 33 — ADMIN REVIEWS PAGE
   ===============================================================
   /maki-admin/reviews — luxury stacked-list, reservation panel hissi.

   🛡️ FAZ 33B — Veri fetch CLIENT-SIDE'a alındı.
   ─────────────────────────────────────────────────────────────
   ROOT CAUSE:
     Önceki versiyonda bu sayfa server component olarak
     `getVillaReviewsForAdmin()`'i çağırıyordu. `@/lib/db`
     server context'te auth cookie/session bilmediği için query
     `anon` role ile çalışıyor; villa_reviews tablosunda public
     SELECT policy `is_approved=true` koşulu uyguladığı için
     PENDING yorumlar server'dan gizleniyordu.

   FIX (production-safe):
     - Page artık thin server skeleton (header sadece)
     - ReviewAdminList client island olarak mount sonrası
       `getVillaReviewsForAdmin`'i kendi fetch'i ile çağırıyor
     - Tarayıcıda eski sağlayıcı client otomatik olarak admin'in
       JWT session'ını ekliyor → RLS `authenticated` role policy
       devreye giriyor → pending + approved hepsi görünür
     - Service-role client YOK; mevcut admin auth pattern reuse
     - Counter strip (Bekleyen / Yayında) data-driven olduğu için
       client island içine taşındı

   PERMISSION: "reviews" — migration 020 + sidebar registry filtre eder.
   DOKUNULMAYAN: reservation, pricing, availability, BookingSidebar,
   gallery, manual reservations, FAQ, search, sidebar structure,
   admin permissions, villa services, public review submit/UI,
   aggregateRating SEO, cache architecture.
   =============================================================== */

export default function Page() {
  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">İçerik</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Misafir yorumları
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Yeni gelen yorumlar admin onayı sonrası mülk detay
          sayfalarında yayınlanır. Her mülk için en fazla bir
          yorum &ldquo;öne çıkan&rdquo; olabilir.
        </p>
      </div>

      <ReviewAdminList />
    </div>
  );
}
