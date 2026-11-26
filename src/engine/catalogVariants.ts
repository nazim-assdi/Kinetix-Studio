import { AnimatableProperty, MotionPresetItem, TimelineClip } from '../types/editor';

function applyCatalogMotionVariant(
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
