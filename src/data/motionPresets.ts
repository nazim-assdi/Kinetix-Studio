import { MotionPresetItem, TimelineClip } from '../types/editor';
import { createEffectInstance } from '../engine/timelineOps';

export const MOTION_PRESET_PACKS: MotionPresetItem[] = [
  // Core animation presets — Animation Composer style
  {
    id: 'elastic_pop_in',
    name: 'Elastic Pop In',
    vendor: 'FX',
    category: 'Animation',
    description: 'Bouncy elastic scale pop from 0% to 100% with fade.',
    accentColor: '#3B82F6',
  },
  {
    id: 'smooth_slide_in',
    name: 'Overshoot Slide In',
    vendor: 'FX',
    category: 'Animation',
    description: 'Snappy horizontal slide with subtle overshoot settle.',
    accentColor: '#3B82F6',
  },
  {
    id: 'flip_3d_in',
    name: '3D Card Flip In',
    vendor: 'FX',
    category: 'Animation',
    description: 'Enables 3D layer and flips Y-axis from -90° to 0°.',
    accentColor: '#8B5CF6',
  },
  {
    id: 'kinetic_scale_drop',
    name: 'Kinetic Impact Drop',
    vendor: 'FX',
    category: 'Animation',
    description: 'High-impact slam from 240% scale down to 100%.',
    accentColor: '#6366F1',
  },
  {
    id: 'parallax_float',
    name: '3D Parallax Float',
    vendor: 'FX',
    category: 'Animation',
    description: 'Gentle 3D Z-drift + Y-tilt continuous depth motion.',
    accentColor: '#0EA5E9',
  },

  // FX transitions — Transitions & Glitch Packs
  {
    id: 'whip_pan_transition',
    name: 'Whip Pan Blur',
    vendor: 'FX',
    category: 'Transition',
    description: 'Fast horizontal whip slide + directional motion blur.',
    accentColor: '#EC4899',
  },
  {
    id: 'zoom_punch_transition',
    name: 'Zoom Punch Cut',
    vendor: 'FX',
    category: 'Transition',
    description: 'Punch-in scale surge with chromatic aberration burst.',
    accentColor: '#EC4899',
  },
  {
    id: 'glitch_flicker_in',
    name: 'Cyber Glitch Reveal',
    vendor: 'FX',
    category: 'Transition',
    description: 'Digital scanline glitch + RGB chromatic reveal.',
    accentColor: '#F43F5E',
  },
  {
    id: 'film_burn_flash',
    name: 'Anamorphic Flash Cut',
    vendor: 'FX',
    category: 'Transition',
    description: 'High-exposure flare bloom transition punch.',
    accentColor: '#F59E0B',
  },

  // FX motion graphics — Motion Graphics, Callouts & 3D Rigs
  {
    id: 'cyber_neon_title',
    name: 'Cyber Glow Title',
    vendor: 'FX',
    category: 'Graphics',
    description: 'Cinema glow + anamorphic flare + kinetic scale reveal.',
    accentColor: '#14B8A6',
  },
  {
    id: 'lower_third_pack',
    name: 'Broadcast Lower-Third',
    vendor: 'FX',
    category: 'Graphics',
    description: 'Clean news/documentary lower-third plate & title.',
    accentColor: '#14B8A6',
  },
  {
    id: 'hud_callout_pack',
    name: 'HUD Telemetry Reticle',
    vendor: 'FX',
    category: 'Graphics',
    description: 'Rotating tactical orbital ring with glow.',
    accentColor: '#10B981',
  },
  {
    id: 'camera_3d_push',
    name: '3D Dolly Push Rig',
    vendor: 'FX',
    category: '3D Rig',
    description: 'Spawns an animated 3D Camera dolly push-in.',
    accentColor: '#F59E0B',
  },
  {
    id: 'three_point_light',
    name: 'Studio Rim Light Rig',
    vendor: 'FX',
    category: '3D Rig',
    description: 'Spawns a warm key + cool rim 3D Light setup.',
    accentColor: '#F59E0B',
  },
];

