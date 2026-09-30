"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import {
  isPopupHomePath,
  isWithinPopupWindow,
  localizeSitePopup,
  popupDismissMs,
  type PublicSitePopup,
} from "@/lib/site-popup";

/* ===============================================================
   🛡️ SitePopupLoader — açılış popup'ının hafif karar katmanı
   ===============================================================
   Public layout bunu YALNIZ server tarafında popup aktif/içerikli ve
   süresi dolmamışsa render eder (aksi halde hiç JS/görsel yok).
   Burada, client'ta:
     1) kapsam (yalnız ana sayfa / tüm site),
     2) tarih penceresi (ISR/cache gecikmesinden bağımsız doğru an),
     3) kapatma kaydı (süre + içerik sürümü)
   kontrol edilir. Hepsi geçerse modal kodu (SitePopupDialog) dinamik
   import edilir ve görsel ancak o zaman istenir.

   KAPATMA KAYDI: { v: <içerik sürümü>, until: <ms> }
     • session → sessionStorage (sekme/ziyaret boyunca)
     • 1h/1d/7d/30d → localStorage (süre dolana kadar)
   Admin içeriği değiştirirse sürüm (updated_at) değişir → kayıt
   geçersiz sayılır, popup yeniden gösterilir. Storage erişilemezse
   (gizli mod vb.) popup yalnız bu sayfa görünümünde gösterilir.
   =============================================================== */

const STORAGE_KEY = "ty_site_popup_dismissed";
const OPEN_DELAY_MS = 700;

const SitePopupDialog = dynamic(() => import("./SitePopupDialog"), { ssr: false });

const CLOSE_LABELS: Record<string, string> = { tr: "Kapat", en: "Close", de: "Schließen" };

function localeOf(pathname: string): "tr" | "en" | "de" {
  if (pathname === "/en" || pathname.startsWith("/en/")) return "en";
  if (pathname === "/de" || pathname.startsWith("/de/")) return "de";
  return "tr";
}

function readDismissed(version: string): boolean {
  for (const store of ["sessionStorage", "localStorage"] as const) {
    try {
      const raw = window[store].getItem(STORAGE_KEY);
      if (!raw) continue;
      const rec = JSON.parse(raw) as { v?: unknown; until?: unknown };
      if (rec?.v !== version) continue;
      if (store === "sessionStorage") return true;
      if (typeof rec.until === "number" && rec.until > Date.now()) return true;
    } catch {
      /* storage kapalı / bozuk kayıt → gösterilebilir */
    }
  }
  return false;
}

function writeDismissed(popup: PublicSitePopup) {
  const ms = popupDismissMs(popup.dismiss);
  try {
    if (ms === null) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ v: popup.version }));
    } else {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ v: popup.version, until: Date.now() + ms })
      );
    }
  } catch {
    /* storage yok → yalnız bu görünümde kapanır */
  }
}

export default function SitePopupLoader({ popup }: { popup: PublicSitePopup }) {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [closedHere, setClosedHere] = useState(false);

  const inScope = popup.scope === "all" || isPopupHomePath(pathname);
  /* İçerik dili: URL prefix'i (/en, /de; diğerleri TR). Çeviri yoksa
     veya alan boşsa Türkçe (server'da uygulanmış fallback). */
  const locale = localeOf(pathname);
  const content = useMemo(() => localizeSitePopup(popup, locale), [popup, locale]);

  useEffect(() => {
    if (closedHere || open || !inScope) return;
    if (!isWithinPopupWindow(Date.now(), popup.startsAt, popup.endsAt)) return;
    if (readDismissed(popup.version)) return;
    const t = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [inScope, popup, closedHere, open]);

  const close = useCallback(() => {
    writeDismissed(popup);
    setClosedHere(true);
    setOpen(false);
  }, [popup]);

  if (!open || !inScope) return null;

  return (
    <SitePopupDialog
      popup={content}
      onClose={close}
      onCta={close}
      closeLabel={CLOSE_LABELS[locale]}
    />
  );
}
