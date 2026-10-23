"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ACTION_PATH = /^\/(bot|game|remote)\//;
// Search param that changes on every form navigation. Pages key their content
// on it (app/page.tsx, app/remote/page.tsx), so the content remounts together
// with the new data.
const FORM_NAVIGATION_PARAM = "fn";

// Dashboard and remote forms post to route handlers that answer with a 303 back
// to the page. Submitted natively, that reloads the whole page at the top. This
// posts them with fetch instead and moves to the redirect target with the
// router, so the page keeps its scroll position.
//
// A reload also gave every form and client component a fresh start (cleared
// inputs, selects showing the saved values, editors seeded from the new data),
// which the router alone would keep. The changing `fn` param keys the page
// content, so it is remounted with the new data like after a reload.
export function FormNavigation() {
  const router = useRouter();

  useEffect(() => {
    // From submit until the new page is in: further submits are ignored.
    let busy = false;
    let navigation = 0;
    const onSubmit = async (event: SubmitEvent) => {
      const form = event.target;
      if (event.defaultPrevented || !(form instanceof HTMLFormElement)) return;
      // Read the attributes: a field named "action" shadows form.action.
      if (form.getAttribute("method")?.toLowerCase() !== "post") return;
      const action = new URL(form.getAttribute("action") ?? "", window.location.href);
      if (action.origin !== window.location.origin || !ACTION_PATH.test(action.pathname)) return;
      event.preventDefault();
      if (busy) return;
      busy = true;
      form.setAttribute("aria-busy", "true");
      try {
        const response = await fetch(action, {
          method: "POST",
          body: new FormData(form, event.submitter),
          headers: { "x-nagu-form-navigation": "1" },
        });
        const target = new URL(response.url);
        if (!response.redirected || target.origin !== window.location.origin) {
          window.location.reload();
          return;
        }
        if (document.activeElement instanceof HTMLElement && form.contains(document.activeElement)) {
          document.activeElement.blur();
        }
        navigation += 1;
        const marker = `${Date.now().toString(36)}${navigation}`;
        target.searchParams.set(FORM_NAVIGATION_PARAM, marker);
        router.replace(`${target.pathname}${target.search}${target.hash}`, { scroll: false });
        await waitFor(() => new URLSearchParams(window.location.search).get(FORM_NAVIGATION_PARAM) === marker, 10_000);
      } catch {
        // The action may have run before the redirect failed; show the result.
        window.location.reload();
      } finally {
        form.removeAttribute("aria-busy");
        busy = false;
      }
    };
    document.addEventListener("submit", onSubmit);
    return () => document.removeEventListener("submit", onSubmit);
  }, [router]);

  return null;
}

function waitFor(condition: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  return new Promise<void>((resolve) => {
    const check = () => (condition() || Date.now() > deadline ? resolve() : window.setTimeout(check, 50));
    check();
  });
}
