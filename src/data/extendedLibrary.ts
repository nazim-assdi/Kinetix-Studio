import {
  CaptionLayerProps,
  EffectType,
  MotionPresetItem,
  PathLayerProps,
  PresetCategory,
  ShapeLayerProps,
} from '../types/editor';
import { COLOR_PALETTES } from './colorPalettes';

type Offset = NonNullable<MotionPresetItem['assetTemplates']>[number]['offset'];

const shapeTemplate = (
  shapeType: ShapeLayerProps['shapeType'],
  fillColor: string,
  strokeColor: string,
  strokeWidth: number,
  width: number,
  height: number,
  offset: Offset = {}
): NonNullable<MotionPresetItem['assetTemplates']>[number] => ({
  kind: 'shape',
  duration: 8,
  offset,
  defaultShape: {
    shapeType,
    width,
    height,
    fillColor,
    strokeColor,
    strokeWidth,
    cornerRadius: 18,
    sides: 6,
  },
});

const textTemplate = (
  text: string,
  color: string,
  fontSize: number,
  offset: Offset = {},
  backgroundColor?: string,
  align: 'left' | 'center' | 'right' = 'center'
): NonNullable<MotionPresetItem['assetTemplates']>[number] => ({
  kind: 'text',
  duration: 8,
  offset,
  defaultText: {
    text,
    fontSize,
    color,
    fontWeight: 800,
    letterSpacing: 1.5,
    align,
    backgroundColor,
  },
});

const pathTemplate = (
  points: Array<[number, number]>,
  color: string,
  options: { closed?: boolean; fill?: string; width?: number; dashed?: boolean; offset?: Offset } = {}
): NonNullable<MotionPresetItem['assetTemplates']>[number] => ({
  kind: 'path',
  duration: 8,
  offset: options.offset ?? {},
  defaultPath: {
    points: points.map(([x, y]) => ({ x, y })),
    closed: options.closed ?? false,
    strokeColor: color,
    strokeWidth: options.width ?? 8,
    fillColor: options.fill ?? 'transparent',
    trimStart: 0,
    trimEnd: 100,
    dashed: options.dashed ?? false,
  },
});

const captionTemplate = (
  text: string,
  color: string,
  bgColor: string,
  highlightColor: string,
  fontSize: number,
  position: CaptionLayerProps['position'] = 'bottom'
): NonNullable<MotionPresetItem['assetTemplates']>[number] => ({
  kind: 'caption',
  duration: 8,
  defaultCaption: {
    cues: [
      { id: 'caption_a', start: 0, end: 3.8, text },
      { id: 'caption_b', start: 4, end: 7.6, text: 'EDIT YOUR CAPTION HERE' },
    ],
    fontSize,
    color,
    highlightColor,
    bgColor,
    position,
  },
});

function catalogItem(
  id: string,
  name: string,
  category: PresetCategory,
  description: string,
  accentColor: string,
  templates: NonNullable<MotionPresetItem['assetTemplates']>
): MotionPresetItem {
  return {
    id,
    name,
    vendor: 'FX',
    category,
    description,
    accentColor,
    assetTemplates: templates,
  };
}

