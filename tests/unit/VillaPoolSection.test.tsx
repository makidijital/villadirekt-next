/* ===============================================================
   🛡️ PHASE 10E BATCH 5 — VillaPoolSection TESTLERİ
   ===============================================================
   Hedef: app/components/villa/VillaPoolSection.tsx (EN/DE havuz bölümü).
   GERÇEK dictionary + GERÇEK pool helper'ları kullanılır.
=============================================================== */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import VillaPoolSection from "@/app/components/villa/VillaPoolSection";
import type { PoolCardSource } from "@/lib/pool.helper";

const VILLA: PoolCardSource = {
  pool_type: "ozel",
  pool_sheltered: true,
  pool_width: "4",
  pool_length: "8",
  pool_depth: "1.5",
  indoor_pool: true,
  indoor_pool_width: "3",
  indoor_pool_length: "6",
  indoor_pool_depth: "1.2",
  child_pool: true,
};

describe("VillaPoolSection — locale etiketleri", () => {
  it("EN havuz tipleri ve UI metinleri", () => {
    render(<VillaPoolSection villa={VILLA} locale="en" />);
    expect(screen.getByText("Pool Details")).toBeInTheDocument();
    expect(screen.getByText("Private Sheltered Pool")).toBeInTheDocument();
    expect(screen.getByText("Indoor Pool")).toBeInTheDocument();
    expect(screen.getByText("Children's Pool")).toBeInTheDocument();
    expect(screen.getAllByText("Width").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Depth").length).toBeGreaterThan(0);
  });

  it("DE havuz tipleri ve UI metinleri", () => {
    render(<VillaPoolSection villa={VILLA} locale="de" />);
    expect(screen.getByText("Poolinformationen")).toBeInTheDocument();
    expect(screen.getByText("Privater überdachter Pool")).toBeInTheDocument();
    expect(screen.getByText("Hallenbad")).toBeInTheDocument();
    expect(screen.getByText("Kinderpool")).toBeInTheDocument();
    expect(screen.getAllByText("Breite").length).toBeGreaterThan(0);
  });

  it("TR locale mevcut TR metinlerini verir", () => {
    render(<VillaPoolSection villa={VILLA} locale="tr" />);
    expect(screen.getByText("Havuz Bilgileri")).toBeInTheDocument();
    expect(screen.getByText("Özel Korunaklı Havuz")).toBeInTheDocument();
    expect(screen.getByText("Kapalı Havuz")).toBeInTheDocument();
    expect(screen.getByText("Çocuk Havuzu")).toBeInTheDocument();
  });

  it("ortak havuz → shared etiketi", () => {
    render(
      <VillaPoolSection villa={{ pool_type: "ortak" }} locale="en" />
    );
    expect(screen.getByText("Shared Pool")).toBeInTheDocument();
  });

  it("havuz yoksa HİÇBİR ŞEY render edilmez", () => {
    const { container } = render(
      <VillaPoolSection villa={{ pool_type: "yok" }} locale="en" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("ölçü yoksa locale'e uygun 'ölçü yok' metni", () => {
    render(
      <VillaPoolSection villa={{ pool_type: "ozel" }} locale="en" />
    );
    expect(screen.getByText("No dimension information")).toBeInTheDocument();
  });

  it("ölçüler formatPoolDimension ile 'm' ekli, locale'den bağımsız", () => {
    const { unmount } = render(
      <VillaPoolSection
        villa={{ pool_type: "ozel", pool_width: "4", pool_length: "8" }}
        locale="en"
      />
    );
    expect(screen.getByText("4 m")).toBeInTheDocument();
    unmount();

    render(
      <VillaPoolSection
        villa={{ pool_type: "ozel", pool_width: "4", pool_length: "8" }}
        locale="de"
      />
    );
    /* Ölçü DEĞERİ çevrilmez. */
    expect(screen.getByText("4 m")).toBeInTheDocument();
  });

  it("🛡️ ikon locale'den ve etiketten ETKİLENMEZ (section başına 1 Waves)", () => {
    const { container: en } = render(
      <VillaPoolSection villa={VILLA} locale="en" />
    );
    const enSvg = en.querySelectorAll("svg").length;
    const { container: de } = render(
      <VillaPoolSection villa={VILLA} locale="de" />
    );
    expect(de.querySelectorAll("svg").length).toBe(enSvg);
    expect(enSvg).toBe(1);
  });

  it("🛡️ kart sırası ve sayısı locale'den bağımsız", () => {
    const { container: en } = render(
      <VillaPoolSection villa={VILLA} locale="en" />
    );
    const { container: tr } = render(
      <VillaPoolSection villa={VILLA} locale="tr" />
    );
    expect(en.querySelectorAll(".p-4.md\\:p-5").length).toBe(
      tr.querySelectorAll(".p-4.md\\:p-5").length
    );
  });

  it("className/grid yapısı TR bloğuyla aynı", () => {
    const { container } = render(
      <VillaPoolSection villa={VILLA} locale="en" />
    );
    expect(
      container.querySelector(".rounded-2xl.border.divide-y")
    ).toBeTruthy();
    expect(container.querySelector(".grid.grid-cols-3")).toBeTruthy();
  });
});
