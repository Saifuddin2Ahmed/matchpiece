// Renders public/og-image.png (the default share image) from buildDefaultOgSvg().
// Run after changing the brand name or tagline: NODE_ENV=test VITEST=1 npx tsx scripts/render-og-image.ts
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { buildDefaultOgSvg, ensureFontConfigInitialized } from '../server';

const ok = await ensureFontConfigInitialized();
if (!ok) {
  console.error('Fonts are not available; cannot render the share image.');
  process.exit(1);
}
const out = path.join(process.cwd(), 'public', 'og-image.png');
const png = await sharp(Buffer.from(buildDefaultOgSvg())).resize(1200, 630).png({ compressionLevel: 9 }).toBuffer();
fs.writeFileSync(out, png);
console.log(`Wrote ${out} (${Math.round(png.length / 1024)} KB)`);
process.exit(0);
