"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type AutomationFeature = "welcome" | "donation" | "heart" | "repeat";

export function AutomationToggle({
  feature,
  initialEnabled,
  label,
}: {
  feature: AutomationFeature;
  initialEnabled: boolean;
  label: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  const toggle = async () => {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/bot/settings", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          mode: "automation_toggle",
          feature,
          enabled: String(nextEnabled),
        }),
      });
      if (!response.ok) throw new Error("toggle_failed");
      startTransition(() => router.refresh());
    } catch {
      setEnabled(!nextEnabled);
      setError("설정을 반영하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="automation-toggle-row">
      <span>{label}</span>
      <button
        className={`automation-toggle${enabled ? " is-enabled" : ""}`}
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label} ${enabled ? "끄기" : "켜기"}`}
        disabled={isSaving || isPending}
        onClick={toggle}
      >
        <span aria-hidden="true" />
        <strong>{enabled ? "ON" : "OFF"}</strong>
      </button>
      <small role="status" aria-live="polite">{error || (isSaving || isPending ? "반영 중" : "")}</small>
    </div>
  );
}
