"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import refreshIcon from "@/asset/icon-refresh.svg";

type RefreshButtonProps = {
  label: string;
  iconOnly?: boolean;
};

export function RefreshButton({ label, iconOnly = false }: RefreshButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [minimumSpin, setMinimumSpin] = useState(false);
  const spinTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (spinTimer.current !== null) window.clearTimeout(spinTimer.current);
    };
  }, []);

  const isLoading = isPending || minimumSpin;
  const buttonLabel = `${label} 새로고침`;

  return (
    <button
      className={`${iconOnly ? "refresh-live-icon" : "refresh-text-button"} ${isLoading ? "is-loading" : ""}`}
      type="button"
      aria-label={buttonLabel}
      title={buttonLabel}
      disabled={isLoading}
      onClick={() => {
        if (spinTimer.current !== null) window.clearTimeout(spinTimer.current);
        setMinimumSpin(true);
        spinTimer.current = window.setTimeout(() => {
          setMinimumSpin(false);
          spinTimer.current = null;
        }, 700);
        startTransition(() => router.refresh());
      }}
    >
      <Image src={refreshIcon} alt="" aria-hidden="true" />
      {!iconOnly && <span>{buttonLabel}</span>}
    </button>
  );
}

export function RefreshLiveButton() {
  return <RefreshButton label="방송 상태" iconOnly />;
}

export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, router]);

  return null;
}