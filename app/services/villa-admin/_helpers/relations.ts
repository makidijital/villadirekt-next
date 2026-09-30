/* 🛡️ FAZ 2 STABILIZATION — relation INSERT/REPLACE create/update
   mutation flow'unda; server-role repo (dbAdmin) RLS bypass. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";

/* ===============================================================
   🛡️ FAZ 2 — VILLA RELATION HELPERS
   ===============================================================
   Eski villa-admin.service.ts içinde inline tanımlı 8 relation
   pattern'i (4 create-side INSERT + 4 update-side RPC replace).
   Pattern + sıra + atomicity garantisi BYTE-IDENTICAL.

   ⚠️ ASIMETRİ (BİLİNÇLİ):
     - Create: `.length > 0` koşullu INSERT (sıfır element → call YOK)
     - Update: ALWAYS replace_* RPC (sıfır element → atomic empty clear)
   Bu asimetri eski davranış aynen; orchestrator preserve eder.

   ⚠️ RELATION KOLON ADI:
     villa_price_include_relations.include_id — `price_include_id`
     DEĞİL. (Eski koddaki uyarı yorumu bilinçli.)

   ⚠️ RPC ATOMIC REPLACE:
     `replace_villa_*_relations` (db/migrations/002) — DELETE+INSERT
     tek transaction'da. Insert fail olursa rollback. Sıfır element
     geçerse hepsini temizler.
=============================================================== */

/* ===============================================================
   📦 CREATE-SIDE INSERT HELPERS
   ===============================================================
   Create flow'unda relation tabloları boş; INSERT yeterli.
   `.length > 0` koşulunu caller orchestrator (`create.service.ts`)
   yapar; helper sadece INSERT mantığını tutar.
=============================================================== */

export async function insertVillaTypeRelations(
  villaId: string,
  typeIds: string[]
): Promise<void> {
  /* FAZ 37: DB I/O villaAdminRepository.insertVillaTypeRelationRows
     delege. Rows shape ({ villa_id, type_id }) aynen. */
  const { error } =
    await villaAdminRepository.insertVillaTypeRelationRows(
      typeIds.map((t: string) => ({
        villa_id: villaId,
        type_id: t,
      }))
    );

  if (error) throw error;
}

export async function insertVillaFeatureRelations(
  villaId: string,
  featureIds: string[]
): Promise<void> {
  const { error } =
    await villaAdminRepository.insertVillaFeatureRelationRows(
      featureIds.map((f: string) => ({
        villa_id: villaId,
        feature_id: f,
      }))
    );

  if (error) throw error;
}

export async function insertVillaRuleRelations(
  villaId: string,
  ruleIds: string[]
): Promise<void> {
  const { error } =
    await villaAdminRepository.insertVillaRuleRelationRows(
      ruleIds.map((r: string) => ({
        villa_id: villaId,
        rule_id: r,
      }))
    );

  if (error) throw error;
}

export async function insertVillaPriceIncludeRelations(
  villaId: string,
  includeIds: string[]
): Promise<void> {
  /* ⚠️ Relation kolonu "include_id" — "price_include_id" DEĞİL. */
  const { error } =
    await villaAdminRepository.insertVillaPriceIncludeRelationRows(
      includeIds.map((p: string) => ({
        villa_id: villaId,
        include_id: p,
      }))
    );

  if (error) throw error;
}

/* ===============================================================
   📦 UPDATE-SIDE RPC REPLACE HELPERS
   ===============================================================
   Update flow'unda relation tablolarında mevcut satırlar var;
   `replace_villa_*_relations` RPC'leri DELETE+INSERT'i tek
   transaction'da çalıştırır. Sıfır element geçerse hepsini temizler.

   Caller orchestrator (`update.service.ts`) `Array.isArray` defansif
   guard'ı uygular ve `[]` fallback ile çağırır → atomic empty replace.
=============================================================== */

export async function replaceVillaTypeRelations(
  villaId: string,
  typeIds: string[]
): Promise<void> {
  /* FAZ 37: RPC delegation; parameter shape AYNEN repo içinde. */
  const { error } = await villaAdminRepository.rpcReplaceVillaTypeRelations(
    villaId,
    typeIds
  );
  if (error) throw error;
}

export async function replaceVillaFeatureRelations(
  villaId: string,
  featureIds: string[]
): Promise<void> {
  const { error } =
    await villaAdminRepository.rpcReplaceVillaFeatureRelations(
      villaId,
      featureIds
    );
  if (error) throw error;
}

export async function replaceVillaRuleRelations(
  villaId: string,
  ruleIds: string[]
): Promise<void> {
  const { error } = await villaAdminRepository.rpcReplaceVillaRuleRelations(
    villaId,
    ruleIds
  );
  if (error) throw error;
}

export async function replaceVillaPriceIncludeRelations(
  villaId: string,
  includeIds: string[]
): Promise<void> {
  /* ⚠️ RPC parameter `p_include_ids` (price_include_id DEĞİL). */
  const { error } =
    await villaAdminRepository.rpcReplaceVillaPriceIncludeRelations(
      villaId,
      includeIds
    );
  if (error) throw error;
}
