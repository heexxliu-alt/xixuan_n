#!/usr/bin/env node
/*
 * Round 3.5B Phase 1: deterministic candidate builder.
 * The supplied master guides the visual language. A single coherent 2:1
 * equirectangular texture is prepared once, then projected onto one fixed
 * sphere for every frame; no frame is generated independently.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('/Users/liuxinran/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const ROOT = path.resolve(__dirname, '..');
const MASTER = path.join(ROOT, 'assets/planet-final/master-v1.png');
const OUT = path.join(ROOT, 'assets/planet-final');
const TEXTURE_SOURCE = path.join(OUT, 'planet-texture-source-v1.png');
const TEXTURE = path.join(OUT, 'planet-texture-equirect-v1.png');
const SIZE = 512;
const FRAMES = 36;
const CX = 629.5;
const CY = 616.5;
const RX = 566.5;
const RY = 556.5;
const RADIUS_SCALE = 0.92; // Keep a small transparent safety margin in 512px runtime frames.

function clamp(v, min = 0, max = 255) { return Math.max(min, Math.min(max, v)); }
function sample(data, width, height, x, y) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const p00 = data[(y0 * width + x0) * 4 + c];
    const p10 = data[(y0 * width + x1) * 4 + c];
    const p01 = data[(y1 * width + x0) * 4 + c];
    const p11 = data[(y1 * width + x1) * 4 + c];
    out[c] = p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
  }
  return out;
}
function sampleRgb(data, width, height, x, y) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const p00 = data[(y0 * width + x0) * 3 + c];
    const p10 = data[(y0 * width + x1) * 3 + c];
    const p01 = data[(y1 * width + x0) * 3 + c];
    const p11 = data[(y1 * width + x1) * 3 + c];
    out[c] = p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
  }
  return out;
}
function seamlessTexture(data, width, height) {
  let bestCut = 0, bestDiff = Infinity;
  for (let x = 0; x < width; x++) {
    const next = (x + 1) % width;
    let diff = 0;
    for (let y = 0; y < height; y++) {
      const a = (y * width + x) * 3, b = (y * width + next) * 3;
      diff += Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
    }
    if (diff < bestDiff) { bestDiff = diff; bestCut = next; }
  }
  const out = Buffer.alloc(data.length);
  for (let x = 0; x < width; x++) {
    const sourceX = (bestCut + x) % width;
    for (let y = 0; y < height; y++) {
      const src = (y * width + sourceX) * 3;
      const dst = (y * width + x) * 3;
      out[dst] = data[src]; out[dst + 1] = data[src + 1]; out[dst + 2] = data[src + 2];
    }
  }
  return out;
}
function tint(rgba, state, nx, ny) {
  let [r, g, b, a] = rgba;
  if (state === 'sunset') {
    const warm = Math.max(0, 1 - Math.hypot(nx - 0.18, ny + 0.18) / 1.15);
    r = r * (1.03 + warm * 0.10) + 8 * warm;
    g = g * (0.98 + warm * 0.015);
    b = b * (0.98 - warm * 0.08);
  } else if (state === 'blue-hour') {
    r = r * 0.88 + 8;
    g = g * 0.93 + 8;
    b = b * 1.05 + 12;
  }
  return [clamp(r), clamp(g), clamp(b), Math.round(a)];
}
function frameRaw(master, masterInfo, texture, textureInfo, phase, state) {
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
      const ny = (y + 0.5 - SIZE / 2) / (SIZE / 2 * RADIUS_SCALE);
    for (let x = 0; x < SIZE; x++) {
      const nx = (x + 0.5 - SIZE / 2) / (SIZE / 2 * RADIUS_SCALE);
      const d = nx * nx + ny * ny;
      const i = (y * SIZE + x) * 4;
      if (d > 1) { out[i + 3] = 0; continue; }
      const nz = Math.sqrt(Math.max(0, 1 - d));
      // Horizontal longitude wrap on a fixed sphere: no whole-image rotation.
      const lambda = Math.atan2(nx, nz) + phase;
      const latitude = Math.asin(Math.max(-1, Math.min(1, ny)));
      const u = ((lambda / (Math.PI * 2) + 0.5) % 1 + 1) % 1;
      const v = Math.max(0, Math.min(1, latitude / Math.PI + 0.5));
      const base = sampleRgb(texture, textureInfo.width, textureInfo.height,
        u * (textureInfo.width - 1), v * (textureInfo.height - 1));
      // Fixed, low-contrast light direction gives the flat texture coherent
      // spherical volume without changing with the rotation.
      const light = 0.93 + 0.10 * (0.62 * nx - 0.42 * ny + 0.66 * nz);
      const shaded = base.map((value) => value * light);
      const rgba = tint([...shaded, 255], state, nx, ny);
      const silhouette = sample(master, masterInfo.width, masterInfo.height, CX + nx * RX, CY + ny * RY);
      out[i] = rgba[0]; out[i + 1] = rgba[1]; out[i + 2] = rgba[2];
      // Alpha comes only from the fixed master silhouette, never from wrapped texture.
      out[i + 3] = Math.round(silhouette[3]);
    }
  }
  return out;
}
async function writeFrame(raw, state, number) {
  const dir = path.join(OUT, state);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `planet-${state}-${String(number + 1).padStart(3, '0')}.webp`);
  await sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .webp({ quality: 88, alphaQuality: 100, smartSubsample: false })
    .toFile(file);
}
async function main() {
  if (!fs.existsSync(MASTER)) throw new Error(`Missing master: ${MASTER}`);
  if (!fs.existsSync(TEXTURE_SOURCE)) throw new Error(`Missing texture reference: ${TEXTURE_SOURCE}`);
  const { data: master, info: masterInfo } = await sharp(MASTER).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: textureRaw, info: textureInfo } = await sharp(TEXTURE_SOURCE).resize({ width: 1024, height: 512, fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const texture = seamlessTexture(textureRaw, textureInfo.width, textureInfo.height);
  await sharp(texture, { raw: { width: textureInfo.width, height: textureInfo.height, channels: 3 } }).png().toFile(TEXTURE);
  for (const state of ['day', 'sunset', 'blue-hour']) {
    for (let i = 0; i < FRAMES; i++) await writeFrame(frameRaw(master, masterInfo, texture, textureInfo, (i / FRAMES) * Math.PI * 2, state), state, i);
  }
  await sharp(MASTER).resize({ width: 768, height: 768, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(OUT, 'master-v1-768.png'));
  console.log(`Built ${FRAMES} frames x 3 states at ${SIZE}x${SIZE} WebP in ${OUT}`);
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
