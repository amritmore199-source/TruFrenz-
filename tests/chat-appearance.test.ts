import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAT_NIGHT } from "../lib/chat-appearance";

function parseRgba(color: string): [number, number, number, number] {
  const match = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (!match) throw new Error(`Unsupported test color: ${color}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

/** Parses "#RRGGBB" into the bare channel triple. */
function darkRgb(value: string): [number, number, number] {
  const parsed = value.match(/^#([0-9a-f]{6})$/i);
  if (!parsed) throw new Error(`not a hex colour: ${value}`);
  const v = parseInt(parsed[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** The conversation's ink as it resolves over a translucent bubble on a backdrop. */
function contrastInkOn(
  color: string,
  backdrop: [number, number, number],
  inkHex = "#2F3A45",
): number {
  const [r, g, b, alpha] = parseRgba(color);
  const composite: [number, number, number] = [
    Math.round(r * alpha + backdrop[0] * (1 - alpha)),
    Math.round(g * alpha + backdrop[1] * (1 - alpha)),
    Math.round(b * alpha + backdrop[2] * (1 - alpha)),
  ];
  const l = luminance(composite);
  const ink = luminance(darkRgb(inkHex));
  return (Math.max(l, ink) + 0.05) / (Math.min(l, ink) + 0.05);
}

const appScreen = (relativePath: string) =>
  new URL(relativePath, `file://${process.cwd()}/`).pathname;

describe("the open conversation's palette", () => {
  /*
   * A conversation keeps its own deeper surfaces while the rest of the app draws
   * dark ink on pale glass. What it cannot keep is white text: the wallpaper is
   * the crew artwork on white paper, so white over these surfaces resolved on the
   * paper manages about 1.1:1. The ink is dark and the surfaces are light, and
   * the assertion below is what stops the two drifting apart again.
   */
  it("carries the app's ink at AA on its own translucent surfaces", () => {
    /*
     * Each bubble is composited over the *card* - the lightest surface a bubble can sit
     * on, and therefore the worst case for dark ink - and the ink is measured where it
     * lands. The bubbles are translucent by design, because that is what makes them glass
     * rather than paint, so the alpha is held in a band rather than pinned: too low and
     * the ink loses its surface, too high and the blur behind it stops showing.
     *
     * The ink is dark because the app is light. This assertion previously demanded white
     * ink over a near-black backdrop, which is what let the palette stay inverted after
     * the casts were restored - so a member who chose White still got a blue bubble.
     */
    const CARD: [number, number, number] = [221, 221, 221];
    for (const surface of [CHAT_NIGHT.incomingBubble, CHAT_NIGHT.outgoingBubble, CHAT_NIGHT.composerSurface]) {
      expect(surface).toMatch(/^rgba\(/);
      const alpha = parseRgba(surface)[3];
      expect(alpha).toBeGreaterThanOrEqual(0.1);
      expect(alpha).toBeLessThanOrEqual(0.95);
      expect(contrastInkOn(surface, CARD, CHAT_NIGHT.primaryText)).toBeGreaterThanOrEqual(4.5);
    }
    // The ink is dark, and it is the same ink the rest of the app uses.
    expect(parseRgba(`rgba(${darkRgb(CHAT_NIGHT.primaryText)}, 1)`)[0]).toBeLessThan(120);
  });

  it("is applied only while rendering an open conversation, not the chat inbox", () => {
    const source = readFileSync(appScreen("app/(tabs)/index.tsx"), "utf8");
    const chatStart = source.indexOf("if (selectedChat && currentThread)");
    const inboxStart = source.indexOf("const renderChats = () =>");
    const chatEnd = source.indexOf("const filters: typeof chatFilter[]", chatStart);
    expect(chatStart).toBeGreaterThanOrEqual(0);
    expect(inboxStart).toBeGreaterThanOrEqual(0);
    expect(chatEnd).toBeGreaterThan(chatStart);
    expect(chatStart).toBeGreaterThan(inboxStart);
    expect(source.slice(inboxStart, chatStart)).not.toContain("CHAT_NIGHT");
    const chatBranch = source.slice(chatStart, chatEnd);
    expect(chatBranch).toContain("CHAT_NIGHT");
    expect(chatBranch).toMatch(/<PlanCardView\s+nightMode/);
    expect(chatBranch).toMatch(/<PlanPollCard\s+nightMode/);

    const planCard = readFileSync(appScreen("components/plan-card-view.tsx"), "utf8");
    const pollCard = readFileSync(appScreen("components/plan-poll-card.tsx"), "utf8");
    expect(planCard).toContain("nightMode = false");
    expect(planCard).toContain("nightMode ? CHAT_NIGHT.controlSurface");
    expect(pollCard).toContain("nightMode = false");
    expect(pollCard).toContain("nightMode ? CHAT_NIGHT.controlSurface");
  });
});
