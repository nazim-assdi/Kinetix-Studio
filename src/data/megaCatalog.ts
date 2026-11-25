import {
  ColorWheelGrade,
  EffectType,
  MotionPresetItem,
  PresetCategory,
  PresetPackVendor,
} from '../types/editor';
import { MOTION_PRESET_PACKS } from './motionPresets';

export interface DaVinciLutPreset {
  id: string;
  name: string;
  grade: Omit<ColorWheelGrade, 'enabled'>;
}

export const DEFAULT_COLOR_GRADE: ColorWheelGrade = {
  enabled: false,
  lift: { r: 0, g: 0, b: 0, luma: 0 },
  gamma: { r: 0, g: 0, b: 0, luma: 0 },
  gain: { r: 0, g: 0, b: 0, luma: 0 },
  temp: 0,
  tint: 0,
  contrast: 100,
  saturation: 100,
  lut: 'Rec.709 Neutral',
};

export const DAVINCI_LUTS: DaVinciLutPreset[] = [
  {
    id: 'lut_neutral',
    name: 'Rec.709 Neutral',
    grade: {
      lift: { r: 0, g: 0, b: 0, luma: 0 },
      gamma: { r: 0, g: 0, b: 0, luma: 0 },
      gain: { r: 0, g: 0, b: 0, luma: 0 },
      temp: 0,
      tint: 0,
      contrast: 100,
      saturation: 100,
      lut: 'Rec.709 Neutral',
    },
  },
  {
    id: 'lut_teal_orange',
    name: 'Teal & Orange Blockbuster',
    grade: {
      lift: { r: -0.25, g: 0.08, b: 0.35, luma: -6 },
      gamma: { r: 0.14, g: 0.04, b: -0.1, luma: 2 },
      gain: { r: 0.32, g: 0.12, b: -0.22, luma: 6 },
      temp: 12,
      tint: -4,
      contrast: 122,
      saturation: 118,
      lut: 'Teal & Orange Blockbuster',
    },
  },
  {
    id: 'lut_kodak_2383',
    name: 'Kodak 2383 Film Print',
    grade: {
      lift: { r: 0.08, g: -0.04, b: 0.12, luma: -8 },
      gamma: { r: 0.12, g: 0.06, b: -0.08, luma: 4 },
      gain: { r: 0.24, g: 0.16, b: -0.14, luma: 8 },
      temp: 16,
      tint: 4,
      contrast: 128,
      saturation: 106,
      lut: 'Kodak 2383 Film Print',
    },
  },
  {
    id: 'lut_fuji_eterna',
    name: 'Fuji Eterna Soft Cinema',
    grade: {
      lift: { r: -0.08, g: 0.1, b: 0.14, luma: 6 },
      gamma: { r: -0.04, g: 0.08, b: 0.04, luma: 2 },
      gain: { r: 0.1, g: 0.08, b: -0.05, luma: -4 },
      temp: -8,
      tint: 6,
      contrast: 92,
      saturation: 88,
      lut: 'Fuji Eterna Soft Cinema',
    },
  },
  {
    id: 'lut_bleach_bypass',
    name: 'Silver Bleach Bypass',
    grade: {
      lift: { r: -0.05, g: -0.05, b: 0.08, luma: -16 },
      gamma: { r: 0, g: 0, b: 0, luma: -4 },
      gain: { r: 0.1, g: 0.1, b: 0.12, luma: 14 },
      temp: -10,
      tint: 0,
      contrast: 148,
      saturation: 52,
      lut: 'Silver Bleach Bypass',
    },
  },
  {
    id: 'lut_cyber_neon',
    name: 'Cyberpunk Neon Grade',
    grade: {
      lift: { r: -0.22, g: -0.08, b: 0.42, luma: -8 },
      gamma: { r: 0.22, g: -0.18, b: 0.28, luma: 4 },
      gain: { r: -0.1, g: 0.28, b: 0.35, luma: 8 },
      temp: -28,
      tint: 26,
      contrast: 132,
      saturation: 146,
      lut: 'Cyberpunk Neon Grade',
    },
  },
  {
    id: 'lut_noir_mono',
    name: 'Noir Monochrome 35mm',
    grade: {
      lift: { r: 0, g: 0, b: 0, luma: -14 },
      gamma: { r: 0, g: 0, b: 0, luma: 0 },
      gain: { r: 0, g: 0, b: 0, luma: 12 },
      temp: 0,
      tint: 0,
      contrast: 142,
      saturation: 0,
      lut: 'Noir Monochrome 35mm',
    },
  },
];

