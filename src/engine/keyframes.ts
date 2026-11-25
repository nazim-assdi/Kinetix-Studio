import {
  AnimatableProperty,
  EasingType,
  Keyframe,
  TimelineClip,
  TransformState,
} from '../types/editor';
import { clamp } from './timecode';
import { evaluateExpression } from './expressions';

export function getClipLocalTime(clip: TimelineClip, globalTime: number): number {
  const raw = clamp(globalTime - clip.start, 0, clip.duration);
  const speed = clamp(clip.speed ?? 1, 0.25, 4);
  const scaled = (raw * speed) % Math.max(0.05, clip.duration);
  const effective = raw * speed <= clip.duration ? raw * speed : scaled;
  return clip.reversed ? Math.max(0, clip.duration - effective) : effective;
}

/**
 * Evaluates a cubic-bezier easing curve y(t) for x1, y1, x2, y2.
 */
export function solveCubicBezier(
  t: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const x = clamp(t, 0, 1);
  // Newton-Raphson approximation for parameter u where Bx(u) = x
  let u = x;
  for (let i = 0; i < 6; i++) {
    const inv = 1 - u;
    const bx = 3 * inv * inv * u * x1 + 3 * inv * u * u * x2 + u * u * u;
    const dbx =
      3 * inv * inv * x1 +
      6 * inv * u * (x2 - x1) +
      3 * u * u * (1 - x2);
    if (Math.abs(dbx) < 1e-5) break;
    u = clamp(u - (bx - x) / dbx, 0, 1);
  }
  const inv = 1 - u;
  return 3 * inv * inv * u * y1 + 3 * inv * u * u * y2 + u * u * u;
}

export function applyEasing(
  t: number,
  easing: EasingType,
  bezier?: [number, number, number, number]
): number {
  const x = clamp(t, 0, 1);
  switch (easing) {
    case 'ease-in':
      return x * x * x;
    case 'ease-out':
      return 1 - Math.pow(1 - x, 3);
    case 'ease-in-out':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'bezier':
      if (bezier) {
        return solveCubicBezier(x, bezier[0], bezier[1], bezier[2], bezier[3]);
      }
      return solveCubicBezier(x, 0.16, 1, 0.3, 1);
    case 'overshoot': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    case 'elastic': {
      if (x === 0 || x === 1) return x;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    }
    case 'linear':
    default:
      return x;
  }
}

export function interpolateKeyframes(
  keyframes: Keyframe[] | undefined,
  localTime: number,
  fallbackValue: number
): number {
  if (!keyframes || keyframes.length === 0) {
    return fallbackValue;
  }

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  if (localTime <= sorted[0].time) {
    return sorted[0].value;
  }
  const last = sorted[sorted.length - 1];
  if (localTime >= last.time) {
    return last.value;
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const k1 = sorted[i];
    const k2 = sorted[i + 1];
    if (localTime >= k1.time && localTime <= k2.time) {
      const span = k2.time - k1.time;
      if (span <= 1e-6) return k2.value;
      const progress = (localTime - k1.time) / span;
      const eased = applyEasing(progress, k1.easing, k1.bezier);
      return k1.value + (k2.value - k1.value) * eased;
    }
  }

  return fallbackValue;
}

export function evaluateClipTransform(
  clip: TimelineClip,
  globalTime: number
): TransformState {
  const localTime = getClipLocalTime(clip, globalTime);
  const exp = clip.expressions ?? {};

  const evalProp = (
    prop: AnimatableProperty,
    baseVal: number,
    seedOffset: number
  ) => {
    const interpolated = interpolateKeyframes(
      clip.keyframes[prop],
      localTime,
      baseVal
    );
    const expr = exp[prop];
    if (!expr) return interpolated;
    return evaluateExpression(expr, {
      time: globalTime,
      localTime,
      duration: clip.duration,
      value: interpolated,
      seedOffset,
    });
  };

  return {
    x: evalProp('x', clip.transform.x, 1.1),
    y: evalProp('y', clip.transform.y, 2.3),
    z: evalProp('z', clip.transform.z ?? 0, 3.7),
    anchorX: evalProp('anchorX', clip.transform.anchorX ?? 0, 4.1),
    anchorY: evalProp('anchorY', clip.transform.anchorY ?? 0, 5.2),
    scale: evalProp('scale', clip.transform.scale, 6.4),
    rotation: evalProp('rotation', clip.transform.rotation, 7.8),
    rotationX: evalProp('rotationX', clip.transform.rotationX ?? 0, 8.5),
    rotationY: evalProp('rotationY', clip.transform.rotationY ?? 0, 9.9),
    opacity: clamp(evalProp('opacity', clip.transform.opacity, 11.2), 0, 100),
    shapeWidth: evalProp('shapeWidth', clip.shapeProps?.width ?? 0, 12.1),
    shapeHeight: evalProp('shapeHeight', clip.shapeProps?.height ?? 0, 13.7),
  };
}