const ICONS: Array<{ name: string; points: Array<[number, number]>; closed?: boolean; filled?: boolean }> = [
  { name: 'Check Mark', points: [[-72, 0], [-22, 48], [76, -58]] },
  { name: 'Close Mark', points: [[-58, -58], [58, 58], [0, 0], [-58, 58], [58, -58]] },
  { name: 'Play', points: [[-42, -64], [64, 0], [-42, 64]], closed: true, filled: true },
  { name: 'Send Arrow', points: [[-78, -10], [78, 0], [-12, 66], [8, 10], [-78, -10]], closed: true, filled: true },
  { name: 'Trend Up', points: [[-78, 48], [-25, 5], [8, 25], [78, -54], [34, -54], [78, -54], [78, -10]] },
  { name: 'Bookmark', points: [[-48, -70], [48, -70], [48, 70], [0, 38], [-48, 70]], closed: true },
  { name: 'Shield', points: [[0, -82], [68, -54], [58, 26], [0, 82], [-58, 26], [-68, -54]], closed: true },
  { name: 'Heart', points: [[0, 70], [-72, 2], [-68, -42], [-28, -68], [0, -36], [28, -68], [68, -42], [72, 2]], closed: true, filled: true },
  { name: 'Star', points: Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? 35 : 78; return [Math.cos(a) * r, Math.sin(a) * r] as [number, number]; }), closed: true, filled: true },
  { name: 'Lightning', points: [[16, -84], [-58, 12], [-8, 12], [-28, 84], [60, -20], [10, -20]], closed: true, filled: true },
  { name: 'Cloud', points: [[-72, 38], [-82, 10], [-62, -20], [-34, -23], [-24, -58], [12, -73], [46, -45], [50, -14], [78, 2], [72, 38]], closed: true },
  { name: 'Location Pin', points: [[0, 82], [-58, 8], [-58, -35], [-32, -69], [0, -80], [32, -69], [58, -35], [58, 8]], closed: true },
  { name: 'Home', points: [[-78, -4], [0, -76], [78, -4], [58, 14], [58, 72], [-58, 72], [-58, 14]], closed: true },
  { name: 'Envelope', points: [[-78, -48], [78, -48], [78, 48], [-78, 48], [-78, -48], [0, 8], [78, -48]] },
  { name: 'Chat Bubble', points: [[-72, -54], [72, -54], [72, 40], [10, 40], [-30, 76], [-24, 40], [-72, 40]], closed: true },
  { name: 'Mountain', points: [[-84, 62], [-32, -28], [-4, 18], [34, -62], [86, 62]], closed: true },
  { name: 'Wave', points: [[-84, 0], [-62, -42], [-38, 42], [-12, -42], [12, 42], [38, -42], [62, 42], [84, 0]] },
  { name: 'Target', points: [[-74, 0], [-60, -48], [-22, -74], [24, -70], [68, -34], [78, 12], [54, 60], [6, 78], [-42, 60], [-74, 0]], closed: true },
  { name: 'Arrow Right', points: [[-78, 0], [70, 0], [22, -48], [70, 0], [22, 48]] },
  { name: 'Upload', points: [[0, -72], [0, 42], [-44, -4], [0, -72], [44, -4], [0, 42], [-68, 42], [-68, 72], [68, 72], [68, 42]] },
  { name: 'Download', points: [[0, -72], [0, 42], [-44, -4], [0, 42], [44, -4], [0, 42], [-68, 42], [-68, 72], [68, 72], [68, 42]] },
  { name: 'Audio Note', points: [[25, -70], [25, 42], [8, 58], [-18, 62], [-42, 48], [-35, 26], [-8, 18], [25, 22], [25, -70], [74, -82], [74, 30]] },
  { name: 'Camera', points: [[-78, -38], [-42, -38], [-24, -60], [32, -60], [48, -38], [78, -38], [78, 58], [-78, 58], [-78, -38]] },
  { name: 'Globe', points: [[-74, 0], [-60, -42], [-20, -72], [24, -70], [64, -38], [78, 4], [60, 48], [18, 74], [-26, 68], [-66, 36], [-74, 0]] },
  { name: 'Lock', points: [[-54, -4], [-54, -42], [-34, -68], [0, -78], [34, -68], [54, -42], [54, -4], [-54, -4], [-66, -4], [66, -4], [66, 72], [-66, 72], [-66, -4]] },
  { name: 'Sparkle', points: [[0, -82], [14, -16], [78, 0], [14, 16], [0, 82], [-14, 16], [-78, 0], [-14, -16]], closed: true, filled: true },
  { name: 'Sun', points: [[0, -70], [0, -88], [0, -70], [42, -42], [60, -60], [42, -42], [70, 0], [90, 0], [70, 0], [42, 42], [60, 60], [42, 42], [0, 70], [0, 88], [0, 70], [-42, 42], [-60, 60], [-42, 42], [-70, 0], [-90, 0], [-70, 0], [-42, -42], [-60, -60], [-42, -42]] },
  { name: 'Pause', points: [[-48, -64], [-16, -64], [-16, 64], [-48, 64], [-48, -64], [16, -64], [48, -64], [48, 64], [16, 64], [16, -64]], closed: true, filled: true },
  { name: 'Eye', points: [[-84, 0], [-48, -40], [0, -58], [48, -40], [84, 0], [48, 40], [0, 58], [-48, 40]], closed: true },
  { name: 'Rocket', points: [[0, -86], [34, -36], [46, 22], [0, 70], [-46, 22], [-34, -36]], closed: true },
  { name: 'Gift', points: [[-72, -30], [72, -30], [72, 66], [-72, 66], [-72, -30], [0, -30], [0, 66], [0, -30], [-42, -66], [-58, -48], [-42, -30], [0, -30], [42, -66], [58, -48], [42, -30]], closed: false },
  { name: 'Microphone', points: [[-30, -74], [-30, 22], [-18, 44], [18, 44], [30, 22], [30, -74], [30, 22], [16, 56], [-16, 56], [-30, 22], [0, 56], [0, 78]] },
];

