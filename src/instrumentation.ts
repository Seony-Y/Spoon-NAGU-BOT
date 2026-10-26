export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs"
    && process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { restoreEnabledBots, shutdownBots } = await import("./lib/bot-runtime");
    const { checkpointDatabase, getDatabasePath, isDatabaseOnPersistentVolume } = await import("./lib/session-store");
    // Where the data lives, for the deploy logs (paths only, no secrets).
    console.log(`[storage] database=${getDatabasePath()} volume=${process.env.RAILWAY_VOLUME_MOUNT_PATH ?? "(none)"} persistent=${isDatabaseOnPersistentVolume()}`);
    if (isDatabaseOnPersistentVolume() === false) {
      const { sendAlert } = await import("./lib/alerts");
      sendAlert("storage", `DB(${getDatabasePath()})가 Railway 볼륨에 있지 않아 배포할 때마다 로그인과 모든 데이터가 초기화됩니다. 서비스에 볼륨을 연결하고 마운트 경로를 DB 경로(기본 /data)와 맞춰 주세요.`);
    }
    // Login attempts are limited per client and in total, so a short code or
    // password can still be guessed over days. Warned, not enforced, so a
    // short value already in use does not lock everyone out on deploy.
    const weakSecrets = (["ACCESS_CODE", "ADMIN_PASSWORD"] as const)
      .filter((name) => {
        const value = process.env[name]?.trim();
        return value && value.length < 16;
      });
    if (weakSecrets.length > 0) {
      const { sendAlert } = await import("./lib/alerts");
      sendAlert("weak-secret", `${weakSecrets.join(", ")}이(가) 16자보다 짧아 추측당할 수 있습니다. 16자 이상의 무작위 값으로 바꿔 주세요.`);
    }
    restoreEnabledBots();
    const { startMaintenance } = await import("./lib/maintenance");
    startMaintenance();
    const { startMetrics } = await import("./lib/metrics");
    startMetrics();
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