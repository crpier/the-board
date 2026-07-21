import {
  type FontMetrics,
  type LayoutInput,
  type TextLayout,
  layoutText,
} from "~/lib/meme-text-layout";

/**
 * Browser glue between the pure `meme-text-layout` module and the canvas/DOM
 * (#84). Nothing here is unit-tested (canvas + fonts are browser APIs, ADR
 * 0019's testing split); the *layout* it delegates to is tested exhaustively.
 *
 * The bundled meme font is Anton (`@fontsource/anton`, self-hosted — no CDN).
 * The classic meme look is white fill + black outline, uppercase, and that is
 * the *only* styling: no colours, rotation, or other controls (spec).
 */
export const MEME_FONT_FAMILY = "Anton";
const LINE_HEIGHT_FACTOR = 1.15;
// Stroke width as a fraction of font size — the chunky black outline.
const STROKE_FRACTION = 1 / 8;

/**
 * A free-positioned caption box. All geometry is in the base image's *natural*
 * pixels, so one box definition drives both the scaled-down editor overlay and
 * the full-resolution export unchanged — the parity guarantee starts here.
 */
export interface TextBox {
  id: string;
  text: string;
  /** Top-left corner, natural image px. */
  xPx: number;
  yPx: number;
  /** Box width, natural image px (height follows from wrapped line count). */
  widthPx: number;
  /** Font size, natural image px; the resize handle scales this. */
  fontSizePx: number;
}

/**
 * Build `FontMetrics` from a real 2D context by measuring with the bundled
 * font. Shared by the overlay and the export so both wrap text identically. The
 * context's `font` is set per measurement because a single metrics object
 * serves boxes of different sizes.
 */
export function canvasFontMetrics(
  ctx: CanvasRenderingContext2D,
  fontFamily: string = MEME_FONT_FAMILY,
): FontMetrics {
  return {
    measureWidth(text, fontSizePx) {
      ctx.font = `${fontSizePx}px ${fontFamily}`;
      return ctx.measureText(text).width;
    },
    lineHeight(fontSizePx) {
      return fontSizePx * LINE_HEIGHT_FACTOR;
    },
  };
}

/** Lazily-created offscreen context for measuring outside a render pass. */
let measureCtx: CanvasRenderingContext2D | null = null;
function offscreenMetrics(): FontMetrics {
  if (measureCtx === null) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
  }
  if (measureCtx === null) {
    // Degrade to a rough monospace estimate if 2D context is unavailable.
    return {
      measureWidth: (text, fontSizePx) => text.length * fontSizePx * 0.5,
      lineHeight: (fontSizePx) => fontSizePx * LINE_HEIGHT_FACTOR,
    };
  }
  return canvasFontMetrics(measureCtx);
}

/** The classic meme caption is uppercase; measure and draw the same string. */
function display(text: string): string {
  return text.toUpperCase();
}

/**
 * Lay a single box out with the shared pure module, measuring with the bundled
 * font. Both the overlay and the export call this, so their line breaks match
 * by construction.
 */
export function layoutBox(
  box: Pick<TextBox, "text" | "widthPx" | "fontSizePx">,
  metrics: FontMetrics = offscreenMetrics(),
): TextLayout {
  const input: LayoutInput = {
    text: display(box.text),
    maxWidthPx: box.widthPx,
    fontSizePx: box.fontSizePx,
  };
  return layoutText(input, metrics);
}

/**
 * Wait for the bundled font to be ready before first render and before export.
 * Skipped without a `document.fonts` (SSR/tests). Measuring before the font
 * loads yields fallback-font widths, which would break WYSIWYG — so every
 * render/export path awaits this first (spec + Further Notes).
 */
export async function ensureMemeFontReady(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await document.fonts.load(`64px ${MEME_FONT_FAMILY}`);
  } catch {
    // load() can reject if the face isn't registered yet; `ready` still settles.
  }
  await document.fonts.ready;
}

/**
 * Composite the base image and every caption box onto `canvas` at the image's
 * natural resolution. Each line is horizontally centered in its box, drawn with
 * a black stroke then white fill (outline-under-fill for a clean edge).
 */
export function renderMeme(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  boxes: TextBox[],
): void {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (ctx === null) return;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const metrics = canvasFontMetrics(ctx);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";

  for (const box of boxes) {
    if (box.text.trim().length === 0) continue;
    const layout = layoutBox(box, metrics);
    ctx.font = `${box.fontSizePx}px ${MEME_FONT_FAMILY}`;
    ctx.lineWidth = box.fontSizePx * STROKE_FRACTION;
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#fff";

    const centerX = box.xPx + box.widthPx / 2;
    layout.lines.forEach((line, i) => {
      // Baseline of line i, roughly font-size below the box top per line.
      const baselineY = box.yPx + layout.lineHeightPx * (i + 0.8);
      ctx.strokeText(line.text, centerX, baselineY);
      ctx.fillText(line.text, centerX, baselineY);
    });
  }
}

/** `canvas.toBlob` as a promise; rejects if encoding fails. */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not encode image.")),
      type,
      quality,
    );
  });
}
