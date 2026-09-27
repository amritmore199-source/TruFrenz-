/**
 * Automatic restore.
 *
 * A subscription is bought once and then outlives the app install. The store
 * keeps it against the member's Play or Apple account, so after a reinstall the
 * store still knows about it — but the app has to ask. Until now that was a
 * manual step ("Restore purchases") buried in Manage Subscription, which meant a
 * member who reinstalled could sit on the free plan while paying for Premium and
 * have no idea why. That is the worst kind of failure: silent, and the member's
 * own money.
 *
 * This module decides whether to reconcile the store's purchase history against
 * what the server already has, and what (if anything) to tell the member.
 *
 * ## Why the trigger is the store, not a cached plan
 *
 * The obvious-looking trigger — "Premium is cached locally but the server has no
 * receipt" — does not actually work, for two reasons:
 *
 * 1. A reinstall wipes local storage, so that cached Premium is exactly what is
 *    gone. The condition cannot fire in the case it is meant to catch.
 * 2. It also fires after a legitimate lapse: a refund, an expiry, or a
 *    cancellation that has run out. Auto-restoring on that basis would nag a
 *    member whose subscription really did end.
 *
 * What *does* survive a reinstall is the store's own purchase history, which is
 * tied to the store account rather than to the app. So the trigger is a mismatch
 * between the two authorities: the store reports a purchase the server has no
 * record of, or the store reports one while the server thinks the member is
 * free. That is unambiguous, and it is silent when there is nothing to fix.
 *
 * Everything here is pure. The store and server calls live in the app screen.
 */

/** What the store and the server each say about this member's subscription. */
export type RestoreSignal = {
  /** Purchases the store reports for this account, from `getAvailablePurchases`. */
  storePurchaseCount: number;
  /** Receipts the server already has on file for this member. */
  serverReceiptCount: number;
  /** The tier the server currently grants. */
  serverTier: "free" | "premium";
  /** Whether a store SDK exists on this platform at all. */
  storeAvailable: boolean;
};

export type AutoRestoreDecision =
  | { action: "skip"; reason: "no-store" | "nothing-in-store" | "already-consistent" | "already-premium" }
  | { action: "restore"; reason: "server-has-no-receipt" | "server-has-not-caught-up" };

/**
 * Decide whether to reconcile.
 *
 * Deliberately conservative: it only acts when the store is present and reports
 * at least one purchase, which is the only situation where asking can change
 * anything. A member with no store purchases and a free tier is the ordinary
 * free member, and must never see a spinner or a prompt.
 */
export function decideAutoRestore(signal: RestoreSignal): AutoRestoreDecision {
  if (!signal.storeAvailable) return { action: "skip", reason: "no-store" };
  if (signal.storePurchaseCount <= 0) return { action: "skip", reason: "nothing-in-store" };

  // The server already grants Premium from a receipt it verified. A restore
  // would either duplicate the receipt or, worse, replace a good one.
  if (signal.serverTier === "premium") return { action: "skip", reason: "already-premium" };

  // The store holds a purchase the server has never seen. This is the reinstall
  // case, and the one where the member is paying for nothing.
  if (signal.serverReceiptCount === 0) {
    return { action: "restore", reason: "server-has-no-receipt" };
  }

  // The server has receipts but grants free: either they lapsed, or a renewal
  // happened that verification has not caught up with. The store is the tie-
  // breaker, so let it be checked.
  return { action: "restore", reason: "server-has-not-caught-up" };
}

export type AutoRestoreOutcome =
  | { kind: "restored"; planId: string; title: string; body: string }
  | { kind: "failed"; title: string; body: string }
  | { kind: "nothing"; silent: true };

/**
 * What to say afterwards.
 *
 * Only a real recovery is announced. A check that found nothing is silent,
 * because the member has no context for it: they did not press anything, so a
 * message reading "we looked and found nothing" is noise that reads like bad
 * news. A failure is announced only when the check *would* have helped, which
 * the caller knows from having had a store purchase in hand.
 */
export function autoRestoreOutcome(
  decision: AutoRestoreDecision,
  result: { ok: boolean; restored: boolean; planId?: string | null },
): AutoRestoreOutcome {
  if (decision.action === "skip") return { kind: "nothing", silent: true };

  if (!result.ok) {
    return {
      kind: "failed",
      title: "We could not check your subscription",
      body:
        "Your store still shows a Trufrenz subscription, but we could not reach the store to confirm it just now. " +
        "Open Manage Subscription and tap Restore purchases, or try again on a better connection.",
    };
  }

  if (!result.restored || !result.planId) {
    // The store had something but the server would not honour it — most often an
    // expired or refunded purchase the store still lists. Staying quiet is
    // correct: the member's access did not change, and a notice here would be
    // alarming without being actionable.
    return { kind: "nothing", silent: true };
  }

  return {
    kind: "restored",
    planId: result.planId,
    title: "Your Premium is back",
    body:
      "We found your Trufrenz subscription in your store account and turned Premium back on for this device. " +
      "Everything you had — calling, the live map, and unlimited proposals — is available again.",
  };
}

/**
 * The once-per-install guard.
 *
 * The check costs a store round-trip, so it runs at most once per stored session
 * token rather than on every launch. Keying it to the session means a member who
 * signs into a *different* account on the same device is checked again, which is
 * exactly the case where the server may be missing a receipt.
 */
export const AUTO_RESTORE_KEY_PREFIX = "trufrenz.auto-restore.v1.";

export function autoRestoreKey(sessionToken: string | null | undefined): string {
  return `${AUTO_RESTORE_KEY_PREFIX}${sessionToken?.trim() || "anonymous"}`;
}

export function shouldAttemptAutoRestore(
  decision: AutoRestoreDecision,
  alreadyAttemptedFor: string | null,
): boolean {
  if (decision.action !== "restore") return false;
  return alreadyAttemptedFor === null;
}