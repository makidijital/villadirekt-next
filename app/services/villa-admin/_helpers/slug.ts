/* 🛡️ Villa Migration S7A3 — anon findSlugCollision yerine native
   findSlugExact (byte-identical: SELECT id · WHERE slug=$1 [AND id<>$2] ·
   LIMIT 1 · ham {data,error}). Bu helper server (create/update/clone
   service) → server-only native repo import'u güvenli. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { slugifyTr } from "@/lib/slug";

/* ===============================================================
   🛡️ FAZ 2 — generateUniqueSlug
   ===============================================================
   Eski villa-admin.service.ts içinde inline tanımlı internal
   helper'ın birebir kopyası. Logic byte-identical:
     - `slugifyTr(title)` ile base slug
     - villa tablosunda eşleşme yoksa direkt dön
     - eşleşme varsa `-2, -3, -4, ...` suffix increment
     - `excludeId` verilirse update flow'unda kendini hariç tutar

   ⚠️ SLUG SOURCE-OF-TRUTH (Faz 6 consolidation):
     `lib/slug > slugifyTr` — migration 008/009 backfill SQL'leriyle
     birebir aynı semantic (translate + regex).
=============================================================== */

export async function generateUniqueSlug(
  title: string,
  excludeId?: string
): Promise<string> {
  const baseSlug = slugifyTr(title);

  let slug = baseSlug;
  let counter = 2;

  while (true) {
    /* FAZ 37: DB I/O villaAdminRepository.findSlugCollision üzerinden
       delege. Predicate (.eq("slug") + .limit(1) + .neq("id", excludeId)
       conditional) repo içinde aynen; service infinite-loop +
       increment + excludeId policy AYNEN. */
    const { data } = await villaAdminRepository.findSlugExact(
      slug,
      excludeId
    );

    if (!data || data.length === 0) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}
