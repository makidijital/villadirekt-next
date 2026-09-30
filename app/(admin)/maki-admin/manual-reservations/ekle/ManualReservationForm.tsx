"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createManualReservationAction as createManualReservation,
  updateManualReservationAction as updateManualReservation,
  deleteManualReservationAction as deleteManualReservation,
  getVillaAvailabilitySnapshotAction as getVillaAvailabilitySnapshot,
} from "@/app/(admin)/maki-admin/manual-reservations/manual-reservation.action";
import { Save, Home as HomeIcon } from "lucide-react";
import { formatDateTr, parseLocalDate } from "@/lib/date-format";
import ReservationCalendar from "@/app/components/admin/reservation-form/ReservationCalendar";
import { fetchExternalCalendarArraysForVillaAdminAction as fetchExternalCalendarArraysForVillaAdmin } from "@/lib/external-calendar.admin.action";
import {
  EMPTY_EXTERNAL_ADMIN_ARRAYS,
  type ExternalCalendarAdminArrays,
} from "@/lib/external-calendar.admin.types";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import { logActivity } from "@/lib/activity-log.client";
import VillaCombobox from "./VillaCombobox";
import ActiveBlocksPanel from "./ActiveBlocksPanel";
import {
  buildActiveBlocks,
  deriveIcalRanges,
} from "@/lib/active-blocks.helper";

/* ===============================================================
   🛡️ FAZ 29 — EDIT MODE SUPPORT
   ===============================================================
   Tek form, iki mod:
     mode="create" (default) → createManualReservation (eski)
     mode="edit"             → updateManualReservation + initial hidrate

   Edit mode'da:
     - initialData ile selectedVilla/start/end/note state lazy hidrate
     - fetchBlockedDates self-exclude: kendi reservation'ının
       tarih aralığı `blockedDates` array'inde GÖRÜNMEZ (kullanıcı
       seçili tarih aralığını korur, blocked sayılmaz)
     - Submit success → toast + router.replace(/manual-reservations)

   Reservation engine semantik'i AYNEN korundu; sadece edit yolu
   eklendi. ReservationCalendar component'i değişmedi.
   =============================================================== */
type InitialData = {
  id: string;
  villa_id: string;
  start_date: string;
  end_date: string;
  note: string | null;
} | null;

/* ===============================================================
   🔥 MANUAL RESERVATION FORM — uses shared ReservationCalendar
   ===============================================================
   ⚠️ react-day-picker bu form için zaten önceki refactor'da
   tamamen kaldırılmıştı. Bu sürümde inline custom calendar
   shared `ReservationCalendar` component'ine extract edildi.
   Reservation engine semantiği BİREBİR korundu:

     - fetchBlockedDates → eski sağlayıcı queries + day-walk loop
     - confirmed/pending half-day classification
     - manual single-day fallback (isFirstDay && isLastDay → blocked)
     - getValidEndDate(start, end, blockedDates)
     - getDayStyle (red/yellow/transparent half-day gradient)
     - createManualReservation payload (sv-SE → YYYY-MM-DD)
     - freshSelection / calendarKey reset on submit success
     - DB EXCLUDE constraint half-open `[)` semantic
   =============================================================== */