export function applyMotionPresetToClip(
  clip: TimelineClip,
  presetId: string
): TimelineClip {
  const dur = clip.duration;
  const inEnd = Math.min(0.85, dur * 0.45);
  const idSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

  switch (presetId) {
    case 'elastic_pop_in':
      return {
        ...clip,
        keyframes: {
          ...clip.keyframes,
          scale: [
            { id: `kf_p1_${idSuffix}`, time: 0, value: 15, easing: 'elastic' },
            { id: `kf_p2_${idSuffix}`, time: inEnd, value: 100, easing: 'linear' },
          ],
          opacity: [
            { id: `kf_o1_${idSuffix}`, time: 0, value: 0, easing: 'ease-out' },
            { id: `kf_o2_${idSuffix}`, time: Math.min(0.25, inEnd), value: 100, easing: 'linear' },
          ],
        },
      };

    case 'smooth_slide_in':
      return {
        ...clip,
        keyframes: {
          ...clip.keyframes,
          x: [
            { id: `kf_sx1_${idSuffix}`, time: 0, value: clip.transform.x - 380, easing: 'overshoot' },
            { id: `kf_sx2_${idSuffix}`, time: inEnd, value: clip.transform.x, easing: 'linear' },
          ],
          opacity: [
            { id: `kf_so1_${idSuffix}`, time: 0, value: 0, easing: 'ease-out' },
            { id: `kf_so2_${idSuffix}`, time: Math.min(0.3, inEnd), value: 100, easing: 'linear' },
          ],
        },
      };

    case 'flip_3d_in':
      return {
        ...clip,
        is3D: true,
        keyframes: {
          ...clip.keyframes,
          rotationY: [
            { id: `kf_fy1_${idSuffix}`, time: 0, value: -88, easing: 'overshoot' },
            { id: `kf_fy2_${idSuffix}`, time: inEnd, value: 0, easing: 'linear' },
          ],
          opacity: [
            { id: `kf_fo1_${idSuffix}`, time: 0, value: 0, easing: 'ease-out' },
            { id: `kf_fo2_${idSuffix}`, time: Math.min(0.25, inEnd), value: 100, easing: 'linear' },
          ],
        },
      };

    case 'kinetic_scale_drop':
      return {
        ...clip,
        keyframes: {
          ...clip.keyframes,
          scale: [
            { id: `kf_kd1_${idSuffix}`, time: 0, value: 230, easing: 'bezier', bezier: [0.12, 0.92, 0.24, 1] },
            { id: `kf_kd2_${idSuffix}`, time: Math.min(0.55, dur * 0.35), value: 100, easing: 'linear' },
          ],
          opacity: [
            { id: `kf_kdo1_${idSuffix}`, time: 0, value: 0, easing: 'ease-out' },
            { id: `kf_kdo2_${idSuffix}`, time: 0.15, value: 100, easing: 'linear' },
          ],
        },
      };

    case 'parallax_float':
      return {
        ...clip,
        is3D: true,
        keyframes: {
          ...clip.keyframes,
          z: [
            { id: `kf_pz1_${idSuffix}`, time: 0, value: 40, easing: 'ease-in-out' },
            { id: `kf_pz2_${idSuffix}`, time: dur, value: -90, easing: 'linear' },
          ],
          rotationY: [
            { id: `kf_pry1_${idSuffix}`, time: 0, value: -10, easing: 'ease-in-out' },
            { id: `kf_pry2_${idSuffix}`, time: dur, value: 10, easing: 'linear' },
          ],
        },
      };

    case 'whip_pan_transition':
      return {
        ...clip,
        keyframes: {
          ...clip.keyframes,
          x: [
            { id: `kf_wp1_${idSuffix}`, time: 0, value: 520, easing: 'bezier', bezier: [0.1, 0.95, 0.2, 1] },
            { id: `kf_wp2_${idSuffix}`, time: Math.min(0.45, dur * 0.4), value: 0, easing: 'linear' },
          ],
        },
        effects: [
          ...clip.effects.filter((e) => e.type !== 'motionblur'),
          createEffectInstance('motionblur'),
        ],
      };

    case 'zoom_punch_transition':
      return {
        ...clip,
        keyframes: {
          ...clip.keyframes,
          scale: [
            { id: `kf_zp1_${idSuffix}`, time: 0, value: 165, easing: 'bezier', bezier: [0.16, 1, 0.3, 1] },
            { id: `kf_zp2_${idSuffix}`, time: Math.min(0.5, dur * 0.4), value: 100, easing: 'linear' },
          ],
        },
        effects: [
          ...clip.effects.filter((e) => e.type !== 'chromatic'),
          createEffectInstance('chromatic'),
        ],
      };

    case 'glitch_flicker_in':
      return {
        ...clip,
        effects: [
          ...clip.effects.filter((e) => e.type !== 'glitch' && e.type !== 'chromatic'),
          createEffectInstance('glitch'),
          createEffectInstance('chromatic'),
        ],
        keyframes: {
          ...clip.keyframes,
          opacity: [
            { id: `kf_gf1_${idSuffix}`, time: 0, value: 20, easing: 'linear' },
            { id: `kf_gf2_${idSuffix}`, time: 0.12, value: 95, easing: 'linear' },
            { id: `kf_gf3_${idSuffix}`, time: 0.22, value: 45, easing: 'linear' },
            { id: `kf_gf4_${idSuffix}`, time: 0.34, value: 100, easing: 'linear' },
          ],
        },
      };

    case 'film_burn_flash':
      return {
        ...clip,
        effects: [
          ...clip.effects.filter((e) => e.type !== 'lensflare' && e.type !== 'glow'),
          createEffectInstance('lensflare'),
          createEffectInstance('glow'),
        ],
      };

    case 'cyber_neon_title':
    default:
      return {
        ...clip,
        effects: [
          ...clip.effects.filter((e) => e.type !== 'glow'),
          createEffectInstance('glow'),
        ],
        keyframes: {
          ...clip.keyframes,
          scale: [
            { id: `kf_cn1_${idSuffix}`, time: 0, value: 82, easing: 'ease-out' },
            { id: `kf_cn2_${idSuffix}`, time: inEnd, value: 100, easing: 'linear' },
          ],
        },
      };
  }
}
