/* ===============================================================
   🛡️ PHASE 9C — HEADER FAVORİLER LİNKİ HREF REGRESYON KİLİDİ
   ===============================================================
   Hedef: app/components/favorites/HeaderFavoritesLink.tsx

   Bu component `header-locale.test.tsx`'te KASITLI OLARAK
   `() => null` mock'lanıyor (o dosyanın amacı yalnızca Header'ın
   dictionary/locale davranışı — bkz. o dosyanın başlık yorumu).
   Bu yüzden href'ini kilitlemek için AYRI, küçük bir dosya:
   component'i DOĞRUDAN (mock'lanmamış) render eder, yalnız
   `useFavorites()` hook'unu (localStorage/context tabanlı — bu
   testin kapsamı DIŞINDA) minimal bir sabit değerle mock'lar.

   PHASE 9C AUDIT KARARI: Header/Footer href'leri bu fazda
   DEĞİŞTİRİLMEDİ — bu test yalnızca BUGÜNKÜ "/favoriler" davranışını
   gelecekte yanlışlıkla bozulmaya karşı kilitler. Locale/dictionary
   mantığına dokunmaz.
=============================================================== */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-favorites", () => ({
  useFavorites: () => useFavoritesMock(),
}));

const useFavoritesMock = vi.fn(() => ({ count: 0, isHydrated: true }));

import HeaderFavoritesLink from "@/app/components/favorites/HeaderFavoritesLink";

describe("HeaderFavoritesLink — Phase 9C href regresyon kilidi", () => {
  it("href her zaman '/favoriler' — count/isHydrated durumundan bağımsız (badge yok)", () => {
    render(<HeaderFavoritesLink />);
    const link = screen.getByRole("link", { name: "Favorilerim" });
    expect(link).toHaveAttribute("href", "/favoriler");
  });

  it("href her zaman '/favoriler' — badge görünür durumda da (count > 0)", () => {
    useFavoritesMock.mockReturnValueOnce({ count: 3, isHydrated: true });
    render(<HeaderFavoritesLink />);
    const link = screen.getByRole("link", { name: "Favorilerim (3)" });
    expect(link).toHaveAttribute("href", "/favoriler");
  });
});
