export type MediaKind =
  | 'video'
  | 'image'
  | 'audio'
  | 'text'
  | 'shape'
  | 'path'
  | 'solid'
  | 'null'
  | 'adjustment'
  | 'camera'
  | 'light'
  | 'particles'
  | 'visualizer'
  | 'caption';

export type TrackKind = 'video' | 'audio';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'add';

export type EasingType =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'bezier'
  | 'elastic'
  | 'overshoot';

export type AnimatableProperty =
  | 'x'
  | 'y'
  | 'z'
  | 'scale'
  | 'rotation'
  | 'rotationX'
  | 'rotationY'
  | 'opacity'
  | 'anchorX'
  | 'anchorY'
  | 'shapeWidth'
  | 'shapeHeight'
  | 'volume';

export type ToolMode = 'select' | 'razor' | 'pen' | 'pin' | 'mask' | 'text' | 'shape' | 'hand';

export type LeftDockTab =
  | 'bin'
  | 'effects'
  | 'packs'
  | 'sfx'
  | 'transitions'
  | 'color'
  | 'audio'
  | 'fusion'
  | 'tracker'
  | 'captions'
  | 'ai';

export type WorkspacePreset =
  | 'compositing'
  | 'editing'
  | 'color'
  | 'motion3d'
  | 'fusion'
  | 'fairlight';

export type ViewLayoutMode = '1-view' | '2-views-h' | '2-views-v' | '4-views';

export type ViewportCameraAngle = 'active' | 'top' | 'front' | 'right';

export type EffectType =
  | 'blur'
  | 'motionblur'
  | 'glow'
  | 'color'
  | 'hue_sat'
  | 'tint'
  | 'vignette'
  | 'chromatic'
  | 'glitch'
  | 'dropshadow'
  | 'filmgrain'
  | 'lensflare'
  | 'wavewarp'
  | 'posterize'
  | 'chromakey'
  | 'sharpen'
  | 'pixelate'
  | 'halation';

export type TextAnimatorPreset =
  | 'none'
  | 'typewriter'
  | 'slide-up'
  | 'word-pop'
  | 'glitch-decode'
  | `animator-${number}`;

export interface SpeedRampPoint {
  id: string;
  /** Clip-local timeline time in seconds. */
  time: number;
  speed: number;
}

export type TrackMatteMode = 'none' | 'alpha' | 'alpha-inverted' | 'luma';

export type SfxPresetName =
  | 'sfx-whoosh'
  | 'sfx-glitch'
  | 'sfx-boom'
  | 'sfx-shimmer'
  | `sfx-pack-${number}`;

export type SynthPreset = 'ambient-pulse' | 'percussion-drive' | SfxPresetName;

export interface Keyframe {
  id: string;
  /** Time in seconds relative to clip start (0 <= time <= clip.duration) */
  time: number;
  value: number;
  easing: EasingType;
  /** Optional custom cubic-bezier control points [x1, y1, x2, y2] */
  bezier?: [number, number, number, number];
}

export interface TransformState {
  x: number;
  y: number;
  z: number;
  /** Anchor offset relative to layer center in pixels */
  anchorX?: number;
  anchorY?: number;
  /** Percentage where 100 = 100% (1.0x) */
  scale: number;
  /** Z-axis rotation in degrees */
  rotation: number;
  /** 3D X-axis pitch rotation in degrees */
  rotationX: number;
  /** 3D Y-axis yaw rotation in degrees */
  rotationY: number;
  /** Percentage 0..100 */
  opacity: number;
  /** Shape dimensions, animated independently from layer transform. */
  shapeWidth?: number;
  shapeHeight?: number;
  /** Animated audio volume percentage, when volume keyframes are present. */
  volume?: number;
}

export type KeyframeMap = Partial<Record<AnimatableProperty, Keyframe[]>>;

export type ExpressionMap = Partial<Record<AnimatableProperty, string>>;

