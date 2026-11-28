import type { HslSecondaryGrade, LumetriRgbCurves } from '../types/editor';

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

function toneCurveWeight(luma: number, channel: 'shadows' | 'midtones' | 'highlights'): number {
  if (channel === 'shadows') return 1 - smoothstep(0.08, 0.62, luma);
  if (channel === 'highlights') return smoothstep(0.38, 0.94, luma);
  return clamp(1 - Math.abs(luma - 0.5) / 0.48, 0, 1);
}

/** Applies Master + Red + Green + Blue Lumetri-style tonal curves in-place. */
export function applyLumetriRgbCurvesToPixels(
  pixels: Uint8ClampedArray,
  curves: LumetriRgbCurves
): void {
  const allValues = [
    curves.master.shadows, curves.master.midtones, curves.master.highlights,
    curves.red.shadows, curves.red.midtones, curves.red.highlights,
    curves.green.shadows, curves.green.midtones, curves.green.highlights,
    curves.blue.shadows, curves.blue.midtones, curves.blue.highlights,
  ];
  if (allValues.every((value) => Math.abs(value) < 0.01)) return;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const red = pixels[index] / 255;
    const green = pixels[index + 1] / 255;
    const blue = pixels[index + 2] / 255;
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const shadowWeight = toneCurveWeight(luma, 'shadows');
    const midtoneWeight = toneCurveWeight(luma, 'midtones');
    const highlightWeight = toneCurveWeight(luma, 'highlights');
    const master = (
      curves.master.shadows * shadowWeight +
      curves.master.midtones * midtoneWeight +
      curves.master.highlights * highlightWeight
    ) * 0.0024;

    const channelDelta = (channel: 'red' | 'green' | 'blue') => (
      curves[channel].shadows * shadowWeight +
      curves[channel].midtones * midtoneWeight +
      curves[channel].highlights * highlightWeight
    ) * 0.0024;

    pixels[index] = clamp(Math.round((red + master + channelDelta('red')) * 255), 0, 255);
    pixels[index + 1] = clamp(Math.round((green + master + channelDelta('green')) * 255), 0, 255);
    pixels[index + 2] = clamp(Math.round((blue + master + channelDelta('blue')) * 255), 0, 255);
  }
}

/** Lightweight unsharp-mask pass for an explicitly enabled Lumetri sharpen control. */
export function applyLumetriSharpenToPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number
): void {
  const strength = clamp(amount, 0, 100) / 100 * 1.15;
  if (strength <= 0.001 || width < 3 || height < 3) return;
  const source = new Uint8ClampedArray(pixels);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = (y * width + x) * 4;
      const up = index - width * 4;
      const down = index + width * 4;
      const left = index - 4;
      const right = index + 4;
      for (let channel = 0; channel < 3; channel++) {
        const blur = (source[up + channel] + source[down + channel] + source[left + channel] + source[right + channel]) * 0.25;
        pixels[index + channel] = clamp(Math.round(source[index + channel] + (source[index + channel] - blur) * strength), 0, 255);
      }
    }
  }
}
