"use client";

/* ===============================================================
   🛡️ VideoStep — YouTube videoları yönetim bölümü
   ===============================================================
   PURE PRESENTATIONAL:
     - Container'dan `videos` + `setVideos` alır
     - Validation pure helper (lib/youtube.helper > parseYouTubeId)
     - Hiçbir API çağrısı yok; save işi villa-admin.service'in

   UX:
     - URL input + "Ekle" butonu
     - Inline hata: parse edilemeyen URL veya duplicate ID
     - Eklenen videolar liste — thumbnail + URL + sil butonu
     - Modern minimal, mobile responsive
     - Enter tuşu = Ekle
   =============================================================== */

import { useState } from "react";
import { Plus, X, Film, AlertCircle } from "lucide-react";

import Section from "./shared/Section";
import {
  parseYouTubeId,
  getYouTubeThumbnailUrl,
  type VillaYouTubeVideo,
} from "@/lib/youtube.helper";

type Props = {
  /* DB-canonical video listesi (id + url). Mutable yapı —
     container `setVideos(next)` ile günceller. */
  videos: VillaYouTubeVideo[];
  setVideos: (next: VillaYouTubeVideo[]) => void;
};

export default function VideoStep({ videos, setVideos }: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    setError(null);
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Lütfen bir YouTube URL'i girin.");
      return;
    }
    const id = parseYouTubeId(trimmed);
    if (!id) {
      setError(
        "Geçersiz URL. Sadece YouTube videoları desteklenir (watch / youtu.be / shorts / embed)."
      );
      return;
    }
    /* Duplicate kontrolü (aynı villa içinde aynı video iki kez olmasın). */
    if (videos.some((v) => v.id === id)) {
      setError("Bu video zaten eklenmiş.");
      return;
    }
    setVideos([...videos, { id, url: trimmed }]);
    setDraft("");
  };

  const handleRemove = (id: string) => {
    setVideos(videos.filter((v) => v.id !== id));
  };

  /* Draft input için canlı validation flag — kullanıcı yazarken
     henüz "Ekle" basmadıysa hata gösterme, sadece typing bittiğinde
     görsel cue. Buton enabled/disabled state'i için kullanılır. */
  const draftIsValid = draft.trim().length === 0 || parseYouTubeId(draft) !== null;

  return (
    <Section
      eyebrow="Medya"
      title="YouTube Videoları"
      subtitle="Mülke ait video URL'lerini ekleyin (opsiyonel)"
    >
      {/* INPUT ROW — URL girişi + Ekle butonu */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div
            className={
              "relative flex-1 min-w-0 flex items-center rounded-xl border bg-white " +
              "transition-colors " +
              (draftIsValid
                ? "border-[var(--color-stone-200)] focus-within:border-[var(--brand-coral,#ff653f)]"
                : "border-red-300 focus-within:border-red-400")
            }
          >
            <Film
              size={16}
              className="ml-3 text-[var(--color-stone-400)] shrink-0"
              aria-hidden
            />
            <input
              type="url"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="https://www.youtube.com/watch?v=…"
              className="
                flex-1 min-w-0 !border-0 !shadow-none
                bg-transparent px-3 py-2 text-sm
                !text-[var(--color-stone-900)]
                placeholder:!text-[var(--color-stone-400)]
                focus:!ring-0 focus:!outline-none
              "
              aria-invalid={!draftIsValid}
              aria-describedby={error ? "video-input-error" : undefined}
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!draft.trim()}
            className="
              inline-flex items-center gap-1.5
              rounded-xl px-4 py-2
              bg-[var(--color-stone-900)] text-white text-sm font-medium
              hover:bg-[var(--color-stone-800)]
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40
              shrink-0
            "
          >
            <Plus size={14} />
            Ekle
          </button>
        </div>

        {/* INLINE ERROR */}
        {error && (
          <div
            id="video-input-error"
            role="alert"
            className="flex items-start gap-2 text-[12.5px] text-red-600"
          >
            <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* LIST — eklenmiş videolar */}
      {videos.length > 0 && (
        <ul className="mt-4 space-y-2">
          {videos.map((v) => {
            const thumb = getYouTubeThumbnailUrl(v.id);
            return (
              <li
                key={v.id}
                className="
                  flex items-center gap-3
                  rounded-xl border border-[var(--color-stone-200)] bg-white
                  px-2.5 py-2
                "
              >
                {/* Thumbnail — 16:9, küçük preview */}
                <div
                  className="
                    relative overflow-hidden shrink-0
                    rounded-lg bg-[var(--color-stone-100)]
                    w-[68px] h-[40px]
                  "
                >
                  {thumb ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : null}
                </div>

                {/* URL — truncate, monospace small */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
                    Video ID
                  </p>
                  <p className="text-[12.5px] font-mono text-[var(--color-stone-700)] truncate">
                    {v.id}
                  </p>
                  <p className="text-[11.5px] text-[var(--color-stone-500)] truncate">
                    {v.url}
                  </p>
                </div>

                {/* DELETE */}
                <button
                  type="button"
                  onClick={() => handleRemove(v.id)}
                  className="
                    w-9 h-9 shrink-0
                    flex items-center justify-center
                    rounded-lg text-[var(--color-stone-400)]
                    hover:text-red-500 hover:bg-red-50
                    transition-colors motion-reduce:transition-none
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300
                  "
                  aria-label={`Videoyu sil: ${v.id}`}
                >
                  <X size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* EMPTY STATE — ilk video eklendiğinde kaybolur */}
      {videos.length === 0 && (
        <p className="mt-3 text-[12px] text-[var(--color-stone-500)]">
          Henüz video eklenmedi. Yukarıdaki kutucuğa YouTube URL&apos;i
          yapıştırın ve &ldquo;Ekle&rdquo; butonuna basın.
        </p>
      )}
    </Section>
  );
}
