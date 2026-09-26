import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The job talks to the database through `revalidateDueReceipts`, so that is
 * stubbed here: what matters is that the schedule starts once, runs on the
 * interval, and can be switched off.
 */
const passes: number[] = [];
vi.mock("../server/billingService", () => ({
  revalidateDueReceipts: vi.fn(async (limit: number) => {
    passes.push(limit);
    return { checked: limit > 10 ? 3 : 0, lapsed: limit > 10 ? 1 : 0 };
  }),
}));

const { runRevalidationPass, startRevalidationJob, stopRevalidationJob } = await import(
  "../server/revalidationJob"
);

afterEach(() => {
  stopRevalidationJob();
  passes.length = 0;
  delete process.env.BILLING_REVALIDATE_INTERVAL_MS;
});

describe("receipt revalidation job", () => {
  it("reports what a pass checked and lapsed", async () => {
    const result = await runRevalidationPass(25);
    expect(result).toEqual({ checked: 3, lapsed: 1 });
    expect(passes).toEqual([25]);
  });

  it("contains a failing pass instead of throwing", async () => {
    const billing = await import("../server/billingService");
    const spy = vi
      .spyOn(billing, "revalidateDueReceipts")
      .mockRejectedValueOnce(new Error("database is down"));

    await expect(runRevalidationPass(5)).resolves.toEqual({ checked: 0, lapsed: 0 });
    spy.mockRestore();
  });

  it("starts once and ignores a second call", () => {
    expect(startRevalidationJob({ intervalMs: 60_000, startDelayMs: 5 })).toBe(true);
    expect(startRevalidationJob({ intervalMs: 60_000, startDelayMs: 5 })).toBe(false);
  });

  it("can be disabled, which is what tests and quiet local runs want", () => {
    expect(startRevalidationJob({ intervalMs: 0 })).toBe(false);
  });

  it("uses the default interval when the variable is not set at all", () => {
    // Regression: Number("") is 0, which would silently disable the job on a
    // normal boot. An absent variable must mean "default", not "off".
    delete process.env.BILLING_REVALIDATE_INTERVAL_MS;
    expect(startRevalidationJob({ startDelayMs: 5 })).toBe(true);

    process.env.BILLING_REVALIDATE_INTERVAL_MS = "";
    stopRevalidationJob();
    expect(startRevalidationJob({ startDelayMs: 5 })).toBe(true);
  });

  it("honours the interval environment variable", () => {
    process.env.BILLING_REVALIDATE_INTERVAL_MS = "0";
    expect(startRevalidationJob()).toBe(false);

    process.env.BILLING_REVALIDATE_INTERVAL_MS = "900000";
    expect(startRevalidationJob()).toBe(true);
  });

  it("runs a pass after the start delay, then keeps to the interval", async () => {
    vi.useFakeTimers();
    try {
      startRevalidationJob({ intervalMs: 1_000, startDelayMs: 100, limit: 7 });

      expect(passes).toEqual([]);
      await vi.advanceTimersByTimeAsync(100);
      expect(passes).toEqual([7]);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(passes).toEqual([7, 7]);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(passes).toEqual([7, 7, 7, 7]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops cleanly so no pass fires afterwards", async () => {
    vi.useFakeTimers();
    try {
      startRevalidationJob({ intervalMs: 500, startDelayMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      expect(passes.length).toBe(1);

      stopRevalidationJob();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(passes.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
