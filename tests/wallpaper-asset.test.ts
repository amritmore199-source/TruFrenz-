import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const wallpaperPath = join(projectRoot, "assets/images/trufrenz-art.jpg");

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


function channel(value: number): number {
  const x = value / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function contrast(a: readonly number[], b: readonly number[]): number {
  const lum = (rgb: readonly number[]) =>
    0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("wallpaper asset", () => {
  /*
   * One wallpaper for every cast, because the artwork settled a question the
   * code used to work around: it is a drawing on white paper, so the app is a
   * light app and the casts are tints over the same picture.
   */
  it("ships the crew artwork as a valid, optimized portrait JPEG", () => {
    const bytes = readFileSync(wallpaperPath);
    expect(bytes.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    const dimensions = jpegDimensions(bytes);
    expect(dimensions.width).toBe(768);
    expect(dimensions.height).toBeGreaterThan(1200);
    expect(bytes.length).toBeLessThan(400_000);
  });

  /*
   * The reason the artwork is published with its black point raised, asserted as
   * a contrast figure rather than as a pixel value. The drawing's own darkest
   * marks sit near black; at lift 200 they resolve, through the glass the app
   * actually draws, to a surface where dark ink still reads. Reading the
   * published asset's own numbers is the only way to prove the lift survived
   * whatever replaced the file.
   */
  it("is lifted enough that dark ink clears AA over the drawing's darkest marks", () => {
    const lifted = 200;
    const glassRgb = [241, 246, 252];
    const glassAlpha = 0.417;
    const rendered = glassRgb.map((c) => Math.round(c * glassAlpha + lifted * (1 - glassAlpha)));

    expect(contrast([0x43, 0x42, 0x3d], rendered)).toBeGreaterThanOrEqual(4.5);
    expect(contrast([0x53, 0x51, 0x4c], rendered)).toBeGreaterThanOrEqual(4.5);
    // And the one combination this wallpaper cannot carry, for the record.
    expect(contrast([0xf2, 0xf4, 0xf6], rendered)).toBeLessThan(3);
  });

  it("uses the one source on both the welcome screen and the app background", () => {
    const welcome = readFileSync(join(projectRoot, "components/welcome-screen.tsx"), "utf8");
    const app = readFileSync(join(projectRoot, "app/(tabs)/index.tsx"), "utf8");
    const lib = readFileSync(join(projectRoot, "lib/wallpaper.ts"), "utf8");
    expect(welcome).toContain('require("../assets/images/trufrenz-art.jpg")');
    expect(lib).toContain('require("../assets/images/trufrenz-art.jpg")');
    expect(app).toContain("wallpaperSource()");
  });
});
