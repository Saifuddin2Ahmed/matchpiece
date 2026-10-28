// The two-ring brand mark, drawn in a 512 x 512 box. One source for the header
// logo files, the favicon and app icons (scripts/render-brand-images.ts) and the
// share images rendered by the server.

export const MARK_GOLD = '#F5B700';
export const MARK_TEAL = '#12B5A6';
export const ICON_BACKGROUND = '#0B1220';

/** Shapes only, for embedding in a larger SVG inside a 512 x 512 coordinate box. */
export const MARK_SHAPES = `<path d="M 210 120 C 138.2 120 80 178.2 80 250 C 80 321.8 138.2 380 210 380 C 265.4 380 312.4 345.3 330.8 296 L 277.2 280.8 C 265.4 309.8 239.8 330 210 330 C 165.8 330 130 294.2 130 250 C 130 205.8 165.8 170 210 170 C 239.8 170 265.4 190.2 277.2 219.2 L 330.8 204 C 312.4 154.7 265.4 120 210 120 Z" fill="${MARK_GOLD}"/>
<path d="M 302 120 C 246.6 120 199.6 154.7 181.2 204 L 234.8 219.2 C 246.6 190.2 272.2 170 302 170 C 346.2 170 382 205.8 382 250 C 382 294.2 346.2 330 302 330 C 272.2 330 246.6 309.8 234.8 280.8 L 181.2 296 C 199.6 345.3 246.6 380 302 380 C 373.8 380 432 321.8 432 250 C 432 178.2 373.8 120 302 120 Z" fill="${MARK_TEAL}"/>
<path d="M 234.8 219.2 C 246.6 190.2 272.2 170 302 170 C 314.5 170 326.2 173.6 336 179.8 L 362 135.2 C 344.2 125.5 323.8 120 302 120 C 246.6 120 199.6 154.7 181.2 204 L 234.8 219.2 Z" fill="${MARK_TEAL}"/>`;

/** The mark placed at (x, y) and drawn `size` pixels wide, for use inside another SVG. */
export function markGroup(x: number, y: number, size: number): string {
  return `<g transform="translate(${x} ${y}) scale(${size / 512})">${MARK_SHAPES}</g>`;
}
