import { refreshStatsCache } from "./lib/stats";

const configuredInterval = Number(process.env.STATS_REFRESH_INTERVAL_MS);
const refreshInterval = Number.isFinite(configuredInterval)
  ? Math.max(60_000, configuredInterval)
  : 15 * 60_000;
let running = true;
let wake: (() => void) | undefined;

const stop = () => {
  running = false;
  wake?.();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const wait = (duration: number) =>
  new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, duration);
    wake = () => {
      clearTimeout(timeout);
      resolve();
    };
  });

while (running) {
  const startedAt = Date.now();
  try {
    const refreshed = await refreshStatsCache();
    console.log(
      `Refreshed ${refreshed} statistics cache entries in ${Date.now() - startedAt}ms`,
    );
  } catch (cause) {
    console.error("Failed to refresh statistics cache", cause);
  }

  if (running) await wait(refreshInterval);
}
