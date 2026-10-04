/* ===============================================================
   🔲 Public takvim gün hücresi çerçevesi — ORTAK TEK KAYNAK
   ===============================================================
   Çok hafif nötr 1px çerçeve; INSET box-shadow ile çizilir → kutu
   ölçüsü, radius, spacing ve arka plan durum renkleri (müsait /
   onaylı / beklemede / yarım gün) DEĞİŞMEZ.

   Kullananlar (yalnız public):
     - app/components/villa/booking/BookingCalendar.tsx
       (rezervasyon datepicker — villa detay sidebar + kart popup'ı)
     - app/components/villa/AvailabilityInlineCalendar.tsx
       (villa detay "Müsaitlik" popup takvimi)
   Admin takvimleri bu sabiti KULLANMAZ.
   =============================================================== */

export const PUBLIC_DAY_CELL_BORDER_SHADOW = "inset 0 0 0 1px #E5E7EB";
