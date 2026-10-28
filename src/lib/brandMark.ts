// The two-ring brand mark, drawn in a 512 x 512 box. One source for the header
// logo files, the favicon and app icons (scripts/render-brand-images.ts) and the
// share images rendered by the server.

export const MARK_GOLD = '#F5B700';
export const MARK_TEAL = '#12B5A6';
export const ICON_BACKGROUND = '#0B1220';

// Two interlocking C rings: gold (centre 210,250) opening right, teal (centre 302,250)
// opening left, teal on top. Each ring is one arc (centre-line radius 105, 50 wide,
// so 80 inside and 130 outside) with straight cuts 22 degrees either side of the gap.
const ARC = 'fill="none" stroke-width="50" stroke-linecap="butt"';

/** Shapes only, for embedding in a larger SVG inside a 512 x 512 coordinate box. */
export const MARK_SHAPES = `<path d="M 307.35 289.33 A 105 105 0 1 1 307.35 210.67" stroke="${MARK_GOLD}" ${ARC}/>
<path d="M 204.65 210.67 A 105 105 0 1 1 204.65 289.33" stroke="${MARK_TEAL}" ${ARC}/>`;

/** The mark alone on a transparent 512 x 512 canvas (header logo). */
export function markSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">\n${MARK_SHAPES}\n</svg>\n`;
}

/**
 * App icon: the mark on the dark background. `maskable` fills the whole square and keeps
 * the mark inside the central safe zone; otherwise the square has rounded corners.
 */
export function iconSvg(maskable = false): string {
  const bg = maskable
    ? `<rect width="512" height="512" fill="${ICON_BACKGROUND}"/>`
    : `<rect width="512" height="512" rx="108" fill="${ICON_BACKGROUND}"/>`;
  const mark = maskable ? markGroup(76, 76, 360) : markGroup(16, 22, 480);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n${bg}\n${mark}\n</svg>\n`;
}

/** The mark placed at (x, y) and drawn `size` pixels wide, for use inside another SVG. */
export function markGroup(x: number, y: number, size: number): string {
  return `<g transform="translate(${x} ${y}) scale(${size / 512})">${MARK_SHAPES}</g>`;
}
