"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import refreshIcon from "@/asset/icon-refresh.svg";

export function RefreshLiveButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className={`refresh-live-icon ${isPending ? "is-loading" : ""}`}
      type="button"
      aria-label={isPending ? "방송 상태 새로고침 중" : "방송 상태 새로고침"}
      title="방송 상태 새로고침"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <Image src={refreshIcon} alt="" aria-hidden="true" />
    </button>
  );
}