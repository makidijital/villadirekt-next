import { formatLocalDate } from "@/lib/date-format";

// ==============================
// 🧠 CORE HELPERS
// ==============================

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const inDateArray = (arr: Date[], date: Date) =>
  arr.some((d) => isSameDay(d, date));

// ==============================
// 🔥 STATE DETECTORS
// ==============================

export const getDayState = ({
  date,
  blockedDates,
  checkinDates,
  checkoutDates,
  pendingCheckinDates,
  pendingCheckoutDates,
  pendingMiddleDates,
  /* 🛡️ FAZ 56H-A — external iCal arrays (optional, additive).
     Public consumer'lar bunları pas geçer (default boş); external
     dateleri zaten confirmed array'lerine merge etmiş olurlar →
     engine kırmızı render → public ayrım görmez.
     Admin consumer'lar bu arrays'i ayrıca geçer → engine violet
     render (lowest priority; confirmed/pending üzerine yazmaz). */
  externalCheckinDates = [],
  externalCheckoutDates = [],
  externalMiddleDates = [],
}: {
  date: Date;
  blockedDates: Date[];
  checkinDates: Date[];
  checkoutDates: Date[];
  pendingCheckinDates: Date[];
  pendingCheckoutDates: Date[];
  pendingMiddleDates: Date[];
  externalCheckinDates?: Date[];
  externalCheckoutDates?: Date[];
  externalMiddleDates?: Date[];
}) => {
  return {
    isCI: inDateArray(checkinDates, date),
    isCO: inDateArray(checkoutDates, date),

    isBlocked: inDateArray(blockedDates, date),

    isPCI: inDateArray(pendingCheckinDates, date),
    isPCO: inDateArray(pendingCheckoutDates, date),
    isPM: inDateArray(pendingMiddleDates, date),

    /* 🛡️ FAZ 56H-A — external iCal state (admin-only visual ton). */
    isXCI: inDateArray(externalCheckinDates, date),
    isXCO: inDateArray(externalCheckoutDates, date),
    isXM: inDateArray(externalMiddleDates, date),
  };
};

// ==============================
// 🎨 STYLE ENGINE
// ==============================

