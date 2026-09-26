import { describe, expect, it } from "vitest";
import { nextSafetySlide, previousSafetySlide, safetyOnboardingSlides } from "../lib/onboarding-carousel";

describe("safety onboarding carousel", () => {
  it("explains friendship intent, mutual acceptance, and safe meetup behavior", () => {
    expect(safetyOnboardingSlides).toHaveLength(3);
    expect(safetyOnboardingSlides[0].eyebrow).toContain("FRIENDSHIP");
    expect(safetyOnboardingSlides[1].body).toContain("accept");
    expect(safetyOnboardingSlides[2].ruleBody).toContain("exact pin");
  });

  it("advances one slide at a time and completes only after the final slide", () => {
    expect(nextSafetySlide(0)).toBe(1);
    expect(nextSafetySlide(1)).toBe(2);
    expect(nextSafetySlide(2)).toBeNull();
  });

  it("keeps back navigation within the carousel bounds", () => {
    expect(previousSafetySlide(0)).toBe(0);
    expect(previousSafetySlide(2)).toBe(1);
  });
});
