import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 2 — anon repo) — importer zinciri KANITLI
   client-safe (Footer RSC + page.service + sitemap + RSC page'ler;
   hiçbir "use client" yok). Okuma; embed/rpc/write yok. single()→
   PGRST116, jsonb (sections/body) read-parser hazır → provider
   değişmedi. `server-only` defansif sınır. Dönüş şekli aynen. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ FAZ 40 — PAGES REPOSITORY
   ===============================================================
   `pages` tablosu — CMS sayfa kayıtları. Service public/admin
   read'leri kapsar; repository sadece DB I/O.

   ⚠️ KESIN KURAL:
     - Public list: is_active=true + created_at DESC.
     - Slug detail: .eq("slug").single() — single resolver (missing
       row → PGRST116 error; service "null" branch'iyle yakalar).
=============================================================== */

export const pagesRepository = {
  /** Public list — aktif pages, created_at DESC. */
  async findActiveList() {
    return await db
      .from("pages")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
  },

  /** Slug detail — .single() resolver. */
  async findBySlug(slug: string) {
    /* 🛡️ H-02 — PUBLIC detay yalnız AKTİF sayfayı döndürür.
       Eski sağlayıcıda bu gizlemeyi satır-seviyesi politika yapıyordu;
       native PostgreSQL'de o katman yok → filtre sorguda olmalı.
       Pasif / olmayan slug → 0 satır → PGRST116 → service null →
       TR mevcut 404 bloğu, EN/DE notFound(), metadata noindex.
       Admin okumaları bu repository'yi KULLANMAZ
       (pages.repository.server.ts, id ile). */
    return await db
      .from("pages")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();
  },

  /** All published pages — slim projection.
     Footer "Kurumsal" kolonunun veri kaynağı. Tek tek farklar:
       • `is_active=true` filtre AYNEN (yayında olmayan asla sızmaz).
       • `show_in_menu` filtresi YOK → header'da gizli sayfalar da
         footer'da görünebilir. Bu kural admin "Menüde Göster"
         toggle'ının yalnız header navigation'ı kontrol etmesini
         sağlar; footer ayrı kanal.
       • Slim SELECT: sections/body/cover_image JSONB+TEXT'leri
         taşımaz → footer SSR payload'ı küçük.
     Sıralama caller tarafında (Footer.tsx): menu_order ASC nulls-
     last, sonra created_at ASC. Repo `.order` zincir bağlamaz çünkü
     SQL "nulls last" semantic'i PostgreSQL'de explicit; client-side
     sort daha taşınabilir. */
  async findActivePages() {
    return await db
      .from("pages")
      .select("id, title, slug, menu_order, created_at")
      .eq("is_active", true);
  },
};
