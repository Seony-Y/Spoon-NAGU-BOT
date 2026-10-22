"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Result notices travel in the URL (?rps=started). Pages auto-refresh every few
// seconds, so without this a "started" notice would stay up long after the game
// ended. Drops those keys from the URL a few seconds after they are shown.
export function ClearStatusParams({ keys, delayMs = 5000 }: { keys: string; delayMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      let changed = false;
      for (const key of keys.split(" ")) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (changed) router.replace(`${url.pathname}${url.search}`, { scroll: false });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [keys, delayMs, router]);

  return null;
}
