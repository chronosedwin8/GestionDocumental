/**
 * Genera los iconos PWA (public/icon-192.png y public/icon-512.png) que el
 * manifest declaraba pero no existían. Se dibujan con pngjs: fondo oscuro de
 * la marca, borde verde ácido y una "A" de archivo, sin dependencias binarias.
 *
 *   npm run icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '..', 'public');

const BG = [10, 10, 10];
const ACID = [204, 255, 0];

function setPixel(png, x, y, [r, g, b], alpha = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const index = (png.width * y + x) << 2;
  png.data[index] = r;
  png.data[index + 1] = g;
  png.data[index + 2] = b;
  png.data[index + 3] = alpha;
}

function fillRect(png, x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) setPixel(png, x, y, color);
  }
}

/** Línea gruesa entre dos puntos (algoritmo de Bresenham engrosado). */
function drawLine(png, x0, y0, x1, y1, color, thickness) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  const half = Math.floor(thickness / 2);

  for (;;) {
    fillRect(png, x - half, y - half, thickness, thickness, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function roundedBorder(png, size, color, inset, thickness, radius) {
  const min = inset;
  const max = size - inset - 1;
  for (let i = 0; i < thickness; i += 1) {
    const a = min + i;
    const b = max - i;
    for (let x = a + radius; x <= b - radius; x += 1) {
      setPixel(png, x, a, color);
      setPixel(png, x, b, color);
    }
    for (let y = a + radius; y <= b - radius; y += 1) {
      setPixel(png, a, y, color);
      setPixel(png, b, y, color);
    }
    // Esquinas redondeadas (cuartos de círculo).
    for (let angle = 0; angle <= 90; angle += 1) {
      const rad = (angle * Math.PI) / 180;
      const dx = Math.round(radius * Math.cos(rad));
      const dy = Math.round(radius * Math.sin(rad));
      setPixel(png, a + radius - dx, a + radius - dy, color);
      setPixel(png, b - radius + dx, a + radius - dy, color);
      setPixel(png, a + radius - dx, b - radius + dy, color);
      setPixel(png, b - radius + dx, b - radius + dy, color);
    }
  }
}

function buildIcon(size) {
  const png = new PNG({ width: size, height: size });
  fillRect(png, 0, 0, size, size, BG);

  const unit = size / 512;
  roundedBorder(png, size, ACID, Math.round(36 * unit), Math.max(2, Math.round(8 * unit)), Math.round(48 * unit));

  // Barra superior del "archivador".
  fillRect(
    png,
    Math.round(140 * unit),
    Math.round(150 * unit),
    Math.round(232 * unit),
    Math.round(34 * unit),
    ACID,
  );

  // "A" de Archivo.
  const thickness = Math.max(3, Math.round(24 * unit));
  const apexX = Math.round(256 * unit);
  const apexY = Math.round(215 * unit);
  const baseY = Math.round(378 * unit);
  drawLine(png, apexX, apexY, Math.round(168 * unit), baseY, ACID, thickness);
  drawLine(png, apexX, apexY, Math.round(344 * unit), baseY, ACID, thickness);
  drawLine(png, Math.round(200 * unit), Math.round(330 * unit), Math.round(312 * unit), Math.round(330 * unit), ACID, thickness);

  return PNG.sync.write(png);
}

mkdirSync(publicDir, { recursive: true });
for (const size of [192, 512]) {
  const buffer = buildIcon(size);
  const file = resolve(publicDir, `icon-${size}.png`);
  writeFileSync(file, buffer);
  console.log(`Generado ${file} (${buffer.length} bytes)`);
}