export interface EffectItem {
  id: string;
  type: EffectType;
  name: string;
  enabled: boolean;
  params: Record<string, number>;
}

export interface LayerMask {
  enabled: boolean;
  shape: 'rect' | 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  feather: number;
  inverted: boolean;
  opacity: number;
}

export interface ColorWheelChannel {
  r: number; // -1..1
  g: number; // -1..1
  b: number; // -1..1
  luma: number; // -100..100
}

export interface ColorWheelGrade {
  enabled: boolean;
  lift: ColorWheelChannel;
  gamma: ColorWheelChannel;
  gain: ColorWheelChannel;
  temp: number; // -100..100
  tint: number; // -100..100
  contrast: number; // 50..180
  saturation: number; // 0..200
  shadows?: number; // -50..50
  highlights?: number; // -50..50
  lut: string;
}

export interface MotionTrackPoint {
  time: number;
  x: number;
  y: number;
  confidence: number;
}

export interface MotionTrackData {
  targetX: number;
  targetY: number;
  points: MotionTrackPoint[];
}

export interface TextLayerProps {
  text: string;
  fontSize: number;
  color: string;
  fontWeight: number;
  letterSpacing: number;
  align: 'left' | 'center' | 'right';
  backgroundColor?: string;
  animator?: TextAnimatorPreset;
}

export interface ShapeLayerProps {
  shapeType:
    | 'rect' | 'rounded-rect' | 'circle' | 'ellipse' | 'ring'
    | 'polygon' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon'
    | 'heptagon' | 'octagon' | 'star' | 'star-6' | 'burst'
    | 'heart' | 'arrow' | 'chevron' | 'cross' | 'plus' | 'minus'
    | 'trapezoid' | 'parallelogram' | 'speech-bubble' | 'cloud'
    | 'lightning' | 'line' | 'lower-third';
  width: number;
  height: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
  sides?: number;
  /** Extrusion distance along local Z, in scene units. Used by 3D shape layers. */
  depth?: number;
}

export interface PathPoint {
  x: number;
  y: number;
  handleInX?: number;
  handleInY?: number;
  handleOutX?: number;
  handleOutY?: number;
}

export interface PathLayerProps {
  points: PathPoint[];
  closed: boolean;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  trimStart: number; // 0..100
  trimEnd: number; // 0..100
  dashed: boolean;
}

export interface SolidLayerProps {
  color: string;
  width: number;
  height: number;
}

export interface CameraLayerProps {
  fov: number; // horizontal field of view in degrees
  focalLength: number; // physical lens focal length in mm
  sensorWidth?: number; // sensor gate width in mm (36 = full frame)
  lookAtX: number;
  lookAtY: number;
  lookAtZ: number;
  useTarget?: boolean;
  nearClip?: number;
  farClip?: number;
  depthOfField: boolean;
  focusDistance?: number; // focus plane distance in scene units
  aperture: number; // f-stop
}

export interface LightLayerProps {
  lightType: 'point' | 'spot' | 'ambient' | 'parallel';
  color: string;
  intensity: number; // 0..200%
  coneAngle: number; // degrees 15..140
  falloff: number; // 0..100
  castShadows: boolean;
}

export interface ParticleLayerProps {
  style: 'sparks' | 'snow' | 'bokeh' | 'matrix' | 'confetti';
  count: number;
  speed: number;
  size: number;
  color: string;
}

export interface VisualizerLayerProps {
  style: 'bars' | 'radial' | 'waveform';
  color: string;
  accentColor: string;
  sensitivity: number;
}

export interface CaptionCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface CaptionLayerProps {
  cues: CaptionCue[];
  fontSize: number;
  color: string;
  highlightColor: string;
  bgColor: string;
  position: 'bottom' | 'center';
}