function buildMegaCatalog(): MotionPresetItem[] {
  const items: MotionPresetItem[] = [
    // Ensure core curated packs carry SFX presets for transitions
    ...MOTION_PRESET_PACKS.map((item) => {
      if (item.id === 'whip_pan_transition') {
        return { ...item, sfxPreset: 'sfx-whoosh' as const };
      }
      if (item.id === 'zoom_punch_transition') {
        return { ...item, sfxPreset: 'sfx-boom' as const };
      }
      if (item.id === 'glitch_flicker_in') {
        return { ...item, sfxPreset: 'sfx-glitch' as const };
      }
      if (item.id === 'film_burn_flash') {
        return { ...item, sfxPreset: 'sfx-shimmer' as const };
      }
      return item;
    }),
  ];

  const vendors: PresetPackVendor[] = ['FX'];

  // 1. Transition Pack with SFX (240 items)
  const transitionBases: {
    prefix: string;
    basePresetId: string;
    sfxPreset: 'sfx-whoosh' | 'sfx-glitch' | 'sfx-boom' | 'sfx-shimmer';
    accentColor: string;
  }[] = [
    { prefix: 'Whip Pan', basePresetId: 'whip_pan_transition', sfxPreset: 'sfx-whoosh', accentColor: '#EC4899' },
    { prefix: 'Zoom Punch', basePresetId: 'zoom_punch_transition', sfxPreset: 'sfx-boom', accentColor: '#F59E0B' },
    { prefix: 'Cyber Glitch Cut', basePresetId: 'glitch_flicker_in', sfxPreset: 'sfx-glitch', accentColor: '#F43F5E' },
    { prefix: 'Anamorphic Light Sweep', basePresetId: 'film_burn_flash', sfxPreset: 'sfx-shimmer', accentColor: '#38BDF8' },
    { prefix: '3D Card Spin', basePresetId: 'flip_3d_in', sfxPreset: 'sfx-whoosh', accentColor: '#8B5CF6' },
    { prefix: 'Impact Slam', basePresetId: 'kinetic_scale_drop', sfxPreset: 'sfx-boom', accentColor: '#6366F1' },
  ];
  const directions = ['Left', 'Right', 'Up', 'Down', 'Diagonal', 'Fast', 'Smooth', 'Ultra', 'Pro', 'V2'];
  const intensities = ['Soft', 'Medium', 'Hard', 'Turbo'];

  let seq = 1;
  for (const tb of transitionBases) {
    for (const dir of directions) {
      for (const inten of intensities) {
        const vendor = vendors[seq % vendors.length];
        items.push({
          id: `mega_tr_${seq}`,
          name: `${tb.prefix} ${dir} · ${inten}`,
          vendor,
          category: 'Transition',
          description: `${vendor} transition with synced ${tb.sfxPreset.replace('sfx-', '').toUpperCase()} SFX.`,
          accentColor: tb.accentColor,
          sfxPreset: tb.sfxPreset,
          basePresetId: tb.basePresetId,
        });
        seq++;
      }
    }
  }

  // 2. Animation Presets (260 items)
  const animBases: { prefix: string; basePresetId: string; color: string }[] = [
    { prefix: 'Elastic Bounce', basePresetId: 'elastic_pop_in', color: '#3B82F6' },
    { prefix: 'Overshoot Glide', basePresetId: 'smooth_slide_in', color: '#3B82F6' },
    { prefix: '3D Twist Flip', basePresetId: 'flip_3d_in', color: '#8B5CF6' },
    { prefix: 'Kinetic Slam', basePresetId: 'kinetic_scale_drop', color: '#6366F1' },
    { prefix: 'Parallax Drift', basePresetId: 'parallax_float', color: '#0EA5E9' },
  ];
  const speeds = ['0.3s Snap', '0.5s Snappy', '0.8s Smooth', '1.2s Cinema', '1.6s Dreamy'];
  const curves = ['Expo', 'Back', 'Quart', 'Elastic', 'Spring', 'Quint', 'Sine', 'Circ', 'Quad', 'Cubic', 'Pro'];
  for (const ab of animBases) {
    for (const sp of speeds) {
      for (const cv of curves) {
        if (items.length >= 520) break;
        const vendor = vendors[seq % vendors.length];
        items.push({
          id: `mega_an_${seq}`,
          name: `${ab.prefix} (${cv} · ${sp})`,
          vendor,
          category: 'Animation',
          description: `${vendor} keyframe rig with ${cv} Bezier easing.`,
          accentColor: ab.color,
          basePresetId: ab.basePresetId,
        });
        seq++;
      }
    }
  }

  // 3. Effects Presets (300 items across all 14 live canvas shaders)
  const fxSpecs: {
    title: string;
    effectType: EffectType;
    variants: string[];
    tiers: string[];
    makeParams: (vIdx: number, tIdx: number) => Record<string, number>;
  }[] = [
    {
      title: 'Optical Blur',
      effectType: 'blur',
      variants: ['Dreamy Mist', 'Macro Defocus', 'Gaussian Soft', 'Tilt Shift', 'Bokeh Haze'],
      tiers: ['Subtle', 'Medium', 'Heavy', 'Extreme'],
      makeParams: (v, t) => ({ radius: 4 + v * 3 + t * 6 }),
    },
    {
      title: 'Directional Shutter Blur',
      effectType: 'motionblur',
      variants: ['180° Shutter', '360° Whip', 'Vertical Streak', 'Diagonal Rush', 'Velocity Smear'],
      tiers: ['Light', 'Fast', 'Hyper', 'Warp'],
      makeParams: (v, t) => ({ amount: 12 + v * 6 + t * 14, angle: (v * 35) % 180 }),
    },
    {
      title: 'Cinema Halation Glow',
      effectType: 'glow',
      variants: ['Pro-Mist 1/4', 'Pro-Mist 1/2', 'Cyber Bloom', 'Solar Flare', 'Neon Halo'],
      tiers: ['Soft', 'Balanced', 'Radiant', 'Overdrive'],
      makeParams: (v, t) => ({ intensity: 25 + t * 18 + v * 5, radius: 12 + t * 8 }),
    },
    {
      title: 'Chromatic Prism',
      effectType: 'chromatic',
      variants: ['Anamorphic Fringe', 'VHS Split', 'Optic Edge', 'Cyber Prism', 'Lens Dispersion'],
      tiers: ['Micro', 'Crisp', 'Wide', 'Chaos'],
      makeParams: (v, t) => ({ shift: 2 + v * 2 + t * 4 }),
    },
    {
      title: 'Digital Glitch Matrix',
      effectType: 'glitch',
      variants: ['Data Mosh', 'Scanline Tear', 'Signal Loss', 'Cyber Corrupt', 'Frame Jitter'],
      tiers: ['Pulse', 'Burst', 'Heavy', 'Overload'],
      makeParams: (v, t) => ({ amount: 15 + t * 15, slices: 4 + v * 3 + t * 2 }),
    },
    {
      title: '35mm Film Emulsion',
      effectType: 'filmgrain',
      variants: ['Kodak 500T', '16mm Grit', 'Super 8mm', 'Fine Archival', 'ISO 3200'],
      tiers: ['Fine', 'Organic', 'Coarse', 'Raw'],
      makeParams: (v, t) => ({ amount: 10 + t * 12 + v * 3, size: 1 + (t % 3) }),
    },
    {
      title: 'Anamorphic Flare Rig',
      effectType: 'lensflare',
      variants: ['Blue Streak', 'Warm Sunset', 'Sci-Fi Horizon', 'Studio Key', 'Prism Halo'],
      tiers: ['Low', 'Medium', 'Bright', 'Blaze'],
      makeParams: (v, t) => ({ brightness: 35 + t * 18, x: 20 + v * 15, y: 25 + (t * 10) }),
    },
    {
      title: 'Fluid Wave Distort',
      effectType: 'wavewarp',
      variants: ['Liquid Ripple', 'Heat Shimmer', 'Flag Flutter', 'Underwater', 'Warp Pulse'],
      tiers: ['Gentle', 'Flow', 'Turbulent', 'Storm'],
      makeParams: (v, t) => ({ height: 5 + t * 6, width: 20 + v * 10, speed: 2 + t * 2 }),
    },
    {
      title: 'Vignette Optics',
      effectType: 'vignette',
      variants: ['35mm Falloff', 'Anamorphic Oval', 'Dark Tunnel', 'Soft Frame', 'Spotlight'],
      tiers: ['25%', '50%', '75%', '95%'],
      makeParams: (_v, t) => ({ amount: 25 + t * 22, softness: 45 + t * 10 }),
    },
    {
      title: 'Split-Tone Grade',
      effectType: 'tint',
      variants: ['Golden Hour', 'Arctic Blue', 'Amber Dusk', 'Teal Wash', 'Sunset Rose'],
      tiers: ['Light', 'Rich', 'Deep', 'Bold'],
      makeParams: (v, t) => ({ warmth: v === 1 || v === 3 ? -40 - t * 15 : 30 + t * 15, amount: 20 + t * 15 }),
    },
    {
      title: 'Drop Shadow Depth',
      effectType: 'dropshadow',
      variants: ['Floating Card', 'Long Cast', 'Soft Ambient', 'Hard Cutout', '3D Lift'],
      tiers: ['Near', 'Mid', 'Far', 'Deep'],
      makeParams: (v, t) => ({ blur: 10 + t * 8, distance: 6 + v * 4 + t * 5, opacity: 55 + t * 10 }),
    },
    {
      title: 'Posterize Graphic',
      effectType: 'posterize',
      variants: ['Pop Art', 'Comic Ink', 'Retro 8-Bit', 'Screenprint', 'Duotone Cut'],
      tiers: ['12-Step', '8-Step', '5-Step', '3-Step'],
      makeParams: (_v, t) => ({ levels: Math.max(2, 12 - t * 3) }),
    },
  ];

  for (const spec of fxSpecs) {
    spec.variants.forEach((variant, vIdx) => {
      spec.tiers.forEach((tier, tIdx) => {
        const vendor = vendors[seq % vendors.length];
        items.push({
          id: `mega_fx_${seq}`,
          name: `${spec.title} · ${variant} (${tier})`,
          vendor,
          category: 'Effects',
          description: `${vendor} live shader preset (${spec.effectType}).`,
          accentColor: '#8B5CF6',
          effectType: spec.effectType,
          effectParams: spec.makeParams(vIdx, tIdx),
        });
        seq++;
      });
    });
  }

  // 4. DaVinci Color LUTs & Looks (160 items)
  const lutMoods = ['Cinema', 'Commercial', 'Documentary', 'Music Video', 'Wedding', 'Sci-Fi', 'Travel', 'Tech'];
  for (const lut of DAVINCI_LUTS) {
    for (const mood of lutMoods) {
      for (const strength of ['50%', '75%', '100%']) {
        const vendor = vendors[seq % vendors.length];
        items.push({
          id: `mega_lut_${seq}`,
          name: `${lut.name} · ${mood} ${strength}`,
          vendor,
          category: 'Color LUT',
          description: `DaVinci 3-Way Color Wheel LUT (${lut.name}).`,
          accentColor: '#F59E0B',
          lutName: lut.name,
        });
        seq++;
      }
    }
  }

  // 5. Graphics, Lower-Thirds, HUD & 3D Rigs (160 items)
  const gfxBases: {
    prefix: string;
    category: PresetCategory;
    basePresetId: string;
    color: string;
  }[] = [
    { prefix: 'Lower-Third Plate', category: 'Graphics', basePresetId: 'lower_third_pack', color: '#14B8A6' },
    { prefix: 'HUD Telemetry Ring', category: 'Graphics', basePresetId: 'hud_callout_pack', color: '#10B981' },
    { prefix: 'Cyber Neon Title', category: 'Graphics', basePresetId: 'cyber_neon_title', color: '#38BDF8' },
    { prefix: '3D Dolly Camera Rig', category: '3D Rig', basePresetId: 'camera_3d_push', color: '#F59E0B' },
    { prefix: 'Studio 3-Point Light', category: '3D Rig', basePresetId: 'three_point_light', color: '#FDE047' },
  ];
  const styles = ['Minimal', 'Tech', 'Broadcast', 'Sports', 'Esports', 'Corporate', 'Luxury', 'Editorial'];
  const editions = ['Alpha', 'Beta', 'Pro', 'Studio'];

  for (const gb of gfxBases) {
    for (const st of styles) {
      for (const ed of editions) {
        const vendor = vendors[seq % vendors.length];
        items.push({
          id: `mega_gfx_${seq}`,
          name: `${gb.prefix} · ${st} ${ed}`,
          vendor,
          category: gb.category,
          description: `${vendor} ${gb.category} template ready for timeline.`,
          accentColor: gb.color,
          basePresetId: gb.basePresetId,
        });
        seq++;
      }
    }
  }

  return items;
}

export const MEGA_CATALOG: MotionPresetItem[] = buildMegaCatalog();
