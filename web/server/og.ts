/**
 * A task's social card: `/tasks/:taskId/og.png`.
 *
 * Task pages are shareable, and a link preview is what someone sees before they open one — so the
 * card is the task's own words on tindone's pink. It is an SVG laid out here and rasterised by
 * resvg (`@resvg/resvg-wasm`), which is small enough to ship inside a Worker; text wraps by an
 * estimate of each character's width, which is all a three-line title needs.
 *
 * The WebAssembly module and the fonts are loaded differently on each host — read from disk by
 * `deno serve`, imported and fetched from Static Assets on Workers — so the entry point hands them
 * in through {@link setOgResources}. Cards are cached in memory by content, so a preview crawler
 * asking twice costs one drawing.
 */

import { initWasm, Resvg } from "@resvg/resvg-wasm";

/** How this host gets resvg's WebAssembly and the fonts in `client/static/fonts/`. */
export interface OgResources {
  wasm(): Promise<WebAssembly.Module | BufferSource>;
  font(name: string): Promise<Uint8Array>;
}

const FONT_FILES = [
  "Inter-Regular.ttf",
  "Inter-Bold.ttf",
  "NotoSansJP-Regular.ttf",
];
const FONT_FAMILY = "Inter, 'Noto Sans JP', sans-serif";

let resources: OgResources | undefined;
let ready: Promise<Uint8Array[]> | undefined;

export function setOgResources(value: OgResources): void {
  resources = value;
}

function start(): Promise<Uint8Array[]> {
  return ready ??= (async () => {
    if (!resources) throw new Error("setOgResources() was not called");
    const r = resources;
    await initWasm(r.wasm());
    return await Promise.all(FONT_FILES.map((name) => r.font(name)));
  })().catch((error) => {
    ready = undefined;
    throw error;
  });
}

const WIDTH = 1200;
const HEIGHT = 630;
const PADDING = 72;

const color = {
  bg: "#ff4458",
  fg: "#ffffff",
  muted: "#ffe3e6",
  rule: "#ff8a96",
} as const;

/** What a card says. */
export interface Card {
  eyebrow: string;
  title: string;
  description: string;
  footer: string;
}

/**
 * Roughly how wide a character is, in ems. Full-width scripts are a square; Latin is narrower, and
 * bold a little wider still. Close enough to wrap on, and the ellipsis absorbs the rest.
 */
function charWidth(char: string, bold: boolean): number {
  const code = char.codePointAt(0)!;
  let width: number;
  if (code >= 0x1100 && !(code >= 0x2000 && code <= 0x206f)) width = 1;
  else if (char === " ") width = 0.28;
  else if (/[A-Z0-9MW@%&]/.test(char)) width = 0.68;
  else if (/[il.,:;'|!]/.test(char)) width = 0.3;
  else width = 0.56;
  return bold ? width * 1.06 : width;
}

/**
 * Breaks text into lines that fit, at spaces where there are any and anywhere in CJK, ending the
 * last line with an ellipsis when it does not all fit.
 */
export function wrap(
  text: string,
  size: number,
  maxWidth: number,
  maxLines: number,
  bold = false,
): string[] {
  const limit = maxWidth / size;
  const lines: string[] = [];
  let line = "";
  let width = 0;
  let breakAt = -1; // index in `line` just after the last space

  for (const char of text.replace(/\s+/g, " ").trim()) {
    const w = charWidth(char, bold);
    if (width + w > limit && line !== "") {
      let rest = "";
      if (char !== " " && breakAt > 0 && charWidth(char, false) < 1) {
        rest = line.slice(breakAt);
        line = line.slice(0, breakAt);
      }
      lines.push(line.trimEnd());
      if (lines.length === maxLines) {
        const last = lines.pop()!;
        let cut = last;
        let cutWidth = [...cut].reduce((sum, c) => sum + charWidth(c, bold), 0);
        while (cut && cutWidth + 1 > limit) {
          const chars = [...cut];
          cutWidth -= charWidth(chars.pop()!, bold);
          cut = chars.join("");
        }
        lines.push(`${cut.trimEnd()}…`);
        return lines;
      }
      line = rest.trimStart();
      width = [...line].reduce((sum, c) => sum + charWidth(c, bold), 0);
      breakAt = -1;
      if (char === " ") continue;
    }
    line += char;
    width += w;
    if (char === " ") breakAt = line.length;
  }
  if (line) lines.push(line);
  return lines;
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The card as SVG. */
export function cardSvg(card: Card): string {
  const inner = WIDTH - PADDING * 2;
  const parts: string[] = [];
  const text = (
    lines: string[],
    top: number,
    size: number,
    lineHeight: number,
    fill: string,
    weight: number,
  ) => {
    lines.forEach((line, i) => {
      parts.push(
        `<text x="${PADDING}" y="${
          top + size + i * size * lineHeight
        }" font-size="${size}" font-weight="${weight}" fill="${fill}">${
          escape(line)
        }</text>`,
      );
    });
    return top + lines.length * size * lineHeight;
  };

  let top = PADDING;
  top = text([card.eyebrow], top, 28, 1.2, color.fg, 700) + 26;
  top =
    text(wrap(card.title, 64, inner, 3, true), top, 64, 1.15, color.fg, 700) +
    26;
  text(wrap(card.description, 30, inner, 2), top, 30, 1.4, color.muted, 400);

  const footerTop = HEIGHT - PADDING - 26;
  parts.push(
    `<rect x="${PADDING}" y="${
      footerTop - 32
    }" width="${inner}" height="1" fill="${color.rule}"/>`,
  );
  text([card.footer], footerTop - 6, 26, 1.2, color.muted, 400);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="${FONT_FAMILY}">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${color.bg}"/>` +
    `<rect width="${WIDTH}" height="10" fill="${color.fg}"/>` +
    parts.join("") + `</svg>`;
}

/**
 * Draws a card.
 *
 * @returns The PNG bytes
 */
export async function renderCard(card: Card): Promise<Uint8Array> {
  const fontBuffers = await start();
  const resvg = new Resvg(cardSvg(card), {
    font: {
      fontBuffers,
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    },
  });
  try {
    const image = resvg.render();
    try {
      return image.asPng();
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}

const cache = new Map<string, Uint8Array>();
const CACHE_LIMIT = 100;

/**
 * @param task What the card says
 * @param host Where the task lives, for the footer line
 * @returns The PNG response
 */
export async function taskImage(
  task: { content: string; list: string },
  host: string,
): Promise<Response> {
  const key = JSON.stringify([task.content, task.list, host]);
  let png = cache.get(key);
  if (!png) {
    png = await renderCard({
      eyebrow: "tindone task",
      title: task.content,
      description: `List: ${task.list.toUpperCase()}`,
      footer: host,
    });
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, png);
  }
  return new Response(png as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=300",
    },
  });
}
