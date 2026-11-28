import type { HslSecondaryGrade } from '../types/editor';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta < 0.000001) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return [((hue * 60) + 360) % 360, saturation, lightness];
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = h / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  let rgb: [number, number, number];
  if (sector < 1) rgb = [chroma, x, 0];
  else if (sector < 2) rgb = [x, chroma, 0];
  else if (sector < 3) rgb = [0, chroma, x];
  else if (sector < 4) rgb = [0, x, chroma];
  else if (sector < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  const offset = l - chroma / 2;
  return [(rgb[0] + offset) * 255, (rgb[1] + offset) * 255, (rgb[2] + offset) * 255];
}

/**
 * Applies a feathered HSL secondary selection to RGBA pixels in-place.
 * Hue is circular (0° and 360° are identical); luminance and saturation are
 * changed only where the selected hue range is strong.
 */
export function applyHslSecondaryToPixels(
  pixels: Uint8ClampedArray,
  settings: HslSecondaryGrade
): void {
  if (!settings.enabled) return;
  const center = ((settings.hueCenter % 360) + 360) % 360;
  const halfWidth = clamp(settings.hueWidth, 5, 180) / 2;
  const feather = Math.max(0.5, (clamp(settings.softness, 0, 100) / 100) * 40);
  const hueShift = clamp(settings.hueShift, -180, 180);
  const saturationShift = clamp(settings.saturation, -100, 100) / 100;
  const luminanceShift = clamp(settings.luminance, -100, 100) / 100 * 0.35;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const [hue, saturation, lightness] = rgbToHsl(
      pixels[index] / 255,
      pixels[index + 1] / 255,
      pixels[index + 2] / 255
    );
    const rawDistance = Math.abs(hue - center);
    const distance = Math.min(rawDistance, 360 - rawDistance);
    const weight = 1 - smoothstep(halfWidth, halfWidth + feather, distance);
    if (weight <= 0.001) continue;
    const mapped = hslToRgb(
      hue + hueShift * weight,
      saturation + saturationShift * weight * Math.max(0.25, 1 - saturationShift * 0.4),
      lightness + luminanceShift * weight
    );
    pixels[index] = clamp(Math.round(mapped[0]), 0, 255);
    pixels[index + 1] = clamp(Math.round(mapped[1]), 0, 255);
    pixels[index + 2] = clamp(Math.round(mapped[2]), 0, 255);
  }
}
