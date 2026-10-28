// Writes every brand image from one source (src/lib/brandMark.ts and the server's
// share-image builder): logo SVGs, favicon, app icons and public/og-image.png.
// Run after changing the mark, the name or the tagline:
//   NODE_ENV=test VITEST=1 npx tsx scripts/render-brand-images.ts
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { iconSvg, markSvg } from '../src/lib/brandMark';
import { buildDefaultOgSvg, ensureFontConfigInitialized } from '../server';

const pub = (f: string) => path.join(process.cwd(), 'public', f);
const write = (f: string, data: string | Buffer) => {
  fs.writeFileSync(pub(f), data);
  console.log(`Wrote public/${f} (${Math.max(1, Math.round(Buffer.byteLength(data) / 1024))} KB)`);
};
const png = (svg: string, size: number) =>
  sharp(Buffer.from(svg), { density: Math.max(72, Math.ceil((72 * size) / 512) * 2) }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

// Logo files. The kwegatta-* names are kept as copies for pages and installed apps cached before the rename.
for (const f of ['matchpiece-mark.svg', 'kwegatta-mark.svg']) write(f, markSvg());
for (const f of ['matchpiece-icon.svg', 'kwegatta-icon.svg', 'icon.svg']) write(f, iconSvg());

write('favicon-32.png', await png(iconSvg(), 32));
write('icon-192.png', await png(iconSvg(), 192));
write('icon-512.png', await png(iconSvg(), 512));
write('icon-maskable-512.png', await png(iconSvg(true), 512));
// iOS rounds the corners itself, so the touch icon is full-bleed
write('apple-touch-icon.png', await png(iconSvg(true), 180));

if (!(await ensureFontConfigInitialized())) {
  console.error('Fonts are not available; cannot render the share image.');
  process.exit(1);
}
write('og-image.png', await sharp(Buffer.from(buildDefaultOgSvg())).resize(1200, 630).png({ compressionLevel: 9 }).toBuffer());
process.exit(0);
