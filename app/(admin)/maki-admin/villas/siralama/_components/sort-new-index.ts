import type { UniqueIdentifier } from "@dnd-kit/core";
import type { NewIndexGetter } from "@dnd-kit/sortable";

/* ===============================================================
   ⚡ O(1) `getNewIndex` — dnd-kit `defaultNewIndexGetter` ile AYNI sonuç
   ===============================================================
   dnd-kit varsayılanı her kart, her render'da
   `arrayMove(items, activeIndex, overIndex).indexOf(id)` çalıştırır:
   N kart × N elemanlı yeni dizi = O(N²) bellek + GC. 1.000+ villada
   sürükleme sırasında ana thread'i kilitliyordu.

   Bu sürüm aynı değeri, dizi kopyalamadan hesaplar:
     • id → index haritası `items` dizi kimliği başına BİR kez kurulur
       (SortableContext, `items` değişmedikçe aynı diziyi verir).
     • arrayMove anlamı: taşınan eleman overIndex'e gider; aradaki
       elemanlar bir kayar; diğerleri yerinde kalır.
   Yalnız görsel hesaplamada kullanılır (useSortable); kaydedilen
   sort_order'lar handleDragEnd'deki arrayMove'dan gelir (değişmedi).
   =============================================================== */

const indexCache = new WeakMap<
  readonly UniqueIdentifier[],
  Map<UniqueIdentifier, number>
>();

function indexOfId(items: readonly UniqueIdentifier[], id: UniqueIdentifier) {
  let map = indexCache.get(items);
  if (!map) {
    map = new Map();
    /* İlk görülen index — `Array.prototype.indexOf` ile aynı. */
    items.forEach((item, i) => {
      if (!map!.has(item)) map!.set(item, i);
    });
    indexCache.set(items, map);
  }
  return map.get(id) ?? -1;
}

export const fastNewIndex: NewIndexGetter = ({
  id,
  items,
  activeIndex,
  overIndex,
}) => {
  const index = indexOfId(items, id);
  if (index === -1) return -1;
  if (index === activeIndex) return overIndex;
  if (activeIndex < overIndex && index > activeIndex && index <= overIndex) {
    return index - 1;
  }
  if (activeIndex > overIndex && index >= overIndex && index < activeIndex) {
    return index + 1;
  }
  return index;
};
