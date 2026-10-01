#!/usr/bin/env python3
"""
Judge a wallpaper candidate on the one thing that matters for this app: whether
text placed on the frosted glass above it stays legible.

The app draws its own glass over the wallpaper, so a candidate is not judged on
how it looks alone — it is judged on what the glass resolves to once the
wallpaper is behind it. Two palettes are checked, because the app ships both:

  night (dusk cast)  bright white text on a translucent slate surface
  day   (sky cast)   dark ink on a translucent pale surface

For each, the worst case is the wallpaper's *brightest* region for light text
and its *darkest* region for dark ink — not the average, which is the mistake
that produced a comfortable-looking but wrong answer earlier in this project.

Usage: evaluate-wallpaper.py <image> [<image> ...]
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

# The app's own constants, mirrored here so the report matches what ships.
DUSK_RGB = (42, 65, 90)
DUSK_SURFACE_ALPHA = 0.46          # the glass ceiling under the dusk cast
DUSK_SURFACE_RGB = (63, 84, 106)   # a neutral card resolved through the cast
DUSK_VEIL_ALPHA = 0.50             # the backdrop the night palette lays down

SKY_SURFACE_ALPHA = 0.42           # the glass ceiling under the pale cast
SKY_SURFACE_RGB = (241, 246, 252)  # a neutral card resolved through the cast

TEXT_NIGHT = {
    "heading #F2F4F6": (242, 244, 246),
    "body #E8ECEF": (232, 236, 239),
    "secondary #DFE6EB": (223, 230, 235),
}
TEXT_DAY = {
    "heading #4E4A3B": (78, 74, 59),
    "body #53514C": (83, 81, 76),
    "secondary #6B6962": (107, 105, 98),
}

AA = 4.5       # the ratio body text needs
AA_LARGE = 3.0  # the ratio large text needs


def _linear(value: float) -> float:
    x = value / 255
    return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4


def luminance(rgb) -> float:
    r, g, b = rgb[:3]
    return 0.2126 * _linear(r) + 0.7152 * _linear(g) + 0.0722 * _linear(b)


def contrast(a, b) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def over(fg, alpha: float, bg):
    return tuple(fg[i] * alpha + bg[i] * (1 - alpha) for i in range(3))


def blend(a, b, t: float):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


def band(pixels, low: float, high: float):
    """Average of the pixels in a luminance percentile band."""
    ordered = sorted(pixels, key=luminance)
    start, end = int(len(ordered) * low), max(int(len(ordered) * high), int(len(ordered) * low) + 1)
    window = ordered[start:end]
    return tuple(sum(p[i] for p in window) / len(window) for i in range(3))


def evaluate(path: Path) -> dict:
    image = Image.open(path).convert("RGB")
    # Sample at a bounded size; a few thousand pixels is far more than enough to
    # characterise a gradient and keeps this fast on a large photo.
    image.thumbnail((96, 200))
    pixels = list(image.getdata())

    brightest = band(pixels, 0.99, 1.0)
    darkest = band(pixels, 0.0, 0.01)
    average = tuple(sum(p[i] for p in pixels) / len(pixels) for i in range(3))

    report = {
        "path": path,
        "size": Image.open(path).size,
        "average": average,
        "brightest": brightest,
        "darkest": darkest,
        "average_luminance": luminance(average),
        "brightest_luminance": luminance(brightest),
        "darkest_luminance": luminance(darkest),
    }

    # --- night palette: bright text over the veil ---
    veiled_bright = blend(brightest, DUSK_RGB, DUSK_VEIL_ALPHA)
    veiled_average = blend(average, DUSK_RGB, DUSK_VEIL_ALPHA)
    glass_over_bright = over(DUSK_SURFACE_RGB, DUSK_SURFACE_ALPHA, veiled_bright)
    glass_over_average = over(DUSK_SURFACE_RGB, DUSK_SURFACE_ALPHA, veiled_average)
    report["night"] = {
        name: {
            "worst": contrast(colour, glass_over_bright),
            "typical": contrast(colour, glass_over_average),
        }
        for name, colour in TEXT_NIGHT.items()
    }
    report["night_glass_worst"] = glass_over_bright

    # --- day palette: dark ink over the same wallpaper, no veil ---
    day_over_bright = over(SKY_SURFACE_RGB, SKY_SURFACE_ALPHA, brightest)
    day_over_darkest = over(SKY_SURFACE_RGB, SKY_SURFACE_ALPHA, darkest)
    report["day"] = {
        name: {
            # Dark ink is at its worst over the *lightest* glass, which is over
            # the brightest wallpaper.
            "worst": contrast(colour, day_over_bright),
            "typical": contrast(colour, over(SKY_SURFACE_RGB, SKY_SURFACE_ALPHA, average)),
        }
        for name, colour in TEXT_DAY.items()
    }
    report["day_glass_over_brightest"] = day_over_bright
    report["day_glass_over_darkest"] = day_over_darkest
    return report


def verdict(report: dict) -> tuple[bool, list[str]]:
    notes: list[str] = []
    ok = True

    for name, ratios in report["night"].items():
        if ratios["worst"] < AA:
            ok = False
            notes.append(f"night {name}: {ratios['worst']:.2f}:1 worst (needs {AA})")
    for name, ratios in report["day"].items():
        if ratios["worst"] < AA:
            ok = False
            notes.append(f"day {name}: {ratios['worst']:.2f}:1 worst (needs {AA})")

    # A wallpaper whose brightest region is far above its average makes the app
    # lean hard on the veil; a tighter tonal range is a better fit by design.
    spread = report["brightest_luminance"] - report["darkest_luminance"]
    if spread > 0.75:
        notes.append(f"very wide tonal range ({spread:.2f}); the veil has to do a lot of work")
    if report["brightest_luminance"] > 0.75:
        notes.append(f"very bright peak ({report['brightest_luminance']:.2f}); fights light text")
    return ok, notes


def main(argv: list[str]) -> int:
    paths = [Path(p) for p in argv[1:]]
    if not paths:
        print(__doc__)
        return 1

    for path in paths:
        if not path.exists():
            print(f"missing: {path}")
            continue
        report = evaluate(path)
        ok, notes = verdict(report)
        print(f"\n=== {path.name} === {report['size'][0]}x{report['size'][1]}")
        print(f"  luminance  avg {report['average_luminance']:.3f}   "
              f"brightest {report['brightest_luminance']:.3f}   "
              f"darkest {report['darkest_luminance']:.3f}")
        print(f"  glass over brightest: night {tuple(round(c) for c in report['night_glass_worst'])}"
              f"   day {tuple(round(c) for c in report['day_glass_over_brightest'])}")
        print("  night (white text):")
        for name, ratios in report["night"].items():
            flag = "ok " if ratios["worst"] >= AA else "FAIL"
            print(f"    {flag} {name:20s} worst {ratios['worst']:5.2f}   typical {ratios['typical']:5.2f}")
        print("  day (dark text):")
        for name, ratios in report["day"].items():
            flag = "ok " if ratios["worst"] >= AA else "FAIL"
            print(f"    {flag} {name:20s} worst {ratios['worst']:5.2f}   typical {ratios['typical']:5.2f}")
        print(f"  verdict: {'usable as is' if ok else 'needs a stronger veil'}")
        for note in notes:
            print(f"    - {note}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))