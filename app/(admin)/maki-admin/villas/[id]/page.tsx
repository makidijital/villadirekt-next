"use client";

/* 🛡️ Tüm okumalar server action üzerinden (6 repository + 2 service +
   @/lib/db client bundle'a girmez); orchestration-only, mantık aynen. */
import { loadVillaEditData } from "./villa-edit.action";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

/* 🛡️ FAZ 2 frontend purge — direct service import KALDIRILDI.
   Eskiden:
     import { updateVillaFull } from "@/app/services/villa-admin.service";
   villa-admin.service barrel hard-delete.service + private-token.service
   re-export ediyor; her ikisi `admin-gateway/server` (server-only) zinciri
   pulluyordu → client bundle'a server-only leak (BUILD HATA). Şimdi:
     PUT /api/admin/villas/[id]/full → updateVillaFull service delege.
   Davranış BYTE-IDENTICAL: service orchestration sırası, validation,
   relation/distance/price/rule/price-include RPC çağrıları AYNEN. */
import { adminFetch } from "@/lib/admin-fetch";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { logActivity } from "@/lib/activity-log.client";
import { slugifyTr } from "@/lib/slug";

import dynamic from "next/dynamic";

const MapPicker = dynamic(
  () => import("../../components/MapPicker"),
  { ssr: false }
);

import { Image as ImageIcon } from "lucide-react";

import PricingCalendarCanvas from "@/app/components/admin/villa/PricingCalendarCanvas";

/* 🔥 Villa form wizard step components — pure presentational.
   Tüm state/effects/handlers page.tsx (orchestrator) içinde kalır;
   componentler yalnızca props alır ve UI render eder. Davranış
   birebir korunur — UI birebir aynı. */
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
import { type VillaYouTubeVideo } from "@/lib/youtube.helper";
import type {
  BedroomLayoutItem,
  BathroomLayoutItem,
} from "@/lib/villa-layout.helper";
import IcalSyncCard from "./_components/IcalSyncCard";
import VillaTranslationsCard from "./_components/VillaTranslationsCard";

/* 🛡️ FAZ 1+2 — typed villa form pipeline + helper-driven payload/audit. */
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

import { buildVillaUpdatePayload } from "../_helpers/payload";
import {
  buildVillaUpdateAuditBefore,
  buildVillaUpdateAuditAfter,
} from "../_helpers/audit";
import {
  hydrateVillaMapDataFromRow,
  hydrateVillaSlugFromRow,
  hydrateVillaLocationIdFromRow,
  hydrateVillaYouTubeVideosFromRow,
  hydrateVillaBedroomLayoutFromRow,
  hydrateVillaBathroomLayoutFromRow,
} from "../_helpers/hydrate";
import { validateVillaUpdate } from "../_helpers/validation";

