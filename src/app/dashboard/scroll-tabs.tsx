"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

// One row of underlined tabs. When they do not fit (phones), the row scrolls
// sideways and ‹ › buttons appear on the side that has more tabs.
export function ScrollTabs({ label, children }: { label: string; children: ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const update = () => setMore({
      left: row.scrollLeft > 1,
      right: row.scrollLeft + row.clientWidth < row.scrollWidth - 1,
    });
    // The selected tab starts in view.
    const active = row.querySelector<HTMLElement>(".is-active");
    if (active) row.scrollLeft = Math.max(0, active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2);
    update();
    row.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(row);
    return () => {
      row.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const scrollBy = (direction: -1 | 1) => {
    const row = rowRef.current;
    row?.scrollBy({ left: direction * row.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <nav className="game-tabs" aria-label={label}>
      {more.left && <button type="button" className="game-tabs-arrow is-left" aria-label="이전 탭 보기" onClick={() => scrollBy(-1)}>‹</button>}
      <div className="game-tabs-row" ref={rowRef}>{children}</div>
      {more.right && <button type="button" className="game-tabs-arrow is-right" aria-label="다음 탭 보기" onClick={() => scrollBy(1)}>›</button>}
    </nav>
  );
}
