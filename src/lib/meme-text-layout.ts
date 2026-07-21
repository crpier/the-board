/**
 * Pure text-layout for the Meme Creator (#84, ADR 0020).
 *
 * This module is the single source of line breaking and geometry shared by the
 * live DOM overlay (what the user edits) and the canvas export (what gets
 * published). Because both call `layoutText` with the same inputs, the exported
 * image matches the overlay by construction — the canvas has no text wrapping
 * of its own, so it *must* reuse the same broken lines, which is exactly the
 * WYSIWYG-parity acceptance criterion.
 *
 * It is deliberately free of any DOM/canvas dependency: font measurement is
 * *injected* as `FontMetrics`. In the browser both callers build metrics from a
 * single offscreen `CanvasRenderingContext2D.measureText`; tests inject a
 * deterministic fake, so parity is provable without a real canvas or a loaded
 * font.
 *
 * Coordinates are in image pixels (the natural resolution of the base image),
 * so a layout computed once is valid for both the scaled-down overlay and the
 * full-resolution export.
 */

/**
 * Measured font geometry at a given pixel size. `measureWidth` returns the
 * rendered width of a run of text; `lineHeight` the vertical advance between
 * baselines. Both are functions of `fontSizePx` so a single metrics object
 * serves every box on the image regardless of its font size.
 */
export interface FontMetrics {
  measureWidth(text: string, fontSizePx: number): number;
  lineHeight(fontSizePx: number): number;
}

export interface LayoutInput {
  /** Raw text; `\n` is an explicit hard break, other whitespace collapses. */
  text: string;
  /** Usable text width in image px (the box width minus any padding). */
  maxWidthPx: number;
  /** Font size in image px. */
  fontSizePx: number;
}

export interface LaidOutLine {
  text: string;
  /** Measured rendered width of this line, in px. */
  widthPx: number;
}

export interface TextLayout {
  lines: LaidOutLine[];
  /** Vertical advance between baselines, in px. */
  lineHeightPx: number;
  /** Total block height (`lines.length * lineHeightPx`), in px. */
  totalHeightPx: number;
  /** Width of the widest line, in px. */
  maxLineWidthPx: number;
}

/**
 * Break a single word that is itself wider than `maxWidthPx` into pieces that
 * each fit, measuring character by character. Guarantees progress: at least one
 * character is emitted per piece even when a single glyph overflows (a
 * pathologically narrow box), so layout can never loop forever.
 */
function breakLongWord(
  word: string,
  maxWidthPx: number,
  fontSizePx: number,
  metrics: FontMetrics,
): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const char of word) {
    const candidate = current + char;
    if (
      current.length > 0 &&
      metrics.measureWidth(candidate, fontSizePx) > maxWidthPx
    ) {
      pieces.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

/**
 * Greedily wrap one paragraph (no internal hard breaks) to `maxWidthPx`. Words
 * are packed onto a line until the next word wouldn't fit; a word too wide for
 * the box on its own is split by `breakLongWord`.
 */
function wrapParagraph(
  paragraph: string,
  maxWidthPx: number,
  fontSizePx: number,
  metrics: FontMetrics,
): string[] {
  const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (metrics.measureWidth(candidate, fontSizePx) <= maxWidthPx) {
      current = candidate;
      continue;
    }

    // The candidate overflows. Flush what we have, then place the word —
    // splitting it if it can't fit on a line by itself. (`current` is always
    // reassigned just below, so it isn't cleared here.)
    if (current.length > 0) {
      lines.push(current);
    }
    if (metrics.measureWidth(word, fontSizePx) <= maxWidthPx) {
      current = word;
    } else {
      const pieces = breakLongWord(word, maxWidthPx, fontSizePx, metrics);
      // All but the last piece are full lines; the last seeds the next line.
      for (let i = 0; i < pieces.length - 1; i++) lines.push(pieces[i]);
      current = pieces[pieces.length - 1];
    }
  }

  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * Lay out `text` within a box of `maxWidthPx` at `fontSizePx`, returning the
 * broken lines and the block geometry both the overlay and the export draw
 * from. Explicit `\n`s are preserved as hard breaks; each resulting paragraph
 * is greedily word-wrapped. Empty input yields a single empty line so an
 * in-progress box still has a caret row.
 */
export function layoutText(
  input: LayoutInput,
  metrics: FontMetrics,
): TextLayout {
  const { text, maxWidthPx, fontSizePx } = input;
  const paragraphs = text.split("\n");

  const lines: LaidOutLine[] = [];
  for (const paragraph of paragraphs) {
    for (const line of wrapParagraph(
      paragraph,
      maxWidthPx,
      fontSizePx,
      metrics,
    )) {
      lines.push({
        text: line,
        widthPx: metrics.measureWidth(line, fontSizePx),
      });
    }
  }

  const lineHeightPx = metrics.lineHeight(fontSizePx);
  const maxLineWidthPx = lines.reduce((max, l) => Math.max(max, l.widthPx), 0);

  return {
    lines,
    lineHeightPx,
    totalHeightPx: lines.length * lineHeightPx,
    maxLineWidthPx,
  };
}
