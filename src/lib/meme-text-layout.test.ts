import { describe, expect, test } from "vitest";

import {
  type FontMetrics,
  type LayoutInput,
  layoutText,
} from "./meme-text-layout";

/**
 * Deterministic injected metrics: every character is exactly `0.5 * fontSizePx`
 * wide and the line advance is `1.2 * fontSizePx`. With a monospace-like model
 * the expected line breaks are computable by hand, so these tests pin the pure
 * line-breaking + geometry contract the overlay and the canvas export both
 * depend on — no browser, no real font. `0.5em`/char means at `fontSizePx = 10`
 * a character is 5px wide, so a 50px box holds 10 characters (spaces included).
 */
const fixedMetrics: FontMetrics = {
  measureWidth: (text, fontSizePx) => text.length * 0.5 * fontSizePx,
  lineHeight: (fontSizePx) => fontSizePx * 1.2,
};

function lines(input: LayoutInput) {
  return layoutText(input, fixedMetrics).lines.map((l) => l.text);
}

describe("layoutText line breaking", () => {
  test("greedily packs words until the next would overflow", () => {
    // 50px box at fontSize 10 => 10 chars/line. "AAA BBB CCC":
    // "AAA BBB" is 7 chars (fits), + " CCC" would be 11 (overflow) => wrap.
    expect(
      lines({ text: "AAA BBB CCC", maxWidthPx: 50, fontSizePx: 10 }),
    ).toEqual(["AAA BBB", "CCC"]);
  });

  test("preserves explicit newlines as hard breaks", () => {
    expect(
      lines({ text: "TOP\nBOTTOM", maxWidthPx: 1000, fontSizePx: 10 }),
    ).toEqual(["TOP", "BOTTOM"]);
  });

  test("hard breaks and wrapping compose", () => {
    // First paragraph wraps, second is a lone hard-break line.
    expect(
      lines({ text: "AAA BBB CCC\nDDD", maxWidthPx: 50, fontSizePx: 10 }),
    ).toEqual(["AAA BBB", "CCC", "DDD"]);
  });

  test("breaks a single word wider than the box, character by character", () => {
    // 25px box at fontSize 10 => 5 chars/line. A 12-char word splits 5/5/2.
    expect(
      lines({ text: "ABCDEFGHIJKL", maxWidthPx: 25, fontSizePx: 10 }),
    ).toEqual(["ABCDE", "FGHIJ", "KL"]);
  });

  test("a long word after normal words flushes the current line first", () => {
    expect(
      lines({ text: "HI ABCDEFGHIJ", maxWidthPx: 25, fontSizePx: 10 }),
    ).toEqual(["HI", "ABCDE", "FGHIJ"]);
  });

  test("collapses runs of spaces and ignores leading/trailing whitespace", () => {
    expect(
      lines({ text: "  A   B  ", maxWidthPx: 1000, fontSizePx: 10 }),
    ).toEqual(["A B"]);
  });

  test("empty text yields a single empty line", () => {
    expect(lines({ text: "", maxWidthPx: 100, fontSizePx: 10 })).toEqual([""]);
  });

  test("never loops when a single glyph is wider than the box", () => {
    // 2px box at fontSize 10 => each 5px char overflows; still emits one per line.
    expect(lines({ text: "ABC", maxWidthPx: 2, fontSizePx: 10 })).toEqual([
      "A",
      "B",
      "C",
    ]);
  });
});

describe("layoutText geometry", () => {
  test("reports line height, total height, and widest line", () => {
    const layout = layoutText(
      { text: "AAA BBB CCC", maxWidthPx: 50, fontSizePx: 10 },
      fixedMetrics,
    );
    // Two lines: "AAA BBB" (7 chars => 35px) and "CCC" (3 chars => 15px).
    expect(layout.lines).toHaveLength(2);
    expect(layout.lineHeightPx).toBe(12); // 1.2 * 10
    expect(layout.totalHeightPx).toBe(24); // 2 lines
    expect(layout.maxLineWidthPx).toBe(35);
    expect(layout.lines[0].widthPx).toBe(35);
    expect(layout.lines[1].widthPx).toBe(15);
  });

  test("layout is a pure function of its inputs (overlay/export parity)", () => {
    const input: LayoutInput = {
      text: "WHEN THE LAYOUT IS SHARED",
      maxWidthPx: 60,
      fontSizePx: 10,
    };
    // The overlay and the export call this independently; identical inputs must
    // give byte-identical line breaks, which is what makes WYSIWYG hold.
    expect(layoutText(input, fixedMetrics)).toEqual(
      layoutText(input, fixedMetrics),
    );
  });

  test("font size scales the layout proportionally", () => {
    const small = layoutText(
      { text: "ABCDE", maxWidthPx: 25, fontSizePx: 10 },
      fixedMetrics,
    );
    const big = layoutText(
      { text: "ABCDE", maxWidthPx: 50, fontSizePx: 20 },
      fixedMetrics,
    );
    // Doubling both the box and the font keeps the same single line.
    expect(small.lines.map((l) => l.text)).toEqual(["ABCDE"]);
    expect(big.lines.map((l) => l.text)).toEqual(["ABCDE"]);
    expect(big.lineHeightPx).toBe(small.lineHeightPx * 2);
  });
});
