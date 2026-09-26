/**
 * The receipt revalidation job.
 *
 * Entitlements are derived from unexpired receipts, so a member whose payment
 * fails keeps Premium only until the period they paid for ends — but the cached
 * `members.subscriptionTier` column would still say premium until something
 * re-checks it. This job does that re-checking on a schedule instead of waiting
 * for the member to open the management screen.
 *
 * It is a plain interval rather than a cron dependency: one process, one timer,
 * no extra moving parts. `revalidateDueReceipts()` already skips anything
 * verified in the last day, so a restart or a missed tick is harmless.
 */

import { revalidateDueReceipts } from "./billingService";

/** How often to look for receipts that need re-checking. */
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

/** Delay before the first run, so boot and seeding finish first. */
const DEFAULT_START_DELAY_MS = 90 * 1000; // 90 seconds

/**
 * The timer handle is `Timeout` in Node and `number` in the React Native
 * typings this project also compiles against, so it is kept opaque here.
 */
type TimerHandle = ReturnType<typeof setTimeout>;

let timer: TimerHandle | null = null;
let firstRun: TimerHandle | null = null;

/** Node timers keep the process alive unless released; this job never should. */
function release(timerRef: TimerHandle | null): void {
  const maybeUnref = (timerRef as { unref?: () => void } | null)?.unref;
  if (typeof maybeUnref === "function") maybeUnref.call(timerRef);
}

/** One pass, with failures contained so the job can never take the server down. */
export async function runRevalidationPass(limit = 50): Promise<{ checked: number; lapsed: number }> {
  try {
    const result = await revalidateDueReceipts(limit);
    if (result.checked > 0) {
      console.log(
        `[billing] revalidated ${result.checked} receipt${result.checked === 1 ? "" : "s"}` +
          (result.lapsed > 0 ? `, ${result.lapsed} lapsed to free` : ""),
      );
    }
    return result;
  } catch (error) {
    console.error("[billing] revalidation pass failed", error);
    return { checked: 0, lapsed: 0 };
  }
}

/**
 * Start the schedule. Safe to call more than once — the second call is a no-op.
 *
 * Set `BILLING_REVALIDATE_INTERVAL_MS=0` to disable the job (useful in tests and
 * in local runs where you do not want background database traffic).
 */
export function startRevalidationJob(options?: {
  intervalMs?: number;
  startDelayMs?: number;
  limit?: number;
}): boolean {
  if (timer || firstRun) return false;

  /*
   * An unset variable must mean "use the default", not zero — `Number("")` is 0,
   * which would silently disable the job on every normal boot.
   */
  const raw = process.env.BILLING_REVALIDATE_INTERVAL_MS;
  const configured = raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
  const intervalMs =
    options?.intervalMs ?? (Number.isFinite(configured) ? configured : DEFAULT_INTERVAL_MS);
  if (intervalMs <= 0) {
    console.log("[billing] receipt revalidation disabled");
    return false;
  }

  const startDelayMs = options?.startDelayMs ?? DEFAULT_START_DELAY_MS;
  const limit = options?.limit ?? 50;

  firstRun = setTimeout(() => {
    firstRun = null;
    void runRevalidationPass(limit);
    timer = setInterval(() => {
      void runRevalidationPass(limit);
    }, intervalMs);
    release(timer);
  }, startDelayMs);
  release(firstRun);

  const minutes = Math.round(intervalMs / 60000);
  console.log(`[billing] receipt revalidation every ${minutes} minute${minutes === 1 ? "" : "s"}`);
  return true;
}

/** Stop the schedule. Used by tests and by a clean shutdown. */
export function stopRevalidationJob(): void {
  if (firstRun) {
    clearTimeout(firstRun);
    firstRun = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
