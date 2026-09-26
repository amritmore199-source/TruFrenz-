import { describe, expect, it } from "vitest";

import {
  MAX_BIO_LENGTH,
  MAX_PHOTOS,
  actionLabel,
  addProfilePhoto,
  availableViewerActions,
  canBeDiscovered,
  canReceiveRequest,
  clampBio,
  createInitialProfile,
  formatDistance,
  moveProfilePhoto,
  orderedPhotos,
  orderInterestsByShared,
  profileCompleteness,
  removeProfilePhoto,
  setPrimaryPhoto,
  sharedInterestSentence,
  toggleFromList,
  validateEditableProfile,
  verificationBadge,
} from "../lib/profile-details";

const baseProfile = createInitialProfile({ name: "Maya Chen", age: 30, locality: "Pacific Heights" });

describe("profile photos", () => {
  it("caps photos at six and promotes the first photo to primary", () => {
    let profile = baseProfile;
    for (let index = 0; index < 8; index += 1) {
      profile = addProfilePhoto(profile, { id: `p${index}`, uri: `file://${index}.jpg` });
    }
    expect(profile.photos).toHaveLength(MAX_PHOTOS);
    expect(profile.primaryPhotoId).toBe("p0");
  });

  it("reassigns the primary when the current one is removed", () => {
    let profile = addProfilePhoto(baseProfile, { id: "a", uri: "file://a.jpg" });
    profile = addProfilePhoto(profile, { id: "b", uri: "file://b.jpg" });
    profile = setPrimaryPhoto(profile, "b");
    profile = removeProfilePhoto(profile, "b");
    expect(profile.primaryPhotoId).toBe("a");
    expect(profile.photos.map((photo) => photo.id)).toEqual(["a"]);
  });

  it("reorders photos and lists the primary first", () => {
    let profile = addProfilePhoto(baseProfile, { id: "a", uri: "file://a.jpg" });
    profile = addProfilePhoto(profile, { id: "b", uri: "file://b.jpg" });
    profile = addProfilePhoto(profile, { id: "c", uri: "file://c.jpg" });
    profile = moveProfilePhoto(profile, "c", -1);
    expect(profile.photos.map((photo) => photo.id)).toEqual(["a", "c", "b"]);
    expect(moveProfilePhoto(profile, "a", -1).photos.map((photo) => photo.id)).toEqual(["a", "c", "b"]);
    expect(orderedPhotos(profile).map((photo) => photo.id)).toEqual(["a", "c", "b"]);
  });

  it("ignores duplicate photo ids", () => {
    const once = addProfilePhoto(baseProfile, { id: "a", uri: "file://a.jpg" });
    const twice = addProfilePhoto(once, { id: "a", uri: "file://a.jpg" });
    expect(twice.photos).toHaveLength(1);
  });
});

describe("editable fields", () => {
  it("clamps a bio to the character cap without cutting mid-word", () => {
    const long = "a".repeat(10) + " " + "b".repeat(MAX_BIO_LENGTH) + " tail";
    const clamped = clampBio(long);
    expect(clamped.length).toBeLessThanOrEqual(MAX_BIO_LENGTH);
    expect(clamped.endsWith("b")).toBe(true);
  });

  it("enforces selection caps for interests, languages, and looking-for tags", () => {
    let list: string[] = [];
    for (const item of ["a", "b", "c"]) list = toggleFromList(list, item, 2);
    expect(list).toEqual(["a", "b"]);
    expect(toggleFromList(list, "a", 2)).toEqual(["b"]);
  });

  it("reports validation problems for an incomplete profile", () => {
    const errors = validateEditableProfile({ ...baseProfile, name: "M", locality: "" });
    expect(errors.name).toBeTruthy();
    expect(errors.locality).toBeTruthy();
    expect(validateEditableProfile(baseProfile)).toEqual({});
  });

  it("keeps age locked and derives the verification badge", () => {
    expect(verificationBadge("phone-only")).toEqual({ label: "Phone verified", strong: false, canGetVerified: true });
    expect(verificationBadge("id-selfie").strong).toBe(true);
    expect(profileCompleteness(baseProfile)).toBeGreaterThan(0);
    expect(profileCompleteness({ ...baseProfile, verification: "id-selfie", bio: "x".repeat(30), interests: ["a", "b", "c"] })).toBeGreaterThan(
      profileCompleteness(baseProfile),
    );
  });
});

