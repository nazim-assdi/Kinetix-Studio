import {
  AnimatableProperty,
  EffectDefinition,
  EffectItem,
  EffectType,
  KeyframeMap,
  TimelineClip,
} from '../types/editor';
import { clamp } from './timecode';
import { getAnimatableBaseValue, interpolateKeyframes } from './keyframes';

export const EFFECT_LIBRARY: EffectDefinition[] = [
  {
    type: 'blur',
    name: 'Gaussian Blur',
    category: 'Blur & Sharpen',
    description: 'Smooth optical blur with adjustable radius.',
    defaultParams: { radius: 8 },
  },
  {
    type: 'motionblur',
    name: 'Directional Motion Blur',
    category: 'Blur & Sharpen',
    description: 'High-speed shutter directional smear.',
    defaultParams: { amount: 24, angle: 0 },
  },
  {
    type: 'glow',
    name: 'Cinema Glow',
    category: 'Stylize',
    description: 'Soft highlight bloom and atmospheric halation.',
    defaultParams: { intensity: 45, radius: 18 },
  },
  {
    type: 'dropshadow',
    name: 'Drop Shadow',
    category: 'Stylize',
    description: 'Soft directional depth shadow behind layer.',
    defaultParams: { blur: 18, distance: 12, opacity: 70 },
  },
  {
    type: 'filmgrain',
    name: '35mm Film Grain',
    category: 'Stylize',
    description: 'Organic cinema emulsion grain texture.',
    defaultParams: { amount: 18, size: 2 },
  },
  {
    type: 'posterize',
    name: 'Posterize Levels',
    category: 'Stylize',
    description: 'Quantizes tonal steps for graphic look.',
    defaultParams: { levels: 6 },
  },
  {
    type: 'color',
    name: 'Lumetri Color',
    category: 'Color Correction',
    description: 'Exposure, contrast, saturation, and hue grading.',
    defaultParams: { exposure: 100, contrast: 112, saturation: 108, hue: 0 },
  },
  {
    type: 'hue_sat',
    name: 'Hue / Saturation',
    category: 'Color Correction',
    description: 'Master hue shift and color vibrance.',
    defaultParams: { hue: 0, saturation: 115, lightness: 100 },
  },
  {
    type: 'tint',
    name: 'Duotone Tint',
    category: 'Color Correction',
    description: 'Warm/cool cinematic split-tone wash.',
    defaultParams: { warmth: 25, amount: 35 },
  },
  {
    type: 'vignette',
    name: 'Edge Vignette',
    category: 'Color Correction',
    description: 'Optical lens falloff around frame perimeter.',
    defaultParams: { amount: 55, softness: 65 },
  },
  {
    type: 'chromatic',
    name: 'Chromatic Aberration',
    category: 'Distort',
    description: 'Prismatic RGB channel separation on edges.',
    defaultParams: { shift: 6 },
  },
  {
    type: 'glitch',
    name: 'Digital Glitch',
    category: 'Distort',
    description: 'Horizontal scanline displacement slices.',
    defaultParams: { amount: 25, slices: 8 },
  },
  {
    type: 'wavewarp',
    name: 'Wave Warp',
    category: 'Distort',
    description: 'Fluid sinusoidal ripple distortion over time.',
    defaultParams: { height: 12, width: 35, speed: 4 },
  },
  {
    type: 'lensflare',
    name: 'Anamorphic Lens Flare',
    category: 'Generate',
    description: 'Horizontal anamorphic optical streak & flare.',
    defaultParams: { brightness: 65, x: 50, y: 35 },
  },
  {
    type: 'chromakey',
    name: 'Ultra Chroma Key',
    category: 'Keying',
    description: 'Green/Blue screen color keyer with spill suppression.',
    defaultParams: { hueTarget: 120, tolerance: 42, softness: 16 },
  },
  {
    type: 'sharpen',
    name: 'Unsharp Mask / Crisp',
    category: 'Blur & Sharpen',
    description: 'Cinema contrast clarity & micro-detail edge boost.',
    defaultParams: { amount: 35 },
  },
  {
    type: 'pixelate',
    name: 'Mosaic Pixelate',
    category: 'Stylize',
    description: 'Retro / censor geometric pixel block grid.',
    defaultParams: { size: 12 },
  },
  {
    type: 'halation',
    name: '35mm Film Halation',
    category: 'Stylize',
    description: 'Warm red-orange analog highlight bloom halo.',
    defaultParams: { intensity: 40, spread: 24 },
  },
];

