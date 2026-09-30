import BlogPostForm from "../BlogPostForm";

/* ===============================================================
   🛡️ Blog — Yeni Yazı (admin). BlogPostForm create mode wrapper.
   =============================================================== */
export default function NewBlogPost() {
  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">İçerik</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Blog yazısı ekle
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          SEO odaklı blog yazısı oluştur. İçerik zengin metin editörüyle
          yazılır; yayında değilse taslak olarak kalır.
        </p>
      </div>
      <BlogPostForm mode="create" />
    </div>
  );
}
