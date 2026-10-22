export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs"
    && process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { restoreEnabledBots, shutdownBots } = await import("./lib/bot-runtime");
    const { checkpointDatabase } = await import("./lib/session-store");
    restoreEnabledBots();
    const { startMaintenance } = await import("./lib/maintenance");
    startMaintenance();
    // Next handles these signals and exits soon after; this runs alongside it
    // as a best effort, so it must stay synchronous.
    const onShutdown = () => {
      shutdownBots();
      checkpointDatabase();
    };
    process.once("SIGTERM", onShutdown);
    process.once("SIGINT", onShutdown);
  }
}