"use client";

/* ===============================================================
   📋 CopyReferenceButton — başarı sayfasındaki referans numarasını
   panoya kopyalar (yalnız sayfada ZATEN gösterilen `value`).
   Clipboard API yoksa/izin verilmezse sessizce hiçbir şey yapmaz —
   referans metni `select-all` ile elle de seçilebilir (mevcut davranış).
   =============================================================== */

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

type Props = {
  value: string;
  label: string;
  copiedLabel: string;
};

export default function CopyReferenceButton({ value, label, copiedLabel }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) return;
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      /* izin yok / desteklenmiyor → sessiz */
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
      className="
        shrink-0 inline-flex h-9 w-9 items-center justify-center
        rounded-[10px] border border-[#E5E7EB] bg-white
        text-[#5B6478] hover:text-[#1B4EF5] hover:border-[#C9D3E3]
        transition-colors motion-reduce:transition-none
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4EF5]/30
      "
    >
      {copied ? (
        <Check size={15} strokeWidth={2.25} className="text-[#00A86B]" aria-hidden="true" />
      ) : (
        <Copy size={15} strokeWidth={1.9} aria-hidden="true" />
      )}
    </button>
  );
}