export interface ProjectAsset {
  id: string;
  name: string;
  kind: MediaKind;
  src?: string;
  duration: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  waveform?: number[];
  synthPreset?: SynthPreset;
  defaultText?: TextLayerProps;
  defaultShape?: ShapeLayerProps;
  defaultSolid?: SolidLayerProps;
  defaultCamera?: CameraLayerProps;
  defaultLight?: LightLayerProps;
  defaultPath?: PathLayerProps;
  defaultParticles?: ParticleLayerProps;
  defaultVisualizer?: VisualizerLayerProps;
  defaultCaption?: CaptionLayerProps;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  trackId: string;
  name: string;
  kind: MediaKind;
  start: number;
  duration: number;
  sourceIn: number;
  src?: string;
  is3D: boolean;
  parentId?: string | null;
  blendMode: BlendMode;
  trackMatte?: TrackMatteMode;
  speed?: number; // 0.25 .. 4.0 (default 1)
  speedRamp?: SpeedRampPoint[];
  reversed?: boolean;
  /** Marks a recorded/dialogue clip as a voiceover source for automatic music ducking. */
  isVoiceover?: boolean;
  duckingEnabled?: boolean;
  duckingAmount?: number; // dB reduction applied to other active audio
  noiseReduction?: number; // 0..100 noise gate + low-frequency rumble reduction
  transform: TransformState;
  keyframes: KeyframeMap;
  expressions?: ExpressionMap;
  effects: EffectItem[];
  mask?: LayerMask;
  colorGrade?: ColorWheelGrade;
  trackData?: MotionTrackData;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  textProps?: TextLayerProps;
  shapeProps?: ShapeLayerProps;
  pathProps?: PathLayerProps;
  solidProps?: SolidLayerProps;
  cameraProps?: CameraLayerProps;
  lightProps?: LightLayerProps;
  particleProps?: ParticleLayerProps;
  visualizerProps?: VisualizerLayerProps;
  captionProps?: CaptionLayerProps;
  waveform?: number[];
  synthPreset?: SynthPreset;
  /** Catalog preset IDs already applied to this clip; prevents accidental duplicate transitions. */
  appliedPresetIds?: string[];
  colorLabel: string;
}

export interface TimelineTrack {
  id: string;
  name: string;
  kind: TrackKind;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  visible: boolean;
  height: number;
  /** Fairlight mixer properties */
  volumeDb?: number; // -36 .. +12 dB
  pan?: number; // -1 .. +1
  eqLow?: number; // -12 .. +12 dB
  eqMid?: number; // -12 .. +12 dB
  eqHigh?: number; // -12 .. +12 dB
  compressor?: boolean;
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface WorkAreaRange {
  enabled: boolean;
  inTime: number;
  outTime: number;
}

export interface CompositionSettings {
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  backgroundColor: string;
  /** How source media is fitted when the sequence aspect ratio differs. */
  fitMode?: 'contain' | 'cover' | 'stretch';
  /** 0..100 object-position for crop-to-fill media fitting. */
  fitPositionX?: number;
  fitPositionY?: number;
}

export interface EffectDefinition {
  type: EffectType;
  name: string;
  category:
    | 'Blur & Sharpen'
    | 'Stylize'
    | 'Color Correction'
    | 'Distort'
    | 'Generate'
    | 'Keying';
  description: string;
  defaultParams: Record<string, number>;
}

export type PresetPackVendor = 'FX';

export type PresetCategory =
  | 'Animation'
  | 'Transition'
  | 'Graphics'
  | '3D Rig'
  | 'Effects'
  | 'Color LUT';

export interface MotionPresetItem {
  id: string;
  name: string;
  vendor: PresetPackVendor;
  category: PresetCategory;
  description: string;
  accentColor: string;
  sfxPreset?: SfxPresetName;
  basePresetId?: string;
  effectType?: EffectType;
  effectParams?: Record<string, number>;
  lutName?: string;
}

export interface SavedProjectPayload {
  version: number;
  savedAt: string;
  composition: CompositionSettings;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  assets?: ProjectAsset[];
  markers?: TimelineMarker[];
  workArea?: WorkAreaRange;
}