const DIVIDERS: Array<{ name: string; points: Array<[number, number]>; dashed?: boolean }> = [
  { name: 'Classic Hairline', points: [[-150, 0], [150, 0]] },
  { name: 'Soft Double Line', points: [[-150, -8], [150, -8]] },
  { name: 'Kinetic Zigzag', points: Array.from({ length: 13 }, (_, i) => [-150 + i * 25, i % 2 ? -18 : 18] as [number, number]) },
  { name: 'Signal Wave', points: Array.from({ length: 17 }, (_, i) => [-150 + i * 18.75, Math.sin(i * Math.PI / 4) * 20] as [number, number]) },
  { name: 'Dot Trail', points: [[-150, 0], [150, 0]], dashed: true },
  { name: 'Arrow Flow', points: [[-150, 0], [110, 0], [80, -28], [110, 0], [80, 28]] },
  { name: 'Center Diamond', points: [[-150, 0], [-30, 0], [0, -18], [30, 0], [150, 0]] },
  { name: 'Bracket Ends', points: [[-150, -20], [-150, 20], [-150, 0], [150, 0], [150, -20], [150, 20]] },
  { name: 'Stepped Rule', points: [[-150, 18], [-85, 18], [-85, -18], [-20, -18], [-20, 18], [45, 18], [45, -18], [110, -18], [110, 18], [150, 18]] },
  { name: 'Pulse Line', points: [[-150, 0], [-46, 0], [-24, -30], [0, 30], [24, -30], [46, 0], [150, 0]] },
  { name: 'Mountain Range', points: [[-150, 18], [-100, -20], [-60, 18], [-12, -42], [40, 18], [90, -18], [150, 18]] },
  { name: 'Corner Cut', points: [[-150, 18], [-150, -18], [-114, -18], [114, -18], [150, -18], [150, 18]] },
  { name: 'Ribbon Line', points: [[-150, -12], [-90, 12], [-30, -12], [30, 12], [90, -12], [150, 12]] },
  { name: 'Orbit Track', points: [[-150, 0], [-110, -22], [-60, -30], [0, -32], [60, -30], [110, -22], [150, 0]] },
  { name: 'Notched Rule', points: [[-150, 0], [-18, 0], [0, -16], [18, 0], [150, 0]] },
  { name: 'Dotted Center', points: [[-150, 0], [150, 0]], dashed: true },
];

const DECORATIONS: Array<{ name: string; points: Array<[number, number]>; closed?: boolean }> = [
  { name: 'Orbit Arc', points: [[-100, 28], [-74, -18], [-20, -48], [44, -44], [92, -4]] },
  { name: 'Burst Rays', points: [[0, -96], [0, -54], [0, 54], [0, 96]] },
  { name: 'Diamond Orbit', points: [[0, -80], [80, 0], [0, 80], [-80, 0]], closed: true },
  { name: 'Corner Brackets', points: [[-90, -55], [-90, -90], [-55, -90], [55, -90], [90, -90], [90, -55]] },
  { name: 'Wave Accent', points: [[-100, 0], [-70, -25], [-40, 25], [-10, -25], [20, 25], [50, -25], [80, 0]] },
  { name: 'Star Trail', points: [[-110, 35], [-60, -12], [-5, 22], [54, -42], [105, -12]] },
  { name: 'Spiral Steps', points: [[-80, 50], [-80, -50], [80, -50], [80, 50], [-48, 50], [-48, -20], [48, -20], [48, 20]] },
  { name: 'Crosshair', points: [[-90, 0], [-32, 0], [32, 0], [90, 0], [0, -90], [0, -32], [0, 32], [0, 90]] },
  { name: 'Diagonal Hatch', points: [[-92, 70], [-50, 28], [-8, -14], [34, -56], [76, -98]] },
  { name: 'Corner Flourish', points: [[-90, 60], [-90, 10], [-70, -30], [-25, -58], [25, -60], [65, -30]] },
  { name: 'Double Wave', points: [[-110, -12], [-70, -36], [-30, -12], [10, -36], [50, -12], [90, -36]] },
  { name: 'Motion Streaks', points: [[-110, -45], [90, -45], [-80, 0], [110, 0], [-110, 45], [90, 45]] },
];