export default function ManualReservationForm({
  villas,
  mode = "create",
  initialData = null,
  initialVillaId,
}: {
  villas:
    | { id: string; title: string; slug?: string | null }[]
    | null;
  /* 🛡️ FAZ 29 — mode: create (default, backward-compat) | edit */
  mode?: "create" | "edit";
  /* 🛡️ FAZ 29 — edit mode için DB'den fetch'lenmiş initial data.
     null → create flow (eski davranış aynen). */
  initialData?: InitialData;
  /* 🛡️ Quick-action — villa listesinden "Takvim" butonuyla gelen
     query param. Yalnız create mode'da etkili; edit mode'da
     initialData.villa_id öncelikli. Undefined → eski davranış aynen
     (boş seçim). Pre-select sonrası `useEffect[selectedVilla]`
     mount'ta fetchBlockedDates + external fetch tetiklenir;
     takvim direkt o villanın müsaitlik durumuyla açılır. */
  initialVillaId?: string;
}) {
  const toast = useNotify();
  const confirm = useConfirm();
  const router = useRouter();

  /* 🛡️ FAZ 29 — Lazy initial state hidrate (mount-once).
     Precedence:
       1. initialData?.villa_id  (edit mode — DB'den hidrate)
       2. initialVillaId         (quick-action query param)
       3. ""                     (boş — eski create default)
     initialData null + initialVillaId undefined → byte-identical
     eski davranış. */
  const [selectedVilla, setSelectedVilla] = useState(
    initialData?.villa_id ?? initialVillaId ?? ""
  );
  const [note, setNote] = useState(initialData?.note ?? "");
  /* 📱 CREATE modal not textarea'sı — mobilde native keyboard'ı tarih commit'i
     anında AÇMAMAK için `autoFocus` kaldırıldı; odak yalnız DESKTOP'ta (fine
     pointer + hover) ref ile verilir → desktop davranışı birebir korunur,
     mobil sessiz kalır (kullanıcı nota dokununca klavye normal açılır). */
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const [loading, setLoading] = useState(false);

  const [startDate, setStartDate] = useState<Date | null>(() =>
    initialData?.start_date ? parseLocalDate(initialData.start_date) : null
  );
  const [endDate, setEndDate] = useState<Date | null>(() =>
    initialData?.end_date ? parseLocalDate(initialData.end_date) : null
  );

  const [currentMonth, setCurrentMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });

  const [blockedDates, setBlockedDates] = useState<Date[]>([]);
  const [checkinDates, setCheckinDates] = useState<Date[]>([]);
  const [checkoutDates, setCheckoutDates] = useState<Date[]>([]);

  const [pendingCheckinDates, setPendingCheckinDates] = useState<Date[]>([]);
  const [pendingCheckoutDates, setPendingCheckoutDates] = useState<Date[]>([]);
  const [pendingMiddleDates, setPendingMiddleDates] = useState<Date[]>([]);

  const [freshSelection, setFreshSelection] = useState(false);
  const [calendarKey, setCalendarKey] = useState(0);

  /* 🛡️ MODAL — create mode'da tarih seçimi tamamlandıktan sonra
     not + kayıt için otomatik açılan dialog. Edit mode'da modal
     açılmaz; eski Note Card + Save Button JSX'i altında render
     edilir. Eski create akışı tek noktada modal'a taşındı; tüm
     state/handler/servis aynen kullanılır (handleSubmit reuse). */
  const [modalOpen, setModalOpen] = useState(false);

  /* 🛡️ Aktif manuel bloklar (sil ikonu UI'sı için).
     `fetchBlockedDates` snapshot'ından `manualBlocks` array'inin
     id + tarih projeksiyonu — UI yalnız id/tarihleri tükettiği
     için minimum shape. Edit mode'da kendi reservation'ı UI'da
     gösterilse de "Sil" tıklanırsa editlenen kaydı siler →
     edit mode'da self-exclude uygulanır (UI tarafında). */
  const [manualBlocksList, setManualBlocksList] = useState<
    { id: string; start_date: string; end_date: string; note: string | null }[]
  >([]);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);

  /* ---------------------------------------------
     🔥 BLOCKED DATES FETCH — birebir korundu (FAZ 34 service delege)
     ---------------------------------------------
     FAZ 34: iki inline eski sağlayıcı çağrısı service'in
     `getVillaAvailabilitySnapshot(villaId)` export'una taşındı.
     Service repo'ya delege ediyor; status allow-list
     `["pending","confirmed"]` + manual blokların tamamı
     (asimetri) + cross-table queries BYTE-IDENTICAL korundu.

     ⚠️ Component-side parse loop (checkin/checkout/blocked Date[]
        arrays + isFirstDay/isLastDay/pending classification +
        editingId self-exclude) AYNEN — kasıtlı (calendar
        rendering UI mantığı service boundary dışında).
  ---------------------------------------------- */
  const fetchBlockedDates = async () => {
    if (!selectedVilla) {
      /* 🛡️ Villa seçimi kaldırıldıysa manuel blok chip strip listesi
         de temizlenir (eski villanın blokları stale kalmasın).
         Mevcut blocked/checkin/checkout state'lerine dokunulmadı
         (eski davranış aynen). */
      setManualBlocksList([]);
      return;
    }

    const { reservations, manualBlocks: manual } =
      await getVillaAvailabilitySnapshot(selectedVilla);

    const editingId =
      mode === "edit" && initialData?.id ? initialData.id : null;

    let blocked: Date[] = [];
    let checkin: Date[] = [];
    let checkout: Date[] = [];
    let pCI: Date[] = [];
    let pCO: Date[] = [];
    let pM: Date[] = [];

    reservations?.forEach((r: any) => {
      let current = parseLocalDate(r.start_date);
      const end = parseLocalDate(r.end_date);
      while (current <= end) {
        const d = new Date(current);
        const startDate = parseLocalDate(r.start_date);
        const endDate = parseLocalDate(r.end_date);
        const isFirstDay =
          current.toDateString() === startDate.toDateString();
        const isLastDay =
          current.toDateString() === endDate.toDateString();
        if (r.status === "confirmed") {
          if (isFirstDay) checkin.push(d);
          else if (isLastDay) checkout.push(d);
          else blocked.push(d);
        }
        if (r.status === "pending") {
          if (isFirstDay) pCI.push(d);
          else if (isLastDay) pCO.push(d);
          else pM.push(d);
        }
        current.setDate(current.getDate() + 1);
      }
    });

    manual?.forEach((r: any) => {
      /* 🛡️ FAZ 29 — Edit mode'da kendini block sayma: kullanıcı
         seçili tarih aralığını "blocked" görmesin, end-clamp
         kendi tarihlerine uygulanmasın. */
      if (editingId && r.id === editingId) return;
      let current = parseLocalDate(r.start_date);
      const end = parseLocalDate(r.end_date);
      while (current <= end) {
        const d = new Date(current);
        const startDate = parseLocalDate(r.start_date);
        const endDate = parseLocalDate(r.end_date);
        const isFirstDay =
          current.toDateString() === startDate.toDateString();
        const isLastDay =
          current.toDateString() === endDate.toDateString();
        if (isFirstDay && isLastDay) blocked.push(d);
        else if (isFirstDay) checkin.push(d);
        else if (isLastDay) checkout.push(d);
        else blocked.push(d);
        current.setDate(current.getDate() + 1);
      }
    });

    const unique = (arr: Date[]) =>
      Array.from(new Map(arr.map((d) => [d.toDateString(), d])).values());

    setBlockedDates(unique(blocked));
    setCheckinDates(unique(checkin));
    setCheckoutDates(unique(checkout));
    setPendingCheckinDates(unique(pCI));
    setPendingCheckoutDates(unique(pCO));
    setPendingMiddleDates(unique(pM));

    /* 🛡️ Manuel blok chip strip listesi — yalnız UI tarafı.
       Sadece manuel kayıtlar (gerçek rezervasyon/iCal DAHİL DEĞİL).
       Edit mode'da kendi düzenlenen kaydı listeden hariç tut
       (kullanıcı kendi tarih aralığını silmemeli) — yukarıda zaten
       tanımlı `editingId` reuse. Parse loop'una dokunulmadı — bu
       blok additive. */
    const blocks = (manual || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => !editingId || r.id !== editingId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({
        id: String(r.id),
        start_date: String(r.start_date),
        end_date: String(r.end_date),
        note: r.note ?? null,
      }))
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
    setManualBlocksList(blocks);
  };

  useEffect(() => {
    fetchBlockedDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVilla]);

  /* 🛡️ ESC ile modal kapatma — sadece modal açıkken listener register
     edilir (overhead sıfır). Loading sırasında ESC'i yutar (submit
     iptal edilmesin). Cleanup unmount + modalOpen değişimi. */
  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) {
        setModalOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen, loading]);

  /* 📱 CREATE modal açıldığında not textarea'sına odak — YALNIZ desktop.
     Eski `autoFocus` her cihazda odaklıyordu → mobilde tarih commit'i
     sonrası modal açılınca native keyboard fırlıyordu. Fine pointer + hover
     (mouse'lu masaüstü) dışında odak verilmez → mobil sessiz; kullanıcı
     nota dokununca klavye normal açılır (editable davranış korunur). */
  useEffect(() => {
    if (mode !== "create" || !modalOpen) return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const isDesktop =
      window.matchMedia("(pointer: fine)").matches &&
      window.matchMedia("(hover: hover)").matches;
    if (!isDesktop) return;
    noteRef.current?.focus();
  }, [mode, modalOpen]);

  /* 🛡️ FAZ 56H-D — External iCal blocks (admin authenticated). */
  const [externalCal, setExternalCal] = useState<ExternalCalendarAdminArrays>(
    EMPTY_EXTERNAL_ADMIN_ARRAYS
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedVilla) {
        if (!cancelled) setExternalCal(EMPTY_EXTERNAL_ADMIN_ARRAYS);
        return;
      }
      const next = await fetchExternalCalendarArraysForVillaAdmin(
        selectedVilla
      );
      if (!cancelled) setExternalCal(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedVilla]);

  /* 🎯 AKTİF BLOKLAR — manuel + iCal birleşik liste (saf UI türetme).
     Veri zaten state'te: `manualBlocksList` (snapshot) + `externalCal`
     (iCal detailByDate). buildActiveBlocks örtüşen aralıkları "Her ikisi"
     işaretler, duplicate'i eler. Yeni fetch / iş mantığı YOK. */
  const activeBlocks = useMemo(
    () =>
      buildActiveBlocks(
        manualBlocksList,
        deriveIcalRanges(externalCal.detailByDate)
      ),
    [manualBlocksList, externalCal]
  );

  /* ---------------------------------------------
     🔥 getValidEndDate — birebir korundu (inline kasıtlı,
     "behavior frozen" — shared lib'e geçirilmedi).
  ---------------------------------------------- */
  const getValidEndDate = (
    start: Date,
    end: Date,
    blockedDates: Date[]
  ) => {
    let current = new Date(start);
    while (current <= end) {
      const isBlocked = blockedDates.some(
        (d) => d.toDateString() === current.toDateString()
      );
      if (isBlocked) {
        const prev = new Date(current);
        prev.setDate(prev.getDate() - 1);
        return prev;
      }
      current.setDate(current.getDate() + 1);
    }
    return end;
  };

  /* 🛡️ HANDLE DELETE BLOCK — chip strip ✕ tıklaması.
     Akış: useConfirm onay → deleteManualReservation servisi (mevcut,
     ManualReservationList ile aynı) → optimistic chip strip filter +
     fetchBlockedDates() ile takvim renkleri reconcile + toast +
     audit log (`manual_reservation.deleted` — list ile parity).

     GÜVENLİK: chip strip yalnız `manualBlocks` snapshot'undan render
     edilir — gerçek rezervasyonlar / iCal blokları UI'da fiziksel
     olarak BULUNMAZ → yanlışlıkla silmeye imkan yok. */
  const handleDeleteBlock = async (block: {
    id: string;
    start_date: string;
    end_date: string;
    note: string | null;
  }) => {
    if (deletingBlockId) return;

    const ok = await confirm({
      title: "Bu blok silinsin mi?",
      description:
        `Seçili manuel blok (${block.start_date} → ${block.end_date}) ` +
        "kaldırılır. Gerçek rezervasyonlar etkilenmez. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!ok) return;

    setDeletingBlockId(block.id);
    try {
      await deleteManualReservation(block.id);
      /* Optimistic chip strip update — kullanıcı anında düştüğünü görür. */
      setManualBlocksList((prev) => prev.filter((b) => b.id !== block.id));
      /* Takvim renkleri (blocked/checkin/checkout array'leri) reconcile —
         silinen blok artık availability'i kapatmaz. */
      await fetchBlockedDates();
      toast.success("Blok silindi", { id: `manual-blok-del-${block.id}` });
      /* AUDIT LOG (fail-safe). ManualReservationList paterni ile parity. */
      logActivity({
        action: "manual_reservation.deleted",
        entity_type: "manual_reservation",
        entity_id: block.id,
        entity_title: `${block.start_date} → ${block.end_date}`,
        before_data: {
          id: block.id,
          villa_id: selectedVilla,
          start_date: block.start_date,
          end_date: block.end_date,
          note: block.note,
        },
      }).catch(() => {});
    } catch (err) {
      console.error("[manual-block.delete] FAILED", err);
      toast.error("Silinemedi", {
        id: `manual-blok-del-${block.id}`,
        description:
          err instanceof Error ? err.message : "Beklenmeyen hata",
      });
    } finally {
      setDeletingBlockId(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedVilla || !startDate || !endDate) {
      toast.error("Eksik bilgi", {
        id: "manual-blok",
        description: "Mülk ve tarih aralığı seçin.",
      });
      return;
    }
    setLoading(true);
    const payload = {
      villa_id: selectedVilla,
      start_date: startDate.toLocaleDateString("sv-SE"),
      end_date: endDate.toLocaleDateString("sv-SE"),
      note,
    };
    try {
      /* 🛡️ FAZ 29 — mode branch */
      if (mode === "edit" && initialData?.id) {
        /* 🛡️ FAZ 55J-3 — BEFORE snapshot from initialData (DB load). */
        const before = {
          id: initialData.id,
          villa_id: initialData.villa_id,
          start_date: initialData.start_date,
          end_date: initialData.end_date,
          note: initialData.note,
        };
        await updateManualReservation(initialData.id, payload);
        toast.success("Blok güncellendi", { id: "manual-blok" });
        /* AUDIT LOG (fail-safe). */
        logActivity({
          action: "manual_reservation.updated",
          entity_type: "manual_reservation",
          entity_id: initialData.id,
          entity_title: payload.villa_id
            ? `${payload.start_date} → ${payload.end_date}`
            : "Manuel blok",
          before_data: before,
          after_data: { id: initialData.id, ...payload },
        }).catch(() => {});
        /* Edit success → liste sayfasına dön (UX). */
        router.replace("/maki-admin/manual-reservations");
        router.refresh();
        return;
      }

      /* CREATE flow (eski davranış aynen) */
      const created = await createManualReservation(payload);
      toast.success("Blok eklendi", { id: "manual-blok" });
      /* 🛡️ FAZ 55J-3 — AUDIT LOG (fail-safe). createManualReservation
         dönen row'u id ile aktarır; failure throw eder → log atılmaz. */
      logActivity({
        action: "manual_reservation.created",
        entity_type: "manual_reservation",
        entity_id:
          created && typeof (created as { id?: string }).id === "string"
            ? (created as { id: string }).id
            : null,
        entity_title: `${payload.start_date} → ${payload.end_date}`,
        after_data: {
          villa_id: payload.villa_id,
          start_date: payload.start_date,
          end_date: payload.end_date,
          note: payload.note,
        },
      }).catch(() => {});

      /* Modal kapanır — create akışında success sonrası. Edit mode
         modal kullanmıyor; setModalOpen(false) edit'te no-op. */
      setModalOpen(false);
      setStartDate(null);
      setEndDate(null);
      setFreshSelection(true);
      setNote("");
      setCalendarKey((prev) => prev + 1);
      await fetchBlockedDates();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : mode === "edit"
            ? "Blok güncellenemedi"
            : "Blok eklenemedi";
      toast.error(
        mode === "edit" ? "Blok güncellenemedi" : "Blok eklenemedi",
        {
          id: "manual-blok",
          description: msg,
        }
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* VILLA SELECT */}
      <div className="card-premium p-6 space-y-2">
        <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] flex items-center gap-1.5">
          <HomeIcon size={12} className="text-[var(--color-champagne-600)]" />
          Mülk
        </label>
        <VillaCombobox
          villas={villas || []}
          value={selectedVilla}
          onChange={setSelectedVilla}
          placeholder="Mülk seç"
        />
      </div>

      {/* CALENDAR — shared ReservationCalendar.
          Manual flow: drag commit'inde kendi getValidEndDate
          ile end-clamp uygulanır. fullyBlockedDates set'i
          component'ten parent'a callback üzerinden gelir;
          aynı boundary semantic'i. */}
      {selectedVilla && (
        <div
          key={calendarKey}
          className="card-premium p-3 md:p-4"
        >
          <ReservationCalendar
            startDate={startDate}
            endDate={endDate}
            freshSelection={freshSelection}
            setFreshSelection={setFreshSelection}
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            blockedDates={blockedDates}
            checkinDates={checkinDates}
            checkoutDates={checkoutDates}
            pendingCheckinDates={pendingCheckinDates}
            pendingCheckoutDates={pendingCheckoutDates}
            pendingMiddleDates={pendingMiddleDates}
            externalCheckinDates={externalCal.externalCheckinDates}
            externalCheckoutDates={externalCal.externalCheckoutDates}
            externalMiddleDates={externalCal.externalMiddleDates}
            externalDetailByDate={externalCal.detailByDate}
            onSelectRange={(from, to, fb) => {
              const safeEnd = getValidEndDate(from, to, fb);
              setStartDate(from);
              setEndDate(safeEnd);
              /* 🛡️ Modal auto-open — create mode'da range commit
                 sonrası kullanıcıyı not + kayıt için tek ekrana götür.
                 Edit mode'da modal kapalı kalır (eski UX). */
              if (mode === "create" && from && safeEnd) {
                setModalOpen(true);
              }
            }}
            resetKey={calendarKey}
            showRangeChip
            monthCount={5}
          />
        </div>
      )}

      {/* 🎯 AKTİF BLOKLAR — manuel + iCal birleşik panel (filtre + badge).
         Takvim ALTINDA ayrı card — takvim hücrelerine / renklerine /
         boyutuna SIFIR etki. Silme YALNIZ manuel/her-ikisi satırlarda
         (iCal salt-okunur → yanlışlıkla silme imkansız). Edit mode'da
         düzenlenen kayıt listede gösterilmez (self-exclude
         fetchBlockedDates içinde). */}
      {selectedVilla && (
        <ActiveBlocksPanel
          blocks={activeBlocks}
          onDeleteManual={handleDeleteBlock}
          deletingId={deletingBlockId}
        />
      )}

      {/* 🛡️ EDIT MODE — eski Note Card + Save Button JSX'i AYNEN
         korundu. Create mode'da modal (aşağıda) kullanılıyor;
         edit mode'da kullanıcı kayıt bilgilerini güncelliyor →
         modal pattern UX'i bozar. Bu yüzden eski inline UI eski
         davranışla bire bir devam eder. */}
      {mode === "edit" && (
        <>
          {/* NOTE */}
          <div className="card-premium p-6 space-y-2">
            <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)]">
              Not (isteğe bağlı)
            </label>
            <textarea
              placeholder="Bu blok için not ekle…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input !rounded-2xl !p-4 h-24 resize-none"
            />
          </div>

          {/* SAVE */}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary"
            >
              <Save size={15} />
              {loading ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
            </button>
          </div>
        </>
      )}

      {/* 🛡️ CREATE MODE — MODAL (tarih commit sonrası otomatik açılır).
         Mevcut state (startDate/endDate/note) ve handleSubmit AYNEN
         reuse. Modal'ın "Kaydet" butonu handleSubmit çağırır →
         createManualReservation → toast + AUDIT + setModalOpen(false)
         + reset. ESC → setModalOpen(false). Backdrop click → kapat.
         Loading sırasında "İptal" ve ESC disable (submit kesilmesin). */}
      {mode === "create" &&
        modalOpen &&
        startDate &&
        endDate && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-block-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
            onClick={() => {
              if (!loading) setModalOpen(false);
            }}
          >
            <div
              className="card-premium w-full max-w-md p-6 space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              {/* HEADER */}
              <div>
                <p className="text-[10.5px] tracking-[0.22em] uppercase font-semibold text-[var(--color-stone-500)]">
                  Yeni Blok
                </p>
                <h3
                  id="new-block-modal-title"
                  className="font-display text-[22px] text-[var(--color-stone-900)] mt-1 tracking-[-0.015em]"
                >
                  Yeni Blok Oluştur
                </h3>
              </div>

              {/* DATE RANGE + NIGHTS */}
              <div className="rounded-2xl border border-[var(--color-stone-100)] bg-[var(--color-sand-50)] px-4 py-3">
                <p
                  className="text-[14.5px] font-medium text-[var(--color-stone-900)]"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatDateTr(
                    startDate.toLocaleDateString("sv-SE")
                  )}{" "}
                  →{" "}
                  {formatDateTr(
                    endDate.toLocaleDateString("sv-SE")
                  )}
                </p>
                <p className="text-[12px] text-[var(--color-stone-500)] mt-1">
                  {(() => {
                    const ms =
                      endDate.getTime() - startDate.getTime();
                    const days = Math.max(
                      0,
                      Math.round(ms / (1000 * 60 * 60 * 24))
                    );
                    return `${days} gece`;
                  })()}
                </p>
              </div>

              {/* NOTE */}
              <div className="space-y-2">
                <label
                  htmlFor="new-block-modal-note"
                  className="text-[11.5px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block"
                >
                  Not (isteğe bağlı)
                </label>
                <textarea
                  id="new-block-modal-note"
                  ref={noteRef}
                  placeholder="Bu blok için not ekle…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input !rounded-2xl !p-3.5 h-24 resize-none w-full"
                />
              </div>

              {/* ACTIONS */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!loading) setModalOpen(false);
                  }}
                  disabled={loading}
                  className="
                    inline-flex items-center gap-1.5
                    px-4 py-2 rounded-xl
                    text-[13px] font-medium
                    text-[var(--color-stone-700)]
                    hover:bg-[var(--color-sand-50)]
                    transition
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="btn-primary"
                >
                  <Save size={14} />
                  {loading ? "Kaydediliyor…" : "Bloklamayı Kaydet"}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
