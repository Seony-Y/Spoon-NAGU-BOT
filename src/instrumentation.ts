export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs"
    && process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { restoreEnabledBots } = await import("./lib/bot-runtime");
    restoreEnabledBots();
  }
}