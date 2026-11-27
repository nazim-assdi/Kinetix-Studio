import type { CubeLut } from '../types/editor';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function parseCubeLut(source: string, fileName = 'Imported LUT'): CubeLut {
  const rows: [number, number, number][] = [];
  let size = 0;
  let title = fileName.replace(/\.cube$/i, '');
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const keyword = parts[0].toUpperCase();
    if (keyword === 'TITLE') {
      title = line.slice(5).trim().replace(/^['"]|['"]$/g, '') || title;
      continue;
    }
    if (keyword === 'LUT_3D_SIZE') {
      size = Number(parts[1]);
      if (!Number.isInteger(size) || size < 2 || size > 64) {
        throw new Error('3D LUT size must be an integer between 2 and 64.');
      }
      continue;
    }
    if (keyword === 'DOMAIN_MIN' || keyword === 'DOMAIN_MAX') {
      const values = parts.slice(1).map(Number);
      if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
        throw new Error('Invalid LUT domain declaration.');
      }
      if (keyword === 'DOMAIN_MIN') domainMin = values as [number, number, number];
      else domainMax = values as [number, number, number];
      continue;
    }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(parts[0])) {
      const values = parts.slice(0, 3).map(Number);
      if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
        throw new Error('Invalid RGB sample in LUT file.');
      }
      rows.push(values as [number, number, number]);
    }
  }

  if (!size) throw new Error('The .cube file is missing LUT_3D_SIZE.');
  if (rows.length !== size * size * size) {
    throw new Error(\`Expected \${size ** 3} LUT samples, found \${rows.length}.\`);
  }
  if (domainMax.some((value, index) => value <= domainMin[index])) {
    throw new Error('LUT DOMAIN_MAX values must be greater than DOMAIN_MIN.');
  }

  return { name: title, size, domainMin, domainMax, data: rows };
}

export function sampleCubeLut(
  lut: CubeLut,
  red: number,
  green: number,
  blue: number
): [number, number, number] {
  const coordinates = [red, green, blue].map((value, index) => {
    const normalized = clamp(
      (value - lut.domainMin[index]) / (lut.domainMax[index] - lut.domainMin[index]),
      0,
      1
    ) * (lut.size - 1);
    const low = Math.floor(normalized);
    return { low, high: Math.min(lut.size - 1, low + 1), fraction: normalized - low };
  });
  const [r, g, b] = coordinates;
  const sample = (ri: number, gi: number, bi: number) =>
    lut.data[ri + gi * lut.size + bi * lut.size * lut.size];

  const interpolate = (channel: 0 | 1 | 2) => {
    const c000 = sample(r.low, g.low, b.low)[channel];
    const c100 = sample(r.high, g.low, b.low)[channel];
    const c010 = sample(r.low, g.high, b.low)[channel];
    const c110 = sample(r.high, g.high, b.low)[channel];
    const c001 = sample(r.low, g.low, b.high)[channel];
    const c101 = sample(r.high, g.low, b.high)[channel];
    const c011 = sample(r.low, g.high, b.high)[channel];
    const c111 = sample(r.high, g.high, b.high)[channel];
    const mix = (a: number, bValue: number, amount: number) => a + (bValue - a) * amount;
    const z0 = mix(
      mix(c000, c100, r.fraction),
      mix(c010, c110, r.fraction),
      g.fraction
    );
    const z1 = mix(
      mix(c001, c101, r.fraction),
      mix(c011, c111, r.fraction),
      g.fraction
    );
    return mix(z0, z1, b.fraction);
  };

  return [interpolate(0), interpolate(1), interpolate(2)];
}

export function applyCubeLutToCanvas(canvas: HTMLCanvasElement, lut: CubeLut): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const mapped = sampleCubeLut(lut, pixels[index] / 255, pixels[index + 1] / 255, pixels[index + 2] / 255);
    pixels[index] = Math.round(clamp(mapped[0], 0, 1) * 255);
    pixels[index + 1] = Math.round(clamp(mapped[1], 0, 1) * 255);
    pixels[index + 2] = Math.round(clamp(mapped[2], 0, 1) * 255);
  }
  ctx.putImageData(image, 0, 0);
}
