'use client';

import { useRef } from 'react';

export function ExploreSplitDivider({
  width,
  min,
  max,
  onChange,
}: {
  width: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
}) {
  const start = useRef({ x: 0, width: 0 });
  return (
    <div
      role="separator"
      aria-label="Resize event list"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      className="group flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center focus-visible:outline-2 focus-visible:outline-black"
      onPointerDown={(event) => {
        start.current = { x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          onChange(
            Math.min(
              max,
              Math.max(
                min,
                start.current.width + event.clientX - start.current.x,
              ),
            ),
          );
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          onChange(
            Math.min(
              max,
              Math.max(min, width + (event.key === 'ArrowLeft' ? -16 : 16)),
            ),
          );
        }
      }}
    >
      <span className="h-12 w-1 rounded-full bg-neutral-300 group-hover:bg-neutral-500" />
    </div>
  );
}
