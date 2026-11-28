import {
  ColorWheelGrade,
  EffectType,
  EasingType,
  MotionPresetItem,
  ParticleLayerProps,
  PresetPackVendor,
  ShapeLayerProps,
} from '../types/editor';
import { MOTION_PRESET_PACKS } from './motionPresets';
import { COLOR_PALETTES } from './colorPalettes';
import { TEXT_ANIMATORS } from './textAnimators';
import { EXTENDED_LIBRARY } from './extendedLibrary';

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
  offset: { r: 0, g: 0, b: 0, luma: 0 },
  exposureStops: 0,
  pivot: 0.5,
  hue: 0,
  vibrance: 0,
  colorBoost: 0,
  midtoneDetail: 0,
  temp: 0,
  tint: 0,
  contrast: 100,
  saturation: 100,
  blacks: 0,
  whites: 0,
  dehaze: 0,
  clarity: 0,
  sharpenAmount: 0,
  curveBlacks: 0,
  curveMidtones: 0,
  curveWhites: 0,
  vignetteAmount: 0,
  vignetteMidpoint: 50,
  vignetteFeather: 70,
  vignetteRoundness: 0,
  hslSecondary: {
    enabled: false,
    hueCenter: 45,
    hueWidth: 45,
    hueShift: 0,
    saturation: 0,
    luminance: 0,
    softness: 35,
  },
  rgbCurves: {
    master: { shadows: 0, midtones: 0, highlights: 0 },
    red: { shadows: 0, midtones: 0, highlights: 0 },
    green: { shadows: 0, midtones: 0, highlights: 0 },
    blue: { shadows: 0, midtones: 0, highlights: 0 },
  },
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
    ...MOTION_PRESET_PACKS.map((sourceItem) => {
      const item: MotionPresetItem = { ...sourceItem, vendor: 'FX' };
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
  const directions: { label: string; value: NonNullable<MotionPresetItem['motionVariant']>['direction'] }[] = [
    { label: 'From Left', value: 'left' },
    { label: 'From Right', value: 'right' },
    { label: 'From Top', value: 'up' },
    { label: 'From Bottom', value: 'down' },
    { label: 'Top Left', value: 'top-left' },
    { label: 'Top Right', value: 'top-right' },
    { label: 'Bottom Left', value: 'bottom-left' },
    { label: 'Bottom Right', value: 'bottom-right' },
    { label: 'Center Punch', value: 'center' },
    { label: 'Diagonal Sweep', value: 'bottom-right' },
  ];
  const intensities = [
    { label: 'Soft', value: 0.65, duration: 0.85 },
    { label: 'Medium', value: 0.9, duration: 0.65 },
    { label: 'Hard', value: 1.2, duration: 0.48 },
    { label: 'Turbo', value: 1.55, duration: 0.32 },
  ];

  let seq = 1;
  for (const tb of transitionBases) {
    for (const dir of directions) {
      for (const inten of intensities) {
        const vendor = vendors[seq % vendors.length];
        items.push({
          id: `mega_tr_${seq}`,
          name: `${tb.prefix} · ${dir.label} · ${inten.label}`,
          vendor,
          category: 'Transition',
          description: `Distinct ${dir.label.toLowerCase()} transition · ${inten.label.toLowerCase()} intensity · ${inten.duration.toFixed(2)}s timing with synced ${tb.sfxPreset.replace('sfx-', '').toUpperCase()} SFX.`,
          accentColor: tb.accentColor,
          sfxPreset: tb.sfxPreset,
          basePresetId: tb.basePresetId,
          motionVariant: { direction: dir.value, intensity: inten.value, duration: inten.duration },
        });
        seq++;
      }
    }
  }

  // 2. Real motion variants: every direction, curve and duration changes applied keyframes.
  const animBases: { prefix: string; basePresetId: string; color: string }[] = [
    { prefix: 'Elastic Bounce', basePresetId: 'elastic_pop_in', color: '#3B82F6' },
    { prefix: 'Overshoot Glide', basePresetId: 'smooth_slide_in', color: '#3B82F6' },
    { prefix: '3D Twist Flip', basePresetId: 'flip_3d_in', color: '#8B5CF6' },
    { prefix: 'Kinetic Slam', basePresetId: 'kinetic_scale_drop', color: '#6366F1' },
    { prefix: 'Parallax Drift', basePresetId: 'parallax_float', color: '#0EA5E9' },
  ];
  const speeds = [
    { label: '0.30s Snap', duration: 0.30, intensity: 0.75 },
    { label: '0.50s Snappy', duration: 0.50, intensity: 0.9 },
    { label: '0.80s Smooth', duration: 0.80, intensity: 1 },
    { label: '1.20s Cinema', duration: 1.20, intensity: 1.18 },
    { label: '1.60s Dreamy', duration: 1.60, intensity: 1.35 },
  ];
  const curves: { label: string; easing: EasingType }[] = [
    { label: 'Linear', easing: 'linear' },
    { label: 'Ease In', easing: 'ease-in' },
    { label: 'Ease Out', easing: 'ease-out' },
    { label: 'Ease In Out', easing: 'ease-in-out' },
    { label: 'Elastic', easing: 'elastic' },
    { label: 'Overshoot', easing: 'overshoot' },
    { label: 'Bezier', easing: 'bezier' },
  ];
  const animationDirections = directions.slice(0, 8);
  for (const ab of animBases) {
    for (const sp of speeds) {
      for (const cv of curves) {
        for (const dir of animationDirections) {
          const intensity = sp.intensity * (cv.easing === 'elastic' || cv.easing === 'overshoot' ? 1.08 : 1);
          items.push({
            id: `mega_an_${seq}`,
            name: `${ab.prefix} · ${dir.label} · ${cv.label} · ${sp.label}`,
            vendor: vendors[seq % vendors.length],
            category: 'Animation',
            description: `Applies a ${dir.label.toLowerCase()} motion rig with ${cv.label.toLowerCase()} interpolation, ${sp.duration.toFixed(2)}s timing and ${intensity.toFixed(2)}x motion strength.`,
            accentColor: ab.color,
            basePresetId: ab.basePresetId,
            motionVariant: {
              direction: dir.value,
              intensity,
              duration: sp.duration,
              easing: cv.easing,
              ...(cv.easing === 'bezier' ? { bezier: [0.16, 1, 0.3, 1] as [number, number, number, number] } : {}),
            },
          });
          seq++;
        }
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

  // 4. DaVinci color looks: strength and mood are applied to the grade, not just the label.
  const lutMoods: { label: string; id: NonNullable<MotionPresetItem['lutMood']> }[] = [
    { label: 'Cinema', id: 'cinema' }, { label: 'Commercial', id: 'commercial' },
    { label: 'Documentary', id: 'documentary' }, { label: 'Music Video', id: 'music-video' },
    { label: 'Wedding', id: 'wedding' }, { label: 'Sci-Fi', id: 'sci-fi' },
    { label: 'Travel', id: 'travel' }, { label: 'Tech', id: 'tech' },
  ];
  for (const lut of DAVINCI_LUTS) {
    for (const mood of lutMoods) {
      for (const strength of [{ label: '50%', value: 0.5 }, { label: '75%', value: 0.75 }, { label: '100%', value: 1 }]) {
        items.push({
          id: `mega_lut_${seq}`,
          name: `${lut.name} · ${mood.label} ${strength.label}`,
          vendor: vendors[seq % vendors.length],
          category: 'Color LUT',
          description: `${mood.label} look · ${strength.label} grade mix · ${lut.name} color-wheel profile.`,
          accentColor: '#F59E0B',
          lutName: lut.name,
          lutMood: mood.id,
          lutStrength: strength.value,
        });
        seq++;
      }
    }
  }

  // Curated 3D rig entries stay single-instance; avoid fake edition duplicates.
  return items;
}

function buildCreativeAssetLibrary(): MotionPresetItem[] {
  const items: MotionPresetItem[] = [];
  const shapes: { type: ShapeLayerProps['shapeType']; label: string; sides?: number }[] = [
    { type: 'rect', label: 'Rectangle' }, { type: 'rounded-rect', label: 'Rounded Rectangle' },
    { type: 'circle', label: 'Circle' }, { type: 'ellipse', label: 'Ellipse' }, { type: 'ring', label: 'Ring' },
    { type: 'polygon', label: 'Polygon', sides: 6 }, { type: 'triangle', label: 'Triangle' },
    { type: 'diamond', label: 'Diamond' }, { type: 'pentagon', label: 'Pentagon' }, { type: 'hexagon', label: 'Hexagon' },
    { type: 'heptagon', label: 'Heptagon' }, { type: 'octagon', label: 'Octagon' },
    { type: 'star', label: 'Five Point Star' }, { type: 'star-6', label: 'Six Point Star' },
    { type: 'burst', label: 'Sun Burst' }, { type: 'heart', label: 'Heart' }, { type: 'arrow', label: 'Arrow' },
    { type: 'chevron', label: 'Chevron' }, { type: 'cross', label: 'Cross' }, { type: 'plus', label: 'Plus' },
    { type: 'minus', label: 'Minus' }, { type: 'trapezoid', label: 'Trapezoid' },
    { type: 'parallelogram', label: 'Parallelogram' }, { type: 'speech-bubble', label: 'Speech Bubble' },
    { type: 'cloud', label: 'Cloud' }, { type: 'lightning', label: 'Lightning' },
    { type: 'line', label: 'Line' }, { type: 'lower-third', label: 'Lower Third' },
  ];
  const shapeStyles = [
    { id: 'solid', label: 'Solid Fill', strokeWidth: 2 },
    { id: 'outline', label: 'Outline', strokeWidth: 7 },
    { id: 'duotone', label: 'Duotone', strokeWidth: 4 },
  ] as const;
  let index = 1;
  for (const shape of shapes) {
    for (const palette of COLOR_PALETTES) {
      for (const style of shapeStyles) {
        const fillColor = style.id === 'outline' || shape.type === 'ring' || shape.type === 'line'
          ? 'transparent'
          : style.id === 'duotone' ? palette.colors[2] : palette.colors[0];
        const strokeColor = style.id === 'solid' ? palette.colors[2] : style.id === 'duotone' ? palette.colors[0] : palette.colors[3];
        items.push({
          id: `lib_shape_${index}`,
          name: `${shape.label} · ${palette.name} · ${style.label}`,
          vendor: 'FX',
          category: 'Shapes',
          description: `Editable vector ${shape.label.toLowerCase()} with ${style.label.toLowerCase()} styling. Resize, rotate, recolor and animate on the canvas.`,
          accentColor: palette.colors[2],
          assetTemplate: {
            kind: 'shape',
            duration: 8,
            defaultShape: {
              shapeType: shape.type,
              width: shape.type === 'line' ? 520 : shape.type === 'lower-third' ? 760 : 280,
              height: shape.type === 'line' ? 8 : shape.type === 'lower-third' ? 150 : 240,
              fillColor,
              strokeColor,
              strokeWidth: shapeStyles.find((entry) => entry.id === style.id)!.strokeWidth,
              cornerRadius: 22,
              sides: shape.sides ?? 6,
            },
          },
        });
        index++;
      }
    }
  }

  const titleStyles = [
    { label: 'Cinematic Main Title', text: 'YOUR STORY', fontSize: 84, fontWeight: 800, letterSpacing: 7, align: 'center' as const },
    { label: 'Minimal Subtitle', text: 'A NEW CHAPTER', fontSize: 36, fontWeight: 500, letterSpacing: 5, align: 'center' as const },
    { label: 'Bold Impact Title', text: 'MAKE IT COUNT', fontSize: 76, fontWeight: 900, letterSpacing: 1, align: 'center' as const },
    { label: 'Editorial Quote', text: '“A BETTER WAY”', fontSize: 58, fontWeight: 600, letterSpacing: 2, align: 'left' as const },
    { label: 'Broadcast Nameplate', text: 'NAME · TITLE', fontSize: 32, fontWeight: 700, letterSpacing: 3, align: 'left' as const },
  ];
  index = 1;
  COLOR_PALETTES.forEach((palette, paletteIndex) => {
    titleStyles.forEach((style, styleIndex) => {
      const animator = TEXT_ANIMATORS[(paletteIndex * titleStyles.length + styleIndex) % TEXT_ANIMATORS.length];
      items.push({
        id: `lib_title_${index}`,
        name: `${style.label} · ${palette.name}`,
        vendor: 'FX',
        category: 'Titles',
        description: `Ready-to-edit title layer with ${animator.name.toLowerCase()} text animation and ${palette.name.toLowerCase()} colors.`,
        accentColor: palette.colors[2],
        assetTemplate: {
          kind: 'text',
          duration: 6,
          defaultText: {
            text: style.text,
            fontSize: style.fontSize,
            color: palette.colors[0],
            fontWeight: style.fontWeight,
            letterSpacing: style.letterSpacing,
            align: style.align,
            backgroundColor: style.label === 'Broadcast Nameplate' ? palette.colors[1] : undefined,
            animator: animator.id,
          },
        },
      });
      index++;
    });
  });

  const particleStyles: ParticleLayerProps['style'][] = ['sparks', 'snow', 'bokeh', 'matrix', 'confetti'];
  const particleLevels = [
    { label: 'Sparse', count: 60, speed: 0.55, size: 3 },
    { label: 'Balanced', count: 140, speed: 1, size: 5 },
    { label: 'Dense', count: 240, speed: 1.45, size: 7 },
  ];
  index = 1;
  for (const palette of COLOR_PALETTES) {
    for (const particleStyle of particleStyles) {
      for (const level of particleLevels) {
        items.push({
          id: `lib_particle_${index}`,
          name: `${particleStyle[0].toUpperCase() + particleStyle.slice(1)} · ${palette.name} · ${level.label}`,
          vendor: 'FX',
          category: 'Particles',
          description: `${level.label} ${particleStyle} generator preset · ${level.count} particles · ${level.speed.toFixed(2)}x speed.`,
          accentColor: palette.colors[2],
          assetTemplate: {
            kind: 'particles',
            duration: 8,
            defaultParticles: {
              style: particleStyle,
              count: level.count,
              speed: level.speed,
              size: level.size,
              color: palette.colors[2],
            },
          },
        });
        index++;
      }
    }
  }

  const visualizerStyles = ['bars', 'radial', 'waveform'] as const;
  const sensitivities = [{ label: 'Soft', value: 0.7 }, { label: 'Punchy', value: 1.6 }];
  index = 1;
  for (const palette of COLOR_PALETTES) {
    for (const visualizerStyle of visualizerStyles) {
      for (const sensitivity of sensitivities) {
        items.push({
          id: `lib_visualizer_${index}`,
          name: `${visualizerStyle[0].toUpperCase() + visualizerStyle.slice(1)} Visualizer · ${palette.name} · ${sensitivity.label}`,
          vendor: 'FX',
          category: 'Visualizers',
          description: `Audio-reactive ${visualizerStyle} visualizer preset with ${sensitivity.label.toLowerCase()} sensitivity.`,
          accentColor: palette.colors[2],
          assetTemplate: {
            kind: 'visualizer',
            duration: 8,
            defaultVisualizer: {
              style: visualizerStyle,
              color: palette.colors[2],
              accentColor: palette.colors[4],
              sensitivity: sensitivity.value,
            },
          },
        });
        index++;
      }
    }
  }

  index = 1;
  COLOR_PALETTES.forEach((palette) => {
    palette.colors.forEach((color, colorIndex) => {
      items.push({
        id: `lib_background_${index}`,
        name: `${palette.name} · Background ${colorIndex + 1}`,
        vendor: 'FX',
        category: 'Backgrounds',
        description: `Full-frame solid matte from the ${palette.name.toLowerCase()} palette. Use as a background, card or color plate.`,
        accentColor: color,
        assetTemplate: {
          kind: 'solid',
          duration: 10,
          defaultSolid: { color, width: 1920, height: 1080 },
        },
      });
      index++;
    });
  });

  return items;
}

const rawMegaCatalog: MotionPresetItem[] = [
  ...buildMegaCatalog(),
  ...buildCreativeAssetLibrary(),
  ...EXTENDED_LIBRARY,
];

/** Remove duplicate shader presets while retaining genuinely different parameter variants. */
export const MEGA_CATALOG: MotionPresetItem[] = (() => {
  const seen = new Set<string>();
  return rawMegaCatalog.filter((item) => {
    if (item.category !== 'Effects' || !item.effectType) return true;
    const params = Object.entries(item.effectParams ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const signature = `effect:${item.effectType}:${JSON.stringify(params)}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
})();