function buildExtendedLibrary(): MotionPresetItem[] {
  const items: MotionPresetItem[] = [];
  let seq = 1;
  const palettes = COLOR_PALETTES;

  // 1. Iconography: compact, editable multi-layer icon compositions.
  ICONS.forEach((icon, iconIndex) => palettes.forEach((palette) => {
    const templates = [
      shapeTemplate('circle', palette.colors[1], palette.colors[2], 5, 196, 196, { scale: 70 }),
      pathTemplate(icon.points, palette.colors[4], {
        closed: icon.closed ?? false,
        fill: icon.filled ? palette.colors[4] : 'transparent',
        width: icon.filled ? 4 : 11,
        offset: { scale: 65 },
      }),
    ];
    items.push(catalogItem(
      `libx_icon_${seq++}`,
      `${icon.name} Icon · ${palette.name}`,
      'Icons',
      `Editable two-layer vector icon. Recolor, resize, rotate and animate the badge and glyph independently.`,
      palette.colors[4],
      templates
    ));
  }));

  // 2. Graphic frames: simple, double-line, and corner-only frame treatments.
  const frameStyles = [
    { name: 'Rounded Cinema Frame', shape: 'rounded-rect' as const, width: 740, height: 390, stroke: 8 },
    { name: 'Classic Film Frame', shape: 'rect' as const, width: 760, height: 420, stroke: 6 },
    { name: 'Portrait Editorial Frame', shape: 'rect' as const, width: 330, height: 520, stroke: 7 },
    { name: 'Circle Portrait Frame', shape: 'ellipse' as const, width: 420, height: 420, stroke: 10 },
    { name: 'Pill Frame', shape: 'rounded-rect' as const, width: 700, height: 160, stroke: 8 },
    { name: 'Diamond Frame', shape: 'diamond' as const, width: 420, height: 420, stroke: 8 },
    { name: 'Hexagon Frame', shape: 'hexagon' as const, width: 420, height: 420, stroke: 8 },
    { name: 'Badge Outline', shape: 'star' as const, width: 380, height: 380, stroke: 9 },
    { name: 'Vertical Story Border', shape: 'rounded-rect' as const, width: 360, height: 640, stroke: 8 },
    { name: 'Wide Safe-Area Frame', shape: 'rect' as const, width: 800, height: 430, stroke: 4 },
    { name: 'Lower Third Frame', shape: 'rounded-rect' as const, width: 760, height: 170, stroke: 7 },
    { name: 'Oval Title Frame', shape: 'ellipse' as const, width: 720, height: 260, stroke: 7 },
  ];
  frameStyles.forEach((frame, frameIndex) => palettes.forEach((palette) => {
    for (const variant of ['Single', 'Double'] as const) {
      const templates = [
        shapeTemplate(frame.shape, 'transparent', palette.colors[3], frame.stroke, frame.width, frame.height, { scale: 65 }),
      ];
      if (variant === 'Double') {
        templates.push(shapeTemplate(frame.shape, 'transparent', palette.colors[1], Math.max(2, frame.stroke / 2), frame.width - 34, frame.height - 34, { scale: 61 }));
      }
      items.push(catalogItem(
        `libx_frame_${seq++}`,
        `${frame.name} · ${variant} · ${palette.name}`,
        'Frames',
        `Editable ${variant.toLowerCase()} frame. Place footage or titles inside and recolor each border layer independently.`,
        palette.colors[3],
        templates
      ));
    }
  }));

  // 3. Callout panels, quote balloons and pointer labels.
  const calloutStyles = [
    { name: 'Speech Bubble', shape: 'speech-bubble' as const, text: 'SAY SOMETHING' },
    { name: 'Rounded Label', shape: 'rounded-rect' as const, text: 'NEW UPDATE' },
    { name: 'Cloud Thought', shape: 'cloud' as const, text: 'THINK ABOUT IT' },
    { name: 'Arrow Label', shape: 'arrow' as const, text: 'NEXT STEP' },
    { name: 'Hex Tech Tag', shape: 'hexagon' as const, text: 'SYSTEM READY' },
    { name: 'Alert Burst', shape: 'burst' as const, text: 'WOW!' },
    { name: 'Pill Tag', shape: 'rounded-rect' as const, text: 'FEATURED' },
    { name: 'Editorial Quote', shape: 'rounded-rect' as const, text: '“A GREAT IDEA”' },
    { name: 'Location Tag', shape: 'speech-bubble' as const, text: 'YOUR LOCATION' },
    { name: 'Number Marker', shape: 'circle' as const, text: '01' },
    { name: 'Warning Banner', shape: 'trapezoid' as const, text: 'IMPORTANT' },
    { name: 'Price Ribbon', shape: 'parallelogram' as const, text: 'SPECIAL OFFER' },
    { name: 'Question Tag', shape: 'cloud' as const, text: 'DID YOU KNOW?' },
    { name: 'Action Pointer', shape: 'chevron' as const, text: 'LOOK HERE' },
  ];
  calloutStyles.forEach((style, styleIndex) => palettes.forEach((palette) => {
    for (const mode of ['Solid', 'Outline'] as const) {
      const templates = [
        shapeTemplate(
          style.shape,
          mode === 'Solid' ? palette.colors[1] : 'transparent',
          palette.colors[3],
          mode === 'Solid' ? 3 : 8,
          style.shape === 'circle' ? 220 : 520,
          style.shape === 'circle' ? 220 : 170,
          { scale: 62 }
        ),
        textTemplate(style.text, mode === 'Solid' ? palette.colors[4] : palette.colors[3], style.shape === 'circle' ? 34 : 29, { y: 1, scale: 75 }),
      ];
      items.push(catalogItem(
        `libx_callout_${seq++}`,
        `${style.name} · ${mode} · ${palette.name}`,
        'Callouts',
        `Two-layer callout with editable vector panel and live text. Replace the wording and style it for tutorials, reviews or explainers.`,
        palette.colors[3],
        templates
      ));
    }
  }));

  // 4. Dividers and motion-safe line accents.
  DIVIDERS.forEach((divider, dividerIndex) => palettes.forEach((palette) => {
    for (const weight of ['Fine', 'Bold'] as const) {
      const templates = [pathTemplate(divider.points, palette.colors[3], {
        width: weight === 'Fine' ? 3 : 9,
        dashed: divider.dashed,
        offset: { scale: 70 },
      })];
      if (divider.name === 'Soft Double Line') {
        templates.push(pathTemplate(divider.points.map(([x, y]) => [x, y + 14]), palette.colors[1], { width: weight === 'Fine' ? 2 : 5, offset: { scale: 70 } }));
      }
      items.push(catalogItem(
        `libx_divider_${seq++}`,
        `${divider.name} · ${weight} · ${palette.name}`,
        'Dividers',
        `Editable vector section divider with ${weight.toLowerCase()} stroke. Great for title cards, chapters and editorial layouts.`,
        palette.colors[3],
        templates
      ));
    }
  }));

  // 5. Caption styles designed as real subtitle/caption timeline layers.
  const captionStyles: Array<{ name: string; font: number; bg: string; position?: CaptionLayerProps['position'] }> = [
    { name: 'Clean Subtitle', font: 34, bg: '#111827' },
    { name: 'Bold Social Caption', font: 42, bg: '#09090B' },
    { name: 'Cinema Subtitle', font: 30, bg: '#000000' },
    { name: 'Karaoke Highlight', font: 38, bg: '#18181B' },
    { name: 'Documentary Note', font: 28, bg: '#1F2937' },
    { name: 'Minimal Top Caption', font: 31, bg: '#0F172A', position: 'center' },
    { name: 'Podcast Quote', font: 36, bg: '#27272A' },
    { name: 'High Contrast Accessibility', font: 40, bg: '#000000' },
  ];
  captionStyles.forEach((style) => palettes.forEach((palette) => {
    items.push(catalogItem(
      `libx_caption_${seq++}`,
      `${style.name} · ${palette.name}`,
      'Captions',
      `Editable timed caption layer with starter cue timings, readable contrast colors and a replaceable sample transcript.`,
      palette.colors[3],
      [captionTemplate('YOUR SUBTITLE GOES HERE', '#FFFFFF', style.bg, palette.colors[3], style.font, style.position ?? 'bottom')]
    ));
  }));

  // 6. Infographic and data-card building blocks: individual editable layers.
  const infoStyles = [
    'KPI Stat Card', 'Four-Bar Comparison', 'Progress Dashboard', 'Milestone Number',
    'Percentage Meter', 'Quote + Source', 'Three-Step Process', 'Timeline Milestones',
    'Feature Comparison', 'Rating Summary', 'Before / After Label', 'Data Highlight',
  ];
  infoStyles.forEach((style, styleIndex) => palettes.forEach((palette) => {
    const templates = [
      shapeTemplate('rounded-rect', '#111827', palette.colors[1], 2, 540, 260, { scale: 66 }),
      textTemplate(style.toUpperCase(), palette.colors[4], 23, { x: -2, y: -66, scale: 74 }, undefined, 'left'),
      shapeTemplate('rounded-rect', '#334155', palette.colors[2], 0, 350, 18, { x: -25, y: 36, scale: 72 }),
      shapeTemplate('rounded-rect', palette.colors[3], palette.colors[3], 0, 220 + (styleIndex % 4) * 26, 18, { x: -72, y: 36, scale: 72 }),
      textTemplate(styleIndex % 2 ? '78%' : '24.8K', '#FFFFFF', 44, { x: 4, y: -2, scale: 75 }),
      textTemplate('LABEL · 2026', '#CBD5E1', 16, { x: 2, y: 83, scale: 70 }),
    ];
    if (styleIndex % 3 === 1) {
      templates.push(shapeTemplate('circle', palette.colors[4], palette.colors[3], 4, 86, 86, { x: 148, y: -62, scale: 70 }));
    }
    items.push(catalogItem(
      `libx_info_${seq++}`,
      `${style} Kit · ${palette.name}`,
      'Infographics',
      `Multi-layer infographic block with editable heading, metric, progress bar and accent shapes. Each element remains a separate timeline layer.`,
      palette.colors[3],
      templates
    ));
  }));

  // 7. Social video, story, thumbnail and end-screen layout kits.
  const socialStyles = [
    'Vertical Story Opener', 'YouTube Thumbnail Layout', 'Podcast Episode Card',
    'Quote Post Layout', 'Product Launch Tile', 'Event Announcement',
    'Channel Subscribe Card', 'Reel End Screen', 'Travel Highlight Card',
    'Course Promo Layout', 'News Flash Card', 'Minimal Brand Intro',
  ];
  socialStyles.forEach((style, styleIndex) => palettes.forEach((palette) => {
    const templates = [
      shapeTemplate('rounded-rect', '#0F172A', palette.colors[1], 2, 680, 380, { scale: 66 }),
      shapeTemplate(styleIndex % 2 ? 'circle' : 'rounded-rect', palette.colors[2], palette.colors[2], 0, 190, 190, { x: 170, y: -56, scale: 64 }),
      textTemplate(style.toUpperCase(), '#FFFFFF', 28, { x: -58, y: -35, scale: 76 }, undefined, 'left'),
      textTemplate('YOUR BRAND · YOUR STORY', palette.colors[4], 18, { x: -60, y: 28, scale: 76 }, undefined, 'left'),
      shapeTemplate('rounded-rect', palette.colors[3], palette.colors[3], 0, 190, 48, { x: -116, y: 100, scale: 70 }),
      textTemplate('WATCH NOW', '#FFFFFF', 17, { x: -116, y: 100, scale: 66 }),
    ];
    items.push(catalogItem(
      `libx_social_${seq++}`,
      `${style} · ${palette.name}`,
      'Social Kits',
      `Editable social-media layout kit with independent background, accent, headline, subline and action layers. Adapt for 16:9 or vertical content.`,
      palette.colors[3],
      templates
    ));
  }));

  // 8. UI components for video explainers, app promos and product demos.
  const uiStyles = [
    'Primary Button', 'Notification Toast', 'Toggle Switch', 'Progress Widget',
    'Search Field', 'Profile Card', 'Feature Chip', 'Pricing Panel',
    'Download Card', 'Audio Player Bar', 'Rating Widget', 'Location Pin Card',
  ];
  uiStyles.forEach((style, styleIndex) => palettes.forEach((palette) => {
    const templates = [
      shapeTemplate('rounded-rect', '#111827', palette.colors[1], 2, 520, 178, { scale: 65 }),
      shapeTemplate(styleIndex % 2 ? 'circle' : 'rounded-rect', palette.colors[3], palette.colors[3], 0, 72, 72, { x: -160, y: 0, scale: 65 }),
      textTemplate(style.toUpperCase(), '#FFFFFF', 25, { x: 34, y: -24, scale: 72 }, undefined, 'left'),
      textTemplate('EDITABLE UI COMPONENT', '#CBD5E1', 15, { x: 34, y: 24, scale: 72 }, undefined, 'left'),
    ];
    if (styleIndex % 3 === 0) {
      templates.push(shapeTemplate('rounded-rect', palette.colors[4], palette.colors[4], 0, 112, 28, { x: 152, y: 54, scale: 70 }));
    }
    items.push(catalogItem(
      `libx_ui_${seq++}`,
      `${style} · ${palette.name}`,
      'UI Elements',
      `Editable multi-layer UI element for app demos, product explainers, tutorials and motion-design overlays.`,
      palette.colors[3],
      templates
    ));
  }));

  // 9. Decorative ornaments, corner marks and graphic overlays.
  DECORATIONS.forEach((decoration) => palettes.forEach((palette) => {
    for (const style of ['Outline', 'Filled'] as const) {
      const templates = [pathTemplate(decoration.points, palette.colors[3], {
        closed: style === 'Filled' && Boolean(decoration.closed),
        fill: style === 'Filled' && decoration.closed ? palette.colors[1] : 'transparent',
        width: style === 'Outline' ? 7 : 3,
        offset: { scale: 72 },
      })];
      templates.push(shapeTemplate('circle', 'transparent', palette.colors[2], 3, 46, 46, { x: 102, y: -66, scale: 65 }));
      items.push(catalogItem(
        `libx_deco_${seq++}`,
        `${decoration.name} · ${style} · ${palette.name}`,
        'Decorative',
        `Editable vector ornament overlay for corner accents, title cards, frames and graphic compositions.`,
        palette.colors[3],
        templates
      ));
    }
  }));

  // 10. Extra abstract background plates built from separate editable layers.
  const backgroundStyles = [
    'Orbit Abstract', 'Bold Diagonal', 'Soft Geometry', 'Editorial Split',
    'Minimal Focus', 'Tech Grid', 'Night Bloom', 'Modern Layers',
    'Spotlight Composition', 'Dynamic Rings', 'Color Blocks', 'Studio Waves',
  ];
  backgroundStyles.forEach((style, styleIndex) => palettes.forEach((palette) => {
    const templates = [
      { kind: 'solid' as const, duration: 10, defaultSolid: { color: palette.colors[0], width: 1920, height: 1080 } },
      shapeTemplate(styleIndex % 2 ? 'ellipse' : 'circle', palette.colors[1], 'transparent', 0, 1100, 1100, { x: 520, y: -310, scale: 90 }),
      shapeTemplate(styleIndex % 3 ? 'rounded-rect' : 'diamond', palette.colors[3], 'transparent', 0, 860, 520, { x: -470, y: 280, scale: 90, rotation: -24 }),
      shapeTemplate('ring', 'transparent', palette.colors[4], 12 + (styleIndex % 4) * 4, 820, 820, { x: 430, y: 240, scale: 82 }),
    ];
    items.push(catalogItem(
      `libx_bg_${seq++}`,
      `${style} Background · ${palette.name}`,
      'Backgrounds',
      `Layered abstract background plate. The base matte, geometric blobs and ring accents are separate editable timeline layers.`,
      palette.colors[3],
      templates
    ));
  }));

  // 11. Texture and finishing looks use the editor's real live effect engine.
  const textureSpecs: Array<{ name: string; type: EffectType; variants: string[]; make: (variant: number, strength: number) => Record<string, number> }> = [
    { name: 'Film Grain', type: 'filmgrain', variants: ['Fine 35mm', 'Super 8', 'Heavy 16mm', 'Archival Dust'], make: (v, s) => ({ amount: 8 + v * 7 + s * 12, size: 1 + (v % 3) }) },
    { name: 'Bloom Glow', type: 'glow', variants: ['Soft Mist', 'Dream Bloom', 'Neon Halo', 'Bright Diffusion'], make: (v, s) => ({ intensity: 18 + v * 11 + s * 16, radius: 10 + s * 9 }) },
    { name: 'Halation', type: 'halation', variants: ['Warm Film', 'Red Edge', 'Vintage Print', 'Night Lights'], make: (v, s) => ({ intensity: 15 + v * 8 + s * 14, spread: 10 + s * 8 }) },
    { name: 'VHS Glitch', type: 'glitch', variants: ['Tape Tear', 'Signal Drop', 'Scanline Burst', 'Datamosh'], make: (v, s) => ({ amount: 10 + v * 8 + s * 14, slices: 4 + v * 3 + s * 2 }) },
    { name: 'Chromatic Fringing', type: 'chromatic', variants: ['Subtle Prism', 'RGB Split', 'Lens Edge', 'Cyber Fringe'], make: (v, s) => ({ shift: 1 + v * 2 + s * 4 }) },
    { name: 'Optical Blur', type: 'blur', variants: ['Dream Mist', 'Macro Defocus', 'Soft Focus', 'Tilt Blur'], make: (v, s) => ({ radius: 3 + v * 3 + s * 7 }) },
    { name: 'Lens Vignette', type: 'vignette', variants: ['Gentle Falloff', 'Oval Lens', 'Spotlight', 'Dark Frame'], make: (_v, s) => ({ amount: 20 + s * 22, softness: 50 + s * 12 }) },
    { name: 'Light Flare', type: 'lensflare', variants: ['Blue Streak', 'Warm Leak', 'Prism Burst', 'Studio Flare'], make: (v, s) => ({ brightness: 25 + s * 22, x: 18 + v * 20, y: 20 + s * 15 }) },
    { name: 'Wave Distortion', type: 'wavewarp', variants: ['Heat Haze', 'Water Ripple', 'Liquid Flow', 'Warp Pulse'], make: (v, s) => ({ height: 4 + s * 8, width: 20 + v * 12, speed: 1 + s * 3 }) },
    { name: 'Pixel Mosaic', type: 'pixelate', variants: ['Fine Mosaic', 'Retro Blocks', 'Large Pixels', 'Data Mask'], make: (v, s) => ({ size: 4 + v * 4 + s * 9 }) },
    { name: 'Color Tint', type: 'tint', variants: ['Amber Film', 'Arctic Wash', 'Teal Mood', 'Rose Memory'], make: (v, s) => ({ warmth: v % 2 ? -25 - s * 20 : 20 + s * 20, amount: 12 + s * 20 }) },
    { name: 'Poster Graphic', type: 'posterize', variants: ['Screenprint', 'Comic Ink', 'Pop Art', 'Retro Game'], make: (_v, s) => ({ levels: Math.max(2, 12 - s * 3) }) },
  ];
  textureSpecs.forEach((spec) => spec.variants.forEach((variant, variantIndex) => {
    for (const tier of [{ name: 'Subtle', value: 0 }, { name: 'Balanced', value: 1 }, { name: 'Strong', value: 2 }, { name: 'Extreme', value: 3 }] as const) {
      items.push({
        id: `libx_texture_${seq++}`,
        name: `${spec.name} · ${variant} · ${tier.name}`,
        vendor: 'FX',
        category: 'Textures',
        description: `Live, adjustable ${spec.name.toLowerCase()} overlay using the ${variant.toLowerCase()} profile at ${tier.name.toLowerCase()} strength.`,
        accentColor: '#A78BFA',
        effectType: spec.type,
        effectParams: spec.make(variantIndex, tier.value),
      });
    }
  }));

  return items;
}

export const EXTENDED_LIBRARY: MotionPresetItem[] = buildExtendedLibrary();
