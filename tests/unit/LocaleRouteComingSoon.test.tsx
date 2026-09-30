/* ===============================================================
   🛡️ PHASE 4A — PUBLIC LOCALE ROUTING CORE: COMPONENT TEST
   ===============================================================
   Hedef: app/components/i18n/LocaleRouteComingSoon.tsx
=============================================================== */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import LocaleRouteComingSoon from "@/app/components/i18n/LocaleRouteComingSoon";

describe("LocaleRouteComingSoon", () => {
  it("locale=en → İngilizce metin render eder", () => {
    render(<LocaleRouteComingSoon locale="en" />);
    expect(
      screen.getByText(/this page isn't translated yet/i)
    ).toBeInTheDocument();
  });

  it("locale=de → Almanca metin render eder", () => {
    render(<LocaleRouteComingSoon locale="de" />);
    expect(
      screen.getByText(/diese seite ist noch nicht übersetzt/i)
    ).toBeInTheDocument();
  });
});