export const getDayStyle = ({
  date,
  blockedDates,
  checkinDates,
  checkoutDates,
  pendingCheckinDates,
  pendingCheckoutDates,
  pendingMiddleDates,
  /* 🛡️ FAZ 56H-A — external iCal arrays (optional, additive).
     Default boş → mevcut consumer'lar (public) etkilenmez. */
  externalCheckinDates = [],
  externalCheckoutDates = [],
  externalMiddleDates = [],
}: {
  date: Date;
  blockedDates: Date[];
  checkinDates: Date[];
  checkoutDates: Date[];
  pendingCheckinDates: Date[];
  pendingCheckoutDates: Date[];
  pendingMiddleDates: Date[];
  externalCheckinDates?: Date[];
  externalCheckoutDates?: Date[];
  externalMiddleDates?: Date[];
}) => {
  const {
    isCI,
    isCO,
    isBlocked,

    isPCI,
    isPCO,
    isPM,

    isXCI,
    isXCO,
    isXM,
  } = getDayState({
    date,
    blockedDates,
    checkinDates,
    checkoutDates,
    pendingCheckinDates,
    pendingCheckoutDates,
    pendingMiddleDates,
    externalCheckinDates,
    externalCheckoutDates,
    externalMiddleDates,
  });

  const isBoth = isCI && isCO;
  const isPendingBoth = isPCI && isPCO;

  let color = "black";

  // ==========================
  // 🔴 CONFIRMED PRIORITY
  // ==========================

  // 🔥 gerçek birleşim noktası
  if (isBoth && isBlocked) {
    return {
      bg: "linear-gradient(to bottom right, rgba(220,38,38,0.85) 48%, #ffffff 48%, #ffffff 52%,rgba(220,38,38,0.85) 52%)",
      color,
    };
  }

  // 🔥 reservation giriş + çıkış
  if (isBoth) {
    return {
      bg: "linear-gradient(to bottom right, rgba(220,38,38,0.85) 48%, #ffffff 48%, #ffffff 52%,rgba(220,38,38,0.85) 52%)",
      color,
    };
  }

  // ==========================
  // 🟡 PENDING PRIORITY
  // ==========================

  if (isPendingBoth) {
    return {
      bg: "linear-gradient(to bottom right, #d7970d 48%, #ffffff 48%, #ffffff 52%,#facc15 52%)",
      color,
    };
  }

  // 🔥 pending + confirmed checkout
  if ((isPM && isCO) || (isPCI && isCO)) {
    return {
      bg: "linear-gradient(to bottom right, rgba(220,38,38,0.85) 48%, #ffffff 48%, #ffffff 52%,rgb(250,204,21) 52%)",
      color,
    };
  }

  // 🔥 pending + confirmed checkin
  if ((isCI && isPM) || (isCI && isPCO)) {
    return {
      bg: "linear-gradient(to bottom right, rgb(250,204,21) 48%, #ffffff 48%, #ffffff 52%,rgba(220,38,38,0.85) 52%)",
      color,
    };
  }

  // ==========================
  // 🟣🔴🟡 CROSS-SOURCE HALF-DAY COMBOS (FAZ 56H-D-FIX)
  // ==========================
  // Aynı gün İKİ FARKLI kaynak yarı-gün paylaştığında (biri checkout
  // → SOL, diğeri checkin → SAĞ) canonical priority (confirmed >
  // pending > external) renk sıralamasını DEĞİL render konumunu
  // belirler: checkout daima SOL, checkin daima SAĞ. Pattern, mevcut
  // pending↔confirmed yarı-gün engine'iyle birebir aynı — sadece
  // external kaynağı 3. taraf olarak ekleniyor.
  //
  // Rule 5 (external middle + reservation → external görünmez):
  //   isXM + (isCI/isCO/isPCI/isPCO/isPM/isBlocked) durumunu
  //   aşağıdaki standalone branch'ler doğal olarak yakalar.
  //   Cross-source check'ler yalnız isXCI/isXCO baz alır; isXM
  //   buraya girmez → reservation half-day rengi natural kazanır.
  //
  // Guard'lar:
  //   !isCO / !isCI → isBoth (confirmed both) zaten yukarıda render
  //                    edildi; duplicate emisyon yasak.
  //   !isBlocked    → confirmed middle (full red) reservation
  //                    priority — cross-source half-day uygulanmaz.
  //   !isPCO / !isPCI → isPendingBoth zaten yukarıda render edildi.
  //
  // Mevcut gradient pattern'leri reuse — yeni bespoke CSS YOK.
  // Violet half-tone: rgba(139,92,246,0.45) — standalone external
  // CI/CO ile birebir aynı.

  // 🔥 external checkout (SOL) + confirmed checkin (SAĞ)
  if (isXCO && isCI && !isCO && !isBlocked) {
    return {
      bg: "linear-gradient(to bottom right, rgba(139,92,246,0.45) 48%, #ffffff 48%, #ffffff 52%,rgba(220,38,38,0.85) 52%)",
      color,
    };
  }

  // 🔥 confirmed checkout (SOL) + external checkin (SAĞ)
  if (isCO && isXCI && !isCI && !isBlocked) {
    return {
      bg: "linear-gradient(to bottom right, rgba(220,38,38,0.85) 48%, #ffffff 48%, #ffffff 52%,rgba(139,92,246,0.45) 52%)",
      color,
    };
  }

  // 🔥 external checkout (SOL) + pending checkin (SAĞ)
  if (isXCO && isPCI && !isPCO) {
    return {
      bg: "linear-gradient(to bottom right, rgba(139,92,246,0.45) 48%, #ffffff 48%, #ffffff 52%,#facc15 52%)",
      color,
    };
  }

  // 🔥 pending checkout (SOL) + external checkin (SAĞ)
  if (isPCO && isXCI && !isPCI) {
    return {
      bg: "linear-gradient(to bottom right, #facc15 48%, #ffffff 48%, #ffffff 52%,rgba(139,92,246,0.45) 52%)",
      color,
    };
  }

  // ==========================
  // 🔴 NORMAL CONFIRMED
  // ==========================

  // 🔥 giriş
  if (isCI && !isBlocked) {
    return {
      bg: "linear-gradient(to bottom right, transparent 48%, #ffffff 48%, #ffffff 52%,rgba(220,38,38,0.85) 52%)",
      color,
    };
  }

  // 🔥 çıkış
  if (isCO && !isBlocked) {
    return {
      bg: "linear-gradient(to bottom right, rgba(220,38,38,0.85) 48%, #ffffff 48%, #ffffff 52%,transparent 52%)",
      color,
    };
  }

  // 🔥 full middle blocked
  if (isBlocked) {
    return {
      bg: "#DC2626",
      color,
    };
  }

  // ==========================
  // 🟡 PENDING
  // ==========================

  if (isPCI) {
    return {
      bg: "linear-gradient(to bottom right, transparent 48%, #ffffff 48%, #ffffff 52%,#facc15 52%)",
      color,
    };
  }

  if (isPCO) {
    return {
      bg: "linear-gradient(to bottom right, #facc15 48%, #ffffff 48%, #ffffff 52%,transparent 52%)",
      color,
    };
  }

  if (isPM) {
    return {
      bg: "#facc15",
      color,
    };
  }

  // ==========================
  // 🟣 EXTERNAL iCAL (FAZ 56H-A — LOWEST priority)
  // ==========================
  // Confirmed (red) ve pending (yellow) yukarıdaki check'lerde early-
  // exit ediyor → buraya yalnız sadece-external günler düşer.
  // Reservation/manual ile çakışan günler ZATEN yukarıda render edildi
  // (duplicate render YASAK). Half-day pattern aynı şekilde (reservation
  // ile birebir); yalnız renk violet.

  const isExternalBoth = isXCI && isXCO;

  if (isExternalBoth) {
    return {
      bg: "linear-gradient(to bottom right, rgba(124,58,237,0.55) 48%, #ffffff 48%, #ffffff 52%,rgba(139,92,246,0.62) 52%)",
      color,
    };
  }

  if (isXCI && !isXM) {
    return {
      bg: "linear-gradient(to bottom right, transparent 48%, #ffffff 48%, #ffffff 52%,rgba(139,92,246,0.45) 52%)",
      color,
    };
  }

  if (isXCO && !isXM) {
    return {
      bg: "linear-gradient(to bottom right, rgba(139,92,246,0.45) 48%, #ffffff 48%, #ffffff 52%,transparent 52%)",
      color,
    };
  }

  if (isXM) {
    return {
      bg: "rgba(139,92,246,0.45)",
      color,
    };
  }

  // ==========================
  // ⚪ DEFAULT
  // ==========================

  return {
    bg: undefined,
    color,
  };
};

// ==============================
// 💰 PRICE HELPER
// ==============================

export const getPriceForDate = (
  date: Date,
  prices: {
    start_date: string;
    end_date: string;
    price: number;
  }[]
) => {
  // formatLocalDate → "YYYY-MM-DD" LOCAL günü.
  // Önceden date.toISOString().split("T")[0] kullanılıyordu;
  // bu UTC günü üretiyordu ve TR (+3) zaman diliminde takvim
  // hücresinde gösterilen tarih ile karşılaştırılan string farklı
  // güne kayabiliyordu (örn. cell "2026-06-04", target "2026-06-03").
  // formatLocalDate ile cell ↔ price-range eşleşmesi sadık kalır.
  const target = formatLocalDate(date);

  const found = prices?.find((p) => {
    return (
      target >= p.start_date &&
      target <= p.end_date
    );
  });

  return found ? found.price : null;
};