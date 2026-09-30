import { describe, it, expect } from "vitest";

import { generatePrivateTokenString } from "@/app/services/villa-admin/_helpers/private-token";

/* ===============================================================
   🛡️ FAZ 5 — generatePrivateTokenString UNIT TESTS
   ===============================================================
   Pure crypto helper. WebCrypto randomUUID + 20-char hex slice.
=============================================================== */

describe("generatePrivateTokenString", () => {
  it("returns a string of length exactly 20", () => {
    for (let i = 0; i < 10; i++) {
      const t = generatePrivateTokenString();
      expect(typeof t).toBe("string");
      expect(t.length).toBe(20);
    }
  });

  it("contains only hex characters (0-9, a-f)", () => {
    for (let i = 0; i < 10; i++) {
      const t = generatePrivateTokenString();
      expect(t).toMatch(/^[0-9a-f]{20}$/);
    }
  });

  it("does not contain hyphens (replaced)", () => {
    for (let i = 0; i < 10; i++) {
      const t = generatePrivateTokenString();
      expect(t.includes("-")).toBe(false);
    }
  });

  it("returns different tokens on successive calls (entropi)", () => {
    const a = generatePrivateTokenString();
    const b = generatePrivateTokenString();
    /* Same prefix collision ihtimali 16^20 ≈ 10^24'te 1; pratikte
       imkânsız. */
    expect(a).not.toBe(b);
  });
});
