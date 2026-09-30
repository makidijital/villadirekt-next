/* 🛡️ Villa Migration S7B — anon villa.repository yerine native
   villa.repository.server. findVillaDistances (byte-identical twin) +
   rpcReplaceVillaDistances (native byte-identical) ikisi de native.
   Bu service yalnız server (public detay RSC + villa-edit.action) →
   server-only native repo import'u güvenli. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import {
  normalizeDistanceValue,
  parseDistance,
  type DistanceUnit,
} from "@/lib/distance.helper";

// 📦 GET (villa'ya ait mesafeler)
export async function getVillaDistances(villaId: string) {
  if (!villaId) return [];

  /* FAZ 37: DB I/O villaAdminRepository.findVillaDistances delege.
     SELECT + order chain repo içinde aynen. */
  const { data, error } =
    await villaAdminRepository.findVillaDistances(villaId);

  if (error) {
    console.error("❌ getVillaDistances:", error.message);
    return [];
  }

  return data || [];
}

/* SET (reset + insert)
   🛡️ ATOMIC REPLACE-ALL (db/migrations/002): replace_villa_distances
   RPC DELETE+INSERT'i tek transaction'da yapar; partial fail durumunda
   rollback. Replace-all semantic'i AYNEN; boş array → tablo o villa
   için temizlenir. Return true/false contract korundu.

   🛡️ FAZ 41 + UNIT EXTENSION — Value normalization at service layer:
     - title trim
     - distance + opsiyonel unit ("m" | "km"):
         * unit verilirse: explicit `${value} ${unit}` serialize
         * unit verilmezse: text içinden parse (geriye uyumluluk)
         * legacy free-text: olduğu gibi korunur (passthrough)
     - title veya distance ikisi de boş → row drop (DB'ye yazılmaz)

   Mevcut DB row'ları DOKUNULMAZ; sadece yeni save akışı normalize eder.
   Eski caller'lar (unit field göndermeden distance text geçen) sorunsuz
   çalışmaya devam eder — geriye uyumluluk %100. */
export async function setVillaDistances(
  villaId: string,
  distances: { title: string; distance: string; unit?: DistanceUnit }[]
) {
  if (!villaId) return false;

  const payload = (distances || [])
    .map((d) => {
      const title = String(d?.title || "").trim();
      /* Unit explicit verildiyse: value'yu text'ten parse et + explicit
         unit ile re-serialize. Verilmediyse: eski davranış (text içinden
         hem value hem unit çıkar). */
      let distance: string;
      if (d?.unit === "m" || d?.unit === "km") {
        const parsed = parseDistance(d.distance);
        /* Legacy free-text ise: form bunu zaten override ediyor olmamalı
           (input boş kalır), ama defensive olarak passthrough. */
        if (parsed.isLegacy) {
          distance = String(d.distance || "").trim();
        } else {
          distance = parsed.value
            ? `${parsed.value} ${d.unit}`
            : "";
        }
      } else {
        distance = normalizeDistanceValue(d?.distance);
      }
      return { title, distance };
    })
    .filter((d) => d.title.length > 0 || d.distance.length > 0);

  /* FAZ 37: RPC delegation; parameter shape ({ p_villa_id, p_distances })
     AYNEN repo içinde. Payload normalize (unit re-serialize, title
     trim, drop empty) service edge'de aynen. */
  const { error } = await villaAdminRepository.rpcReplaceVillaDistances(
    villaId,
    payload
  );

  if (error) {
    console.error("❌ replace distances:", error.message);
    return false;
  }

  return true;
}
