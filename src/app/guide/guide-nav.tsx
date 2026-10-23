"use client";

import { useEffect } from "react";

const SECTIONS = [
  ["getting-started", "시작하기"],
  ["commands", "명령어"],
  ["dashboard", "대시보드"],
  ["bot-operations", "봇 운영"],
  ["game", "게임"],
  ["data", "데이터·연결 해제"],
] as const;

// Jumping to a closed <details> only shows its header, so open it first.
function openSection(id: string) {
  const target = document.getElementById(id);
  if (target instanceof HTMLDetailsElement) target.open = true;
}

export function GuideNav() {
  useEffect(() => {
    const openFromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      openSection(id);
      document.getElementById(id)?.scrollIntoView();
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  return (
    <nav className="guide-nav" aria-label="사용 방법 메뉴">
      {SECTIONS.map(([id, label]) => (
        <a key={id} href={`#${id}`} onClick={() => openSection(id)}>{label}</a>
      ))}
    </nav>
  );
}
