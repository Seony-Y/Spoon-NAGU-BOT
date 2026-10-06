import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import {
  deleteRouletteKeeps,
  deleteRouletteDistributionItem,
  getRouletteSettings,
  updateRouletteDistribution,
  updateRouletteKeeps,
  updateRouletteSettings,
} from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

function parsePercentage(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/u.test(text)) return null;
  const percentage = Math.round(Number(text) * 100);
  return Number.isSafeInteger(percentage) && percentage >= 0 && percentage <= 10_000
    ? percentage
    : null;
}

function redirect(request: NextRequest, status: string) {
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "game");
  target.searchParams.set("game", "roulette");
  target.searchParams.set("roulette", status);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) return redirect(request, "authentication_required");

  const formData = await request.formData();
  const action = String(formData.get("action") ?? "");
  const deleteId = formData.get("deleteId");

  if (action === "keeps") {
    const operation = String(formData.get("operation") ?? "");
    const selections = formData.getAll(operation === "delete" ? "selection" : "item").map(String);
    if (
      !["update", "delete"].includes(operation)
      || selections.length === 0
      || new Set(selections).size !== selections.length
      || selections.some((selection) => !/^\d+$/u.test(selection))
    ) {
      return redirect(request, "invalid_keeps");
    }
    const items = selections.map((selection) => ({
      userId: String(formData.get(`userId:${selection}`) ?? ""),
      itemLabel: String(formData.get(`itemLabel:${selection}`) ?? ""),
      count: Number(formData.get(`count:${selection}`)),
    }));
    if (operation === "delete") {
      return redirect(request, deleteRouletteKeeps(sessionId, items)
        ? "keeps_deleted"
        : "invalid_keeps");
    }
    return redirect(request, updateRouletteKeeps(sessionId, items)
      ? "keeps_updated"
      : "invalid_keeps");
  }

  if (deleteId !== null) {
    const id = Number(deleteId);
    if (!Number.isSafeInteger(id) || id < 1) return redirect(request, "invalid_distribution");
    return redirect(request, deleteRouletteDistributionItem(sessionId, id)
      ? "item_deleted"
      : "invalid_distribution");
  }

  if (action === "settings") {
    const cost = Number(formData.get("cost"));
    if (
      !Number.isSafeInteger(cost)
      || cost < 1
      || cost > 1_000_000
    ) {
      return redirect(request, "invalid_settings");
    }
    const current = getRouletteSettings(sessionId);
    updateRouletteSettings(sessionId, {
      enabled: formData.get("enabled") === "on",
      cost,
      missWeight: current.missWeight,
    });
    return redirect(request, "settings_saved");
  }

  if (action === "distribution") {
    const labels = formData.getAll("label").map((value) => String(value).trim());
    const percentages = formData.getAll("percentage");
    const removed = new Set(formData.getAll("remove").map(String));
    if (labels.length !== percentages.length) {
      return redirect(request, "invalid_distribution");
    }

    const items: Array<{ label: string; percentage: number }> = [];
    for (let index = 0; index < labels.length; index += 1) {
      if (removed.has(String(index))) continue;
      const label = labels[index];
      const percentage = parsePercentage(percentages[index]);
      if (!label && String(percentages[index]).trim() === "") continue;
      if (!label || percentage === null || percentage === 0) {
        return redirect(request, "invalid_distribution");
      }
      items.push({ label, percentage });
    }
    const prizePercentage = items.reduce((total, item) => total + item.percentage, 0);
    if (prizePercentage > 10_000) return redirect(request, "invalid_distribution");
    return redirect(request, updateRouletteDistribution(sessionId, 10_000 - prizePercentage, items)
      ? "distribution_saved"
      : "invalid_distribution");
  }

  return redirect(request, "invalid_action");
}
