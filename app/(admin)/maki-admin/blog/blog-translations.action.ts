"use server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  getBlogTranslations,
  upsertBlogTranslation,
  type BlogTranslationInput,
  type BlogTranslationsListResult,
  type BlogTranslationResult,
} from "@/app/services/blog-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ MIGRATION 089 — Admin Blog Çeviri UI Server Actions
   ===============================================================
   `page-translations.action.ts` (Phase 12C) ile BİREBİR AYNI desen.

   Okuma: sayfa zaten middleware ile korunuyor — ekstra auth GEREKMİYOR.
   Yazma: `authorizeAdminSession()` İLK kontrol.

   ⚠️ Bu dosya yalnız ince wrapper — iş mantığı YOK. Mevcut Blog CRUD
   API route'larına (`/api/admin/blog`) DOKUNULMADI.
   =============================================================== */

export async function loadBlogTranslationsAction(
  postId: string
): Promise<BlogTranslationsListResult> {
  /* 🛡️ Blog artık kendi permission key'ini kullanır ("blog");
     ÖNCEDEN `pages` REUSE ediliyordu. Authorization DESENİ değişmedi —
     yalnız key. */
  await requirePermission("blog");
  return getBlogTranslations(postId);
}

export async function saveBlogTranslationAction(
  input: BlogTranslationInput
): Promise<BlogTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  /* 🛡️ Bkz. yukarısı — key `pages` → `blog`. Guard yapısı ve
     `{ ok:false }` dönüş şekli AYNEN korundu. */
  if (!(await callerHasPermission(auth.caller.id, "blog"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  return upsertBlogTranslation(input);
}
