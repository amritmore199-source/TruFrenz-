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

function contrastWhiteOn(color: string, backdrop: [number, number, number]): number {
  const [r, g, b, alpha] = parseRgba(color);
  const composite: [number, number, number] = [
    Math.round(r * alpha + backdrop[0] * (1 - alpha)),
    Math.round(g * alpha + backdrop[1] * (1 - alpha)),
    Math.round(b * alpha + backdrop[2] * (1 - alpha)),
  ];
  const l = luminance(composite);
  return 1.05 / (l + 0.05);
}

const appScreen = (relativePath: string) =>
  new URL(relativePath, `file://${process.cwd()}/`).pathname;

describe("chat-only bright white appearance", () => {
  it("uses translucent dark surfaces behind white conversation text", () => {
    for (const surface of [CHAT_NIGHT.incomingBubble, CHAT_NIGHT.outgoingBubble, CHAT_NIGHT.composerSurface]) {
      expect(surface).toMatch(/^rgba\(/);
      expect(parseRgba(surface)[3]).toBeGreaterThanOrEqual(0.76);
      expect(parseRgba(surface)[3]).toBeLessThan(0.9);
      // White text remains legible even over the brightest underlying wallpaper.
      expect(contrastWhiteOn(surface, [255, 255, 255])).toBeGreaterThan(4.5);
    }
    expect(CHAT_NIGHT.primaryText).toBe("#FFFFFF");
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
