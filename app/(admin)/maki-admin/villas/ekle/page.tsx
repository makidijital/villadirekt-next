"use client";

/* 🛡️ FAZ 2 frontend purge — direct anon DB client import KALDIRILDI.
   Eskiden 5 ayrı `db.from(table).select(...)` useEffect'i vardı:
     - villa_locations (select *)
     - villa_types     (select *)
     - villa_features  (select *)
     - rule_items      (select id, title order created_at asc)
     - price_include_items (select id, title order created_at asc)
   Hepsi tek `adminFetch GET /api/admin/taxonomies` çağrısına indi
   (5 paralel server-side fetch, tek round-trip). Service-role +
   Bearer auth → BYTE-IDENTICAL data shape. UI dropdown ordering ve
   loading timing aynen. */
import { useEffect, useState } from "react";

/* 🛡️ FAZ 2 frontend purge — direct service import KALDIRILDI.
   Eskiden:
     import { createVillaFull } from "@/app/services/villa-admin.service";
   villa-admin.service barrel hard-delete + private-token re-export ediyor
   (server-only chain) → BUILD HATA. Şimdi:
     POST /api/admin/villas → createVillaFull service delege.
   Service orchestration (validate → slug → INSERT → 4 conditional relation
   → distances → prices) BYTE-IDENTICAL. */
import { adminFetch } from "@/lib/admin-fetch";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { logActivity } from "@/lib/activity-log.client";
import { slugifyTr } from "@/lib/slug";
import { buildInitialDistances } from "@/lib/distance.helper";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const MapPicker = dynamic(
  () => import("../../components/MapPicker"),
  { ssr: false }
);

import PricingCalendarCanvas from "@/app/components/admin/villa/PricingCalendarCanvas";

/* 🔥 Villa form wizard step components — pure presentational.
   Tüm state/effects/handlers page (orchestrator) içinde kalır;
   componentler yalnızca props alır ve UI render eder. UI birebir
   aynı; create page için showCleaningCurrency=false (cleaning_currency
   alanı create page'de yok), submitOnlyOnLastStep=true (create page
   sticky bar'ında submit yalnız son adımda görünür). */
import WizardStepBar from "@/app/components/admin/villa-form/WizardStepBar";
import StickyActionBar from "@/app/components/admin/villa-form/StickyActionBar";
import BasicInfoStep from "@/app/components/admin/villa-form/BasicInfoStep";
import AmenitiesStep from "@/app/components/admin/villa-form/AmenitiesStep";
import LocationStep from "@/app/components/admin/villa-form/LocationStep";
import PricingStep from "@/app/components/admin/villa-form/PricingStep";
import RulesAndIncludesStep from "@/app/components/admin/villa-form/RulesAndIncludesStep";
import SeoStep from "@/app/components/admin/villa-form/SeoStep";
import VideoStep from "@/app/components/admin/villa-form/VideoStep";
import AccommodationLayoutStep from "@/app/components/admin/villa-form/AccommodationLayoutStep";
import type { VillaYouTubeVideo } from "@/lib/youtube.helper";
import type {
  BedroomLayoutItem,
  BathroomLayoutItem,
} from "@/lib/villa-layout.helper";

/* 🛡️ FAZ 1 — typed villa form pipeline.
   useState<any> drift'i kapatıldı. `form` artık typed VillaFormData;
   child wizard step component'ler `VillaFormShape` loose contract'ı
   ile compatible (intersection subtype). setForm child JSX'ine
   geçerken `VillaFormSetter` ile cast edilir (variance gerekli;
   setter contravariant pozisyon). */
import {
  initialVillaFormData,
  type VillaFormData,
  type VillaFormSetter,
  type VillaMapData,
  type VillaPriceRowState,
  type VillaLocationRowLite,
  type VillaTypeRowLite,
  type VillaFeatureRowLite,
  type VillaRuleItemRowLite,
  type VillaPriceIncludeItemRowLite,
} from "../_types/villa-form-data";

