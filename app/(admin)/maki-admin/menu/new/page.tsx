"use client";

import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import { useRouter } from "next/navigation";
import { Save, Link2, FileText, Tag, MapPin, Languages } from "lucide-react";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import type { MenuSourceType } from "@/lib/menu-resolver";
import { revalidateMenu } from "@/app/services/revalidate.actions";
/* 🛡️ MIGRATION 086 — menü adının EN/DE karşılıkları. Kayıt, menü
   satırı oluşturulduktan SONRA dönen `id` ile `menu_translations`'a
   yazılır (aynı server action, `/maki-admin/menu` listesindeki
   panelle PAYLAŞILIR — ikinci bir yazma yolu yaratılmadı). */
import { saveMenuTranslationAction } from "../menu-translations.action";
import {
  MENU_LOCALE_LABELS,
  MENU_TRANSLATION_MAX_LEN,
} from "../MenuTranslationsPanel";

/* ===============================================================
   🛡️ MENU EKLE — DYNAMIC NAVIGATION SOURCE PICKER
   ===============================================================
   Bağlantı Türü 4 source'tan biri:
     manual    → name + href manuel girilir (klasik link)
     page      → aktif CMS sayfası seç (title + /p/{slug} runtime)
     category  → villa_types kaydı seç  (name + /arama?categories=…)
     region    → villa_locations kaydı seç (name + /arama?regions=…)

   Non-manual türlerde:
     - menu.name → source.name snapshot (orphan durumda fallback için)
     - menu.href → runtime URL snapshot
     - menu.source_type / menu.source_id → resolver'ın resolve edeceği
       canonical referans
   Render zamanında source'tan TAZE okuma yapılır; name/href stale
   olsa bile resolver güncel değeri gösterir. Snapshot yalnız orphan
   fallback için faydalı.
   =============================================================== */

type Option = { id: string; name: string };

