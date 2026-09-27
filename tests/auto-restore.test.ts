import { describe, expect, it } from "vitest";

import {
  AUTO_RESTORE_KEY_PREFIX,
  autoRestoreKey,
  autoRestoreOutcome,
  decideAutoRestore,
  shouldAttemptAutoRestore,
  type RestoreSignal,
} from "../lib/auto-restore";

const base: RestoreSignal = {
  storePurchaseCount: 1,
  serverReceiptCount: 0,
  serverTier: "free",
  storeAvailable: true,
};

describe("auto-restore decision", () => {
  it("restores when the store holds a purchase the server never saw", () => {
    // This is the reinstall case: local storage is gone, the store still knows
    // about the subscription, and the member is paying for nothing.
    expect(decideAutoRestore(base)).toEqual({ action: "restore", reason: "server-has-no-receipt" });
  });

  it("restores when the server has receipts but still grants free", () => {
    // A renewal that verification has not caught up with, or a lapsed period the
    // store has since extended. The store is the tie-breaker.
    expect(decideAutoRestore({ ...base, serverReceiptCount: 2 })).toEqual({
      action: "restore",
      reason: "server-has-not-caught-up",
    });
  });

  it("does nothing at all without a store", () => {
    expect(decideAutoRestore({ ...base, storeAvailable: false })).toEqual({ action: "skip", reason: "no-store" });
  });

  it("does nothing when the store reports no purchase", () => {
    // An ordinary free member. They must never see a spinner or a prompt for a
    // subscription they do not have.
    expect(decideAutoRestore({ ...base, storePurchaseCount: 0 })).toEqual({
      action: "skip",
      reason: "nothing-in-store",
    });
  });

  it("never replaces an entitlement the server already granted", () => {
    expect(decideAutoRestore({ ...base, serverTier: "premium", serverReceiptCount: 1 })).toEqual({
      action: "skip",
      reason: "already-premium",
    });
    // Even with several store purchases in play: restoring would risk writing a
    // duplicate receipt over a good one.
    expect(decideAutoRestore({ storePurchaseCount: 3, serverReceiptCount: 1, serverTier: "premium", storeAvailable: true }).action).toBe(
      "skip",
    );
  });

  it("does not react to a legitimate lapse", () => {
    // A refunded or expired subscription the store still lists, on a server that
    // has the receipt and grants free. This is the case that would make a
    // cache-based trigger nag a member whose plan really did end, so it is worth
    // pinning: the decision is to restore, and the server then decides.
    const decision = decideAutoRestore({ ...base, serverReceiptCount: 1, serverTier: "free" });
    expect(decision.action).toBe("restore");
    // The outcome for a store purchase the server will not honour stays silent.
    expect(
      autoRestoreOutcome(decision, { ok: true, restored: false, planId: null }),
    ).toEqual({ kind: "nothing", silent: true });
  });
});

describe("auto-restore outcomes", () => {
  const restore = { action: "restore", reason: "server-has-no-receipt" } as const;

  it("announces a real recovery", () => {
    const outcome = autoRestoreOutcome(restore, { ok: true, restored: true, planId: "quarterly" });
    expect(outcome.kind).toBe("restored");
    if (outcome.kind !== "restored") throw new Error("expected a restore");
    expect(outcome.title).toMatch(/Premium is back/i);
    expect(outcome.body).toMatch(/store account/i);
  });

  it("explains a failure, because this member is paying for nothing", () => {
    const outcome = autoRestoreOutcome(restore, { ok: false, restored: false });
    expect(outcome.kind).toBe("failed");
    if (outcome.kind !== "failed") throw new Error("expected a failure");
    // The copy has to name the fallback, or the member is left with a dead end.
    expect(outcome.body).toMatch(/Restore purchases/i);
  });

  it("stays silent when the check found nothing to do", () => {
    expect(autoRestoreOutcome({ action: "skip", reason: "nothing-in-store" }, { ok: true, restored: false })).toEqual({
      kind: "nothing",
      silent: true,
    });
    // A store purchase the server refuses is also silent: access did not change,
    // so a notice would alarm without being actionable.
    expect(autoRestoreOutcome(restore, { ok: true, restored: false })).toEqual({ kind: "nothing", silent: true });
  });

  it("stays silent when the server reported success but no plan", () => {
    expect(autoRestoreOutcome(restore, { ok: true, restored: true, planId: null })).toEqual({
      kind: "nothing",
      silent: true,
    });
  });
});

describe("auto-restore once-per-session guard", () => {
  it("keys to the session, so a different account is checked again", () => {
    // Signing into another account on the same device is exactly the case where
    // the server may be missing a receipt.
    expect(autoRestoreKey("session-a")).not.toBe(autoRestoreKey("session-b"));
    expect(autoRestoreKey("session-a")).toBe(`${AUTO_RESTORE_KEY_PREFIX}session-a`);
  });

  it("falls back to a stable key when the session has no token", () => {
    expect(autoRestoreKey(null)).toBe(`${AUTO_RESTORE_KEY_PREFIX}anonymous`);
    expect(autoRestoreKey("   ")).toBe(`${AUTO_RESTORE_KEY_PREFIX}anonymous`);
  });

  it("attempts only once, and only when there is something to restore", () => {
    const restore = { action: "restore", reason: "server-has-no-receipt" } as const;
    expect(shouldAttemptAutoRestore(restore, null)).toBe(true);
    expect(shouldAttemptAutoRestore(restore, "1758000000000")).toBe(false);
    // A skip is never attempted, so an ordinary free member makes no store call.
    expect(shouldAttemptAutoRestore({ action: "skip", reason: "nothing-in-store" }, null)).toBe(false);
  });
});