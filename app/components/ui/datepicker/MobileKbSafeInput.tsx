"use client";

import { forwardRef } from "react";

/* ===============================================================
   🛡️ MOBILE KEYBOARD-SAFE INPUT — react-datepicker customInput
   ===============================================================
   PROBLEM:
     react-datepicker default olarak `<input type="text">` render
     eder. Mobil tarayıcıda (Android Chrome / iOS Safari) input
     focus aldığında OS sanal klavyeyi açar. react-datepicker'ın
     internal akışı: tap → input focus → popper open. Yani input'a
     focus VERMESİ gerekiyor (takvimi açmak için), ancak default
     `type="text"` input focus alınca tarayıcı klavyeyi de açar.

   ÇÖZÜM (DÜŞÜK RİSK):
     `inputMode="none"` HTML5 attribute → tarayıcıya "bu input
     için sanal klavye GÖSTERME" sinyali. Input yine focus alır,
     react-datepicker yine popper açar, sadece OS klavyesi
     görünmez.

   NEDEN customInput:
     react-datepicker `inputMode` prop'unu doğrudan input'a
     forward etmez (dokümante değil). customInput ile kendi
     DOM input'umuzu render edip `inputMode="none"` ekliyoruz.

   NEDEN forwardRef:
     react-datepicker customInput'a ref bağlar (popper konum,
     focus yönetimi). forwardRef olmadan calendar açılmaz.

   DESKTOP ETKİSİ: SIFIR
     `inputMode="none"` mobile-specific. Desktop browser'lar
     bu attribute'u görmezden gelir; input davranışı bire bir
     aynı kalır (focus, blur, keyboard input, copy/paste, vs).

   PROP FORWARDING:
     react-datepicker, customInput'a şu prop'ları clone-injekt
     eder (kütüphane internal): value, placeholder, className,
     onClick, onFocus, onBlur, onChange, onKeyDown, disabled,
     readOnly, name, autoComplete, autoFocus, aria-*.
     Tümü `{...props}` ile DOM input'a forward edilir.

     `inputMode` en SONA yazılır → dışarıdan override edilemez
     (DatePicker tarafından `inputMode` enjekte edilmez zaten,
     yine de defansif sıralama).
=============================================================== */

type Props = React.InputHTMLAttributes<HTMLInputElement>;

const MobileKbSafeInput = forwardRef<HTMLInputElement, Props>(
  function MobileKbSafeInput(props, ref) {
    return (
      <input
        {...props}
        ref={ref}
        inputMode="none"
        autoComplete="off"
      />
    );
  }
);

export default MobileKbSafeInput;