/** Keep one live instance of each shader type on a clip. */
export function dedupeEffectStack(effects: EffectItem[] = []): EffectItem[] {
  const seen = new Set<EffectType>();
  const unique: EffectItem[] = [];
  for (const effect of effects) {
    if (!effect || seen.has(effect.type)) continue;
    seen.add(effect.type);
    unique.push(effect);
  }
  return unique;
}

export function createEffectInstance(type: EffectType): EffectItem {
  const def = EFFECT_LIBRARY.find((e) => e.type === type);
  if (!def) {
    throw new Error(`Unknown effect type: ${type}`);
  }
  return {
    id: `fx_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: def.type,
    name: def.name,
    enabled: true,
    params: { ...def.defaultParams },
  };
}

/** Creates an independent audio companion for a video timeline clip. */
export function createCompanionAudioClip(
  videoClip: TimelineClip,
  audioTrackId: string,
  waveform: number[] = []
): TimelineClip {
  return {
    ...videoClip,
    id: `${videoClip.id}_audio`,
    trackId: audioTrackId,
    name: `${videoClip.name} · Audio`,
    kind: 'audio',
    is3D: false,
    parentId: null,
    blendMode: 'normal',
    transform: {
      x: 0, y: 0, z: 0, scale: 100, rotation: 0,
      rotationX: 0, rotationY: 0, opacity: 100,
    },
    keyframes: {},
    expressions: undefined,
    effects: [],
    fusionGraph: undefined,
    mask: undefined,
    colorGrade: undefined,
    volume: 100,
    fadeIn: 0,
    fadeOut: 0,
    textProps: undefined,
    shapeProps: undefined,
    pathProps: undefined,
    solidProps: undefined,
    cameraProps: undefined,
    lightProps: undefined,
    particleProps: undefined,
    visualizerProps: undefined,
    captionProps: undefined,
    waveform: [...waveform],
    synthPreset: undefined,
    transitionIn: undefined,
    colorLabel: '#14B8A6',
  };
}

export function splitClipAtTime(
  clip: TimelineClip,
  splitTime: number,
  minDuration: number = 0.1
): [TimelineClip, TimelineClip] | null {
  const offset = splitTime - clip.start;
  if (offset < minDuration || clip.duration - offset < minDuration) {
    return null;
  }

  const leftDuration = Number(offset.toFixed(3));
  const rightDuration = Number((clip.duration - leftDuration).toFixed(3));

  const leftKeyframes: KeyframeMap = {};
  const rightKeyframes: KeyframeMap = {};

  const props: AnimatableProperty[] = [
    'x',
    'y',
    'z',
    'scale',
    'rotation',
    'rotationX',
    'rotationY',
    'opacity',
    'maskX',
    'maskY',
    'maskWidth',
    'maskHeight',
    'maskFeather',
    'maskOpacity',
  ];

  for (const prop of props) {
    const kfs = clip.keyframes[prop];
    if (!kfs || kfs.length === 0) continue;

    const splitVal = Number(
      interpolateKeyframes(kfs, leftDuration, getAnimatableBaseValue(clip, prop)).toFixed(2)
    );

    const leftList = kfs
      .filter((k) => k.time < leftDuration - 0.001)
      .map((k) => ({ ...k }));
    leftList.push({
      id: `kf_${prop}_splitL_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      time: leftDuration,
      value: splitVal,
      easing: 'linear',
    });
    leftKeyframes[prop] = leftList;

    const rightList = [
      {
        id: `kf_${prop}_splitR_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        time: 0,
        value: splitVal,
        easing: 'ease-in-out' as const,
      },
      ...kfs
        .filter((k) => k.time > leftDuration + 0.001)
        .map((k) => ({
          ...k,
          id: `${k.id}_r`,
          time: Number((k.time - leftDuration).toFixed(3)),
        })),
    ];
    rightKeyframes[prop] = rightList;
  }

  const leftClip: TimelineClip = {
    ...clip,
    duration: leftDuration,
    keyframes: leftKeyframes,
    fadeOut: Math.min(clip.fadeOut, leftDuration),
  };

  const rightClip: TimelineClip = {
    ...clip,
    id: `${clip.id}_cut_${Math.random().toString(36).slice(2, 6)}`,
    start: Number((clip.start + leftDuration).toFixed(3)),
    duration: rightDuration,
    sourceIn: Number((clip.sourceIn + leftDuration).toFixed(3)),
    keyframes: rightKeyframes,
    effects: clip.effects.map((fx) => ({
      ...fx,
      id: `${fx.id}_r`,
      params: { ...fx.params },
    })),
    // A transition belongs to the clip's original incoming edge, not to a cut
    // introduced later inside that clip.
    transitionIn: undefined,
    fadeIn: Math.min(clip.fadeIn, rightDuration),
  };

  return [leftClip, rightClip];
}

export function trimClipEdge(
  clip: TimelineClip,
  edge: 'left' | 'right',
  newEdgeTime: number,
  minDuration: number = 0.2
): TimelineClip {
  if (edge === 'right') {
    const nextDuration = Math.max(minDuration, Number((newEdgeTime - clip.start).toFixed(3)));
    const nextKeyframes: KeyframeMap = {};
    (Object.keys(clip.keyframes) as AnimatableProperty[]).forEach((prop) => {
      const list = clip.keyframes[prop];
      if (!list) return;
      nextKeyframes[prop] = list.map((k) => ({
        ...k,
        time: clamp(k.time, 0, nextDuration),
      }));
    });
    return {
      ...clip,
      duration: nextDuration,
      keyframes: nextKeyframes,
    };
  }

  const maxStart = clip.start + clip.duration - minDuration;
  const clampedStart = clamp(Number(newEdgeTime.toFixed(3)), 0, maxStart);
  const delta = clampedStart - clip.start;
  const nextSourceIn = Math.max(0, Number((clip.sourceIn + delta).toFixed(3)));
  const actualDelta = nextSourceIn - clip.sourceIn;
  const finalStart = Number((clip.start + actualDelta).toFixed(3));
  const nextDuration = Math.max(minDuration, Number((clip.duration - actualDelta).toFixed(3)));

  const nextKeyframes: KeyframeMap = {};
  (Object.keys(clip.keyframes) as AnimatableProperty[]).forEach((prop) => {
    const list = clip.keyframes[prop];
    if (!list) return;
    nextKeyframes[prop] = list.map((k) => ({
      ...k,
      time: clamp(Number((k.time - actualDelta).toFixed(3)), 0, nextDuration),
    }));
  });

  return {
    ...clip,
    start: finalStart,
    duration: nextDuration,
    sourceIn: nextSourceIn,
    keyframes: nextKeyframes,
  };
}

/**
 * Premiere Pro-style Ripple Delete: removes target clip and pulls subsequent clips
 * on the same track earlier by the deleted clip's duration.
 */
export function rippleDeleteClip(
  clips: TimelineClip[],
  clipId: string
): TimelineClip[] {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return clips;
  const gap = target.duration;
  return clips
    .filter((c) => c.id !== clipId)
    .map((c) => {
      if (c.trackId === target.trackId && c.start >= target.start + target.duration - 0.005) {
        return {
          ...c,
          start: Math.max(0, Number((c.start - gap).toFixed(3))),
        };
      }
      return c;
    });
}

export function duplicateClip(clip: TimelineClip): TimelineClip {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    ...clip,
    id: `${clip.id}_dup_${uid}`,
    name: `${clip.name} Copy`,
    start: Number((clip.start + clip.duration + 0.1).toFixed(3)),
    effects: clip.effects.map((fx) => ({
      ...fx,
      id: `${fx.id}_dup_${uid}`,
      params: { ...fx.params },
    })),
    keyframes: Object.fromEntries(
      Object.entries(clip.keyframes).map(([prop, list]) => [
        prop,
        (list ?? []).map((k) => ({ ...k, id: `${k.id}_dup_${uid}` })),
      ])
    ),
    expressions: clip.expressions ? { ...clip.expressions } : undefined,
  };
}

/**
 * Inserts a 2s Freeze Frame hold copy of the clip evaluated at playheadTime.
 */
export function freezeFrameClip(
  clip: TimelineClip,
  playheadTime: number,
  evaluatedTransform: TimelineClip['transform']
): TimelineClip {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const freezeTime = clamp(playheadTime - clip.start, 0, clip.duration);
  return {
    ...clip,
    id: `${clip.id}_freeze_${uid}`,
    name: `${clip.name} [Freeze]`,
    start: Number((clip.start + clip.duration + 0.05).toFixed(3)),
    duration: 2.0,
    sourceIn: Number((clip.sourceIn + freezeTime).toFixed(3)),
    speed: 0.25,
    transform: { ...evaluatedTransform },
    keyframes: {},
    effects: clip.effects.map((fx) => ({
      ...fx,
      id: `${fx.id}_fz_${uid}`,
      params: { ...fx.params },
    })),
  };
}

