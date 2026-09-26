import { describe, expect, it } from "vitest";
import { buildMeetupInviteDraft, formatMeetupInvite, publicMeetupVenues } from "../lib/meetup-invite";

describe("meetup invite draft", () => {
  it("requires a title and time before creating a shareable invite", () => {
    expect(buildMeetupInviteDraft("  ", publicMeetupVenues[0], "Tomorrow · 10:30 AM")).toBeNull();
    expect(buildMeetupInviteDraft("Coffee", publicMeetupVenues[0], " ")).toBeNull();
  });

  it("trims the plan title and includes its selected public place and time", () => {
    const draft = buildMeetupInviteDraft("  Coffee and a slow start  ", publicMeetupVenues[0], "Saturday · 10:30 AM");
    expect(draft?.title).toBe("Coffee and a slow start");
    expect(draft && formatMeetupInvite(draft)).toContain("Juniper Café · Pacific Heights");
    expect(draft && formatMeetupInvite(draft)).toContain("Saturday · 10:30 AM");
  });
});