function getAnimatableBaseValue(clip: TimelineClip, prop: AnimatableProperty): number {
  if (prop === 'shapeWidth') return clip.shapeProps?.width ?? 0;
  if (prop === 'shapeHeight') return clip.shapeProps?.height ?? 0;
  return clip.transform[prop] ?? 0;
}

export function upsertKeyframe(
  clip: TimelineClip,
  prop: AnimatableProperty,
  localTime: number,
  value: number,
  easing: EasingType = 'ease-in-out',
  // Only replace a keyframe at effectively the same timestamp. The old 40ms
  // window silently swallowed neighbouring-frame keys at 24/30/60fps.
  tolerance: number = 0.001,
  bezier?: [number, number, number, number]
): TimelineClip {
  const clampedTime = clamp(Number(localTime.toFixed(3)), 0, clip.duration);
  const existing = [...(clip.keyframes[prop] ?? [])];
  const nearIdx = existing.findIndex((k) => Math.abs(k.time - clampedTime) <= tolerance);

  if (nearIdx >= 0) {
    existing[nearIdx] = {
      ...existing[nearIdx],
      value,
      ...(bezier ? { bezier, easing: 'bezier' } : {}),
    };
  } else {
    existing.push({
      id: `kf_${prop}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      time: clampedTime,
      value,
      easing,
      ...(bezier ? { bezier } : {}),
    });
  }

  existing.sort((a, b) => a.time - b.time);

  return {
    ...clip,
    keyframes: {
      ...clip.keyframes,
      [prop]: existing,
    },
  };
}

export function togglePropertyKeyframing(
  clip: TimelineClip,
  prop: AnimatableProperty,
  localTime: number
): TimelineClip {
  const existing = clip.keyframes[prop];
  if (existing && existing.length > 0) {
    const frozenValue = interpolateKeyframes(
      existing,
      localTime,
      clip.transform[prop] ?? 0
    );
    const nextKeyframes = { ...clip.keyframes };
    delete nextKeyframes[prop];
    return {
      ...clip,
      transform: {
        ...clip.transform,
        [prop]: Number(frozenValue.toFixed(2)),
      },
      keyframes: nextKeyframes,
    };
  }

  return upsertKeyframe(
    clip,
    prop,
    localTime,
    getAnimatableBaseValue(clip, prop),
    'ease-in-out'
  );
}

export function removeKeyframeAtTime(
  clip: TimelineClip,
  prop: AnimatableProperty,
  keyframeId: string
): TimelineClip {
  const existing = clip.keyframes[prop] ?? [];
  const filtered = existing.filter((k) => k.id !== keyframeId);
  const nextKeyframes = { ...clip.keyframes };
  if (filtered.length === 0) {
    delete nextKeyframes[prop];
  } else {
    nextKeyframes[prop] = filtered;
  }
  return {
    ...clip,
    keyframes: nextKeyframes,
  };
}

export function updateKeyframeEasing(
  clip: TimelineClip,
  prop: AnimatableProperty,
  keyframeId: string,
  easing: EasingType,
  bezier?: [number, number, number, number]
): TimelineClip {
  const existing = clip.keyframes[prop] ?? [];
  return {
    ...clip,
    keyframes: {
      ...clip.keyframes,
      [prop]: existing.map((k) =>
        k.id === keyframeId ? { ...k, easing, bezier } : k
      ),
    },
  };
}
