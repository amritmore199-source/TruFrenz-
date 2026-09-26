export type SafetyOnboardingSlide = {
  eyebrow: string;
  title: string;
  body: string;
  ruleTitle: string;
  ruleBody: string;
  icon: "diversity-3" | "handshake" | "shield";
};

export const safetyOnboardingSlides: readonly SafetyOnboardingSlide[] = [
  {
    eyebrow: "FRIENDSHIP, NOT DATING",
    title: "A little more human.",
    body: "Trufrenz is a calm place to make local friends—without swipes, scores, or romantic prompts.",
    ruleTitle: "Come as a neighbor.",
    ruleBody: "Share the small things you enjoy and meet people who are here for friendship, too.",
    icon: "diversity-3",
  },
  {
    eyebrow: "A MUTUAL YES",
    title: "No open DMs.",
    body: "Friend requests arrive quietly. A private chat opens only after you both accept.",
    ruleTitle: "A no can stay quiet.",
    ruleBody: "You can decline without explaining. Respect boundaries and let every connection move at its own pace.",
    icon: "handshake",
  },
  {
    eyebrow: "MEET WITH CARE",
    title: "Keep plans public.",
    body: "Choose a familiar public place, tell someone you trust, and leave whenever you want.",
    ruleTitle: "Your location is yours.",
    ruleBody: "Trufrenz never shares an exact pin automatically. Use block or report if something feels off.",
    icon: "shield",
  },
] as const;

export function nextSafetySlide(index: number): number | null {
  return index < safetyOnboardingSlides.length - 1 ? index + 1 : null;
}

export function previousSafetySlide(index: number): number {
  return Math.max(0, Math.min(index - 1, safetyOnboardingSlides.length - 1));
}
