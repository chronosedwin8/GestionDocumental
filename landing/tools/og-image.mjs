/**
 * Generador de la imagen social (Open Graph) 1200x630 de EduArchive SGDEA.
 *
 * No usa fuentes del sistema ni dependencias de rasterizacion: dibuja las
 * letras con una tipografia geometrica de trazos definida aqui mismo y las
 * rellena con un rasterizador por distancia (bordes suavizados).
 * Unica dependencia: `pngjs`, que ya es devDependency de la raiz del proyecto.
 */

import { PNG } from 'pngjs';

/* ---------------------------------------------------------------------------
 * Tipografia de trazos. Rejilla de 5 x 7 unidades (x: 0..4, y: 0..6).
 * Cada glifo es una lista de polilineas; los puntos se unen con trazo grueso
 * de extremos redondeados.
 * ------------------------------------------------------------------------- */

const GLYPHS = {
  A: [[[0, 6], [2, 0], [4, 6]], [[0.75, 4.05], [3.25, 4.05]]],
  B: [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
  C: [[[4, 1.1], [3, 0], [1, 0], [0, 1.1], [0, 4.9], [1, 6], [3, 6], [4, 4.9]]],
  D: [[[0, 0], [0, 6]], [[0, 0], [2.8, 0], [4, 1.2], [4, 4.8], [2.8, 6], [0, 6]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3.1, 3]]],
  F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3.1, 3]]],
  G: [[[4, 1.1], [3, 0], [1, 0], [0, 1.1], [0, 4.9], [1, 6], [3, 6], [4, 4.9], [4, 3.4], [2.2, 3.4]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3.1], [4, 3.1]]],
  I: [[[2, 0], [2, 6]], [[0.7, 0], [3.3, 0]], [[0.7, 6], [3.3, 6]]],
  J: [[[3.2, 0], [3.2, 4.8], [2.2, 6], [1, 6], [0, 4.9]]],
  K: [[[0, 0], [0, 6]], [[3.9, 0], [0.15, 3.35]], [[1.5, 2.55], [4, 6]]],
  L: [[[0, 0], [0, 6], [3.9, 6]]],
  M: [[[0, 6], [0, 0], [2, 2.7], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [[[1, 0], [3, 0], [4, 1.1], [4, 4.9], [3, 6], [1, 6], [0, 4.9], [0, 1.1], [1, 0]]],
  P: [[[0, 6], [0, 0], [3, 0], [4, 1.1], [4, 2.4], [3, 3.5], [0, 3.5]]],
  Q: [[[1, 0], [3, 0], [4, 1.1], [4, 4.9], [3, 6], [1, 6], [0, 4.9], [0, 1.1], [1, 0]], [[2.5, 4.3], [4.3, 6.4]]],
  R: [[[0, 6], [0, 0], [3, 0], [4, 1.1], [4, 2.4], [3, 3.5], [0, 3.5]], [[1.9, 3.5], [4, 6]]],
  S: [[[4, 1.1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 4.9]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 4.9], [1, 6], [3, 6], [4, 4.9], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 2.5], [3, 6], [4, 0]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [[[0, 0], [2, 3.1], [4, 0]], [[2, 3.1], [2, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  0: [[[1, 0], [3, 0], [4, 1.1], [4, 4.9], [3, 6], [1, 6], [0, 4.9], [0, 1.1], [1, 0]], [[3.3, 1.4], [0.7, 4.6]]],
  1: [[[0.7, 1.3], [2, 0], [2, 6]], [[0.7, 6], [3.3, 6]]],
  2: [[[0, 1.1], [1, 0], [3, 0], [4, 1.1], [4, 2.2], [0.1, 6], [4, 6]]],
  3: [[[0, 0], [4, 0], [1.7, 2.7]], [[1.7, 2.7], [3, 2.7], [4, 3.8], [4, 4.9], [3, 6], [1, 6], [0, 4.9]]],
  4: [[[3, 6], [3, 0], [0, 4.25], [4.2, 4.25]]],
  5: [[[4, 0], [0, 0], [0, 2.6], [3, 2.6], [4, 3.7], [4, 4.9], [3, 6], [1, 6], [0, 4.9]]],
  6: [[[3.6, 0.35], [2.6, 0], [1, 0], [0, 1.1], [0, 4.9], [1, 6], [3, 6], [4, 4.9], [4, 4], [3, 3], [1, 3], [0, 4]]],
  7: [[[0, 0], [4, 0], [1.6, 6]]],
  8: [[[1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]]],
  9: [[[0.4, 5.65], [1.4, 6], [3, 6], [4, 4.9], [4, 1.1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 2]]],
  '-': [[[0.6, 3.2], [3.4, 3.2]]],
  '/': [[[3.6, -0.2], [0.4, 6.2]]],
  '.': [[[2, 5.9], [2, 6]]],
  ',': [[[2, 5.9], [1.5, 6.9]]],
  ':': [[[2, 1.9], [2, 2]], [[2, 4.9], [2, 5]]],
  '·': [[[2, 3], [2, 3.05]]],
  '!': [[[2, 0], [2, 4.2]], [[2, 5.9], [2, 6]]],
  ' ': [],
};

// Vocales acentuadas: glifo base + tilde aguda.
const ACUTE = [[1.6, -1.3], [2.9, -2.4]];
for (const pair of [['Á', 'A'], ['É', 'E'], ['Í', 'I'], ['Ó', 'O'], ['Ú', 'U']]) {
  GLYPHS[pair[0]] = GLYPHS[pair[1]].concat([ACUTE]);
}
GLYPHS['Ñ'] = GLYPHS.N.concat([[[0.6, -1.9], [1.4, -2.5], [2.6, -1.9], [3.4, -2.5]]]);

const GLYPH_W = 4; // ancho util del glifo en unidades
const GLYPH_H = 6; // alto util del glifo en unidades

/* ---------------------------------------------------------------------------
 * Lienzo RGBA con mezcla alfa y rasterizado por distancia.
 * ------------------------------------------------------------------------- */

class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  fill(color) {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = color[0];
      this.data[i + 1] = color[1];
      this.data[i + 2] = color[2];
      this.data[i + 3] = 255;
    }
  }

  blend(x, y, color, alpha) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const a = Math.min(1, alpha);
    const i = (y * this.width + x) * 4;
    this.data[i] = this.data[i] * (1 - a) + color[0] * a;
    this.data[i + 1] = this.data[i + 1] * (1 - a) + color[1] * a;
    this.data[i + 2] = this.data[i + 2] * (1 - a) + color[2] * a;
    this.data[i + 3] = 255;
  }

  rect(x, y, w, h, color, alpha = 1) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) this.blend(px, py, color, alpha);
    }
  }

  /** Traza una polilinea con grosor `weight` y extremos redondeados. */
  stroke(points, weight, color, alpha = 1) {
    if (points.length === 0) return;
    const half = weight / 2;
    const pad = Math.ceil(half + 2);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      if (point[0] < minX) minX = point[0];
      if (point[0] > maxX) maxX = point[0];
      if (point[1] < minY) minY = point[1];
      if (point[1] > maxY) maxY = point[1];
    }
    const x0 = Math.max(0, Math.floor(minX) - pad);
    const x1 = Math.min(this.width, Math.ceil(maxX) + pad);
    const y0 = Math.max(0, Math.floor(minY) - pad);
    const y1 = Math.min(this.height, Math.ceil(maxY) + pad);
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        const d = distanceToPolyline(px + 0.5, py + 0.5, points);
        const cov = Math.min(1, Math.max(0, half + 0.5 - d));
        if (cov > 0) this.blend(px, py, color, cov * alpha);
      }
    }
  }

  toPng() {
    const png = new PNG({ width: this.width, height: this.height });
    png.data = Buffer.from(this.data.buffer, this.data.byteOffset, this.data.length);
    return PNG.sync.write(png);
  }
}