export default function NewMenu() {
  const toast = useNotify();
  const router = useRouter();

  const [sourceType, setSourceType] = useState<MenuSourceType>("manual");

  // manual fields
  const [manualName, setManualName] = useState("");
  const [manualHref, setManualHref] = useState("");

  // source-bound selection
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");

  /* 🛡️ MIGRATION 086 — menü adı çevirileri (OPSİYONEL). Boş bırakılırsa
     hiç yazılmaz; public tarafta TR adı gösterilir. Kaynağa bağlı
     türlerde de geçerlidir — bu alan menünün GÖRÜNEN ETİKETİDİR,
     kaynak kaydın kendi çevirisini değiştirmez. */
  const [nameEn, setNameEn] = useState("");
  const [nameDe, setNameDe] = useState("");

  // option lists
  const [pageOptions, setPageOptions] = useState<
    { id: string; title: string; slug: string; show_in_menu?: boolean }[]
  >([]);
  const [typeOptions, setTypeOptions] = useState<Option[]>([]);
  const [locationOptions, setLocationOptions] = useState<Option[]>([]);
  /* 🛡️ "Zaten kullanılıyor" işareti için mevcut menü satırları
     (source_type/source_id). GET zaten döndürüyor; ekstra sorgu YOK. */
  const [menuRows, setMenuRows] = useState<
    { source_type: string; source_id: string | null }[]
  >([]);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    /* 🛡️ FAZ 2 frontend purge — adminFetch (Bearer) GET /api/admin/menu.
       Tek request 3 dropdown source döner: pages(active) + villa_types +
       villa_locations. Davranış BYTE-IDENTICAL: aynı select shape, aynı
       filter (pages.is_active=true), repository üzerinden. */
    (async () => {
      try {
        const res = await adminFetch("/api/admin/menu");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          pages?: Array<{
            id: string;
            title: string;
            slug: string;
            show_in_menu?: boolean;
          }>;
          types?: Option[];
          locations?: Option[];
          menu?: Array<{ source_type: string; source_id: string | null }>;
        };
        if (!res.ok || !json.ok) return;
        setPageOptions(json.pages || []);
        setTypeOptions(json.types || []);
        setLocationOptions(json.locations || []);
        setMenuRows(json.menu || []);
      } catch {
        /* fail-soft: dropdownlar boş kalır, kullanıcı yine manual seçebilir. */
      }
    })();
  }, []);

  /* Source seçiminden derive olan name + href preview. Submit
     anında bunlar menu.name/href olarak yazılır (snapshot). */
  const preview = useMemo(() => {
    if (sourceType === "manual") {
      return { name: manualName.trim(), href: manualHref.trim() };
    }
    if (!selectedSourceId) return { name: "", href: "" };

    if (sourceType === "page") {
      const p = pageOptions.find((o) => o.id === selectedSourceId);
      if (!p) return { name: "", href: "" };
      return { name: p.title, href: `/p/${p.slug}` };
    }
    if (sourceType === "category") {
      const t = typeOptions.find((o) => o.id === selectedSourceId);
      if (!t) return { name: "", href: "" };
      /* 🛡️ slug-preferred URL (migration 008); fallback UUID.
         Canonical param: `villa-turleri` — server eski `categories`'ı
         da kabul eder. */
      const slug = (t as { slug?: string | null }).slug;
      const token = (slug && String(slug).trim()) || t.id;
      return {
        name: t.name,
        href: `/arama?villa-turleri=${encodeURIComponent(token)}`,
      };
    }
    if (sourceType === "region") {
      const l = locationOptions.find((o) => o.id === selectedSourceId);
      if (!l) return { name: "", href: "" };
      /* 🛡️ slug-preferred URL (migration 009); fallback UUID.
         Canonical param: `bolgeler` — server eski `regions`'ı da kabul eder. */
      const slug = (l as { slug?: string | null }).slug;
      const token = (slug && String(slug).trim()) || l.id;
      return {
        name: l.name,
        href: `/arama?bolgeler=${encodeURIComponent(token)}`,
      };
    }
    return { name: "", href: "" };
  }, [
    sourceType,
    manualName,
    manualHref,
    selectedSourceId,
    pageOptions,
    typeOptions,
    locationOptions,
  ]);

  /* 🛡️ "Zaten kullanılıyor" — gelen menü satırlarından (source_type:
     source_id) sayım + page için show_in_menu. Salt-okuma, ekstra
     sorgu yok. N = aynı source_id ile oluşturulmuş menu satırı sayısı. */
  const usedCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of menuRows) {
      if (!r.source_id) continue;
      const k = `${r.source_type}:${r.source_id}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [menuRows]);

  const pageInMenu = useMemo(
    () => new Set(pageOptions.filter((p) => p.show_in_menu).map((p) => p.id)),
    [pageOptions]
  );

  const usageFor =
    (type: MenuSourceType) =>
    (id: string): { used: boolean; count: number } => {
      const count = usedCountMap.get(`${type}:${id}`) ?? 0;
      const used = count > 0 || (type === "page" && pageInMenu.has(id));
      return { used, count };
    };

  const canSubmit =
    !loading &&
    (sourceType === "manual"
      ? preview.name && preview.href
      : !!selectedSourceId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error("Eksik alan", {
        id: "menu-create",
        description:
          sourceType === "manual"
            ? "Ad ve link zorunlu."
            : "Lütfen bir kaynak seç.",
      });
      return;
    }
    setLoading(true);

    /* INSERT payload:
       - manual:   source_type='manual', source_id=null, name/href manuel
       - non-manual: source_type & source_id canonical;
         name/href snapshot (resolver runtime'da taze değer alır). */
    const payload: Record<string, any> = {
      name: preview.name,
      href: preview.href,
      source_type: sourceType,
      source_id: sourceType === "manual" ? null : selectedSourceId,
      is_active: true,
    };

    /* 🛡️ FAZ 2 frontend purge — adminFetch (Bearer) üzerinden /api/admin/menu.
       Server route insert + show_in_menu sync'i atomik yapar (eski client
       behavior BYTE-IDENTICAL: page source ise pages.show_in_menu=true
       sync'i route içinde yapılıyor; best-effort, sync hatası insert'i
       BOZMAZ). */
    let resJson: { ok?: boolean; error?: string; id?: string | null } = {};
    try {
      const res = await adminFetch("/api/admin/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      resJson = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        id?: string | null;
      };
      if (!res.ok || !resJson.ok) {
        setLoading(false);
        toast.error("Menü eklenemedi", {
          id: "menu-create",
          description: resJson.error || `HTTP ${res.status}`,
        });
        return;
      }
    } catch (err) {
      setLoading(false);
      toast.error("Menü eklenemedi", {
        id: "menu-create",
        description: err instanceof Error ? err.message : "İstek başarısız",
      });
      return;
    }
    /* 🛡️ MIGRATION 086 — çeviriler best-effort: menü satırı ZATEN
       oluştu; çeviri yazımı başarısız olsa bile kayıt BOZULMAZ
       (kullanıcı listeden "Çeviriler" paneliyle tekrar deneyebilir).
       Boş alanlar için istek HİÇ atılmaz. */
    const newMenuId = (resJson.id ?? "").toString().trim();
    /* 🛡️ MIGRATION 086 — çeviri YALNIZ manual menüde yazılır. Kullanıcı
       önce manual'de alanları doldurup sonra türü değiştirdiyse bile
       (state'te değer kalabilir) istek ATILMAZ; servis tarafında da
       aynı kural parent ön-kontrolüyle ayrıca uygulanır. */
    if (newMenuId && sourceType === "manual") {
      const pending: Array<{ locale: "en" | "de"; name: string }> = [];
      if (nameEn.trim()) pending.push({ locale: "en", name: nameEn });
      if (nameDe.trim()) pending.push({ locale: "de", name: nameDe });

      for (const t of pending) {
        const tr = await saveMenuTranslationAction({
          menuId: newMenuId,
          locale: t.locale,
          name: t.name,
        });
        if (!tr.ok) {
          toast.error("Çeviri kaydedilemedi", {
            id: "menu-create-translation",
            description: tr.error,
          });
          break;
        }
      }
    }

    setLoading(false);

    toast.success("Menü eklendi", { id: "menu-create" });
    revalidateMenu().catch(() => {});
    router.push("/maki-admin/menu");
  }

  /* ============== Source picker kartları ============== */
  const sourceCards: {
    value: MenuSourceType;
    label: string;
    icon: typeof Link2;
    hint: string;
  }[] = [
    {
      value: "manual",
      label: "Manuel Link",
      icon: Link2,
      hint: "Özel ad ve URL",
    },
    {
      value: "page",
      label: "CMS Sayfa",
      icon: FileText,
      hint: "Aktif sayfa referansı",
    },
    {
      value: "category",
      label: "Mülk Tipi",
      icon: Tag,
      hint: "/arama?villa-turleri=…",
    },
    {
      value: "region",
      label: "Bölge",
      icon: MapPin,
      hint: "/arama?bolgeler=…",
    },
  ];

  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">İçerik</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Menü ekle
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Header / Footer menüsünde gösterilecek navigation öğesini
          oluştur. Kaynağa bağlı satırlar (sayfa, villa tipi, bölge) her
          render edildiğinde kaynağın güncel adını ve URL&apos;ini kullanır.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="card-premium p-6 md:p-8 space-y-7"
      >
        {/* ============ 1) Bağlantı Türü ============ */}
        <div className="space-y-3">
          <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
            Bağlantı Türü
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {sourceCards.map((card) => {
              const Icon = card.icon;
              const selected = sourceType === card.value;
              return (
                <button
                  key={card.value}
                  type="button"
                  onClick={() => {
                    setSourceType(card.value);
                    setSelectedSourceId("");
                    /* 🛡️ MIGRATION 086 — tür değişince çeviri taslağı
                       temizlenir (yalnız manual'de anlamlı). */
                    if (card.value !== "manual") {
                      setNameEn("");
                      setNameDe("");
                    }
                  }}
                  className={
                    "text-left rounded-xl border px-4 py-3.5 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
                    (selected
                      ? "border-[var(--color-stone-900)] bg-[var(--color-stone-900)] text-white"
                      : "border-[var(--color-stone-200)] bg-white text-[var(--color-stone-700)] hover:border-[var(--color-stone-300)]")
                  }
                >
                  <div className="flex items-center gap-2">
                    <Icon size={14} />
                    <span className="text-[13px] font-semibold">
                      {card.label}
                    </span>
                  </div>
                  <p
                    className={
                      "text-[11px] mt-1 " +
                      (selected ? "text-white/70" : "text-[var(--color-stone-400)]")
                    }
                  >
                    {card.hint}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ============ 2) Conditional source picker ============ */}
        {sourceType === "manual" && (
          <div className="space-y-5 pt-2 border-t border-[var(--color-stone-100)]">
            <div className="space-y-1.5 pt-5">
              <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                Menü adı
              </label>
              <input
                placeholder="Örn: İletişim"
                className="input"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                Bağlantı
              </label>
              <input
                placeholder="/iletisim veya https://…"
                className="input font-mono text-sm"
                value={manualHref}
                onChange={(e) => setManualHref(e.target.value)}
              />
              <p className="text-xs text-[var(--color-stone-400)]">
                Site içi yol veya tam URL girebilirsin.
              </p>
            </div>
          </div>
        )}

        {sourceType === "page" && (
          <SourcePicker
            label="CMS sayfası"
            hint="Sadece aktif sayfalar listelenir."
            value={selectedSourceId}
            onChange={setSelectedSourceId}
            options={pageOptions.map((p) => ({ id: p.id, name: p.title }))}
            emptyMessage="Aktif CMS sayfası bulunamadı."
            getUsage={usageFor("page")}
          />
        )}

        {sourceType === "category" && (
          <SourcePicker
            label="Mülk tipi"
            hint="Seçilen tip /arama?villa-turleri= ile linklenir."
            value={selectedSourceId}
            onChange={setSelectedSourceId}
            options={typeOptions}
            emptyMessage="Tanımlı mülk tipi yok."
            getUsage={usageFor("category")}
          />
        )}

        {sourceType === "region" && (
          <SourcePicker
            label="Bölge"
            hint="Seçilen bölge /arama?bolgeler= ile linklenir."
            value={selectedSourceId}
            onChange={setSelectedSourceId}
            options={locationOptions}
            emptyMessage="Tanımlı bölge yok."
            getUsage={usageFor("region")}
          />
        )}

        {/* ============ 3) Menü adı çevirileri (opsiyonel) ============
            🛡️ MIGRATION 086 — mevcut form tasarım dili (uppercase
            label + `input` class) korunarak eklendi.

            YALNIZ `manual` türünde gösterilir: diğer türlerde menü adı
            kaynağından gelir ve çevirisi o kaynağın kendi sisteminde
            yapılır (CMS Sayfa → Pages, Villa Tipi → Villa Tipleri;
            Bölge → Phase 10I gereği çevrilmez). */}
        {sourceType === "manual" && (
        <div className="space-y-5 pt-5 border-t border-[var(--color-stone-100)]">
          <div className="flex items-center gap-1.5">
            <Languages size={13} className="text-[var(--color-champagne-700)]" />
            <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)]">
              Menü adı çevirileri
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              {MENU_LOCALE_LABELS.en}
            </label>
            <input
              aria-label={MENU_LOCALE_LABELS.en}
              placeholder="Örn: Rental Villas"
              className="input"
              maxLength={MENU_TRANSLATION_MAX_LEN}
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
              {MENU_LOCALE_LABELS.de}
            </label>
            <input
              aria-label={MENU_LOCALE_LABELS.de}
              placeholder="Örn: Mietvillen"
              className="input"
              maxLength={MENU_TRANSLATION_MAX_LEN}
              value={nameDe}
              onChange={(e) => setNameDe(e.target.value)}
            />
            <p className="text-xs text-[var(--color-stone-400)]">
              Boş bırakılan dilde Türkçe menü adı gösterilir. Bağlantı
              adresi çevrilmez.
            </p>
          </div>
        </div>
        )}

        {/* ============ 4) URL preview ============ */}
        {(preview.name || preview.href) && (
          <div className="rounded-xl border border-[var(--color-stone-100)] bg-[var(--color-sand-50)]/50 px-4 py-3">
            <p className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
              Önizleme
            </p>
            <p className="text-sm font-medium text-[var(--color-stone-900)] mt-1.5 truncate">
              {preview.name || "—"}
            </p>
            <p className="text-[11px] tracking-[0.04em] uppercase font-mono text-[var(--color-stone-500)] truncate mt-0.5">
              {preview.href || "—"}
            </p>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={!canSubmit} className="btn-primary">
            <Save size={15} />
            {loading ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ===============================================================
   SourcePicker — generic dropdown for source-bound types
   ===============================================================
   Premium native select. Searchable değil (minimal scope); listeler
   küçük olduğu için yeterli. Empty state friendly.
=============================================================== */
function SourcePicker({
  label,
  hint,
  value,
  onChange,
  options,
  emptyMessage,
  getUsage,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  emptyMessage: string;
  /** 🛡️ Opsiyonel: öğenin menüde kullanım durumu (✓ + "Kullanılıyor (N)"). */
  getUsage?: (id: string) => { used: boolean; count: number };
}) {
  return (
    <div className="space-y-1.5 pt-5 border-t border-[var(--color-stone-100)]">
      <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block pt-1">
        {label}
      </label>
      {options.length === 0 ? (
        <p className="text-sm text-[var(--color-stone-500)] italic">
          {emptyMessage}
        </p>
      ) : (
        <>
          <select
            className="input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— Seç —</option>
            {options.map((o) => {
              const u = getUsage?.(o.id);
              const label = u?.used
                ? `✓ ${o.name} — Kullanılıyor${
                    u.count > 1 ? ` (${u.count})` : ""
                  }`
                : o.name;
              return (
                <option key={o.id} value={o.id}>
                  {label}
                </option>
              );
            })}
          </select>
          <p className="text-xs text-[var(--color-stone-400)]">{hint}</p>
        </>
      )}
    </div>
  );
}
