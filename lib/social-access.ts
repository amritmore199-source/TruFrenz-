export type VerificationStatus = "id-selfie" | "phone-only";
export type PremiumFeature = "live-map" | "voice-call" | "video-call";

/** Only stronger-verification profiles may send an initial friendship request. */
export function canRequestFriendship(verification: VerificationStatus): boolean {
  return verification === "id-selfie";
}

/** Text chats are available only after mutual acceptance (groups are invite-only). */
export function canOpenChat(isAcceptedFriend: boolean, isAcceptedGroupMember = false): boolean {
  return isAcceptedFriend || isAcceptedGroupMember;
}

/** Map and calling capabilities remain a paid-tier feature. */
export function canUsePremiumFeature(feature: PremiumFeature, isPaidMember: boolean): boolean {
  if (feature === "live-map" || feature === "voice-call" || feature === "video-call") return isPaidMember;
  return false;
}
