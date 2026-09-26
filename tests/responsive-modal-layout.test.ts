import { describe, expect, it } from "vitest";
import { getResponsiveModalLayout } from "../lib/responsive-modal-layout";

describe("responsive centered modal layout", () => {
  it("keeps narrow short-phone dialogs within safe insets and screen gutters", () => {
    const layout = getResponsiveModalLayout(320, 568, { top: 24, bottom: 16 });
    expect(layout.compact).toBe(true);
    expect(layout.horizontalGutter).toBe(12);
    expect(layout.maxWidth).toBe(296);
    expect(layout.maxHeight).toBe(508);
    expect(layout.topPadding).toBe(34);
    expect(layout.bottomPadding).toBe(26);
  });

  it("uses roomier margins on a regular phone while still capping dialog width", () => {
    const layout = getResponsiveModalLayout(390, 844, { top: 48, bottom: 24 });
    expect(layout.compact).toBe(false);
    expect(layout.horizontalGutter).toBe(18);
    expect(layout.maxWidth).toBe(354);
    expect(layout.maxHeight).toBe(640);
    expect(layout.topPadding).toBe(72);
    expect(layout.bottomPadding).toBe(48);
  });

  it("caps wide layouts and maintains minimum usable dimensions", () => {
    const wide = getResponsiveModalLayout(1280, 900);
    const constrained = getResponsiveModalLayout(200, 100, { top: 80, bottom: 80 });
    expect(wide.maxWidth).toBe(520);
    expect(wide.maxHeight).toBe(640);
    expect(constrained.maxWidth).toBe(176);
    expect(constrained.maxHeight).toBe(0);
  });
});
