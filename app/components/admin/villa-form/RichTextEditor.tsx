"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Quote,
} from "lucide-react";

import { convertImageToWebP } from "@/lib/image.helpers";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
import { STORAGE_BUCKETS } from "@/lib/storage";

/* ===============================================================
   🛡️ RICH TEXT EDITOR — villa açıklaması (Tiptap, admin-only)
   ===============================================================
   - StarterKit: bold, italic, underline, H2-H4, bullet/ordered list,
     blockquote, link (rel/target güvenli).
   - Image: mevcut R2 upload (convertImageToWebP → /api/admin/storage/
     upload → resolveVillaImageUrl).
   - Table: TableKit.
   - value/onChange = HTML string (DB `description` ile aynı sözleşme).
   - immediatelyRender:false → Next SSR hydration güvenli.
   Sanitize KAYIT anında server'da (payload.ts) + RENDER'da (detay).
   =============================================================== */

type Props = {
  value: string;
  onChange: (html: string) => void;
};

/* Toolbar butonu — modül seviyesinde (render içinde component tanımlama
   yasağı: react-hooks/static-components). */
function ToolbarBtn({
  on,
  active,
  title,
  children,
}: {
  on: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={on}
      title={title}
      aria-label={title}
      className={`w-9 h-9 inline-flex items-center justify-center rounded-lg border transition-colors motion-reduce:transition-none ${
        active
          ? "bg-[var(--color-stone-900)] text-white border-[var(--color-stone-900)]"
          : "bg-white text-[var(--color-stone-700)] border-[var(--color-stone-200)] hover:bg-[var(--color-stone-50)]"
      }`}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ value, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        },
      }),
      Image,
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "villa-rte tiptap min-h-40 rounded-2xl border border-[var(--color-stone-200)] bg-white p-4 leading-relaxed focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  /* Dış value değişimi (edit-mode hidrasyon) — editör odaklı değilken
     ve farklıysa içeriği senkronla (cursor jump / loop önlenir). */
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && !editor.isFocused) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  const addImage = async (file: File) => {
    try {
      const webp = await convertImageToWebP(file, {});
      const path = `descriptions/${crypto.randomUUID()}.webp`;
      const fd = new FormData();
      fd.append("file", webp);
      fd.append("bucket", STORAGE_BUCKETS.VILLA_IMAGES);
      fd.append("path", path);
      const res = await fetch("/api/admin/storage/upload", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as { ok?: boolean };
      if (!res.ok || !json.ok) return;
      const url = resolveVillaImageUrl(path);
      if (url) editor.chain().focus().setImage({ src: url }).run();
    } catch {
      /* sessiz: upload hatası editörü bozmasın */
    }
  };

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Bağlantı URL'i:", prev || "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolbarBtn on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Kalın">
          <Bold size={16} />
        </ToolbarBtn>
        <ToolbarBtn on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="İtalik">
          <Italic size={16} />
        </ToolbarBtn>
        <ToolbarBtn on={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Altı çizili">
          <UnderlineIcon size={16} />
        </ToolbarBtn>
        <span className="w-px h-6 bg-[var(--color-stone-200)] mx-1" />
        <ToolbarBtn on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Başlık 2">
          <Heading2 size={16} />
        </ToolbarBtn>
        <ToolbarBtn on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Başlık 3">
          <Heading3 size={16} />
        </ToolbarBtn>
        <ToolbarBtn on={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} active={editor.isActive("heading", { level: 4 })} title="Başlık 4">
          <Heading4 size={16} />
        </ToolbarBtn>
        <span className="w-px h-6 bg-[var(--color-stone-200)] mx-1" />
        <ToolbarBtn on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Madde listesi">
          <List size={16} />
        </ToolbarBtn>
        <ToolbarBtn on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numaralı liste">
          <ListOrdered size={16} />
        </ToolbarBtn>
        <ToolbarBtn on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Alıntı">
          <Quote size={16} />
        </ToolbarBtn>
        <span className="w-px h-6 bg-[var(--color-stone-200)] mx-1" />
        <ToolbarBtn on={setLink} active={editor.isActive("link")} title="Bağlantı">
          <LinkIcon size={16} />
        </ToolbarBtn>
        <ToolbarBtn on={() => fileInputRef.current?.click()} title="Görsel yükle">
          <ImageIcon size={16} />
        </ToolbarBtn>
        <ToolbarBtn
          on={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          title="Tablo ekle"
        >
          <TableIcon size={16} />
        </ToolbarBtn>
      </div>

      <EditorContent editor={editor} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addImage(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
