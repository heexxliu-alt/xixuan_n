#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const sharp = require('/Users/liuxinran/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const SIZE = 512;
const FRAME_COUNT = 24;
const RADIUS = 181;
const OUTPUT_DIR = path.resolve(__dirname, '../assets/planet-prototype');

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

// Build each frame from a single sphere model rather than modifying the old
// ringed composite. The silhouette, center, lighting and alpha edge are fixed;
// only the periodic longitude texture phase advances from frame to frame.
const makeFrame = (frameIndex) => {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const phase = (Math.PI * 2 * frameIndex) / FRAME_COUNT;
  const light = [-0.42, -0.52, 0.74];
  const lightLength = Math.hypot(...light);
  light[0] /= lightLength;
  light[1] /= lightLength;
  light[2] /= lightLength;

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = (x + 0.5 - SIZE / 2) / RADIUS;
      const dy = (y + 0.5 - SIZE / 2) / RADIUS;
      const radial = Math.hypot(dx, dy);
      const offset = (y * SIZE + x) * 4;
      if (radial > 1.01) {
        pixels[offset + 3] = 0;
        continue;
      }

      const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
      const longitude = Math.atan2(dx, nz) + phase;
      const latitude = Math.asin(clamp(dy, -1, 1));

      const broad = 0.5 + 0.5 * Math.sin(2.15 * longitude + 1.2 * Math.sin(latitude * 2.1));
      const ribbon = 0.5 + 0.5 * Math.sin(5.2 * longitude - 1.35 * Math.sin(latitude * 3.2) + 0.8);
      const wisps = 0.5 + 0.5 * Math.sin(9.5 * longitude + 2.2 * Math.sin(latitude * 5.1) - 0.6);
      const latitudeBand = 0.5 + 0.5 * Math.sin(7.2 * latitude + 1.7 * Math.sin(longitude * 2.4));
      const texture = clamp(0.40 * broad + 0.30 * ribbon + 0.18 * wisps + 0.12 * latitudeBand);
      const coolBand = 0.5 + 0.5 * Math.sin(3.1 * longitude + latitude * 4.8 + 1.8);

      const warm = [250, 190, 219];
      const lilac = [180, 151, 224];
      const deepLilac = [137, 126, 191];
      const aqua = [159, 208, 232];
      const blend = texture;
      const deepMix = Math.pow(blend, 2.2) * 0.55;
      let red = warm[0] + (lilac[0] - warm[0]) * blend;
      let green = warm[1] + (lilac[1] - warm[1]) * blend;
      let blue = warm[2] + (lilac[2] - warm[2]) * blend;
      red += (deepLilac[0] - red) * deepMix;
      green += (deepLilac[1] - green) * deepMix;
      blue += (deepLilac[2] - blue) * deepMix;
      const aquaMix = Math.pow(coolBand, 7) * 0.20;
      red += (aqua[0] - red) * aquaMix;
      green += (aqua[1] - green) * aquaMix;
      blue += (aqua[2] - blue) * aquaMix;

      const dot = Math.max(0, dx * light[0] + dy * light[1] + nz * light[2]);
      const diffuse = 0.62 + 0.38 * dot;
      const specular = Math.pow(Math.max(0, dot), 18) * 0.12;
      const rim = Math.pow(1 - nz, 2.4) * 0.06;
      const edgeAlpha = radial > 0.985 ? clamp((1.01 - radial) / 0.025) : 1;

      pixels[offset] = Math.round(clamp((red * diffuse + 255 * specular + 255 * rim) / 255) * 255);
      pixels[offset + 1] = Math.round(clamp((green * diffuse + 255 * specular + 255 * rim) / 255) * 255);
      pixels[offset + 2] = Math.round(clamp((blue * diffuse + 255 * specular + 255 * rim) / 255) * 255);
      pixels[offset + 3] = Math.round(edgeAlpha * 255);
    }
  }
  return sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .webp({ quality: 88, alphaQuality: 95, effort: 4 })
    .toFile(path.join(OUTPUT_DIR, `planet-${String(frameIndex).padStart(2, '0')}.webp`));
};

(async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all(Array.from({ length: FRAME_COUNT }, (_, index) => makeFrame(index)));
  console.log(`Generated ${FRAME_COUNT} ringless ${SIZE}x${SIZE} WebP frames in ${OUTPUT_DIR}`);
})();
