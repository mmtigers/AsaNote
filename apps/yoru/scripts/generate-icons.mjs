#!/usr/bin/env node
// design/icon.svg から public/ のアプリアイコン(PNG)を書き出す。
//   node scripts/generate-icons.mjs
// sharp は Next.js が画像最適化で依存しているものを使う(package.json には追加しない)。
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const svg = await readFile(new URL("../design/icon.svg", import.meta.url));

// 全面塗り・中身は安全領域内なので、通常/maskable/apple-touch を同じ絵から作れる。
const targets = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/maskable-512.png", 512],
  ["public/apple-touch-icon.png", 180],
];

for (const [path, size] of targets) {
  const png = await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(new URL(`../${path}`, import.meta.url), png);
  console.log(`${path} (${size}x${size}, ${png.length} bytes)`);
}
