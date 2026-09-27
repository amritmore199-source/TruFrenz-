import { describe, expect, it } from "vitest";
import {
  REMINDER_HORIZON_MS,
  reminderKindFor,
  renewalDate,
  renewalReminderCopy,
  windowLabel,
  type ReminderKind,
} from "../lib/renewal-reminders";

const DAY = 24 * 60 * 60 * 1000;
/** A fixed instant, so every boundary assertion is exact rather than approximate. */
const NOW = new Date("2026-09-27T12:00:00.000Z");

/** A date exactly `days` (optionally fractional) away from NOW. */
function inDays(days: number): Date {
  return new Date(NOW.getTime() + days * DAY);
}

describe("renewal reminder windows", () => {
  it("says nothing while the period is more than a week out", () => {
    expect(reminderKindFor(inDays(8), NOW)).toBeNull();
    expect(reminderKindFor(inDays(30), NOW)).toBeNull();
    // Just outside the window: 7 days and one millisecond.
    expect(reminderKindFor(new Date(inDays(7).getTime() + 1), NOW)).toBeNull();
  });

  it("uses the seven-day window at its exact boundary", () => {
    expect(reminderKindFor(inDays(7), NOW)).toBe("7d");
    expect(reminderKindFor(new Date(inDays(7).getTime() - 1), NOW)).toBe("7d");
  });

  it("uses the three-day window at its exact boundary", () => {
    expect(reminderKindFor(inDays(3), NOW)).toBe("3d");
    expect(reminderKindFor(new Date(inDays(3).getTime() - 1), NOW)).toBe("3d");
  });

  it("uses the one-day window at its exact boundary", () => {
    expect(reminderKindFor(inDays(1), NOW)).toBe("1d");
    expect(reminderKindFor(inDays(0.5), NOW)).toBe("1d");
  });

  it("reports the nearest window, so a missed run cannot dump three notices", () => {
    // Two days left is past the 7- and 3-day windows; the member should hear
    // "3 days" once, not "7 days", "3 days", and "1 day" back to back.
    expect(reminderKindFor(inDays(2), NOW)).toBe("3d");
    expect(reminderKindFor(inDays(6), NOW)).toBe("7d");
    expect(reminderKindFor(inDays(0.01), NOW)).toBe("1d");
  });

  it("reports expiry once the period has ended", () => {
    expect(reminderKindFor(NOW, NOW)).toBe("expired");
    expect(reminderKindFor(inDays(-0.001), NOW)).toBe("expired");
    expect(reminderKindFor(inDays(-9), NOW)).toBe("expired");
  });

  it("ignores an unreadable expiry rather than guessing", () => {
    expect(reminderKindFor(new Date("not a date"), NOW)).toBeNull();
    expect(reminderKindFor(new Date(Number.NaN), NOW)).toBeNull();
  });

  it("exposes a horizon that matches the widest window", () => {
    expect(REMINDER_HORIZON_MS).toBe(7 * DAY);
  });
});

describe("renewal reminder copy", () => {
  const base = {
    planLabel: "Quarterly",
    renewsOn: new Date("2026-10-04T12:00:00.000Z"),
    chargeInr: 139,
  };

  it("reassures an auto-renewing member that nothing is needed", () => {
    const copy = renewalReminderCopy({ ...base, kind: "3d", autoRenewing: true });
    expect(copy.title).toBe("Premium renews in 3 days");
    expect(copy.body).toContain("nothing you need to do");
    expect(copy.body).toContain("₹139");
  });

  it("warns a cancelled member that access really will stop", () => {
    const copy = renewalReminderCopy({ ...base, kind: "3d", autoRenewing: false });
    expect(copy.title).toBe("Premium ends in 3 days");
    expect(copy.body).toContain("will not renew");
    // The distinction that matters: no promise of continued access.
    expect(copy.body).not.toContain("nothing you need to do");
  });

  it("says tomorrow rather than in 1 day", () => {
    const copy = renewalReminderCopy({ ...base, kind: "1d", autoRenewing: true });
    expect(copy.title).toBe("Premium renews tomorrow");
  });

  it("closes the loop when the period has ended", () => {
    const copy = renewalReminderCopy({ ...base, kind: "expired", autoRenewing: false });
    expect(copy.title).toBe("Your Premium has ended");
    // Reassures the member that nothing was deleted by the downgrade.
    expect(copy.body).toContain("still here");
  });

  it("labels every window in words a person would use", () => {
    const labels = (["7d", "3d", "1d", "expired"] as ReminderKind[]).map(windowLabel);
    expect(labels).toEqual(["in 7 days", "in 3 days", "tomorrow", "today"]);
  });

  it("renders the renewal date for an India audience", () => {
    // 4 Oct 2026 12:00 UTC is still 4 October in IST, which is the market the
    // plans are priced for, so the date a member reads does not shift by a day.
    expect(renewalDate(new Date("2026-10-04T12:00:00.000Z"))).toBe("4 Oct 2026");
    // Just after IST midnight: the IST date is already the 5th.
    expect(renewalDate(new Date("2026-10-04T19:00:00.000Z"))).toBe("5 Oct 2026");
  });
});


describe("comp reminder copy", () => {
  const expiresAt = new Date("2026-10-10T00:00:00.000Z");

  it("never mentions auto-renew, a charge, or a store account", () => {
    // A comp has no auto-renew to switch and nothing in a store account to
    // manage. Sending the member looking for a purchase that does not exist is
    // the failure mode this copy exists to prevent.
    for (const kind of ["7d", "3d", "1d"] as const) {
      const copy = renewalReminderCopy({
        kind,
        planLabel: "Monthly",
        renewsOn: expiresAt,
        autoRenewing: false,
        chargeInr: 49,
        isComp: true,
      });
      const text = `${copy.title} ${copy.body}`.toLowerCase();
      expect(text).not.toContain("auto-renew");
      expect(text).not.toContain("₹");
      expect(text).not.toContain("store account");
      expect(text).toContain("granted");
    }
  });

  it("offers a renewal reminder that reads as a gift, not a bill", () => {
    const copy = renewalReminderCopy({
      kind: "3d",
      planLabel: "Quarterly",
      renewsOn: expiresAt,
      autoRenewing: false,
      chargeInr: 139,
      isComp: true,
    });
    expect(copy.title).toMatch(/Complimentary Premium ends/i);
    expect(copy.body).toMatch(/nothing is charged and there is nothing to cancel/i);
  });

  it("closes the period without implying a payment ended", () => {
    const copy = renewalReminderCopy({
      kind: "expired",
      planLabel: "Monthly",
      renewsOn: expiresAt,
      autoRenewing: false,
      chargeInr: 49,
      isComp: true,
    });
    expect(copy.title).toMatch(/complimentary Premium has ended/i);
    expect(copy.body).toMatch(/we granted your account/i);
    // The member must still be told their data survives.
    expect(copy.body).toMatch(/still here/i);
  });

  it("leaves store copy alone when the receipt is not a comp", () => {
    const copy = renewalReminderCopy({
      kind: "3d",
      planLabel: "Monthly",
      renewsOn: expiresAt,
      autoRenewing: true,
      chargeInr: 49,
    });
    expect(copy.title).toMatch(/renews/i);
    expect(copy.body).toMatch(/₹49/);
  });
});
