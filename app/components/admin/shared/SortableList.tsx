"use client";

import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

/* ===============================================================
   🛡️ SortableList — admin drag-drop sıralama primitifi (reusable)
   ===============================================================
   VillaSortPanel'in dnd-kit ÇEKİRDEĞİ generic olarak buraya çıkarıldı
   (kod kopyalama YOK — mantık extraction). Kart içeriği ve persist
   akışı consumer'da kalır; bu primitif yalnız dnd mekaniğini sağlar:
     - DndContext (collisionDetection = closestCenter)
     - SortableContext (verticalListSortingStrategy)
     - useSortable + CSS.Transform + isDragging opacity
     - arrayMove ile yeni sıra → onReorder(next)

   SENSÖR: VillaSortPanel ile BİREBİR → dnd-kit DEFAULT sensörleri
   (explicit sensors prop YOK). Default set PointerSensor + KeyboardSensor'ı
   içerir; PointerSensor pointer-event üzerinden dokunmatiği (touch) kapsar
   → mobilde sürükleme çalışır (VillaSortPanel ile aynı davranış).

   LAYOUT: satır wrapper'ı yalnız transform/transition/opacity uygular →
   sürükleme sırasında yükseklik/layout DEĞİŞMEZ (translate + opacity).
   =============================================================== */

export type DragHandleProps = {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
};

export function SortableList<T>({
  items,
  getId,
  onReorder,
  className,
  children,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (next: T[]) => void;
  className?: string;
  children: (
    item: T,
    ctx: {
      index: number;
      isDragging: boolean;
      dragHandleProps: DragHandleProps;
    }
  ) => ReactNode;
}) {
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((it) => getId(it) === active.id);
    const newIndex = items.findIndex((it) => getId(it) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={items.map(getId)}
        strategy={verticalListSortingStrategy}
      >
        <div className={className}>
          {items.map((item, index) => (
            <SortableRow key={getId(item)} id={getId(item)} index={index}>
              {(ctx) => children(item, ctx)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  index,
  children,
}: {
  id: string;
  index: number;
  children: (ctx: {
    index: number;
    isDragging: boolean;
    dragHandleProps: DragHandleProps;
  }) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "relative z-10" : undefined}
    >
      {children({
        index,
        isDragging,
        dragHandleProps: { attributes, listeners },
      })}
    </div>
  );
}