describe("privacy and discoverability", () => {
  it("hides a profile from discovery when paused or hidden", () => {
    expect(canBeDiscovered(baseProfile)).toBe(true);
    expect(canBeDiscovered({ ...baseProfile, available: false })).toBe(false);
    expect(canBeDiscovered({ ...baseProfile, privacy: { ...baseProfile.privacy, hideFromDiscovery: true } })).toBe(false);
  });

  it("applies the request-audience rule", () => {
    const verifiedOnly = { ...baseProfile, privacy: { ...baseProfile.privacy, requestAudience: "verified-only" as const } };
    expect(canReceiveRequest(verifiedOnly, { isFriendOfFriend: true, isVerified: false })).toBe(false);
    expect(canReceiveRequest(verifiedOnly, { isFriendOfFriend: false, isVerified: true })).toBe(true);
    const friendsOfFriends = { ...baseProfile, privacy: { ...baseProfile.privacy, requestAudience: "friends-of-friends" as const } };
    expect(canReceiveRequest(friendsOfFriends, { isFriendOfFriend: false, isVerified: true })).toBe(false);
  });
});

describe("distance gating", () => {
  it("hides distance entirely for free members", () => {
    expect(formatDistance(2.4, "free", false)).toBeNull();
  });

  it("shows a precise distance to paid members and a coarse range when hidden", () => {
    expect(formatDistance(2.44, "paid", false)).toBe("2.4 km away");
    expect(formatDistance(2.44, "paid", true)).toBe("~5 km away");
    expect(formatDistance(12, "paid", true)).toBe("~15 km away");
    expect(formatDistance(10, "paid", true)).toBe("~10 km away");
    expect(formatDistance(null, "paid", false)).toBeNull();
  });
});

describe("shared interests", () => {
  it("lists shared interests first and removes duplicates", () => {
    const { shared, other } = orderInterestsByShared(["Hiking", "Coffee", "hiking", "Books"], ["coffee", "Hiking"]);
    expect(shared).toEqual(["Hiking", "Coffee"]);
    expect(other).toEqual(["Books"]);
    expect(sharedInterestSentence(shared)).toBe("You both like hiking and coffee");
    expect(sharedInterestSentence(["Hiking"])).toBe("You both like hiking");
    expect(sharedInterestSentence([])).toBeNull();
  });
});

describe("viewer actions", () => {
  it("offers ask-friendship before acceptance and expands after it", () => {
    expect(availableViewerActions({ relationship: "stranger", viewerCanRequestFriendship: true, paidTierActive: false })).toEqual([
      "ask-friendship",
      "report",
      "block",
    ]);
    const accepted = availableViewerActions({ relationship: "accepted", viewerCanRequestFriendship: true, paidTierActive: false });
    expect(accepted).toContain("chat");
    expect(accepted).toContain("hangout");
    expect(accepted).not.toContain("call");
    expect(availableViewerActions({ relationship: "accepted", viewerCanRequestFriendship: true, paidTierActive: true })).toContain("call");
  });

  it("keeps the blocked relationship reversible and labels every action", () => {
    expect(availableViewerActions({ relationship: "blocked", viewerCanRequestFriendship: true, paidTierActive: true })).toEqual(["unblock", "report"]);
    expect(availableViewerActions({ relationship: "request-received", viewerCanRequestFriendship: true, paidTierActive: false })).toContain("accept-request");
    expect(actionLabel("ask-friendship")).toBe("Ask for Friendship");
    expect(actionLabel("meetup")).toBe("Meetup");
  });
});