/* 🛡️ FAZ 2 — payload + audit helpers (pure). Orchestrator yalnız
   async I/O + UI sırasını yönetir. */
import { buildVillaCreatePayload } from "../_helpers/payload";
import { buildVillaCreateAuditAfter } from "../_helpers/audit";
import {
  validateVillaCreate,
  validateVillaCreateStep1,
} from "../_helpers/validation";

export default function EditVilla() {
  const toast = useNotify();
  /* 🛡️ FAZ 1 — typed state shape (initial factory + VillaFormData).
     Eski `useState<any>` ile birebir aynı initial object; conditional
     spread (`commission_rate: 20` create modunda) ile alan SIRASI
     byte-identical. Initial value'lar tek source-of-truth:
     `_types/villa-form-data > initialVillaFormData("create")`. */
  const [form, setForm] = useState<VillaFormData>(() =>
    initialVillaFormData("create")
  );

  const [types, setTypes] = useState<VillaTypeRowLite[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [features, setFeatures] = useState<VillaFeatureRowLite[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [locations, setLocations] = useState<VillaLocationRowLite[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [slug, setSlug] = useState("");

  /* 🛡️ FAZ 19 — Distance preset auto-seed.
     Yeni villa formunda standart 8 mesafe satırı otomatik gelir
     (Restoran / Market / Plaj / Havaalanları / Otobüs Terminali /
     Şehir Merkezi / Sağlık Merkezi). Admin distance değerlerini
     doldurur; istenmeyen satırlar X butonu ile silinebilir.

     ⚠️ Bu seed YALNIZ /villas/ekle (yeni villa) için.
     /villas/[id] (edit) DB'den `getVillaDistances` ile çeker;
     EXISTING VILLAS BU SEED'DEN HİÇ ETKİLENMEZ. */
  const [distances, setDistances] = useState<
    { title: string; distance: string }[]
  >(() => buildInitialDistances());

  const [prices, setPrices] = useState<VillaPriceRowState[]>([]);

  /* 🛡️ YouTube videos — yeni villa default boş.
     `VillaYouTubeVideo` { id, url }. Admin VideoStep ile ekler/siler.
     Service-layer normalize edip JSONB array olarak yazar; boş ise null. */
  const [youtubeVideos, setYoutubeVideos] = useState<VillaYouTubeVideo[]>([]);

  /* 🛡️ Konaklama Düzeni (mig 047) — yeni villa default boş.
     Service-layer normalize edip JSONB array yazar; boş ise null. */
  const [bedroomLayout, setBedroomLayout] = useState<BedroomLayoutItem[]>([]);
  const [bathroomLayout, setBathroomLayout] = useState<BathroomLayoutItem[]>(
    []
  );

  /* ---------------------------------------------
     🔥 RULES + PRICE INCLUDES — master/relation
     ChipCheckbox ile master listeden seçim.
  ---------------------------------------------- */
  const [ruleItems, setRuleItems] = useState<VillaRuleItemRowLite[]>([]);
  const [selectedRules, setSelectedRules] = useState<string[]>([]);

  const [priceIncludeItems, setPriceIncludeItems] = useState<VillaPriceIncludeItemRowLite[]>([]);
  const [selectedPriceIncludes, setSelectedPriceIncludes] = useState<
    string[]
  >([]);

  const [mapData, setMapData] = useState<VillaMapData>({
    map_type: "coords",
    latitude: 36.36,
    longitude: 29.35,
    map_embed: "",
  });

  /* ---------------------------------------------
     🔥 WIZARD — adım bazlı UI organizasyonu
     ===============================================
     Yalnız görsel akış. Tüm mevcut state, save/upload,
     slug, pricing, SEO logic'i AYNEN korundu.
  ---------------------------------------------- */
  const STEPS: { id: number; label: string }[] = [
    { id: 1, label: "Temel Bilgiler" },
    { id: 2, label: "Olanaklar" },
    { id: 3, label: "Konum & Mesafe" },
    { id: 4, label: "Fiyatlandırma" },
    { id: 5, label: "Kurallar & Dahil" },
    { id: 6, label: "SEO" },
  ];
  const TOTAL_STEPS = STEPS.length;
  const [currentStep, setCurrentStep] = useState<number>(1);

  const goNext = () => {
    // Step 1 zorunlu alan kontrolü (mevcut handleCreate guard ile aynı kural).
    // FAZ 2 — helper-driven; mesaj sırası BYTE-IDENTICAL (title FIRST, location SECOND).
    if (currentStep === 1) {
      const step1 = validateVillaCreateStep1({ form, selectedLocation });
      if (!step1.ok) {
        toast.error(step1.message, { id: "villa-validation" });
        return;
      }
    }
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };
  const goBack = () =>
    setCurrentStep((s) => Math.max(s - 1, 1));

  /* 🛡️ SLUG SOURCE-OF-TRUTH — lib/slug > slugifyTr.
     Önceki inline `slugify` kaldırıldı. slugifyTr daha geniş TR
     karakter map'i (büyük harfler dahil) + NFKD diakritik strip +
     trim. Migration backfill ile birebir aynı semantic. */

  /* ---------------------------------------------
     🛡️ FAZ 2 frontend purge — tek adminFetch dropdown init
     ---------------------------------------------
     Eskiden 5 ayrı useEffect vardı (her biri anon DB client
     query); şimdi `/api/admin/taxonomies` (admin-only, service-role)
     tek round-trip'te 5 paralel fetch'i birleştirir.

     ⚠️ BYTE-IDENTICAL davranış:
       - Mount sonrası FIRE (deps [] aynen)
       - setLocations / setTypes / setFeatures / setRuleItems /
         setPriceIncludeItems aynı sırada çağrılır
       - Response shape: route içinde
           villa_locations.select("id, name, slug")
           villa_types.select("id, name, slug")
           villa_features.select("id, name")
           rule_items.select("id, title").order("created_at", asc)
           price_include_items.select("id, title").order("created_at", asc)
         UI yalnız id+name (locations/types/features) ve id+title
         (rules/includes) okuyor → eski `select("*")` ile yetinmesinden
         daha narrow ama UI consumer set'i değişmiyor (drift yok).
       - Hata path'i: data fallback `[]` aynen (eski `data || []`
         pattern korunur). adminFetch network/auth hatasında state'ler
         boş kalır (eski eski sağlayıcı hata davranışıyla aynı semantic). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch("/api/admin/taxonomies");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          locations?: VillaLocationRowLite[];
          types?: VillaTypeRowLite[];
          features?: VillaFeatureRowLite[];
          ruleItems?: VillaRuleItemRowLite[];
          priceIncludeItems?: VillaPriceIncludeItemRowLite[];
        };
        if (cancelled) return;
        /* 🛡️ Migration 050 — grup köklerini (name === filter_group_name)
           villa lokasyon seçicisinden gizle. Bunlar filtre üst başlığı;
           gerçek seçilebilir lokasyon değil. Veri modeli/SEO/resolver
           değişmez; yalnız bu dropdown temizlenir. */
        setLocations(
          (json.locations || []).filter((l) => {
            const g = (l.filter_group_name ?? "").toString().trim();
            return !(g.length > 0 && l.name === g);
          })
        );
        setTypes(json.types || []);
        setFeatures(json.features || []);
        setRuleItems(json.ruleItems || []);
        setPriceIncludeItems(json.priceIncludeItems || []);
      } catch {
        /* network/auth fail → state'ler [] kalır (eski davranış parity) */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const router = useRouter();

  /* 🛡️ FAZ 4 — Wizard step component'leri `VillaFormShape` loose
     contract'ı bekliyor. `VillaFormData` strict subtype'ı geçer
     ama setter contravariant pozisyon → variance fail. Tek noktada
     cast; runtime'da aynı fonksiyon referansı; davranış byte-identical. */
  const setFormLoose = setForm as unknown as VillaFormSetter;

  const handleCreate = async () => {
    if (loading) return;
    setLoading(true);

    /* 🛡️ FAZ 2 — validation helper'dan; mesaj birebir aynen. */
    const guard = validateVillaCreate({ form, selectedLocation });
    if (!guard.ok) {
      toast.error(guard.message, { id: "villa-create" });
      setLoading(false);
      return;
    }

    try {
      /* 🛡️ FAZ 4 — ORCHESTRATION SIRASI BYTE-IDENTICAL:
         1. payload build (sync helper)
         2. AWAITED createVillaFull
         3. toast.success
         4. FIRE-FORGET logActivity (.catch(()=>{}))
         5. router.push("/maki-admin/villas/{newId}/galeri")
         Catch + finally pattern aynen. */
      /* 🛡️ FAZ 2 — adminFetch POST /api/admin/villas.
         Route içinde aynı `createVillaFull(payload)` service çağrısı;
         orchestration BYTE-IDENTICAL. Service return string newId; route
         `{ ok, id }` JSON. Service throw → route 400 + msg → caller catch. */
      let newId: string;
      {
        const apiRes = await adminFetch("/api/admin/villas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildVillaCreatePayload({
              form,
              selectedLocation,
              selectedTypes,
              selectedFeatures,
              mapData,
              distances,
              prices,
              selectedRules,
              selectedPriceIncludes,
              youtubeVideos,
              bedroomLayout,
              bathroomLayout,
            })
          ),
        });
        const apiJson = (await apiRes.json().catch(() => ({}))) as {
          ok?: boolean;
          id?: string;
          error?: string;
        };
        if (!apiRes.ok || !apiJson.ok || !apiJson.id) {
          throw new Error(
            apiJson.error || `HTTP ${apiRes.status}`
          );
        }
        newId = apiJson.id;
      }
      toast.success("Mülk eklendi", { id: "villa-create" });
      /* 🛡️ FAZ 55J-1 — AUDIT LOG (fail-safe).
         after_data shape `_helpers/audit > buildVillaCreateAuditAfter`
         tarafında; count-summary pattern BYTE-IDENTICAL. */
      logActivity({
        action: "villa.created",
        entity_type: "villa",
        entity_id: newId,
        entity_title: form.title,
        after_data: buildVillaCreateAuditAfter({
          newId,
          form,
          selectedLocation,
          selectedTypes,
          selectedFeatures,
          selectedRules,
          selectedPriceIncludes,
          distances,
          prices,
        }),
      }).catch(() => {});
      router.push(`/maki-admin/villas/${newId}/galeri`);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Bir hata oluştu";
      toast.error("Mülk eklenemedi", {
        id: "villa-create",
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 w-full">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Mülk</p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
            Yeni mülk ekle
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Mülke ait tüm detayları ekle, görselleri sonraki adımda
            yükleyebilirsin.
          </p>
        </div>
      </div>

      {/* WIZARD STEP BAR — create page'de yalnızca tamamlanmış step'lere
          atlama serbest (allowFreeNav=false). */}
      <WizardStepBar
        steps={STEPS}
        currentStep={currentStep}
        onStepClick={setCurrentStep}
        allowFreeNav={false}
      />

      <div className="space-y-6">
        {/* STEP 1 — Detaylar / Açıklama / Badge / YouTube Videoları */}
        {currentStep === 1 && (
          <>
            <BasicInfoStep
              form={form}
              setForm={setFormLoose}
              slug={slug}
              setSlug={setSlug}
              slugify={slugifyTr}
              locations={locations}
              selectedLocation={selectedLocation}
              setSelectedLocation={setSelectedLocation}
            />
            {/* YouTube Videoları — temel medya bilgisi olarak Adım 1 içinde.
                STEPS array'i etkilenmez (6 adım korunur); UX değişimi
                yalnız Adım 1'in altına bir section eklenmesidir. */}
            <VideoStep
              videos={youtubeVideos}
              setVideos={setYoutubeVideos}
            />
            {/* 🛡️ Konaklama Düzeni (mig 047) — Adım 1 medya/detay grubu.
                STEPS array değişmez; Adım 1 altına eklenir. */}
            <AccommodationLayoutStep
              bedrooms={bedroomLayout}
              setBedrooms={setBedroomLayout}
              bathrooms={bathroomLayout}
              setBathrooms={setBathroomLayout}
            />
          </>
        )}

        {/* STEP 2 — Havuz / Tipler / Özellikler */}
        {currentStep === 2 && (
          <AmenitiesStep
            form={form}
            setForm={setFormLoose}
            types={types}
            selectedTypes={selectedTypes}
            setSelectedTypes={setSelectedTypes}
            features={features}
            selectedFeatures={selectedFeatures}
            setSelectedFeatures={setSelectedFeatures}
          />
        )}

        {/* STEP 3 — Mesafeler / Konum */}
        {currentStep === 3 && (
          <LocationStep
            distances={distances}
            setDistances={setDistances}
            mapData={mapData}
            setMapData={setMapData}
            mapPickerSlot={
              <MapPicker
                value={{
                  latitude: mapData.latitude,
                  longitude: mapData.longitude,
                }}
                onChange={(val) =>
                  setMapData({
                    ...mapData,
                    latitude: val.latitude,
                    longitude: val.longitude,
                  })
                }
              />
            }
          />
        )}

        {/* STEP 4 — Pricing canvas (controlled mode, villaId YOK)
            + Ekstra ücretler. Edit page ile parity için
            showCleaningCurrency varsayılanı (true) kullanılıyor:
            Temizlik ücreti yanında TRY/USD/EUR/GBP currency
            dropdown'u görünür. createVillaFull payload'ı
            cleaning_currency'i form state'ten okur (default TRY). */}
        {currentStep === 4 && (
          <PricingStep
            pricingCanvasSlot={
              <PricingCalendarCanvas
                visibleMonths={5}
                initialPrices={prices}
                onPricesChanged={(updated) => {
                  setPrices(
                    updated.map((p) => ({
                      start_date: p.start_date,
                      end_date: p.end_date,
                      price: p.price,
                      currency: p.currency || "TRY",
                    }))
                  );
                }}
              />
            }
            form={form}
            setForm={setFormLoose}
          />
        )}

        {/* STEP 5 — Kurallar / Fiyata Dahil Olanlar */}
        {currentStep === 5 && (
          <RulesAndIncludesStep
            ruleItems={ruleItems}
            selectedRules={selectedRules}
            setSelectedRules={setSelectedRules}
            priceIncludeItems={priceIncludeItems}
            selectedPriceIncludes={selectedPriceIncludes}
            setSelectedPriceIncludes={setSelectedPriceIncludes}
          />
        )}

        {/* STEP 6 — SEO */}
        {currentStep === 6 && (
          <SeoStep
            seoTitle={form.seo_title || ""}
            seoDescription={form.seo_description || ""}
            noindex={!!form.noindex}
            fallbackTitle={form.title}
            fallbackDescription={form.description}
            onChangeTitle={(v) => setForm({ ...form, seo_title: v })}
            onChangeDescription={(v) =>
              setForm({ ...form, seo_description: v })
            }
            onToggleNoindex={() =>
              setForm({ ...form, noindex: !form.noindex })
            }
            slug={slugifyTr(form.title)}
          />
        )}
      </div>

      {/* STICKY WIZARD NAV — create page modu:
          submitOnlyOnLastStep + disableNavWhileLoading. */}
      <StickyActionBar
        steps={STEPS}
        currentStep={currentStep}
        onBack={goBack}
        onNext={goNext}
        onSubmit={handleCreate}
        loading={loading}
        submitLabel="Mülk Ekle"
        submitOnlyOnLastStep
        disableNavWhileLoading
      />
    </div>
  );
}

