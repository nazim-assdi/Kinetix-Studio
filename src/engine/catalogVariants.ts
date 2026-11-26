import { AnimatableProperty, ColorWheelGrade, MotionPresetItem, TimelineClip } from '../types/editor';

export function applyCatalogMotionVariant(
  clip: TimelineClip,
  variant: MotionPresetItem['motionVariant']
): TimelineClip {
  if (!variant) return clip;
  const duration = Math.max(0.01, Math.min(clip.duration, variant.duration ?? 0.8));
  const intensity = Math.max(0.1, Math.min(3, variant.intensity ?? 1));
  const directionVectors = {
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    'top-left': { x: -0.707, y: -0.707 },
    'top-right': { x: 0.707, y: -0.707 },
    'bottom-left': { x: -0.707, y: 0.707 },
    'bottom-right': { x: 0.707, y: 0.707 },
    center: { x: 0, y: 0 },
  } as const;
  const vector = directionVectors[variant.direction ?? 'center'];
  const easing = variant.easing ?? 'ease-out';
  const bezier = variant.bezier ?? [0.16, 1, 0.3, 1];
  const suffix = `lib_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const keyframes = { ...clip.keyframes };

  (Object.keys(keyframes) as AnimatableProperty[]).forEach((property) => {
    const list = keyframes[property];
    if (!list?.length || property === 'x' || property === 'y') return;
    const sorted = [...list].sort((a, b) => a.time - b.time);
    const lastTime = Math.max(0.001, sorted[sorted.length - 1].time);
    const neutral = property === 'scale' ? 100 : Number(clip.transform[property] ?? 0);
    keyframes[property] = sorted.map((frame, index) => {
      let value = frame.value;
      if (property === 'scale' || property === 'rotation' || property === 'rotationX' || property === 'rotationY') {
        value = neutral + (value - neutral) * intensity;
      }
      return {
        ...frame,
        time: (frame.time / lastTime) * duration,
        value,
        easing: index === sorted.length - 1 ? frame.easing : easing,
        ...(easing === 'bezier' && index !== sorted.length - 1 ? { bezier } : {}),
      };
    });
  });

  // Direction is real transform data, not merely a catalogue label.
  const distance = 260 * intensity;
  keyframes.x = [
    { id: `${suffix}_x_in`, time: 0, value: clip.transform.x + vector.x * distance, easing: easing, ...(easing === 'bezier' ? { bezier } : {}) },
    { id: `${suffix}_x_out`, time: duration, value: clip.transform.x, easing: 'linear' },
  ];
  keyframes.y = [
    { id: `${suffix}_y_in`, time: 0, value: clip.transform.y + vector.y * distance, easing: easing, ...(easing === 'bezier' ? { bezier } : {}) },
    { id: `${suffix}_y_out`, time: duration, value: clip.transform.y, easing: 'linear' },
  ];

  return { ...clip, keyframes };
}

export function buildCatalogColorGrade(
  item: MotionPresetItem,
  baseGrade: Omit<ColorWheelGrade, 'enabled'>
): ColorWheelGrade {
  const strength = Math.max(0, Math.min(1, item.lutStrength ?? 1));
  const moodAdjustments = {
    cinema: { temp: -2, tint: 1, contrast: 8, saturation: 3 },
    commercial: { temp: 2, tint: 0, contrast: 5, saturation: 12 },
    documentary: { temp: 0, tint: 0, contrast: -3, saturation: -12 },
    'music-video': { temp: -4, tint: 5, contrast: 13, saturation: 18 },
    wedding: { temp: 11, tint: 3, contrast: -5, saturation: 5 },
    'sci-fi': { temp: -15, tint: 12, contrast: 15, saturation: 14 },
    travel: { temp: 6, tint: -2, contrast: 4, saturation: 16 },
    tech: { temp: -7, tint: 4, contrast: 10, saturation: 8 },
  } as const;
  const mood = moodAdjustments[item.lutMood ?? 'cinema'];
  const blend = (value: number) => value * strength;
  return {
    ...baseGrade,
    enabled: true,
    lift: {
      r: blend(baseGrade.lift.r), g: blend(baseGrade.lift.g),
      b: blend(baseGrade.lift.b), luma: blend(baseGrade.lift.luma),
    },
    gamma: {
      r: blend(baseGrade.gamma.r), g: blend(baseGrade.gamma.g),
      b: blend(baseGrade.gamma.b), luma: blend(baseGrade.gamma.luma),
    },
    gain: {
      r: blend(baseGrade.gain.r), g: blend(baseGrade.gain.g),
      b: blend(baseGrade.gain.b), luma: blend(baseGrade.gain.luma),
    },
    temp: (baseGrade.temp + mood.temp) * strength,
    tint: (baseGrade.tint + mood.tint) * strength,
    contrast: 100 + (baseGrade.contrast - 100 + mood.contrast) * strength,
    saturation: 100 + (baseGrade.saturation - 100 + mood.saturation) * strength,
    lut: `${baseGrade.lut} · ${item.lutMood ?? 'cinema'} · ${Math.round(strength * 100)}%`,
  };
}
