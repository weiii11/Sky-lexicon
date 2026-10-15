import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE ?? 'sharp');
const root = new URL('../', import.meta.url);
const path = relative => fileURLToPath(new URL(relative, root));
const report = [];
const partial = process.argv.includes('--available-only');
const missing = [];
const islandSource = 'design/islands/landmarks-v2/source';
const islandOutput = 'public/assets/islands/v2';
mkdirSync(path(`${islandOutput}/`), { recursive: true });
async function encode(source, output, size, quality) {
  if (!existsSync(path(source))) throw new Error(`Missing art source: ${source}`);
  const before = await sharp(path(source)).metadata();
  await sharp(path(source)).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality, alphaQuality: 100, effort: 6 }).toFile(path(output));
  const after = await sharp(path(output)).metadata();
  report.push({ source, output, sourceBytes: statSync(path(source)).size, bytes: statSync(path(output)).size,
    sourceWidth: before.width, sourceHeight: before.height, width: after.width, height: after.height,
    decodedMiB: after.width * after.height * 4 / 1048576 });
}
for (let number = 1; number <= 22; number++) {
  const id = String(number).padStart(2, '0');
  if (partial && !existsSync(path(`${islandSource}/chapter-${id}.png`))) { missing.push(number); continue; }
  await encode(`${islandSource}/chapter-${id}.png`, `${islandOutput}/chapter-${id}.webp`, 512, 88);
}
await encode('design/frog-concepts/a-dumpling.png', 'public/assets/frog-dumpling.webp', 256, 90);
for (const [name, size, quality] of [['concept-world', 768, 80], ['garden-pond', 1478, 90]]) {
  const archived = `design/source-assets/${name}.png`;
  await encode(existsSync(path(archived)) ? archived : `public/assets/${name}.png`, `public/assets/${name}.webp`, size, quality);
}
const islands = report.filter(row => row.output.includes('/islands/'));
const result = { revision: 'distinct-landmarks-v2', partial: missing.length > 0, missing, islandCount: islands.length, islandBytes: islands.reduce((sum, r) => sum + r.bytes, 0),
  allIslandDecodeMiB: islands.reduce((sum, r) => sum + r.decodedMiB, 0),
  sourceIslandBytes: islands.reduce((sum, r) => sum + r.sourceBytes, 0),
  sourceIslandDecodeMiB: islands.reduce((sum, r) => sum + r.sourceWidth * r.sourceHeight * 4 / 1048576, 0),
  note: 'Art is preserved in design/. Runtime WebP files are resized for the 215–235 CSS pixel island display; memory is an RGBA pixel estimate, not browser total memory.', files: report };
writeFileSync(path('design/islands/runtime-art-report.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ islandCount: result.islandCount, islandBytes: result.islandBytes, allIslandDecodeMiB: result.allIslandDecodeMiB, sourceIslandBytes: result.sourceIslandBytes, sourceIslandDecodeMiB: result.sourceIslandDecodeMiB }, null, 2));