export default function EditVilla() {
  const toast = useNotify();
  const params = useParams();
  const id = params?.id as string;

  /* 🛡️ FAZ 1 — typed state shape (initial factory + VillaFormData).
     Eski `useState<any>` ile birebir aynı initial object; "edit" mode
     factory commission_rate KEY EKLEMEZ (DB spread DB değerini getirir).
     Initial value'lar tek source-of-truth:
     `_types/villa-form-data > initialVillaFormData("edit")`. */
  const [form, setForm] = useState<VillaFormData>(() =>
    initialVillaFormData("edit")
  );

  const [types, setTypes] = useState<VillaTypeRowLite[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [features, setFeatures] = useState<VillaFeatureRowLite[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [locations, setLocations] = useState<VillaLocationRowLite[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [slug, setSlug] = useState("");

  const [distances, setDistances] = useState<
    { title: string; distance: string }[]
  >([]);

  const [prices, setPrices] = useState<VillaPriceRowState[]>([]);

  /* 🛡️ YouTube videos — edit page'de DB'den hidrate edilir.
     normalizeYouTubeVideos villa.youtube_videos JSONB'sini (null/array)
     güvenli VillaYouTubeVideo[]'a indirger; geçersiz item drop. */
  const [youtubeVideos, setYoutubeVideos] = useState<VillaYouTubeVideo[]>([]);

  /* 🛡️ Konaklama Düzeni (mig 047) — DB'den hidrate edilir. */
  const [bedroomLayout, setBedroomLayout] = useState<BedroomLayoutItem[]>([]);
  const [bathroomLayout, setBathroomLayout] = useState<BathroomLayoutItem[]>(
    []
  );

  /* ---------------------------------------------
     🔥 RULES + PRICE INCLUDES — master/relation
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
     Yalnız görsel akış. Tüm mevcut state, save/update,
     upload, slug, pricing, SEO logic'i AYNEN korundu.
     Edit page: serbest navigation + save her adımda erişilebilir.
  ---------------------------------------------- */
  const STEPS: { id: number; label: string }[] = [
    { id: 1, label: "Temel Bilgiler" },
    { id: 2, label: "Olanaklar" },
    { id: 3, label: "Konum & Mesafe" },
    { id: 4, label: "Fiyatlandırma" },
    { id: 5, label: "Kurallar & Dahil" },
    { id: 6, label: "SEO" },
    { id: 7, label: "iCal" },
    { id: 8, label: "Çeviriler" },
  ];
  const TOTAL_STEPS = STEPS.length;
  const [currentStep, setCurrentStep] = useState<number>(1);
  const goNext = () =>
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () =>
    setCurrentStep((s) => Math.max(s - 1, 1));

  /* 🛡️ SLUG SOURCE-OF-TRUTH — lib/slug > slugifyTr.
     Önceki inline `slugify` kaldırıldı. slugifyTr daha geniş TR
     karakter map'i (büyük harfler dahil) + NFKD diakritik strip +
     trim. Migration backfill ile birebir aynı semantic. */

  /* 🛡️ TÜM OKUMALAR TEK SERVER ACTION ile (orchestration-only). Hidrate/
     filter/map mantığı BYTE-IDENTICAL; yalnız veri kaynağı server action.
     `id` route param sabit → önceki `[]`/`[id]` effect'leri tek [id]
     altında birleşti (davranış aynı). */
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const d = await loadVillaEditData(id);

      const data = d.villa;
      if (data) {
        setForm((prev) => ({ ...prev, ...(data as Partial<VillaFormData>) }));
        setSelectedLocation(
          hydrateVillaLocationIdFromRow(data as Record<string, unknown>)
        );
        setSlug(hydrateVillaSlugFromRow(data as Record<string, unknown>));
        setMapData(hydrateVillaMapDataFromRow(data as Record<string, unknown>));
        setYoutubeVideos(
          hydrateVillaYouTubeVideosFromRow(data as Record<string, unknown>)
        );
        setBedroomLayout(
          hydrateVillaBedroomLayoutFromRow(data as Record<string, unknown>)
        );
        setBathroomLayout(
          hydrateVillaBathroomLayoutFromRow(data as Record<string, unknown>)
        );
      }

      /* 🛡️ Migration 050 — grup köklerini gizle (AYNEN). */
      setLocations(
        (d.locations || []).filter(
          (l: { name?: string; filter_group_name?: string | null }) => {
            const g = (l.filter_group_name ?? "").toString().trim();
            return !(g.length > 0 && l.name === g);
          }
        )
      );

      setTypes(d.types || []);
      setSelectedTypes(d.selectedTypes?.map((x) => x.type_id) || []);

      setFeatures(d.features || []);
      setSelectedFeatures(d.selectedFeatures?.map((x) => x.feature_id) || []);

      setDistances(d.distances);
      setPrices(d.prices);

      setRuleItems(d.ruleItems || []);
      setSelectedRules((d.selectedRules || []).map((x: any) => x.rule_id));

      setPriceIncludeItems(d.priceIncludeItems || []);
      setSelectedPriceIncludes(
        (d.selectedIncludes || []).map((x: any) => x.include_id)
      );
    };
    load();
  }, [id]);

  /* 🛡️ FAZ 4 — Wizard step component'leri `VillaFormShape` loose
     contract'ı bekliyor. setForm child JSX'ine geçerken cast (variance;
     contravariant pozisyon). Tek noktada cast; runtime pointer-identical. */
  const setFormLoose = setForm as unknown as VillaFormSetter;

  const handleUpdate = async () => {
    if (loading) return;

    /* 🛡️ FAZ 2 — validation helper'dan; mesaj birebir aynen. */
    const guard = validateVillaUpdate({ form });
    if (!guard.ok) {
      toast.error(guard.message, { id: "villa-update" });
      return;
    }

    setLoading(true);

    /* 🛡️ FAZ 55J-1 — BEFORE snapshot (audit için).
       FAZ 2 helper-driven; 21-alan count-summary BYTE-IDENTICAL.
       Local state'in dump'ı; updateVillaFull henüz çalışmadı → bu
       state DB'deki "şu anki" değerlerin son aşaması (kullanıcı
       son düzenleme öncesi hydrate edilmişti — relation diff'ler
       count-bazlı). */
    const beforeSnapshot = buildVillaUpdateAuditBefore({
      id,
      form,
      slug,
      selectedLocation,
      selectedTypes,
      selectedFeatures,
      selectedRules,
      selectedPriceIncludes,
      distances,
      prices,
    });

    try {
      /* 🛡️ FAZ 4 — ORCHESTRATION SIRASI BYTE-IDENTICAL:
         1. payload build (sync helper)
         2. AWAITED updateVillaFull
         3. toast.success
         4. FIRE-FORGET logActivity (.catch(()=>{}))
         Catch + finally pattern aynen. */
      /* 🛡️ FAZ 2 — adminFetch PUT /api/admin/villas/[id]/full.
         Route içinde aynı `updateVillaFull` service çağrısı; orchestration
         BYTE-IDENTICAL. Service throw → route 400 + msg → caller catch
         tetiklenir (eski semantic). Payload `id` path param olarak gider;
         body kalan field'lar. */
      {
        const fullPayload = buildVillaUpdatePayload({
          id,
          form,
          slug,
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
        });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _omit, ...bodyPayload } = fullPayload;
        const apiRes = await adminFetch(
          `/api/admin/villas/${encodeURIComponent(id)}/full`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
          }
        );
        const apiJson = (await apiRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!apiRes.ok || !apiJson.ok) {
          throw new Error(
            apiJson.error || `HTTP ${apiRes.status}`
          );
        }
      }
      toast.success("Mülk güncellendi", { id: "villa-update" });
      /* 🛡️ FAZ 55J-1 — AUDIT LOG (fail-safe).
         after_data shape `_helpers/audit > buildVillaUpdateAuditAfter`;
         count-summary pattern before ile birebir aynı. */
      logActivity({
        action: "villa.updated",
        entity_type: "villa",
        entity_id: id,
        entity_title: form.title,
        before_data: beforeSnapshot,
        after_data: buildVillaUpdateAuditAfter({
          id,
          form,
          slug,
          selectedLocation,
          selectedTypes,
          selectedFeatures,
          selectedRules,
          selectedPriceIncludes,
          distances,
          prices,
        }),
      }).catch(() => {});
    } catch (err: unknown) {
      console.error("Update error:", err);
      const msg = err instanceof Error ? err.message : "Bir hata oluştu";
      toast.error("Mülk güncellenemedi", {
        id: "villa-update",
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!id)
    return (
      <div className="card-premium p-10 text-center text-[var(--color-stone-500)]">
        Yükleniyor…
      </div>
    );

  return (
    <div className="space-y-8 w-full">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Mülk</p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em] truncate">
            {form.title || "Mülk Düzenle"}
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Detayları güncelle, sezonları yönet ya da galeriye geç.
          </p>
        </div>
        <Link
          href={`/maki-admin/villas/${id}/galeri`}
          className="btn-ghost self-start"
        >
          <ImageIcon size={15} />
          Galeri
        </Link>
      </div>

      {/* WIZARD STEP BAR — edit page'de serbest navigation */}
      <WizardStepBar
        steps={STEPS}
        currentStep={currentStep}
        onStepClick={setCurrentStep}
        allowFreeNav
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
            {/* YouTube Videoları — temel medya bilgisi olarak Adım 1
                içinde (STEPS değişmez; UX edit page'inde de aynı). */}
            <VideoStep
              videos={youtubeVideos}
              setVideos={setYoutubeVideos}
            />
            {/* 🛡️ Konaklama Düzeni (mig 047). */}
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

        {/* STEP 4 — Pricing canvas + Ekstra ücretler.
            Canvas onPricesChanged ile parent state senkron kalır;
            handleUpdate payload contract aynı. */}
        {currentStep === 4 && (
          <PricingStep
            pricingCanvasSlot={
              <PricingCalendarCanvas
                visibleMonths={5}
                villaId={id}
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
            villaId={id}
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

        {/* 🔥 SEO & SOSYAL PAYLAŞIM */}
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
          slug={slug || slugifyTr(form.title)}
        />
        )}
      </div>

      {/* 🛡️ FAZ 56E — Takvim Senkronizasyonları kartı.
          🛡️ DÜZELTME turu — artık yalnız "iCal" sekmesinde
          (currentStep === 7) görünür; önceden wizard step'lerinden
          bağımsız, her adımda mount ediliyordu. IcalSyncCard'ın kendisi,
          prop'ları (villaId/villaSlug/villaTitle), external_calendar_sources
          okuma/yazma + sync endpoint çağrıları, state/handler mantığı
          BİREBİR AYNI — yalnız hangi sekmede render edildiği değişti.
          BookingSidebar / availability / reservation pipeline'a dokunulmadı. */}
      {id && currentStep === 7 && (
        <IcalSyncCard
          villaId={id as string}
          villaSlug={slug || slugifyTr(form.title)}
          villaTitle={form.title}
        />
      )}

      {/* 🛡️ PHASE 10A — Admin Villa Translation UI.
          IcalSyncCard ile AYNI prensip: yalnız "Çeviriler" sekmesinde
          (currentStep === 8) mount edilir; kendi state/save mekanizması
          var, handleUpdate/buildVillaUpdatePayload/audit zincirine
          KARIŞMAZ. Steps 1-7 ve handleUpdate DEĞİŞMEDİ. */}
      {id && currentStep === 8 && (
        <VillaTranslationsCard
          villaId={id as string}
          villaTitle={form.title}
        />
      )}

      {/* STICKY WIZARD NAV — Geri / İleri / Galeri / Güncelle
          handleUpdate her adımda erişilebilir. */}
      <StickyActionBar
        steps={STEPS}
        currentStep={currentStep}
        onBack={goBack}
        onNext={goNext}
        onSubmit={handleUpdate}
        loading={loading}
        submitLabel="Güncelle"
        galeriHref={`/maki-admin/villas/${id}/galeri`}
      />
    </div>
  );
}

