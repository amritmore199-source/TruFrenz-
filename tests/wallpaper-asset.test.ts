import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const nightPath = join(projectRoot, "assets/images/trufrenz-night.jpg");
const dayPath = join(projectRoot, "assets/images/trufrenz-day.jpg");

function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);

  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let markerOffset = offset + 1;
    while (bytes[markerOffset] === 0xff) markerOffset += 1;
    const marker = bytes[markerOffset];
    offset = markerOffset + 1;
    if (marker === 0xd9 || marker === 0xda || offset + 1 >= bytes.length) break;

    const segmentLength = bytes.readUInt16BE(offset);
    if (startOfFrameMarkers.has(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    if (segmentLength < 2) break;
    offset += segmentLength;
  }
  throw new Error("Wallpaper JPEG has no valid start-of-frame marker.");
}

describe("wallpaper assets", () => {
  /*
   * Both wallpapers come from the same crew artwork, sized to ship cheaply. The
   * pair exists because the two colour palettes need opposite things from a
   * background: bright white text wants a dark picture and dark ink wants a
   * bright one. The day version is the drawing lifted onto white paper, the
   * night version is the same line work standing on the night sky.
   */
  for (const [name, path] of [["night", nightPath], ["day", dayPath]] as const) {
    it(`ships a valid, optimized portrait JPEG for the ${name} palette`, () => {
      const bytes = readFileSync(path);
      expect(bytes.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
      const dimensions = jpegDimensions(bytes);
      expect(dimensions.width).toBe(768);
      expect(dimensions.height).toBeGreaterThan(1200);
      expect(bytes.length).toBeLessThan(400_000);
    });
  }

  it("pairs each wallpaper with the cast that needs it", () => {
    const pairs = readFileSync(join(projectRoot, "lib/wallpaper.ts"), "utf8");
    expect(pairs).toContain("wallpaperForTint");
    expect(pairs).toContain('tint === "dusk" ? "night" : "day"');
  });

  it("is used by both the welcome screen and signed-in app background", () => {
    const welcome = readFileSync(join(projectRoot, "components/welcome-screen.tsx"), "utf8");
    const app = readFileSync(join(projectRoot, "app/(tabs)/index.tsx"), "utf8");
    expect(welcome).toContain('require("../assets/images/trufrenz-night.jpg")');
    expect(app).toContain("wallpaperSource(glassTintChoice)");
  });
});
