"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

const ACTION_PATH = /^\/(bot|game|remote)\//;

// Dashboard and remote forms post to route handlers that answer with a 303 back
// to the page. Submitted natively, that reloads the whole page at the top. This
// posts them with fetch instead and moves to the redirect target with the
// router, so the page keeps its scroll position and only the content updates.
export function FormNavigation() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const submitted = useRef<HTMLFormElement | null>(null);

  // Clear the form once the new page is in, like a reload did (added quiz
  // questions, chat messages, chosen files). Fields keep the saved defaults.
  useEffect(() => {
    if (isPending || !submitted.current) return;
    submitted.current.reset();
    submitted.current = null;
  }, [isPending]);

  useEffect(() => {
    const inFlight = new WeakSet<HTMLFormElement>();
    const onSubmit = async (event: SubmitEvent) => {
      const form = event.target;
      if (event.defaultPrevented || !(form instanceof HTMLFormElement)) return;
      // Read the attributes: a field named "action" shadows form.action.
      if (form.getAttribute("method")?.toLowerCase() !== "post") return;
      const action = new URL(form.getAttribute("action") ?? "", window.location.href);
      if (action.origin !== window.location.origin || !ACTION_PATH.test(action.pathname)) return;
      event.preventDefault();
      if (inFlight.has(form)) return;
      inFlight.add(form);
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
        submitted.current = form;
        startTransition(() => router.replace(`${target.pathname}${target.search}${target.hash}`, { scroll: false }));
      } catch {
        // The action may have run before the redirect failed; show the result.
        window.location.reload();
      } finally {
        inFlight.delete(form);
        form.removeAttribute("aria-busy");
      }
    };
    document.addEventListener("submit", onSubmit);
    return () => document.removeEventListener("submit", onSubmit);
  }, [router]);

  return null;
}