function distanceToPolyline(x, y, points) {
  if (points.length === 1) {
    return Math.hypot(x - points[0][0], y - points[0][1]);
  }
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const ax = points[i][0];
    const ay = points[i][1];
    const dx = points[i + 1][0] - ax;
    const dy = points[i + 1][1] - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

/* ---------------------------------------------------------------------------
 * Composicion de texto
 * ------------------------------------------------------------------------- */

function drawText(canvas, text, options) {
  const { x, y, unit, weight, color, tracking = 0, alpha = 1 } = options;
  let cursor = x;
  for (const char of text.toUpperCase()) {
    const glyph = GLYPHS[char] || GLYPHS[' '];
    for (const polyline of glyph) {
      const points = polyline.map((p) => [cursor + p[0] * unit, y + p[1] * unit]);
      canvas.stroke(points, weight, color, alpha);
    }
    cursor += GLYPH_W * unit + tracking;
  }
  return cursor - tracking;
}

/* ---------------------------------------------------------------------------
 * Imagen social
 * ------------------------------------------------------------------------- */

const INK = {
  bg: [8, 10, 6],
  bgLift: [18, 22, 13],
  grid: [204, 255, 0],
  white: [244, 247, 238],
  acid: [204, 255, 0],
  muted: [152, 162, 136],
};

export function renderOgImage(options = {}) {
  const {
    eyebrow = 'EDUARCHIVE SGDEA',
    line1 = 'ARCHIVO ELECTRÓNICO',
    line2 = 'QUE CUMPLE LA NORMA',
    footer = 'LEY 594 DE 2000 · ACUERDOS AGN · COLOMBIA',
    width = 1200,
    height = 630,
  } = options;

  const canvas = new Canvas(width, height);
  canvas.fill(INK.bg);

  // Halo diagonal muy tenue hacia la esquina superior izquierda.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const d = Math.hypot(x - width * 0.12, y - height * 0.06) / (width * 0.9);
      const a = Math.max(0, 0.5 - d) * 0.36;
      if (a > 0) canvas.blend(x, y, INK.bgLift, a);
    }
  }

  // Reticula de archivo.
  for (let x = 48; x < width; x += 48) canvas.rect(x, 0, 1, height, INK.grid, 0.035);
  for (let y = 48; y < height; y += 48) canvas.rect(0, y, width, 1, INK.grid, 0.024);

  // Barra acida lateral: la firma visual de la marca.
  canvas.rect(0, 0, 14, height, INK.acid, 1);
  canvas.rect(14, 0, 3, height, INK.acid, 0.28);

  const marginX = 88;
  const contentW = width - marginX - 100;

  // Marca de agua tipo lomo de expediente, esquina inferior derecha.
  const barTop = 372;
  for (let i = 0; i < 7; i += 1) {
    const w = 176 - i * 19;
    canvas.rect(width - 100 - w, barTop + i * 23, w, 6, INK.acid, 0.09 + i * 0.045);
  }

  // Cuadro de acento + eyebrow.
  canvas.rect(marginX, 102, 16, 16, INK.acid, 1);
  drawText(canvas, eyebrow, {
    x: marginX + 36, y: 102, unit: 3.1, weight: 3.4, color: INK.muted, tracking: 7,
  });

  // Regla fina bajo el eyebrow.
  canvas.rect(marginX, 156, contentW, 1, INK.white, 0.16);

  // Titular en dos lineas, ajustado al ancho disponible.
  const lines = [
    { text: line1, color: INK.white },
    { text: line2, color: INK.acid },
  ];
  const longest = Math.max.apply(null, lines.map((l) => l.text.length));
  const unit = contentW / (longest * (GLYPH_W + 1.35) - 1.35);
  const tracking = unit * 1.35;
  const weight = Math.max(6, unit * 0.86);

  let y = 214;
  for (const line of lines) {
    drawText(canvas, line.text, {
      x: marginX, y, unit, weight, color: line.color, tracking,
    });
    y += GLYPH_H * unit + unit * 3.2;
  }

  // Pie: marco normativo.
  const footerY = height - 104;
  canvas.rect(marginX, footerY - 36, 58, 2, INK.acid, 0.85);
  drawText(canvas, footer, {
    x: marginX, y: footerY, unit: 2.9, weight: 3.2, color: INK.muted, tracking: 6,
  });

  return canvas.toPng();
}
