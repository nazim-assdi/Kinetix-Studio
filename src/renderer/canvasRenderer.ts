import {
  BlendMode,
  ColorWheelGrade,
  CompositionSettings,
  EffectItem,
  LayerMask,
  PathPoint,
  TimelineClip,
  TimelineTrack,
  ToolMode,
  ViewportCameraAngle,
  ViewportOrbitState,
} from '../types/editor';
import {
  applyLumaMatteToPixels,
  CameraViewState,
  computeAnchorScreenCenter,
  computeLightShading,
  projectLayerPointThroughCamera,
  projectLayerThroughCamera,
  quaternionFromEuler,
  resolveCameraViewState,
  resolveWorldTransform,
  rotateVector3,
} from '../engine/math3d';
import { evaluateClipTransform, getClipLocalTime, getClipSpeedAtLocalTime } from '../engine/keyframes';
import { findAdjacentOutgoingClip, getTransitionProgress } from '../engine/transitions';
import { getTextAnimatorDefinition } from '../data/textAnimators';

export interface MediaCache {
  images: Map<string, HTMLImageElement>;
  videos: Map<string, HTMLVideoElement>;
  scratch: Map<string, HTMLCanvasElement>;
}

export function createMediaCache(): MediaCache {
  return {
    images: new Map(),
    videos: new Map(),
    scratch: new Map(),
  };
}

function getScratchCanvas(
  cache: MediaCache,
  key: string,
  width: number,
  height: number
): HTMLCanvasElement {
  let c = cache.scratch.get(key);
  if (!c) {
    c = document.createElement('canvas');
    cache.scratch.set(key, c);
  }
  const tw = Math.max(1, Math.round(width));
  const th = Math.max(1, Math.round(height));
  if (c.width !== tw || c.height !== th) {
    c.width = tw;
    c.height = th;
  }
  const sctx = c.getContext('2d');
  if (sctx) {
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, tw, th);
  }
  return c;
}

interface ScreenPoint2D {
  x: number;
  y: number;
}

function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  source: [ScreenPoint2D, ScreenPoint2D, ScreenPoint2D],
  destination: [ScreenPoint2D, ScreenPoint2D, ScreenPoint2D]
) {
  const [s1, s2, s3] = source;
  const [d1, d2, d3] = destination;
  const denominator =
    s1.x * (s2.y - s3.y) +
    s2.x * (s3.y - s1.y) +
    s3.x * (s1.y - s2.y);
  if (Math.abs(denominator) < 0.0001) return;

  const a = (d1.x * (s2.y - s3.y) + d2.x * (s3.y - s1.y) + d3.x * (s1.y - s2.y)) / denominator;
  const b = (d1.y * (s2.y - s3.y) + d2.y * (s3.y - s1.y) + d3.y * (s1.y - s2.y)) / denominator;
  const c = (d1.x * (s3.x - s2.x) + d2.x * (s1.x - s3.x) + d3.x * (s2.x - s1.x)) / denominator;
  const d = (d1.y * (s3.x - s2.x) + d2.y * (s1.x - s3.x) + d3.y * (s2.x - s1.x)) / denominator;
  const e = (
    d1.x * (s2.x * s3.y - s3.x * s2.y) +
    d2.x * (s3.x * s1.y - s1.x * s3.y) +
    d3.x * (s1.x * s2.y - s2.x * s1.y)
  ) / denominator;
  const f = (
    d1.y * (s2.x * s3.y - s3.x * s2.y) +
    d2.y * (s3.x * s1.y - s1.x * s3.y) +
    d3.y * (s1.x * s2.y - s2.x * s1.y)
  ) / denominator;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.lineTo(d3.x, d3.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(texture, 0, 0);
  ctx.restore();
}

/** Perspective-correctly maps a layer texture onto a subdivided 3D plane. */
function drawPerspectiveLayerPlane(
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  world: ReturnType<typeof resolveWorldTransform>,
  cameraClip: TimelineClip | null,
  clips: TimelineClip[],
  playheadTime: number,
  width: number,
  height: number,
  layerWidth: number,
  layerHeight: number,
  anchorX: number,
  anchorY: number,
  cameraState: CameraViewState,
  planeDepth = 0
) {
  const segments = 6;
  const left = width / 2 - layerWidth / 2 - anchorX;
  const top = height / 2 - layerHeight / 2 - anchorY;
  const cellW = layerWidth / segments;
  const cellH = layerHeight / segments;

  for (let row = 0; row < segments; row++) {
    for (let column = 0; column < segments; column++) {
      const sx0 = left + column * cellW;
      const sx1 = sx0 + cellW;
      const sy0 = top + row * cellH;
      const sy1 = sy0 + cellH;
      const project = (sx: number, sy: number) =>
        projectLayerPointThroughCamera(
          world,
          cameraClip,
          clips,
          playheadTime,
          width,
          height,
          sx - width / 2,
          sy - height / 2,
          planeDepth,
          cameraState
        );
      const p00 = project(sx0, sy0);
      const p10 = project(sx1, sy0);
      const p11 = project(sx1, sy1);
      const p01 = project(sx0, sy1);
      if (!p00.visible || !p10.visible || !p11.visible || !p01.visible) continue;

      drawTexturedTriangle(
        ctx,
        texture,
        [{ x: sx0, y: sy0 }, { x: sx1, y: sy0 }, { x: sx1, y: sy1 }],
        [p00, p10, p11]
      );
      drawTexturedTriangle(
        ctx,
        texture,
        [{ x: sx0, y: sy0 }, { x: sx1, y: sy1 }, { x: sx0, y: sy1 }],
        [p00, p11, p01]
      );
    }
  }
}

function shadeHexColor(color: string, factor: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const value = Number.parseInt(match[1], 16);
  const r = Math.max(0, Math.min(255, Math.round(((value >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((value >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((value & 255) * factor)));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Draws the actual side walls of an extruded 3D vector shape before its front plane. */
function drawExtrudedShapeSides(
  ctx: CanvasRenderingContext2D,
  world: ReturnType<typeof resolveWorldTransform>,
  clip: TimelineClip,
  clips: TimelineClip[],
  playheadTime: number,
  activeCamera: TimelineClip | null,
  cameraState: CameraViewState,
  width: number,
  height: number,
  anchorX: number,
  anchorY: number,
  depth: number
) {
  const props = clip.shapeProps;
  if (!props || Math.abs(depth) <= 0.01) return;
  const shapeTransform = evaluateClipTransform(clip, playheadTime);
  const shapeWidth = Math.max(1, shapeTransform.shapeWidth ?? props.width);
  const shapeHeight = Math.max(1, shapeTransform.shapeHeight ?? props.height);
  const halfW = shapeWidth / 2;
  const halfH = shapeHeight / 2;
  const outline: ScreenPoint2D[] = [];

  if (props.shapeType === 'circle' || props.shapeType === 'ring') {
    const count = 48;
    const radiusX = halfW;
    const radiusY = halfH;
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      outline.push({ x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY });
    }
  } else if (props.shapeType === 'polygon') {
    const sides = Math.max(3, Math.min(32, Math.round(props.sides ?? 6)));
    for (let index = 0; index < sides; index++) {
      const angle = (index / sides) * Math.PI * 2 - Math.PI / 2;
      outline.push({ x: Math.cos(angle) * halfW, y: Math.sin(angle) * halfH });
    }
  } else {
    outline.push(
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH }
    );
  }

  const project = (point: ScreenPoint2D, z: number) =>
    projectLayerPointThroughCamera(
      world,
      activeCamera,
      clips,
      playheadTime,
      width,
      height,
      point.x - anchorX,
      point.y - anchorY,
      z,
      cameraState
    );

  ctx.save();
  ctx.lineWidth = Math.max(0.8, Math.min(4, props.strokeWidth || 1));
  ctx.lineJoin = 'round';

  for (let index = 0; index < outline.length; index++) {
    const next = (index + 1) % outline.length;
    const a = outline[index];
    const b = outline[next];
    const backA = project(a, 0);
    const backB = project(b, 0);
    const frontA = project(a, depth);
    const frontB = project(b, depth);
    if (!backA.visible || !backB.visible || !frontA.visible || !frontB.visible) continue;

    const shade = 0.48 + (index % 5) * 0.065;
    ctx.fillStyle = shadeHexColor(props.fillColor, shade);
    ctx.strokeStyle = shadeHexColor(props.strokeColor, 0.72);
    ctx.beginPath();
    ctx.moveTo(backA.x, backA.y);
    ctx.lineTo(backB.x, backB.y);
    ctx.lineTo(frontB.x, frontB.y);
    ctx.lineTo(frontA.x, frontA.y);
    ctx.closePath();
    ctx.fill();
    if (props.strokeWidth > 0) ctx.stroke();
  }
  ctx.restore();
}

function getFittedMediaSize(
  sourceWidth: number,
  sourceHeight: number,
  frameWidth: number,
  frameHeight: number,
  fitMode: 'contain' | 'cover' | 'stretch'
): { width: number; height: number } {
  if (fitMode === 'stretch') return { width: frameWidth, height: frameHeight };
  const scale = fitMode === 'cover'
    ? Math.max(frameWidth / Math.max(1, sourceWidth), frameHeight / Math.max(1, sourceHeight))
    : Math.min(frameWidth / Math.max(1, sourceWidth), frameHeight / Math.max(1, sourceHeight));
  return { width: sourceWidth * scale, height: sourceHeight * scale };
}

function drawFittedMedia(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  drawWidth: number,
  drawHeight: number,
  frameWidth: number,
  frameHeight: number,
  fitMode: 'contain' | 'cover' | 'stretch',
  fitPositionX = 50,
  fitPositionY = 50
): { width: number; height: number } {
  ctx.save();
  if (fitMode === 'cover') {
    ctx.beginPath();
    ctx.rect(-frameWidth / 2, -frameHeight / 2, frameWidth, frameHeight);
    ctx.clip();
  }
  const overflowX = Math.max(0, drawWidth - frameWidth);
  const overflowY = Math.max(0, drawHeight - frameHeight);
  const offsetX = (Math.max(0, Math.min(100, fitPositionX)) / 100 - 0.5) * overflowX;
  const offsetY = (Math.max(0, Math.min(100, fitPositionY)) / 100 - 0.5) * overflowY;
  ctx.drawImage(
    source,
    -drawWidth / 2 - offsetX,
    -drawHeight / 2 - offsetY,
    drawWidth,
    drawHeight
  );
  ctx.restore();
  return fitMode === 'contain'
    ? { width: drawWidth, height: drawHeight }
    : { width: frameWidth, height: frameHeight };
}

function getOrLoadImage(
  cache: MediaCache,
  src: string,
  onReady?: () => void
): HTMLImageElement | null {
  let img = cache.images.get(src);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      onReady?.();
    };
    img.src = src;
    cache.images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function getOrLoadVideo(
  cache: MediaCache,
  src: string,
  localMediaTime: number,
  isPlaying: boolean,
  onReady?: () => void,
  playbackRate = 1,
  reversed = false
): HTMLVideoElement | null {
  let video = cache.videos.get(src);
  if (!video) {
    video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.onloadeddata = () => {
      onReady?.();
    };
    cache.videos.set(src, video);
  }

  if (video.readyState >= 2) {
    const clampedTarget = Math.max(
      0,
      Math.min(video.duration || localMediaTime, localMediaTime)
    );
    if (reversed) {
      // HTMLVideoElement does not provide reliable negative playbackRate support.
      // Pause and seek to the exact reverse source time on every preview frame.
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - clampedTarget) > 0.012) {
        video.currentTime = clampedTarget;
      }
    } else if (isPlaying) {
      video.playbackRate = Math.max(0.1, Math.min(8, playbackRate));
      if (video.paused) video.play().catch(() => {});
      if (Math.abs(video.currentTime - clampedTarget) > 0.22) {
        video.currentTime = clampedTarget;
      }
    } else {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - clampedTarget) > 0.04) {
        video.currentTime = clampedTarget;
      }
    }
    return video;
  }
  return null;
}

/**
 * Awaits active image decode and video frame seeks before offline rendering/snapshot.
 */
export async function awaitMediaReadyForFrame(
  cache: MediaCache,
  clips: TimelineClip[],
  playheadTime: number,
  fps: number = 30
): Promise<void> {
  const transitionMediaIds = new Set<string>();
  for (const incoming of clips) {
    const transition = incoming.transitionIn;
    if (!transition) continue;
    const outgoing = findAdjacentOutgoingClip(clips, incoming, fps);
    if (!outgoing) continue;
    const halfDuration = transition.duration / 2;
    if (playheadTime < incoming.start - halfDuration || playheadTime > incoming.start + halfDuration) continue;
    transitionMediaIds.add(outgoing.id);
    transitionMediaIds.add(incoming.id);
  }

  const activeMediaClips = clips.filter(
    (c) =>
      (c.kind === 'image' || c.kind === 'video') &&
      Boolean(c.src) &&
      ((playheadTime >= c.start && playheadTime <= c.start + c.duration) || transitionMediaIds.has(c.id))
  );

  await Promise.all(
    activeMediaClips.map(async (clip) => {
      if (!clip.src) return;
      if (clip.kind === 'image') {
        let img = cache.images.get(clip.src);
        if (!img) {
          img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = clip.src;
          cache.images.set(clip.src, img);
        }
        if (!img.complete) {
          await new Promise<void>((resolve) => {
            const done = () => resolve();
            img!.addEventListener('load', done, { once: true });
            img!.addEventListener('error', done, { once: true });
            setTimeout(done, 1500);
          });
        }
      } else if (clip.kind === 'video') {
        let video = cache.videos.get(clip.src);
        if (!video) {
          video = document.createElement('video');
          video.src = clip.src;
          video.muted = true;
          video.playsInline = true;
          video.crossOrigin = 'anonymous';
          video.preload = 'auto';
          cache.videos.set(clip.src, video);
        }
        if (video.readyState < 2) {
          await new Promise<void>((resolve) => {
            const done = () => resolve();
            video!.addEventListener('loadeddata', done, { once: true });
            video!.addEventListener('error', done, { once: true });
            setTimeout(done, 2000);
          });
        }
        if (video.readyState >= 2) {
          if (!video.paused) video.pause();
          const target = Math.max(
            0,
            Math.min(
              video.duration || 0,
              clip.sourceIn + getClipLocalTime(clip, playheadTime)
            )
          );
          if (Math.abs(video.currentTime - target) > 0.03) {
            await new Promise<void>((resolve) => {
              const done = () => resolve();
              video!.addEventListener('seeked', done, { once: true });
              video!.currentTime = target;
              setTimeout(done, 450);
            });
          }
        }
      }
    })
  );
}

function toCompositeOp(mode: BlendMode): GlobalCompositeOperation {
  switch (mode) {
    case 'multiply':
      return 'multiply';
    case 'screen':
      return 'screen';
    case 'overlay':
      return 'overlay';
    case 'add':
      return 'lighter';
    case 'normal':
    default:
      return 'source-over';
  }
}

function buildFilterString(
  effects: EffectItem[],
  lightBrightness: number = 1,
  colorGrade?: ColorWheelGrade
): string {
  const filters: string[] = [];
  if (Math.abs(lightBrightness - 1) > 0.03) {
    filters.push(`brightness(${Math.round(lightBrightness * 100)}%)`);
  }

  if (colorGrade?.enabled) {
    const lumaShift =
      100 +
      colorGrade.lift.luma * 0.25 +
      colorGrade.gamma.luma * 0.35 +
      colorGrade.gain.luma * 0.4 +
      (colorGrade.highlights ?? 0) * 0.25 +
      (colorGrade.shadows ?? 0) * 0.2;
    const curveContrast =
      colorGrade.contrast + ((colorGrade.highlights ?? 0) - (colorGrade.shadows ?? 0)) * 0.35;
    const exposureMultiplier = Math.pow(2, Math.max(-5, Math.min(5, colorGrade.exposureStops ?? 0)));
    const saturation = Math.max(0, Math.min(300, colorGrade.saturation + (colorGrade.vibrance ?? 0) * 0.55 + (colorGrade.colorBoost ?? 0) * 0.35));
    const tempShift = (colorGrade.temp ?? 0) * 0.035;
    const tintShift = (colorGrade.tint ?? 0) * -0.025;
    const pivot = Math.max(0.1, Math.min(0.9, colorGrade.pivot ?? 0.5));
    const pivotContrast = 100 + (0.5 - pivot) * 22;
    filters.push(
      `brightness(${Math.max(8, Math.min(800, Math.round(lumaShift * exposureMultiplier)))}%) contrast(${Math.max(40, Math.round(curveContrast + pivotContrast - 100))}%) saturate(${Math.round(saturation)}%) hue-rotate(${Math.round((colorGrade.hue ?? 0) + tempShift + tintShift)}deg)`
    );
  }

  for (const fx of effects) {
    if (!fx.enabled) continue;
    if (fx.type === 'blur') {
      const r = Math.max(0, fx.params.radius ?? 0);
      if (r > 0) filters.push(`blur(${r}px)`);
    } else if (fx.type === 'motionblur') {
      const amt = Math.max(0, fx.params.amount ?? 0);
      if (amt > 0) filters.push(`blur(${(amt * 0.22).toFixed(1)}px)`);
    } else if (fx.type === 'sharpen') {
      const amt = Math.max(0, fx.params.amount ?? 35);
      filters.push(`contrast(${Math.round(100 + amt * 0.55)}%)`);
    } else if (fx.type === 'color') {
      const exp = fx.params.exposure ?? 100;
      const con = fx.params.contrast ?? 100;
      const sat = fx.params.saturation ?? 100;
      const hue = fx.params.hue ?? 0;
      filters.push(
        `brightness(${exp}%) contrast(${con}%) saturate(${sat}%) hue-rotate(${hue}deg)`
      );
    } else if (fx.type === 'hue_sat') {
      const hue = fx.params.hue ?? 0;
      const sat = fx.params.saturation ?? 100;
      const light = fx.params.lightness ?? 100;
      filters.push(`hue-rotate(${hue}deg) saturate(${sat}%) brightness(${light}%)`);
    } else if (fx.type === 'posterize') {
      const lv = Math.max(2, fx.params.levels ?? 6);
      const boost = 100 + (12 - Math.min(10, lv)) * 12;
      filters.push(`contrast(${boost}%)`);
    }
  }
  return filters.length > 0 ? filters.join(' ') : 'none';
}

function traceLayerMaskPath(ctx: CanvasRenderingContext2D, mask: LayerMask, layerW: number, layerH: number) {
  const mw = Math.max(12, (mask.width / 100) * layerW);
  const mh = Math.max(12, (mask.height / 100) * layerH);
  const mx = (mask.x / 100) * layerW;
  const my = (mask.y / 100) * layerH;
  ctx.beginPath();
  if (mask.shape === 'ellipse') {
    ctx.ellipse(mx, my, mw / 2, mh / 2, 0, 0, Math.PI * 2);
  } else if (mask.shape === 'rounded-rect') {
    const radius = Math.max(4, Math.min(mw, mh) * 0.14);
    ctx.roundRect(mx - mw / 2, my - mh / 2, mw, mh, radius);
  } else {
    ctx.rect(mx - mw / 2, my - mh / 2, mw, mh);
  }
}

/** Applies a real alpha mask to the isolated layer texture; feather softens only the mask boundary. */
function applyFeatheredLayerMask(
  layerCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  mask: LayerMask,
  layerW: number,
  layerH: number,
  maskTransform: DOMMatrix
) {
  const maskCtx = maskCanvas.getContext('2d');
  const layerCtx = layerCanvas.getContext('2d');
  if (!maskCtx || !layerCtx) return;

  maskCtx.save();
  maskCtx.setTransform(1, 0, 0, 1, 0, 0);
  maskCtx.globalCompositeOperation = 'source-over';
  maskCtx.filter = 'none';
  if (mask.inverted) {
    maskCtx.fillStyle = '#FFFFFF';
    maskCtx.fillRect(0, 0, layerW, layerH);
  }
  maskCtx.setTransform(maskTransform);
  maskCtx.globalCompositeOperation = mask.inverted ? 'destination-out' : 'source-over';
  const feather = Math.max(0, Math.min(120, mask.feather));
  maskCtx.filter = feather > 0 ? `blur(${feather}px)` : 'none';
  maskCtx.fillStyle = '#FFFFFF';
  traceLayerMaskPath(maskCtx, mask, layerW, layerH);
  maskCtx.fill();
  maskCtx.restore();

  if (mask.opacity < 100) {
    maskCtx.save();
    maskCtx.setTransform(1, 0, 0, 1, 0, 0);
    maskCtx.globalCompositeOperation = 'destination-in';
    maskCtx.globalAlpha = Math.max(0, Math.min(1, mask.opacity / 100));
    maskCtx.fillStyle = '#FFFFFF';
    maskCtx.fillRect(0, 0, layerW, layerH);
    maskCtx.restore();
  }

  layerCtx.save();
  layerCtx.setTransform(1, 0, 0, 1, 0, 0);
  layerCtx.globalCompositeOperation = 'destination-in';
  layerCtx.drawImage(maskCanvas, 0, 0);
  layerCtx.restore();
}

function applyDaVinciToneOverlay(
  ctx: CanvasRenderingContext2D,
  grade: ColorWheelGrade,
  baseW: number,
  baseH: number
) {
  if (!grade.enabled) return;

  // Lift (Shadows) + Gain (Highlights) + Temp/Tint wash
  const liftR = Math.max(0, Math.min(255, Math.round(128 + grade.lift.r * 110)));
  const liftG = Math.max(0, Math.min(255, Math.round(128 + grade.lift.g * 110)));
  const liftB = Math.max(0, Math.min(255, Math.round(128 + grade.lift.b * 110)));
  const liftStrength = Math.min(
    0.45,
    Math.hypot(grade.lift.r, grade.lift.g, grade.lift.b) * 0.42
  );
  if (liftStrength > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = liftStrength * 0.55;
    ctx.fillStyle = `rgb(${liftR}, ${liftG}, ${liftB})`;
    ctx.fillRect(-baseW / 2, -baseH / 2, baseW, baseH);
    ctx.restore();
  }

  const gammaR = Math.max(0, Math.min(255, Math.round(128 + grade.gamma.r * 120 + grade.temp * 0.6)));
  const gammaG = Math.max(0, Math.min(255, Math.round(128 + grade.gamma.g * 120 - grade.tint * 0.5)));
  const gammaB = Math.max(0, Math.min(255, Math.round(128 + grade.gamma.b * 120 - grade.temp * 0.6)));
  const gammaStrength = Math.min(
    0.45,
    (Math.hypot(grade.gamma.r, grade.gamma.g, grade.gamma.b) +
      Math.abs(grade.temp) / 140 +
      Math.abs(grade.tint) / 140) *
      0.38
  );
  if (gammaStrength > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = gammaStrength;
    ctx.fillStyle = `rgb(${gammaR}, ${gammaG}, ${gammaB})`;
    ctx.fillRect(-baseW / 2, -baseH / 2, baseW, baseH);
    ctx.restore();
  }

  const gainR = Math.max(0, Math.min(255, Math.round(128 + grade.gain.r * 125)));
  const gainG = Math.max(0, Math.min(255, Math.round(128 + grade.gain.g * 125)));
  const gainB = Math.max(0, Math.min(255, Math.round(128 + grade.gain.b * 125)));
  const gainStrength = Math.min(
    0.45,
    Math.hypot(grade.gain.r, grade.gain.g, grade.gain.b) * 0.4
  );
  if (gainStrength > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = gainStrength;
    ctx.fillStyle = `rgb(${gainR}, ${gainG}, ${gainB})`;
    ctx.fillRect(-baseW / 2, -baseH / 2, baseW, baseH);
    ctx.restore();
  }

  const offset = grade.offset ?? { r: 0, g: 0, b: 0, luma: 0 };
  const offsetStrength = Math.min(0.32, (Math.hypot(offset.r, offset.g, offset.b) + Math.abs(offset.luma) / 100) * 0.25);
  if (offsetStrength > 0.005) {
    const r = Math.max(0, Math.min(255, Math.round(128 + offset.r * 115 + offset.luma * 0.7)));
    const g = Math.max(0, Math.min(255, Math.round(128 + offset.g * 115 + offset.luma * 0.7)));
    const b = Math.max(0, Math.min(255, Math.round(128 + offset.b * 115 + offset.luma * 0.7)));
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = offsetStrength;
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(-baseW / 2, -baseH / 2, baseW, baseH);
    ctx.restore();
  }

  const detail = Math.max(-100, Math.min(100, grade.midtoneDetail ?? 0));
  if (Math.abs(detail) > 1) {
    ctx.save();
    ctx.globalCompositeOperation = detail > 0 ? 'overlay' : 'soft-light';
    ctx.globalAlpha = Math.abs(detail) / 700;
    ctx.fillStyle = detail > 0 ? '#FFFFFF' : '#808080';
    ctx.fillRect(-baseW / 2, -baseH / 2, baseW, baseH);
    ctx.restore();
  }
}

function applyPostOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effects: EffectItem[],
  time: number,
  mediaCache: MediaCache
) {
  for (const fx of effects) {
    if (!fx.enabled) continue;

    if (fx.type === 'vignette') {
      const amount = Math.min(1, Math.max(0, (fx.params.amount ?? 50) / 100));
      const softness = Math.min(1, Math.max(0.1, (fx.params.softness ?? 65) / 100));
      const outerRadius = Math.hypot(width, height) * 0.54;
      const innerRadius = outerRadius * (0.25 + softness * 0.45);
      const grad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        innerRadius,
        width / 2,
        height / 2,
        outerRadius
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${amount * 0.9})`);
      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } else if (fx.type === 'tint') {
      const amt = Math.min(0.6, (fx.params.amount ?? 35) / 100);
      const warmth = fx.params.warmth ?? 25;
      ctx.save();
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle =
        warmth >= 0
          ? `rgba(245, 158, 11, ${amt})`
          : `rgba(56, 189, 248, ${amt})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } else if (fx.type === 'chromatic') {
      const shift = fx.params.shift ?? 4;
      if (shift > 0) {
        const snap = getScratchCanvas(mediaCache, 'postfx_snap', width, height);
        const sctx = snap.getContext('2d');
        if (sctx) {
          sctx.drawImage(ctx.canvas, 0, 0, width, height);
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = 0.28;
          ctx.drawImage(snap, -shift, 0);
          ctx.drawImage(snap, shift, 0);
          ctx.restore();
        }
      }
    } else if (fx.type === 'glitch') {
      const amount = fx.params.amount ?? 25;
      const slices = Math.max(2, Math.round(fx.params.slices ?? 8));
      const snap = getScratchCanvas(mediaCache, 'postfx_snap', width, height);
      const sctx = snap.getContext('2d');
      if (sctx) {
        sctx.drawImage(ctx.canvas, 0, 0, width, height);
        ctx.save();
        for (let i = 0; i < slices; i++) {
          const seed = Math.sin(time * 24 + i * 17.3);
          const sy = Math.floor(((seed + 1) / 2) * Math.max(1, height - 24));
          const sh = Math.max(6, Math.round((6 + (i % 4) * 7) * (height / 720)));
          const dx = Math.round(Math.cos(time * 31 + i * 9.1) * (amount * 0.8));
          ctx.drawImage(snap, 0, sy, width, sh, dx, sy, width, sh);
        }
        ctx.restore();
      }
    } else if (fx.type === 'wavewarp') {
      const h = fx.params.height ?? 10;
      const w = Math.max(10, fx.params.width ?? 35);
      const spd = fx.params.speed ?? 4;
      const snap = getScratchCanvas(mediaCache, 'postfx_snap', width, height);
      const sctx = snap.getContext('2d');
      if (sctx) {
        sctx.drawImage(ctx.canvas, 0, 0, width, height);
        ctx.save();
        const bandH = Math.max(8, Math.round(height / 72));
        for (let y = 0; y < height; y += bandH) {
          const dx = Math.sin(y / w + time * spd) * h;
          const bh = Math.min(bandH, height - y);
          ctx.drawImage(snap, 0, y, width, bh, dx, y, width, bh);
        }
        ctx.restore();
      }
    } else if (fx.type === 'lensflare') {
      const bright = Math.min(1, (fx.params.brightness ?? 65) / 100);
      const fxX = ((fx.params.x ?? 50) / 100) * width;
      const fxY = ((fx.params.y ?? 35) / 100) * height;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const radial = ctx.createRadialGradient(fxX, fxY, 2, fxX, fxY, width * 0.35);
      radial.addColorStop(0, `rgba(255, 240, 210, ${0.85 * bright})`);
      radial.addColorStop(0.25, `rgba(96, 165, 250, ${0.35 * bright})`);
      radial.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);

      // Anamorphic horizontal streak
      const streak = ctx.createLinearGradient(0, fxY, width, fxY);
      streak.addColorStop(0, 'rgba(59,130,246,0)');
      streak.addColorStop(0.5, `rgba(147,197,253,${0.48 * bright})`);
      streak.addColorStop(1, 'rgba(59,130,246,0)');
      ctx.fillStyle = streak;
      ctx.fillRect(0, fxY - 4, width, 8);
      ctx.restore();
    } else if (fx.type === 'filmgrain') {
      const amt = Math.min(0.3, (fx.params.amount ?? 18) / 250);
      const size = Math.max(2, fx.params.size ?? 2);
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255,${amt})`;
      for (let i = 0; i < 180; i++) {
        const gx = ((Math.sin(i * 91.7 + time * 17) + 1) * 0.5) * width;
        const gy = ((Math.cos(i * 47.3 + time * 29) + 1) * 0.5) * height;
        ctx.fillRect(gx, gy, size, size);
      }
      ctx.restore();
    } else if (fx.type === 'halation') {
      const intensity = Math.min(0.65, (fx.params.intensity ?? 40) / 100);
      const snap = getScratchCanvas(mediaCache, 'postfx_snap', width, height);
      const sctx = snap.getContext('2d');
      if (sctx) {
        sctx.drawImage(ctx.canvas, 0, 0, width, height);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = intensity * 0.65;
        ctx.filter = `blur(${Math.max(4, Math.round(fx.params.spread ?? 20))}px)`;
        ctx.drawImage(snap, 0, 0);
        ctx.filter = 'none';
        ctx.fillStyle = `rgba(239, 68, 68, ${intensity * 0.25})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    } else if (fx.type === 'pixelate') {
      const block = Math.max(4, Math.min(48, Math.round(fx.params.size ?? 12)));
      const sw = Math.max(8, Math.floor(width / block));
      const sh = Math.max(6, Math.floor(height / block));
      const tmp = getScratchCanvas(mediaCache, 'pixelate_tmp', sw, sh);
      const tctx = tmp.getContext('2d');
      if (tctx) {
        tctx.drawImage(ctx.canvas, 0, 0, sw, sh);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, width, height);
        ctx.restore();
      }
    }
  }
}

function applyChromaKeyToSource(
  cache: MediaCache,
  source: HTMLImageElement | HTMLVideoElement,
  w: number,
  h: number,
  hueTargetDeg: number,
  tolerance: number,
  softness: number
): HTMLCanvasElement {
  const bw = Math.max(1, Math.min(640, Math.round(w)));
  const bh = Math.max(1, Math.min(360, Math.round(h)));
  const buf = getScratchCanvas(cache, 'chromakey_tmp', bw, bh);
  const bctx = buf.getContext('2d');
  if (!bctx) return buf;
  bctx.drawImage(source, 0, 0, bw, bh);
  const imgData = bctx.getImageData(0, 0, bw, bh);
  const d = imgData.data;
  const targetIsGreen = hueTargetDeg >= 75 && hueTargetDeg <= 170;
  const tol = Math.max(8, tolerance);
  const soft = Math.max(4, softness);

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const diff = targetIsGreen
      ? g - Math.max(r, b)
      : b - Math.max(r, g);
    if (diff > tol) {
      d[i + 3] = 0;
    } else if (diff > tol - soft) {
      const alpha = Math.max(0, Math.min(1, (tol - diff) / soft));
      d[i + 3] = Math.round(d[i + 3] * alpha);
      if (targetIsGreen) d[i + 1] = Math.min(d[i + 1], Math.max(r, b) + 6);
    }
  }
  bctx.putImageData(imgData, 0, 0);
  return buf;
}

function drawVectorPathPoints(
  ctx: CanvasRenderingContext2D,
  points: PathPoint[],
  closed: boolean,
  trimStart: number,
  trimEnd: number
) {
  if (points.length < 2) return;
  const totalPts = points.length;
  const startIdx = Math.floor((trimStart / 100) * (totalPts - 1));
  const endIdx = Math.max(
    startIdx + 1,
    Math.ceil((trimEnd / 100) * (totalPts - 1))
  );

  ctx.beginPath();
  ctx.moveTo(points[startIdx].x, points[startIdx].y);
  for (let i = startIdx + 1; i <= Math.min(endIdx, totalPts - 1); i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (
      prev.handleOutX !== undefined &&
      prev.handleOutY !== undefined &&
      curr.handleInX !== undefined &&
      curr.handleInY !== undefined
    ) {
      ctx.bezierCurveTo(
        prev.handleOutX,
        prev.handleOutY,
        curr.handleInX,
        curr.handleInY,
        curr.x,
        curr.y
      );
    } else {
      ctx.lineTo(curr.x, curr.y);
    }
  }
  if (closed && trimStart <= 1 && trimEnd >= 99) {
    const last = points[totalPts - 1];
    const first = points[0];
    if (
      last.handleOutX !== undefined && last.handleOutY !== undefined &&
      first.handleInX !== undefined && first.handleInY !== undefined
    ) {
      ctx.bezierCurveTo(last.handleOutX, last.handleOutY, first.handleInX, first.handleInY, first.x, first.y);
    }
    ctx.closePath();
  }
}

type ShapePoint = { x: number; y: number };

function traceVectorShape(
  ctx: CanvasRenderingContext2D,
  shapeType: NonNullable<TimelineClip['shapeProps']>['shapeType'],
  width: number,
  height: number,
  cornerRadius: number,
  sides = 6
) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const l = -w / 2;
  const r = w / 2;
  const t = -h / 2;
  const b = h / 2;
  const polygon = (points: ShapePoint[]) => {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
  };
  const regularPolygon = (count: number, innerRatio = 1) => {
    const radius = Math.min(w, h) / 2;
    const points: ShapePoint[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      points.push({
        x: Math.cos(a) * radius * (innerRatio === 1 ? 1 : (i % 2 === 0 ? 1 : innerRatio)),
        y: Math.sin(a) * radius * (innerRatio === 1 ? 1 : (i % 2 === 0 ? 1 : innerRatio)),
      });
    }
    return points;
  };

  ctx.beginPath();
  switch (shapeType) {
    case 'circle':
      ctx.ellipse(0, 0, Math.min(w, h) / 2, Math.min(w, h) / 2, 0, 0, Math.PI * 2);
      break;
    case 'ellipse':
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'ring':
      ctx.ellipse(0, 0, Math.min(w, h) / 2, Math.min(w, h) / 2, 0, 0, Math.PI * 2);
      break;
    case 'polygon':
      polygon(regularPolygon(Math.max(3, Math.min(24, Math.round(sides)))));
      break;
    case 'triangle':
      polygon([{ x: 0, y: t }, { x: r, y: b }, { x: l, y: b }]);
      break;
    case 'diamond':
      polygon([{ x: 0, y: t }, { x: r, y: 0 }, { x: 0, y: b }, { x: l, y: 0 }]);
      break;
    case 'pentagon':
      polygon(regularPolygon(5));
      break;
    case 'hexagon':
      polygon(regularPolygon(6));
      break;
    case 'heptagon':
      polygon(regularPolygon(7));
      break;
    case 'octagon':
      polygon(regularPolygon(8));
      break;
    case 'star':
      polygon(regularPolygon(10, 0.43));
      break;
    case 'star-6':
      polygon(regularPolygon(12, 0.48));
      break;
    case 'burst':
      polygon(regularPolygon(24, 0.55));
      break;
    case 'heart':
      ctx.moveTo(0, h * 0.42);
      ctx.bezierCurveTo(-w * 0.12, h * 0.28, -w * 0.5, -h * 0.02, -w * 0.46, -h * 0.24);
      ctx.bezierCurveTo(-w * 0.42, -h * 0.54, -w * 0.08, -h * 0.53, 0, -h * 0.28);
      ctx.bezierCurveTo(w * 0.08, -h * 0.53, w * 0.42, -h * 0.54, w * 0.46, -h * 0.24);
      ctx.bezierCurveTo(w * 0.5, -h * 0.02, w * 0.12, h * 0.28, 0, h * 0.42);
      ctx.closePath();
      break;
    case 'arrow':
      polygon([
        { x: l, y: -h * 0.18 }, { x: w * 0.08, y: -h * 0.18 },
        { x: w * 0.08, y: -h * 0.42 }, { x: r, y: 0 },
        { x: w * 0.08, y: h * 0.42 }, { x: w * 0.08, y: h * 0.18 },
        { x: l, y: h * 0.18 },
      ]);
      break;
    case 'chevron':
      polygon([
        { x: l, y: t }, { x: -w * 0.12, y: t }, { x: r, y: 0 },
        { x: -w * 0.12, y: b }, { x: l, y: b }, { x: w * 0.05, y: 0 },
      ]);
      break;
    case 'cross':
      polygon([
        { x: -w * 0.18, y: t }, { x: w * 0.18, y: t },
        { x: w * 0.18, y: -h * 0.18 }, { x: r, y: -h * 0.18 },
        { x: r, y: h * 0.18 }, { x: w * 0.18, y: h * 0.18 },
        { x: w * 0.18, y: b }, { x: -w * 0.18, y: b },
        { x: -w * 0.18, y: h * 0.18 }, { x: l, y: h * 0.18 },
        { x: l, y: -h * 0.18 }, { x: -w * 0.18, y: -h * 0.18 },
      ]);
      break;
    case 'plus':
      polygon([
        { x: -w * 0.16, y: t }, { x: w * 0.16, y: t },
        { x: w * 0.16, y: -h * 0.16 }, { x: r, y: -h * 0.16 },
        { x: r, y: h * 0.16 }, { x: w * 0.16, y: h * 0.16 },
        { x: w * 0.16, y: b }, { x: -w * 0.16, y: b },
        { x: -w * 0.16, y: h * 0.16 }, { x: l, y: h * 0.16 },
        { x: l, y: -h * 0.16 }, { x: -w * 0.16, y: -h * 0.16 },
      ]);
      break;
    case 'minus':
      polygon([{ x: l, y: -h * 0.16 }, { x: r, y: -h * 0.16 }, { x: r, y: h * 0.16 }, { x: l, y: h * 0.16 }]);
      break;
    case 'trapezoid':
      polygon([{ x: -w * 0.32, y: t }, { x: w * 0.32, y: t }, { x: r, y: b }, { x: l, y: b }]);
      break;
    case 'parallelogram':
      polygon([{ x: -w * 0.28, y: t }, { x: r, y: t }, { x: w * 0.28, y: b }, { x: l, y: b }]);
      break;
    case 'speech-bubble':
      polygon([
        { x: l, y: t }, { x: r, y: t }, { x: r, y: h * 0.24 },
        { x: w * 0.12, y: h * 0.24 }, { x: -w * 0.04, y: b },
        { x: -w * 0.08, y: h * 0.24 }, { x: l, y: h * 0.24 },
      ]);
      break;
    case 'cloud':
      ctx.moveTo(-w * 0.38, h * 0.22);
      ctx.bezierCurveTo(-w * 0.57, h * 0.08, -w * 0.49, -h * 0.19, -w * 0.25, -h * 0.2);
      ctx.bezierCurveTo(-w * 0.18, -h * 0.49, w * 0.2, -h * 0.5, w * 0.28, -h * 0.2);
      ctx.bezierCurveTo(w * 0.57, -h * 0.22, w * 0.59, h * 0.16, w * 0.34, h * 0.25);
      ctx.bezierCurveTo(w * 0.27, h * 0.49, -w * 0.12, h * 0.47, -w * 0.2, h * 0.25);
      ctx.closePath();
      break;
    case 'lightning':
      polygon([
        { x: w * 0.08, y: t }, { x: -w * 0.28, y: h * 0.08 },
        { x: -w * 0.02, y: h * 0.08 }, { x: -w * 0.16, y: b },
        { x: w * 0.3, y: -h * 0.12 }, { x: w * 0.04, y: -h * 0.12 },
      ]);
      break;
    case 'line':
      ctx.moveTo(l, b);
      ctx.lineTo(r, t);
      break;
    case 'rounded-rect':
      ctx.roundRect(l, t, w, h, Math.max(0, Math.min(cornerRadius || 28, Math.min(w, h) / 2)));
      break;
    case 'rect':
    case 'lower-third':
    default:
      ctx.rect(l, t, w, h);
      break;
  }
}

export interface RenderOptions {
  canvas: HTMLCanvasElement;
  composition: CompositionSettings;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  playheadTime: number;
  selectedClipId: string | null;
  showSafeMargins: boolean;
  showTransparencyGrid: boolean;
  showWireframes?: boolean;
  cameraAngle?: ViewportCameraAngle;
  penDraftPoints?: PathPoint[];
  isPlaying: boolean;
  mediaCache: MediaCache;
  onMediaLoaded?: () => void;
  drawGizmo?: boolean;
  activeTool?: ToolMode;
  /** Preview backing-store scale; capped to avoid excessive GPU/CPU memory use. */
  renderScale?: number;
  viewportOrbit?: ViewportOrbitState;
}

export interface BoundingBox {
  clipId: string;
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotationRad: number;
}

function renderOrthographic3DView(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  angle: Exclude<ViewportCameraAngle, 'active'>,
  tracks: TimelineTrack[],
  clips: TimelineClip[],
  playheadTime: number,
  selectedClipId: string | null,
  orbit: ViewportOrbitState = { yaw: 34, pitch: 24, zoom: 1, panX: 0, panY: 0 }
) {
  ctx.fillStyle = '#0D0F14';
  ctx.fillRect(0, 0, width, height);

  if (angle !== 'orbit') {
    // Fine grid plus stronger major divisions for the orthographic views.
    ctx.lineWidth = 1;
    const step = 32;
    for (let x = 0; x <= width; x += step) {
      const major = Math.abs(x - width / 2) % 256 === 0;
      ctx.strokeStyle = major ? 'rgba(148,163,184,0.16)' : 'rgba(255,255,255,0.045)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y <= height; y += step) {
      const major = Math.abs(y - height / 2) % 256 === 0;
      ctx.strokeStyle = major ? 'rgba(148,163,184,0.16)' : 'rgba(255,255,255,0.045)';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(248,113,113,0.72)';
    ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(74,222,128,0.72)';
    ctx.beginPath(); ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height); ctx.stroke();
    ctx.fillStyle = '#FCA5A5'; ctx.font = '600 11px "JetBrains Mono", monospace'; ctx.fillText('X', width - 18, height / 2 - 8);
    ctx.fillStyle = '#86EFAC'; ctx.fillText('Y', width / 2 + 8, 16);
  }

  const activeTracks = new Set(
    tracks.filter((track) => track.kind === 'video' && track.visible).map((track) => track.id)
  );
  const activeClips = clips.filter(
    (clip) =>
      activeTracks.has(clip.trackId) &&
      playheadTime >= clip.start &&
      playheadTime <= clip.start + clip.duration
  );
  const scale = 0.42;

  const projectPoint = (point: { x: number; y: number; z: number }) => {
    if (angle === 'orbit') {
      const yaw = (orbit.yaw * Math.PI) / 180;
      const pitch = (Math.max(-82, Math.min(82, orbit.pitch)) * Math.PI) / 180;
      const dx = point.x - orbit.panX;
      const dy = point.y - orbit.panY;
      const dz = point.z;
      const yawX = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const yawZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const pitchY = dy * Math.cos(pitch) - yawZ * Math.sin(pitch);
      const pitchZ = dy * Math.sin(pitch) + yawZ * Math.cos(pitch);
      const cameraDistance = 2400;
      const perspective = cameraDistance / Math.max(420, cameraDistance + pitchZ);
      const orbitScale = scale * Math.max(0.2, Math.min(5, orbit.zoom)) * perspective;
      return { x: width / 2 + yawX * orbitScale, y: height / 2 + pitchY * orbitScale };
    }
    if (angle === 'top') {
      return { x: width / 2 + point.x * scale, y: height / 2 + point.z * scale };
    }
    if (angle === 'front') {
      return { x: width / 2 + point.x * scale, y: height / 2 + point.y * scale };
    }
    return { x: width / 2 + point.z * scale, y: height / 2 + point.y * scale };
  };

  if (angle === 'orbit') {
    // Perspective floor grid gives the free-orbit view an actual spatial horizon.
    const floorY = orbit.panY + 260;
    const extent = 1800;
    const divisions = 24;
    for (let index = -divisions; index <= divisions; index++) {
      const offset = (index / divisions) * extent;
      const major = index % 4 === 0;
      ctx.strokeStyle = major ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.09)';
      ctx.lineWidth = major ? 1.2 : 0.7;
      const x1 = projectPoint({ x: -extent, y: floorY, z: offset });
      const x2 = projectPoint({ x: extent, y: floorY, z: offset });
      const z1 = projectPoint({ x: offset, y: floorY, z: -extent });
      const z2 = projectPoint({ x: offset, y: floorY, z: extent });
      ctx.beginPath(); ctx.moveTo(x1.x, x1.y); ctx.lineTo(x2.x, x2.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(z1.x, z1.y); ctx.lineTo(z2.x, z2.y); ctx.stroke();
    }
    const axisStart = projectPoint({ x: -extent, y: floorY, z: 0 });
    const axisEnd = projectPoint({ x: extent, y: floorY, z: 0 });
    ctx.strokeStyle = 'rgba(248,113,113,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(axisStart.x, axisStart.y); ctx.lineTo(axisEnd.x, axisEnd.y); ctx.stroke();
    const zStart = projectPoint({ x: 0, y: floorY, z: -extent });
    const zEnd = projectPoint({ x: 0, y: floorY, z: extent });
    ctx.strokeStyle = 'rgba(96,165,250,0.85)';
    ctx.beginPath(); ctx.moveTo(zStart.x, zStart.y); ctx.lineTo(zEnd.x, zEnd.y); ctx.stroke();
    ctx.fillStyle = '#FCA5A5'; ctx.font = '600 11px "JetBrains Mono", monospace'; ctx.fillText('X', axisEnd.x - 14, axisEnd.y - 8);
    ctx.fillStyle = '#93C5FD'; ctx.fillText('Z', zEnd.x + 6, zEnd.y - 6);
  }

  for (const clip of activeClips) {
    const world = resolveWorldTransform(clip, clips, playheadTime);
    const isSelected = clip.id === selectedClipId;
    const orientation = world.orientation ?? quaternionFromEuler(world.rotationX, world.rotationY, world.rotation);
    const origin = { x: world.x, y: world.y, z: world.z };

    ctx.save();
    if (clip.kind === 'camera') {
      const props = clip.cameraProps;
      let cameraOrientation = orientation;
      if (props?.useTarget) {
        const cameraPosition = { x: world.x, y: world.y, z: -900 + world.z };
        const direction = {
          x: props.lookAtX - cameraPosition.x,
          y: props.lookAtY - cameraPosition.y,
          z: props.lookAtZ - cameraPosition.z,
        };
        const yaw = Math.atan2(direction.x, direction.z) * 180 / Math.PI;
        const pitch = -Math.atan2(direction.y, Math.max(0.0001, Math.hypot(direction.x, direction.z))) * 180 / Math.PI;
        cameraOrientation = quaternionFromEuler(pitch, yaw, world.rotation);
      }
      const cameraOrigin = { x: world.x, y: world.y, z: -900 + world.z };
      const distance = 420;
      const focal = Math.max(8, props?.focalLength ?? 35);
      const sensorWidth = Math.max(18, props?.sensorWidth ?? 36);
      const halfW = Math.tan((sensorWidth / (2 * focal))) * distance;
      const halfH = halfW / Math.max(0.1, width / height);
      const corners = [
        { x: -halfW, y: -halfH, z: distance },
        { x: halfW, y: -halfH, z: distance },
        { x: halfW, y: halfH, z: distance },
        { x: -halfW, y: halfH, z: distance },
      ].map((point) => {
        const rotated = rotateVector3(point, cameraOrientation);
        return { x: cameraOrigin.x + rotated.x, y: cameraOrigin.y + rotated.y, z: cameraOrigin.z + rotated.z };
      });
      const screenOrigin = projectPoint(cameraOrigin);
      const screenCorners = corners.map(projectPoint);

      ctx.strokeStyle = isSelected ? '#FBBF24' : '#F59E0B';
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.beginPath();
      screenCorners.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      screenCorners.forEach((point) => {
        ctx.beginPath();
        ctx.moveTo(screenOrigin.x, screenOrigin.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      });
      ctx.fillStyle = '#FCD34D';
      ctx.beginPath();
      ctx.arc(screenOrigin.x, screenOrigin.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillText('CAM', screenOrigin.x + 10, screenOrigin.y - 8);
    } else if (clip.kind === 'light') {
      const color = clip.lightProps?.color ?? '#93C5FD';
      const lightOrigin = projectPoint(origin);
      const forward = rotateVector3({ x: 0, y: 0, z: 1 }, orientation);
      const side = rotateVector3({ x: 1, y: 0, z: 0 }, orientation);
      const up = rotateVector3({ x: 0, y: 1, z: 0 }, orientation);
      const reach = 180;
      const spread = clip.lightProps?.lightType === 'spot' ? 65 : 24;
      const endPoints = [
        { x: origin.x + forward.x * reach + side.x * spread + up.x * spread, y: origin.y + forward.y * reach + side.y * spread + up.y * spread, z: origin.z + forward.z * reach + side.z * spread + up.z * spread },
        { x: origin.x + forward.x * reach - side.x * spread + up.x * spread, y: origin.y + forward.y * reach - side.y * spread + up.y * spread, z: origin.z + forward.z * reach - side.z * spread + up.z * spread },
        { x: origin.x + forward.x * reach - side.x * spread - up.x * spread, y: origin.y + forward.y * reach - side.y * spread - up.y * spread, z: origin.z + forward.z * reach - side.z * spread - up.z * spread },
        { x: origin.x + forward.x * reach + side.x * spread - up.x * spread, y: origin.y + forward.y * reach + side.y * spread - up.y * spread, z: origin.z + forward.z * reach + side.z * spread - up.z * spread },
      ].map(projectPoint);
      ctx.strokeStyle = isSelected ? '#FFFFFF' : color;
      ctx.fillStyle = color;
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(lightOrigin.x, lightOrigin.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(endPoints[0].x, endPoints[0].y);
      endPoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.globalAlpha = 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.beginPath();
      endPoints.forEach((point) => {
        ctx.moveTo(lightOrigin.x, lightOrigin.y);
        ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillText('LIGHT', lightOrigin.x + 10, lightOrigin.y + 4);
    } else if (clip.kind !== 'audio') {
      const shapeTransform = clip.kind === 'shape' ? evaluateClipTransform(clip, playheadTime) : null;
      const baseW = clip.shapeProps
        ? (shapeTransform?.shapeWidth ?? clip.shapeProps.width)
        : clip.kind === 'text' ? Math.max(180, (clip.textProps?.text.length ?? 12) * (clip.textProps?.fontSize ?? 28) * 0.62) : 180;
      const baseH = clip.shapeProps
        ? (shapeTransform?.shapeHeight ?? clip.shapeProps.height)
        : clip.kind === 'text' ? Math.max(48, (clip.textProps?.fontSize ?? 28) * 1.5) : 100;
      const halfW = baseW * world.scale / 200;
      const halfH = baseH * world.scale / 200;
      const projectLocalPoint = (local: { x: number; y: number; z: number }) => {
        const rotated = rotateVector3(local, orientation);
        return projectPoint({
          x: origin.x + rotated.x,
          y: origin.y + rotated.y,
          z: origin.z + rotated.z,
        });
      };
      const localCorners = [
        { x: -halfW, y: -halfH }, { x: halfW, y: -halfH },
        { x: halfW, y: halfH }, { x: -halfW, y: halfH },
      ];
      const planeCorners = localCorners.map((point) => projectLocalPoint({ ...point, z: 0 }));
      const extrusion = clip.is3D && clip.kind === 'shape'
        ? Math.max(0, Math.min(2000, (clip.shapeProps?.depth ?? 0) * world.scale / 100))
        : 0;

      if (extrusion > 0) {
        const front = localCorners.map((point) => projectLocalPoint({ ...point, z: -extrusion / 2 }));
        const rear = localCorners.map((point) => projectLocalPoint({ ...point, z: extrusion / 2 }));
        // Rear cap, four shaded side faces, then the front cap.
        ctx.fillStyle = 'rgba(91, 74, 155, 0.16)';
        ctx.strokeStyle = 'rgba(167,139,250,0.58)';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.beginPath();
        rear.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
        ctx.closePath(); ctx.fill(); ctx.stroke();
        for (let index = 0; index < 4; index++) {
          const next = (index + 1) % 4;
          ctx.fillStyle = index % 2 === 0 ? 'rgba(139,92,246,0.20)' : 'rgba(96,80,168,0.25)';
          ctx.beginPath();
          ctx.moveTo(front[index].x, front[index].y);
          ctx.lineTo(front[next].x, front[next].y);
          ctx.lineTo(rear[next].x, rear[next].y);
          ctx.lineTo(rear[index].x, rear[index].y);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(139, 92, 246, 0.16)';
        ctx.beginPath();
        front.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        ctx.strokeStyle = isSelected ? '#3B82F6' : clip.is3D ? '#A78BFA' : '#64748B';
        ctx.fillStyle = clip.is3D ? 'rgba(139, 92, 246, 0.08)' : 'rgba(100, 116, 139, 0.04)';
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.beginPath();
        planeCorners.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      const labelPoint = projectPoint({ x: origin.x + 10, y: origin.y - 10, z: origin.z });
      ctx.fillStyle = isSelected ? '#93C5FD' : '#9BA1AD';
      ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(clip.name.slice(0, 16), labelPoint.x, labelPoint.y);
    }

    if (isSelected) {
      const axisOrigin = projectPoint(origin);
      const axisLength = 132;
      const axes = [
        { label: 'X', color: '#F87171', vector: rotateVector3({ x: 1, y: 0, z: 0 }, orientation) },
        { label: 'Y', color: '#4ADE80', vector: rotateVector3({ x: 0, y: 1, z: 0 }, orientation) },
        { label: 'Z', color: '#60A5FA', vector: rotateVector3({ x: 0, y: 0, z: 1 }, orientation) },
      ];
      ctx.save();
      ctx.lineCap = 'round';
      axes.forEach((axis) => {
        const end = projectPoint({
          x: origin.x + axis.vector.x * axisLength,
          y: origin.y + axis.vector.y * axisLength,
          z: origin.z + axis.vector.z * axisLength,
        });
        ctx.strokeStyle = axis.color;
        ctx.fillStyle = axis.color;
        ctx.lineWidth = 2.8;
        ctx.beginPath(); ctx.moveTo(axisOrigin.x, axisOrigin.y); ctx.lineTo(end.x, end.y); ctx.stroke();
        const angleRad = Math.atan2(end.y - axisOrigin.y, end.x - axisOrigin.x);
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - Math.cos(angleRad - 0.45) * 10, end.y - Math.sin(angleRad - 0.45) * 10);
        ctx.lineTo(end.x - Math.cos(angleRad + 0.45) * 10, end.y - Math.sin(angleRad + 0.45) * 10);
        ctx.closePath(); ctx.fill();
        ctx.font = '700 11px "JetBrains Mono", monospace';
        ctx.fillText(axis.label, end.x + 5, end.y - 5);
      });
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath(); ctx.arc(axisOrigin.x, axisOrigin.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

export function renderCompositionFrame(options: RenderOptions): BoundingBox | null {
  const {
    canvas,
    composition,
    tracks,
    clips,
    playheadTime,
    selectedClipId,
    showSafeMargins,
    showTransparencyGrid,
    showWireframes = false,
    cameraAngle = 'active',
    penDraftPoints = [],
    isPlaying,
    mediaCache,
    onMediaLoaded,
    drawGizmo = true,
    activeTool = 'select',
    renderScale = 1,
    viewportOrbit = { yaw: 34, pitch: 24, zoom: 1, panX: 0, panY: 0 },
  } = options;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { width, height } = composition;
  const requestedScale = Math.max(0.35, Math.min(1.5, renderScale));
  const maxBackingPixels = 16_777_216;
  const safeScale = Math.min(
    requestedScale,
    Math.sqrt(maxBackingPixels / Math.max(1, width * height)),
    8192 / Math.max(1, width),
    8192 / Math.max(1, height)
  );
  const backingWidth = Math.max(1, Math.round(width * safeScale));
  const backingHeight = Math.max(1, Math.round(height * safeScale));
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  const scaleX = canvas.width / width;
  const scaleY = canvas.height / height;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (cameraAngle !== 'active') {
    renderOrthographic3DView(
      ctx,
      width,
      height,
      cameraAngle,
      tracks,
      clips,
      playheadTime,
      selectedClipId,
      viewportOrbit
    );
    return null;
  }

  if (!showTransparencyGrid) {
    ctx.fillStyle = composition.backgroundColor || '#090A0D';
    ctx.fillRect(0, 0, width, height);
  }

  const videoTracks = [...tracks].filter((t) => t.kind === 'video').reverse();
  const hasSoloVideo = videoTracks.some((t) => t.solo);
  const visibleTrackIds = new Set(
    videoTracks
      .filter((t) => t.visible && (!hasSoloVideo || t.solo))
      .map((t) => t.id)
  );

  // Active Camera and active Lights at playheadTime
  const activeCamera =
    clips.find(
      (c) =>
        c.kind === 'camera' &&
        visibleTrackIds.has(c.trackId) &&
        playheadTime >= c.start &&
        playheadTime <= c.start + c.duration
    ) ?? null;

  const activeLights = clips.filter(
    (c) =>
      c.kind === 'light' &&
      visibleTrackIds.has(c.trackId) &&
      playheadTime >= c.start &&
      playheadTime <= c.start + c.duration
  );

  // Resolve edit-point transitions only when both neighbouring clips still touch.
  const activeTransitions: {
    id: string;
    outgoing: TimelineClip;
    incoming: TimelineClip;
    transition: NonNullable<TimelineClip['transitionIn']>;
    progress: number;
  }[] = [];
  for (const incoming of clips) {
    const transition = incoming.transitionIn;
    if (!transition || !visibleTrackIds.has(incoming.trackId)) continue;
    const outgoing = findAdjacentOutgoingClip(clips, incoming, composition.fps);
    if (!outgoing) continue;
    const halfDuration = transition.duration / 2;
    if (playheadTime < incoming.start - halfDuration || playheadTime > incoming.start + halfDuration) continue;
    activeTransitions.push({
      id: incoming.id,
      outgoing,
      incoming,
      transition,
      progress: getTransitionProgress(transition, incoming.start, playheadTime),
    });
  }
  const transitionByClipId = new Map<string, (typeof activeTransitions)[number]>();
  const transitionClipIds = new Set<string>();
  activeTransitions.forEach((pair) => {
    transitionByClipId.set(pair.outgoing.id, pair);
    transitionByClipId.set(pair.incoming.id, pair);
    transitionClipIds.add(pair.outgoing.id);
    transitionClipIds.add(pair.incoming.id);
  });

  const activeCameraView = resolveCameraViewState(activeCamera, clips, playheadTime, width);

  let selectedBox: BoundingBox | null = null;

  // Identify clips consumed as Track Mattes by the track directly below
  const consumedMatteIds = new Set<string>();
  const trackOrderTopToBottom = tracks.filter((t) => t.kind === 'video');
  for (let i = 0; i < trackOrderTopToBottom.length; i++) {
    const tr = trackOrderTopToBottom[i];
    if (!visibleTrackIds.has(tr.id)) continue;
    const mattedClips = clips.filter(
      (c) =>
        c.trackId === tr.id &&
        c.trackMatte &&
        c.trackMatte !== 'none' &&
        playheadTime >= c.start &&
        playheadTime <= c.start + c.duration
    );
    if (mattedClips.length > 0 && i > 0) {
      const matteTrackAbove = trackOrderTopToBottom[i - 1];
      const matteClipsAbove = clips.filter(
        (c) =>
          c.trackId === matteTrackAbove.id &&
          c.kind !== 'camera' &&
          c.kind !== 'light' &&
          c.kind !== 'adjustment' &&
          playheadTime >= c.start &&
          playheadTime <= c.start + c.duration
      );
      matteClipsAbove.forEach((mc) => consumedMatteIds.add(mc.id));
    }
  }

  const drawSingleClipToContext = (
    targetCtx: CanvasRenderingContext2D,
    clip: TimelineClip,
    ignoreBlendMode: boolean = false,
    transitionAlpha: number = 1
  ): BoundingBox | null => {
    const world = resolveWorldTransform(clip, clips, playheadTime);
    let cx = width / 2 + world.x;
    let cy = height / 2 + world.y;
    let effScaleX = world.scale / 100;
    let effScaleY = world.scale / 100;
    let skewX = 0;
    let projection: ReturnType<typeof projectLayerThroughCamera> | null = null;

    if (clip.is3D) {
      projection = projectLayerThroughCamera(
        world,
        activeCamera,
        clips,
        playheadTime,
        width,
        height
      );
      if (!projection.visible) return null;
      cx = projection.screenX;
      cy = projection.screenY;
      effScaleX = projection.perspectiveScale * projection.scaleX;
      effScaleY = projection.perspectiveScale * projection.scaleY;
      skewX = projection.skewX;
    }

    const shading = clip.is3D
      ? computeLightShading(world, activeLights, clips, playheadTime)
      : { brightnessFactor: 1, tintColor: '#ffffff', tintAlpha: 0 };

    const rotRad = projection?.rotationRad ?? (world.rotation * Math.PI) / 180;

    if (clip.kind === 'null') {
      if (drawGizmo && (clip.id === selectedClipId || showWireframes)) {
        targetCtx.save();
        targetCtx.translate(cx, cy);
        targetCtx.rotate(rotRad);
        targetCtx.strokeStyle = clip.id === selectedClipId ? '#F59E0B' : '#94A3B8';
        targetCtx.lineWidth = 2;
        targetCtx.strokeRect(-45, -45, 90, 90);
        targetCtx.beginPath();
        targetCtx.moveTo(-45, -45);
        targetCtx.lineTo(45, 45);
        targetCtx.moveTo(45, -45);
        targetCtx.lineTo(-45, 45);
        targetCtx.stroke();
        targetCtx.restore();
      }
      return null;
    }

    const ax = world.anchorX ?? 0;
    const ay = world.anchorY ?? 0;
    const layerTexture = getScratchCanvas(mediaCache, `layer-${clip.id}`, width, height);
    const renderCtx = layerTexture.getContext('2d') ?? targetCtx;

    renderCtx.save();
    renderCtx.setTransform(1, 0, 0, 1, 0, 0);
    // Each layer renders independently. Blend mode is applied once when it is composited.
    renderCtx.globalCompositeOperation = 'source-over';
    renderCtx.globalAlpha = clip.is3D
      ? 1
      : Math.max(0, Math.min(1, world.opacity / 100));
    renderCtx.filter = 'none';
    renderCtx.shadowBlur = 0;
    let baseFilter = buildFilterString(
      clip.effects,
      shading.brightnessFactor,
      clip.colorGrade
    );
    // Depth-of-field is evaluated from camera-space depth, not screen-space distance.
    if (projection && activeCamera?.cameraProps?.depthOfField) {
      const camera = activeCamera.cameraProps;
      const focusDistance = Math.max(1, camera.focusDistance ?? 900);
      const aperture = Math.max(0.7, Math.min(32, camera.aperture || 2.8));
      // A wider aperture (lower f-number) produces stronger defocus.
      const defocus = Math.min(
        14,
        Math.abs(projection.depthZ - focusDistance) / focusDistance * (2.8 / aperture) * 6
      );
      if (defocus > 0.25) {
        baseFilter = baseFilter === 'none'
          ? `blur(${defocus.toFixed(2)}px)`
          : `${baseFilter} blur(${defocus.toFixed(2)}px)`;
      }
    }
    // Mask feather is applied to a separate alpha surface below, never to the artwork itself.
    renderCtx.filter = baseFilter;

    const glowFx = clip.effects.find((f) => f.enabled && f.type === 'glow');
    const shadowFx = clip.effects.find((f) => f.enabled && f.type === 'dropshadow');
    if (glowFx) {
      renderCtx.shadowColor = 'rgba(96, 165, 250, 0.8)';
      renderCtx.shadowBlur =
        (glowFx.params.radius ?? 16) * ((glowFx.params.intensity ?? 50) / 50);
    } else if (shadowFx) {
      const op = (shadowFx.params.opacity ?? 70) / 100;
      renderCtx.shadowColor = `rgba(0, 0, 0, ${op})`;
      renderCtx.shadowBlur = shadowFx.params.blur ?? 16;
      renderCtx.shadowOffsetX = (shadowFx.params.distance ?? 10) * 0.5;
      renderCtx.shadowOffsetY = shadowFx.params.distance ?? 10;
    }

    if (clip.is3D) {
      // Render the source layer in its own local plane. Camera projection and
      // world rotation/scale are applied later by the perspective mesh.
      renderCtx.translate(width / 2, height / 2);
    } else {
      renderCtx.translate(cx, cy);
      renderCtx.rotate(rotRad);
      if (skewX !== 0) {
        renderCtx.transform(1, 0, skewX, 1, 0, 0);
      }
      renderCtx.scale(effScaleX, effScaleY);
    }
    if (ax !== 0 || ay !== 0) {
      renderCtx.translate(-ax, -ay);
    }

    const maskTransform = clip.mask?.enabled ? renderCtx.getTransform() : null;

    let baseW = width;
    let baseH = height;
    const chromaFx = clip.effects.find((f) => f.enabled && f.type === 'chromakey');
    const localPlayT = getClipLocalTime(clip, playheadTime);

    if (clip.kind === 'solid' && clip.solidProps) {
      baseW = clip.solidProps.width;
      baseH = clip.solidProps.height;
      renderCtx.fillStyle = clip.solidProps.color;
      renderCtx.fillRect(-baseW / 2, -baseH / 2, baseW, baseH);
    } else if (clip.kind === 'image' && clip.src) {
      const img = getOrLoadImage(mediaCache, clip.src, onMediaLoaded);
      if (img) {
        const fitMode = composition.fitMode ?? 'contain';
        const mediaSize = getFittedMediaSize(
          img.naturalWidth,
          img.naturalHeight,
          width,
          height,
          fitMode
        );
        if (chromaFx) {
          const keyed = applyChromaKeyToSource(
            mediaCache,
            img,
            mediaSize.width,
            mediaSize.height,
            chromaFx.params.hueTarget ?? 120,
            chromaFx.params.tolerance ?? 42,
            chromaFx.params.softness ?? 16
          );
          const fitted = drawFittedMedia(
            renderCtx,
            keyed,
            mediaSize.width,
            mediaSize.height,
            width,
            height,
            fitMode,
            composition.fitPositionX ?? 50,
            composition.fitPositionY ?? 50
          );
          baseW = fitted.width;
          baseH = fitted.height;
        } else {
          const fitted = drawFittedMedia(
            renderCtx,
            img,
            mediaSize.width,
            mediaSize.height,
            width,
            height,
            fitMode,
            composition.fitPositionX ?? 50,
            composition.fitPositionY ?? 50
          );
          baseW = fitted.width;
          baseH = fitted.height;
        }
      }
    } else if (clip.kind === 'video' && clip.src) {
      const mediaTime = clip.sourceIn + localPlayT;
      const timelineLocalT = Math.max(0, Math.min(clip.duration, playheadTime - clip.start));
      const mediaSpeed = getClipSpeedAtLocalTime(clip, timelineLocalT);
      const video = getOrLoadVideo(
        mediaCache,
        clip.src,
        mediaTime,
        isPlaying,
        onMediaLoaded,
        mediaSpeed,
        Boolean(clip.reversed)
      );
      if (video) {
        const fitMode = composition.fitMode ?? 'contain';
        const mediaSize = getFittedMediaSize(
          video.videoWidth || width,
          video.videoHeight || height,
          width,
          height,
          fitMode
        );
        if (chromaFx) {
          const keyed = applyChromaKeyToSource(
            mediaCache,
            video,
            mediaSize.width,
            mediaSize.height,
            chromaFx.params.hueTarget ?? 120,
            chromaFx.params.tolerance ?? 42,
            chromaFx.params.softness ?? 16
          );
          const fitted = drawFittedMedia(
            renderCtx,
            keyed,
            mediaSize.width,
            mediaSize.height,
            width,
            height,
            fitMode,
            composition.fitPositionX ?? 50,
            composition.fitPositionY ?? 50
          );
          baseW = fitted.width;
          baseH = fitted.height;
        } else {
          const fitted = drawFittedMedia(
            renderCtx,
            video,
            mediaSize.width,
            mediaSize.height,
            width,
            height,
            fitMode,
            composition.fitPositionX ?? 50,
            composition.fitPositionY ?? 50
          );
          baseW = fitted.width;
          baseH = fitted.height;
        }
      }
    } else if (clip.kind === 'text' && clip.textProps) {
      const tp = clip.textProps;
      const localT = localPlayT;
      const anim = tp.animator ?? 'none';
      let renderText = tp.text;
      let animOffsetY = 0;
      let animScale = 1;
      let animRotation = 0;
      let animBlur = 0;
      let animTracking = 0;

      if (anim === 'typewriter') {
        const revealDur = Math.min(2.2, Math.max(0.4, clip.duration * 0.45));
        const chars = Math.max(
          1,
          Math.floor(Math.min(1, localT / revealDur) * tp.text.length)
        );
        renderText = tp.text.slice(0, chars);
      } else if (anim === 'slide-up') {
        const prog = Math.min(1, localT / 0.55);
        const ease = 1 - Math.pow(1 - prog, 3);
        animOffsetY = (1 - ease) * 34;
        renderCtx.globalAlpha *= ease;
      } else if (anim === 'word-pop') {
        const prog = Math.min(1, localT / 0.45);
        animScale = 0.78 + 0.22 * (1 - Math.pow(1 - prog, 3));
      } else if (anim === 'glitch-decode' && localT < 0.9) {
        const glyphs = '#@%&*01XZ';
        const settled = Math.floor((localT / 0.9) * tp.text.length);
        renderText = tp.text
          .split('')
          .map((ch, idx) =>
            idx <= settled || ch === ' '
              ? ch
              : glyphs[Math.floor((localT * 40 + idx * 7) % glyphs.length)]
          )
          .join('');
      }

      const advancedAnimator = getTextAnimatorDefinition(tp.animator);
      if (advancedAnimator) {
        const progress = Math.min(1, Math.max(0, localT / advancedAnimator.duration));
        const eased = 1 - Math.pow(1 - progress, 3);
        const amount = advancedAnimator.intensity;
        switch (advancedAnimator.family) {
          case 'fade-rise':
            animOffsetY = (1 - eased) * 56 * amount;
            renderCtx.globalAlpha *= eased;
            break;
          case 'fade-drop':
            animOffsetY = -(1 - eased) * 56 * amount;
            renderCtx.globalAlpha *= eased;
            break;
          case 'scale-pop':
            animScale = 0.28 + eased * 0.72;
            renderCtx.globalAlpha *= eased;
            break;
          case 'rotate-reveal':
            animRotation = (1 - eased) * 0.35 * amount;
            animScale = 0.85 + eased * 0.15;
            renderCtx.globalAlpha *= eased;
            break;
          case 'tracking-reveal':
            animTracking = (1 - eased) * 24 * amount;
            renderCtx.globalAlpha *= eased;
            break;
          case 'soft-blur':
            animBlur = (1 - eased) * 18 * amount;
            renderCtx.globalAlpha *= eased;
            break;
          case 'wave-in':
            animOffsetY = (1 - eased) * 38 * amount + Math.sin(localT * 12 + advancedAnimator.variant) * (1 - eased) * 13;
            renderCtx.globalAlpha *= eased;
            break;
          case 'bounce-in': {
            const bounce = 1 + Math.sin(progress * Math.PI * 3) * (1 - progress) * 0.16 * amount;
            animScale = Math.max(0.1, eased * bounce);
            animOffsetY = (1 - eased) * 46 * amount;
            renderCtx.globalAlpha *= eased;
            break;
          }
          case 'typewriter': {
            const chars = Math.max(0, Math.floor(progress * tp.text.length));
            renderText = tp.text.slice(0, chars);
            break;
          }
          case 'glitch': {
            if (progress < 1) {
              const glyphs = '01#@%&XZ';
              const settled = Math.floor(progress * tp.text.length);
              renderText = tp.text
                .split('')
                .map((character, index) =>
                  index < settled || character === ' '
                    ? character
                    : glyphs[(index * 7 + Math.floor(localT * 36) + advancedAnimator.variant) % glyphs.length]
                )
                .join('');
            }
            break;
          }
        }
      }

      renderCtx.font = `${tp.fontWeight} ${tp.fontSize}px "${tp.fontFamily ?? 'Plus Jakarta Sans'}", sans-serif`;
      renderCtx.textAlign = tp.align;
      renderCtx.textBaseline = 'middle';
      if ('letterSpacing' in renderCtx) {
        (renderCtx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${tp.letterSpacing + animTracking}px`;
      }
      const metrics = renderCtx.measureText(tp.text);
      baseW = Math.max(120, metrics.width + 40);
      baseH = Math.max(48, tp.fontSize * 1.45);

      renderCtx.save();
      renderCtx.translate(0, animOffsetY);
      if (animRotation !== 0) renderCtx.rotate(animRotation);
      if (animScale !== 1) renderCtx.scale(animScale, animScale);
      if (animBlur > 0) renderCtx.filter = `blur(${animBlur.toFixed(1)}px)`;
      if (tp.backgroundColor) {
        renderCtx.fillStyle = tp.backgroundColor;
        const rx =
          tp.align === 'left' ? -16 : tp.align === 'right' ? -baseW + 16 : -baseW / 2;
        renderCtx.beginPath();
        renderCtx.roundRect(rx, -baseH / 2, baseW, baseH, 6);
        renderCtx.fill();
      }
      // 3D text uses a controllable stacked extrusion on its local plane.
      // The resulting text texture is then projected by the scene camera with the other 3D layers.
      const extrusionDepth = clip.is3D ? Math.max(0, Math.min(120, tp.extrusionDepth ?? 24)) : 0;
      if (extrusionDepth > 0) {
        const steps = Math.min(48, Math.max(1, Math.ceil(extrusionDepth)));
        const sideColor = tp.extrusionColor ?? '#334155';
        renderCtx.fillStyle = sideColor;
        for (let step = steps; step >= 1; step--) {
          const amount = extrusionDepth * (step / steps);
          renderCtx.fillText(renderText, amount * 0.34, amount * 0.58);
        }
      }
      const outlineWidth = Math.max(0, Math.min(24, tp.strokeWidth ?? 0));
      if (outlineWidth > 0) {
        renderCtx.lineJoin = 'round';
        renderCtx.lineWidth = outlineWidth;
        renderCtx.strokeStyle = tp.strokeColor ?? '#0F172A';
        renderCtx.strokeText(renderText, 0, 0);
      }
      renderCtx.fillStyle = tp.color;
      renderCtx.fillText(renderText, 0, 0);
      renderCtx.restore();
    } else if (clip.kind === 'particles' && clip.particleProps) {
      const pp = clip.particleProps;
      baseW = width;
      baseH = height;
      const count = Math.min(240, Math.max(12, pp.count));
      const localT = localPlayT;
      for (let i = 0; i < count; i++) {
        const seedA = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
        const seedB = Math.cos(i * 78.233 + 1.732) * 28461.9183;
        const rx = seedA - Math.floor(seedA);
        const ry = seedB - Math.floor(seedB);

        let px = (rx - 0.5) * width;
        let py = (ry - 0.5) * height;
        const spd = pp.speed * 42;
        if (pp.style === 'snow') {
          py = (((ry * height + localT * spd) % height) - height / 2);
          px += Math.sin(localT * 2 + i) * 18;
        } else if (pp.style === 'sparks') {
          py = height / 2 - ((ry * height + localT * spd * 1.4) % height);
          px += Math.sin(localT * 3.5 + i * 0.7) * 26;
        } else if (pp.style === 'matrix') {
          px = (Math.floor(rx * 32) / 32 - 0.5) * width;
          py = (((ry * height + localT * spd * 1.8) % height) - height / 2);
        } else {
          px += Math.cos(localT * 0.9 + i) * 22;
          py += Math.sin(localT * 0.8 + i * 1.3) * 22;
        }

        const radius = pp.size * (0.45 + (i % 5) * 0.18);
        renderCtx.save();
        renderCtx.fillStyle = pp.color;
        renderCtx.globalAlpha *= pp.style === 'bokeh' ? 0.35 : 0.78;
        renderCtx.beginPath();
        if (pp.style === 'confetti') {
          renderCtx.translate(px, py);
          renderCtx.rotate(localT * 3 + i);
          renderCtx.fillRect(-radius, -radius * 0.5, radius * 2, radius);
        } else if (pp.style === 'matrix') {
          renderCtx.fillRect(px, py, Math.max(2, radius * 0.6), radius * 3.2);
        } else {
          renderCtx.arc(px, py, radius, 0, Math.PI * 2);
          renderCtx.fill();
        }
        renderCtx.restore();
      }
    } else if (clip.kind === 'visualizer' && clip.visualizerProps) {
      const vp = clip.visualizerProps;
      baseW = 580;
      baseH = 200;
      const bars = 40;
      const localT = localPlayT;
      if (vp.style === 'radial') {
        const baseR = 90;
        for (let i = 0; i < bars; i++) {
          const ang = (i / bars) * Math.PI * 2;
          const mag =
            (0.25 + 0.75 * Math.abs(Math.sin(localT * 7 + i * 0.55) * Math.cos(localT * 3 + i * 0.25))) *
            75 *
            vp.sensitivity;
          renderCtx.strokeStyle = i % 2 === 0 ? vp.color : vp.accentColor;
          renderCtx.lineWidth = 4;
          renderCtx.beginPath();
          renderCtx.moveTo(Math.cos(ang) * baseR, Math.sin(ang) * baseR);
          renderCtx.lineTo(Math.cos(ang) * (baseR + mag), Math.sin(ang) * (baseR + mag));
          renderCtx.stroke();
        }
      } else {
        const barW = baseW / bars - 4;
        for (let i = 0; i < bars; i++) {
          const mag =
            (0.2 + 0.8 * Math.abs(Math.sin(localT * 8 + i * 0.48) * Math.cos(localT * 2.5 + i * 0.3))) *
            baseH *
            0.72 *
            vp.sensitivity;
          const bx = -baseW / 2 + i * (baseW / bars);
          renderCtx.fillStyle = i % 3 === 0 ? vp.accentColor : vp.color;
          renderCtx.beginPath();
          renderCtx.roundRect(bx, baseH / 2 - mag, barW, Math.max(6, mag), 2);
          renderCtx.fill();
        }
      }
    } else if (clip.kind === 'caption' && clip.captionProps) {
      const cp = clip.captionProps;
      const activeCue = cp.cues.find(
        (q) => localPlayT >= q.start && localPlayT <= q.end
      );
      baseW = 680;
      baseH = 72;
      if (activeCue) {
        const yPos = cp.position === 'bottom' ? height * 0.34 : 0;
        const maxTextWidth = Math.max(80, width - 120);
        renderCtx.font = `700 ${cp.fontSize}px "Plus Jakarta Sans", sans-serif`;
        renderCtx.textAlign = 'center';
        renderCtx.textBaseline = 'middle';

        const lines: string[] = [];
        for (const paragraph of activeCue.text.split(/\r?\n/)) {
          const words = paragraph.split(/\s+/).filter(Boolean);
          if (words.length === 0) {
            lines.push('');
            continue;
          }
          let line = '';
          for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (line && renderCtx.measureText(candidate).width > maxTextWidth) {
              lines.push(line);
              line = word;
            } else {
              line = candidate;
            }
          }
          if (line) lines.push(line);
        }

        const visibleLines = lines.length > 0 ? lines : [''];
        const lineHeight = cp.fontSize * 1.28;
        const textWidth = Math.max(...visibleLines.map((line) => renderCtx.measureText(line).width));
        const boxW = Math.min(width - 48, Math.max(80, Math.min(maxTextWidth, textWidth) + 36));
        const boxH = visibleLines.length * lineHeight + 18;
        baseW = boxW;
        baseH = boxH;

        renderCtx.fillStyle = cp.bgColor;
        renderCtx.beginPath();
        renderCtx.roundRect(-boxW / 2, yPos - boxH / 2, boxW, boxH, 8);
        renderCtx.fill();
        renderCtx.fillStyle = cp.color;
        visibleLines.forEach((line, index) => {
          renderCtx.fillText(
            line,
            0,
            yPos + (index - (visibleLines.length - 1) / 2) * lineHeight,
            maxTextWidth
          );
        });
      }
    } else if (clip.kind === 'shape' && clip.shapeProps) {
      const sp = clip.shapeProps;
      const shapeTransform = evaluateClipTransform(clip, playheadTime);
      const shapeWidth = Math.max(1, shapeTransform.shapeWidth ?? sp.width);
      const shapeHeight = Math.max(1, shapeTransform.shapeHeight ?? sp.height);
      baseW = shapeWidth;
      baseH = shapeHeight;

      traceVectorShape(renderCtx, sp.shapeType, shapeWidth, shapeHeight, sp.cornerRadius, sp.sides);
      if (sp.shapeType !== 'ring' && sp.shapeType !== 'line' && sp.fillColor !== 'transparent') {
        renderCtx.fillStyle = sp.fillColor;
        renderCtx.fill();
      }
      if (sp.strokeWidth > 0) {
        renderCtx.strokeStyle = sp.strokeColor;
        renderCtx.lineWidth = sp.strokeWidth;
        if (sp.shapeType === 'ring') renderCtx.setLineDash([28, 12, 8, 12]);
        if (sp.shapeType === 'line') renderCtx.lineCap = 'round';
        renderCtx.stroke();
        renderCtx.setLineDash([]);
      }
    } else if (clip.kind === 'path' && clip.pathProps) {
      const pp = clip.pathProps;
      baseW = 360;
      baseH = 260;
      if (pp.dashed) renderCtx.setLineDash([14, 10]);
      drawVectorPathPoints(renderCtx, pp.points, pp.closed, pp.trimStart, pp.trimEnd);
      if (pp.closed && pp.fillColor !== 'transparent') {
        renderCtx.fillStyle = pp.fillColor;
        renderCtx.fill();
      }
      if (pp.strokeWidth > 0) {
        renderCtx.strokeStyle = pp.strokeColor;
        renderCtx.lineWidth = pp.strokeWidth;
        renderCtx.lineCap = 'round';
        renderCtx.lineJoin = 'round';
        renderCtx.stroke();
      }
      renderCtx.setLineDash([]);
    }

    // Clear shadow & filter before DaVinci color wash and 3D light tint so halos never bleed
    renderCtx.shadowBlur = 0;
    renderCtx.shadowOffsetX = 0;
    renderCtx.shadowOffsetY = 0;
    renderCtx.shadowColor = 'transparent';
    renderCtx.filter = 'none';

    if (clip.colorGrade?.enabled) {
      applyDaVinciToneOverlay(renderCtx, clip.colorGrade, baseW, baseH);
    }

    if (shading.tintAlpha > 0.01) {
      renderCtx.globalCompositeOperation = 'overlay';
      renderCtx.globalAlpha = shading.tintAlpha;
      renderCtx.fillStyle = shading.tintColor;
      renderCtx.fillRect(-baseW / 2, -baseH / 2, baseW, baseH);
    }

    renderCtx.restore();

    if (
      clip.effects.some(
        (f) =>
          f.enabled &&
          [
            'vignette',
            'tint',
            'chromatic',
            'glitch',
            'wavewarp',
            'lensflare',
            'filmgrain',
            'halation',
            'pixelate',
          ].includes(f.type)
      )
    ) {
      applyPostOverlays(renderCtx, width, height, clip.effects, playheadTime, mediaCache);
    }

    if (clip.mask?.enabled && maskTransform) {
      const maskCanvas = getScratchCanvas(mediaCache, `mask-alpha-${clip.id}`, width, height);
      applyFeatheredLayerMask(layerTexture, maskCanvas, clip.mask, width, height, maskTransform);
    }

    if (clip.is3D) {
      targetCtx.save();
      targetCtx.globalAlpha = Math.max(0, Math.min(1, world.opacity / 100)) * Math.max(0, Math.min(1, transitionAlpha));
      if (!ignoreBlendMode) {
        targetCtx.globalCompositeOperation = toCompositeOp(clip.blendMode);
      }
      // Camera sits on negative Z and looks toward +Z; negative local depth extends
      // the front surface toward the camera. Side faces use a positive depth magnitude.
      const shapeExtrusion = clip.kind === 'shape'
        ? Math.max(0, Math.min(2000, clip.shapeProps?.depth ?? 0))
        : 0;
      const textExtrusion = clip.kind === 'text'
        ? Math.max(0, Math.min(120, clip.textProps?.extrusionDepth ?? 0))
        : 0;
      const planeDepth = -(shapeExtrusion || textExtrusion);

      if (clip.kind === 'shape' && shapeExtrusion > 0) {
        drawExtrudedShapeSides(
          targetCtx,
          world,
          clip,
          clips,
          playheadTime,
          activeCamera,
          activeCameraView,
          width,
          height,
          ax,
          ay,
          planeDepth
        );
      }

      // Text glyphs are kept as editable raster text on a perspective 3D plane.
      // A small stack of depth slices gives the title a visible solid body instead of a flat card.
      drawPerspectiveLayerPlane(
        targetCtx,
        layerTexture,
        world,
        activeCamera,
        clips,
        playheadTime,
        width,
        height,
        baseW,
        baseH,
        ax,
        ay,
        activeCameraView,
        planeDepth
      );
      targetCtx.restore();
    } else {
      targetCtx.save();
      if (!ignoreBlendMode) targetCtx.globalCompositeOperation = toCompositeOp(clip.blendMode);
      targetCtx.drawImage(layerTexture, 0, 0);
      targetCtx.restore();
    }

    const { screenCx, screenCy } = computeAnchorScreenCenter(
      cx,
      cy,
      ax,
      ay,
      effScaleX,
      effScaleY,
      rotRad,
      skewX
    );

    if (drawGizmo && clip.id === selectedClipId && clip.mask?.enabled && world.opacity > 0.01) {
      targetCtx.save();
      targetCtx.translate(cx, cy);
      targetCtx.rotate(rotRad);
      if (skewX !== 0) {
        targetCtx.transform(1, 0, skewX, 1, 0, 0);
      }
      targetCtx.scale(effScaleX, effScaleY);
      if (ax !== 0 || ay !== 0) {
        targetCtx.translate(-ax, -ay);
      }
      const mw = (clip.mask.width / 100) * width;
      const mh = (clip.mask.height / 100) * height;
      const mx = (clip.mask.x / 100) * width;
      const my = (clip.mask.y / 100) * height;
      targetCtx.strokeStyle = '#F59E0B';
      targetCtx.lineWidth = 2;
      targetCtx.setLineDash([6, 4]);
      targetCtx.beginPath();
      if (clip.mask.shape === 'ellipse') {
        targetCtx.ellipse(mx, my, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      } else if (clip.mask.shape === 'rounded-rect') {
        const radius = Math.max(4, Math.min(mw, mh) * 0.14);
        targetCtx.roundRect(mx - mw / 2, my - mh / 2, mw, mh, radius);
      } else {
        targetCtx.rect(mx - mw / 2, my - mh / 2, mw, mh);
      }
      targetCtx.stroke();
      targetCtx.setLineDash([]);
      targetCtx.fillStyle = '#FFFFFF';
      const maskHandle = 9 / Math.max(0.01, Math.abs(effScaleX));
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          targetCtx.fillRect(mx + sx * mw / 2 - maskHandle / 2, my + sy * mh / 2 - maskHandle / 2, maskHandle, maskHandle);
        }
      }
      targetCtx.restore();
    }

    if (drawGizmo && clip.id === selectedClipId && world.opacity > 0.01) {
      targetCtx.save();
      if (activeTool === 'pin') {
        // The pivot is the transform origin (cx/cy), not the visible layer center.
        targetCtx.strokeStyle = '#FBBF24';
        targetCtx.fillStyle = '#FDE68A';
        targetCtx.lineWidth = 2;
        targetCtx.beginPath();
        targetCtx.moveTo(cx - 15, cy);
        targetCtx.lineTo(cx + 15, cy);
        targetCtx.moveTo(cx, cy - 15);
        targetCtx.lineTo(cx, cy + 15);
        targetCtx.stroke();
        targetCtx.beginPath();
        targetCtx.arc(cx, cy, 6, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.strokeStyle = '#111827';
        targetCtx.stroke();
        targetCtx.font = '600 10px "JetBrains Mono", monospace';
        targetCtx.fillStyle = '#FDE68A';
        targetCtx.fillText('PIVOT', cx + 11, cy - 10);
      } else {
        targetCtx.fillStyle = '#FDE68A';
        targetCtx.strokeStyle = '#111827';
        targetCtx.lineWidth = 2;
        targetCtx.beginPath();
        targetCtx.arc(screenCx, screenCy, 5, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.stroke();
      }
      targetCtx.restore();
    }

    if (
      drawGizmo &&
      clip.id === selectedClipId &&
      (clip.kind === 'text' || clip.kind === 'shape') &&
      activeTool === 'select' &&
      world.opacity > 0.01
    ) {
      targetCtx.save();
      targetCtx.translate(cx, cy);
      targetCtx.rotate(rotRad);
      if (skewX !== 0) targetCtx.transform(1, 0, skewX, 1, 0, 0);
      targetCtx.scale(effScaleX, effScaleY);
      if (ax !== 0 || ay !== 0) targetCtx.translate(-ax, -ay);
      const boxX = -baseW / 2;
      const boxY = -baseH / 2;
      targetCtx.strokeStyle = '#60A5FA';
      targetCtx.lineWidth = 1.5 / Math.max(0.01, Math.min(Math.abs(effScaleX), Math.abs(effScaleY)));
      targetCtx.setLineDash([5, 4]);
      targetCtx.strokeRect(boxX, boxY, baseW, baseH);
      targetCtx.setLineDash([]);
      const handleSize = 9 / Math.max(0.01, Math.min(Math.abs(effScaleX), Math.abs(effScaleY)));
      targetCtx.fillStyle = '#F8FAFC';
      targetCtx.strokeStyle = '#2563EB';
      targetCtx.lineWidth = 1.5 / Math.max(0.01, Math.min(Math.abs(effScaleX), Math.abs(effScaleY)));
      const handles: ShapePoint[] = [
        { x: boxX, y: boxY }, { x: 0, y: boxY }, { x: -boxX, y: boxY },
        { x: -boxX, y: 0 }, { x: -boxX, y: -boxY }, { x: 0, y: -boxY },
        { x: boxX, y: -boxY }, { x: boxX, y: 0 },
      ];
      handles.forEach((point) => {
        targetCtx.fillRect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize);
        targetCtx.strokeRect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize);
      });
      const rotateY = boxY - 34 / Math.max(0.01, Math.abs(effScaleY));
      targetCtx.strokeStyle = '#F59E0B';
      targetCtx.beginPath();
      targetCtx.moveTo(0, boxY);
      targetCtx.lineTo(0, rotateY);
      targetCtx.stroke();
      targetCtx.beginPath();
      targetCtx.arc(0, rotateY, 6 / Math.max(0.01, Math.min(Math.abs(effScaleX), Math.abs(effScaleY))), 0, Math.PI * 2);
      targetCtx.fillStyle = '#FBBF24';
      targetCtx.fill();
      targetCtx.stroke();
      targetCtx.restore();
    }

    if (drawGizmo && clip.id === selectedClipId && clip.is3D && world.opacity > 0.01) {
      const anchorOffsetX = screenCx - cx;
      const anchorOffsetY = screenCy - cy;
      const axes = [
        { label: 'X', x: 120, y: 0, z: 0, color: '#F87171' },
        { label: 'Y', x: 0, y: 120, z: 0, color: '#4ADE80' },
        { label: 'Z', x: 0, y: 0, z: 120, color: '#60A5FA' },
      ];
      targetCtx.save();
      targetCtx.lineWidth = 3;
      targetCtx.font = '700 12px "JetBrains Mono", monospace';
      for (const axis of axes) {
        const tip = projectLayerPointThroughCamera(
          world,
          activeCamera,
          clips,
          playheadTime,
          width,
          height,
          axis.x,
          axis.y,
          axis.z,
          activeCameraView
        );
        if (!tip.visible) continue;
        const tx = tip.x + anchorOffsetX;
        const ty = tip.y + anchorOffsetY;
        targetCtx.strokeStyle = axis.color;
        targetCtx.fillStyle = axis.color;
        targetCtx.beginPath();
        targetCtx.moveTo(screenCx, screenCy);
        targetCtx.lineTo(tx, ty);
        targetCtx.stroke();
        targetCtx.beginPath();
        targetCtx.arc(tx, ty, 4, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.fillText(axis.label, tx + 6, ty - 6);
      }
      targetCtx.restore();
    }

    if (drawGizmo && clip.id === selectedClipId && clip.trackData) {
      const td = clip.trackData;
      targetCtx.save();
      if (td.points.length > 1) {
        targetCtx.strokeStyle = 'rgba(20, 184, 166, 0.75)';
        targetCtx.lineWidth = 2;
        targetCtx.beginPath();
        td.points.forEach((pt, idx) => {
          const px = width / 2 + pt.x;
          const py = height / 2 + pt.y;
          if (idx === 0) targetCtx.moveTo(px, py);
          else targetCtx.lineTo(px, py);
        });
        targetCtx.stroke();
      }
      const tx = screenCx + td.targetX * effScaleX;
      const ty = screenCy + td.targetY * effScaleY;
      targetCtx.strokeStyle = '#14B8A6';
      targetCtx.lineWidth = 2;
      targetCtx.strokeRect(tx - 16, ty - 16, 32, 32);
      targetCtx.beginPath();
      targetCtx.moveTo(tx - 24, ty);
      targetCtx.lineTo(tx + 24, ty);
      targetCtx.moveTo(tx, ty - 24);
      targetCtx.lineTo(tx, ty + 24);
      targetCtx.stroke();
      targetCtx.restore();
    }

    if (showWireframes && clip.is3D) {
      targetCtx.save();
      targetCtx.translate(screenCx, screenCy);
      targetCtx.rotate(rotRad);
      targetCtx.strokeStyle = 'rgba(167, 139, 250, 0.45)';
      targetCtx.lineWidth = 1;
      targetCtx.strokeRect(
        (-baseW * Math.abs(effScaleX)) / 2,
        (-baseH * Math.abs(effScaleY)) / 2,
        baseW * Math.abs(effScaleX),
        baseH * Math.abs(effScaleY)
      );
      targetCtx.restore();
    }

    if (clip.id === selectedClipId) {
      return {
        clipId: clip.id,
        cx: screenCx,
        cy: screenCy,
        width: Math.abs(baseW * effScaleX),
        height: Math.abs(baseH * effScaleY),
        rotationRad: rotRad,
      };
    }
    return null;
  };

  for (const track of videoTracks) {
    if (!visibleTrackIds.has(track.id)) continue;

    const activeClips = clips.filter(
      (c) =>
        c.trackId === track.id &&
        c.kind !== 'camera' &&
        c.kind !== 'light' &&
        c.kind !== 'audio' &&
        !consumedMatteIds.has(c.id) &&
        ((playheadTime >= c.start && playheadTime <= c.start + c.duration) || transitionClipIds.has(c.id))
    );

    // Sort 3D clips back-to-front within track if multiple 3D layers share track
    activeClips.sort((a, b) => {
      if (!a.is3D && !b.is3D) return 0;
      const wa = resolveWorldTransform(a, clips, playheadTime);
      const wb = resolveWorldTransform(b, clips, playheadTime);
      return wb.z - wa.z;
    });

    const renderedTransitionIds = new Set<string>();
    const drawTransitionParticipant = (
      clip: TimelineClip,
      alpha: number,
      offsetX = 0,
      offsetY = 0,
      scale = 1,
      revealRect?: { x: number; y: number; width: number; height: number }
    ) => {
      ctx.save();
      if (revealRect) {
        ctx.beginPath();
        ctx.rect(revealRect.x, revealRect.y, revealRect.width, revealRect.height);
        ctx.clip();
      }
      if (offsetX !== 0 || offsetY !== 0 || scale !== 1) {
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.clip();
        ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
        ctx.scale(scale, scale);
        ctx.translate(-width / 2, -height / 2);
      }
      const boundedAlpha = Math.max(0, Math.min(1, alpha));
      ctx.globalAlpha = boundedAlpha;
      const box = drawSingleClipToContext(ctx, clip, false, boundedAlpha);
      ctx.restore();
      if (box) selectedBox = box;
    };

    const drawEditPointTransition = (pair: (typeof activeTransitions)[number]) => {
      const { outgoing, incoming, transition, progress } = pair;
      const p = Math.max(0, Math.min(1, progress));
      const direction = transition.direction;
      const strength = Math.max(0.5, Math.min(1.8, transition.intensity));
      if (transition.style === 'dip-black' || transition.style === 'dip-white') {
        if (p < 0.5) drawTransitionParticipant(outgoing, 1);
        else drawTransitionParticipant(incoming, 1);
        const veilAlpha = p < 0.5 ? p * 2 : (1 - p) * 2;
        if (veilAlpha > 0.001) {
          ctx.save();
          ctx.globalAlpha = veilAlpha;
          ctx.fillStyle = transition.style === 'dip-white' ? '#FFFFFF' : '#000000';
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
        return;
      }
      if (transition.style === 'wipe') {
        drawTransitionParticipant(outgoing, 1);
        const revealWidth = width * p;
        const revealHeight = height * p;
        const revealRect = direction === 'right'
          ? { x: width - revealWidth, y: 0, width: revealWidth, height }
          : direction === 'up'
            ? { x: 0, y: height - revealHeight, width, height: revealHeight }
            : direction === 'down'
              ? { x: 0, y: 0, width, height: revealHeight }
              : { x: 0, y: 0, width: revealWidth, height };
        if (p > 0) drawTransitionParticipant(incoming, 1, 0, 0, 1, revealRect);
        return;
      }
      if (transition.style === 'push') {
        const travelX = width * strength;
        const travelY = height * strength;
        const incomingX = direction === 'left' ? -travelX * (1 - p) : direction === 'right' ? travelX * (1 - p) : 0;
        const outgoingX = direction === 'left' ? travelX * p : direction === 'right' ? -travelX * p : 0;
        const incomingY = direction === 'up' ? -travelY * (1 - p) : direction === 'down' ? travelY * (1 - p) : 0;
        const outgoingY = direction === 'up' ? travelY * p : direction === 'down' ? -travelY * p : 0;
        drawTransitionParticipant(outgoing, 1, outgoingX, outgoingY);
        drawTransitionParticipant(incoming, 1, incomingX, incomingY);
        return;
      }
      if (transition.style === 'zoom') {
        drawTransitionParticipant(outgoing, 1);
        const startScale = Math.max(0.72, 0.94 - (strength - 1) * 0.06);
        drawTransitionParticipant(incoming, p, 0, 0, startScale + (1 - startScale) * p);
        return;
      }
      // A true alpha cross-dissolve: the outgoing image remains underneath while
      // the incoming image is composited over it from transparent to opaque.
      drawTransitionParticipant(outgoing, 1);
      drawTransitionParticipant(incoming, p);
    };

    for (const clip of activeClips) {
      const transitionPair = transitionByClipId.get(clip.id);
      if (transitionPair) {
        if (renderedTransitionIds.has(transitionPair.id)) continue;
        renderedTransitionIds.add(transitionPair.id);
        drawEditPointTransition(transitionPair);
        continue;
      }

      if (clip.kind === 'adjustment') {
        const filterStr = buildFilterString(clip.effects);
        if (filterStr !== 'none') {
          const temp = getScratchCanvas(mediaCache, 'adjustment_tmp', width, height);
          const tctx = temp.getContext('2d');
          if (tctx) {
            tctx.filter = filterStr;
            tctx.drawImage(canvas, 0, 0);
            tctx.filter = 'none';
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(temp, 0, 0);
          }
        }
        applyPostOverlays(ctx, width, height, clip.effects, playheadTime, mediaCache);
        continue;
      }

      if (clip.trackMatte && clip.trackMatte !== 'none') {
        const topIdx = trackOrderTopToBottom.findIndex((t) => t.id === track.id);
        const matteTrackAbove = topIdx > 0 ? trackOrderTopToBottom[topIdx - 1] : null;
        const matteClip = matteTrackAbove
          ? clips.find(
              (mc) =>
                mc.trackId === matteTrackAbove.id &&
                mc.kind !== 'camera' &&
                mc.kind !== 'light' &&
                mc.kind !== 'adjustment' &&
                playheadTime >= mc.start &&
                playheadTime <= mc.start + mc.duration
            )
          : undefined;

        if (matteClip) {
          const layerBuf = getScratchCanvas(mediaCache, 'matte_layer', width, height);
          const lctx = layerBuf.getContext('2d');
          const maskBuf = getScratchCanvas(mediaCache, 'matte_mask', width, height);
          const mctx = maskBuf.getContext('2d');

          if (lctx && mctx) {
            const box = drawSingleClipToContext(lctx, clip, true);
            if (box) selectedBox = box;
            drawSingleClipToContext(mctx, matteClip, true);

            if (clip.trackMatte === 'luma') {
              const targetImg = lctx.getImageData(0, 0, width, height);
              const matteImg = mctx.getImageData(0, 0, width, height);
              applyLumaMatteToPixels(targetImg.data, matteImg.data);
              lctx.putImageData(targetImg, 0, 0);
            } else {
              lctx.save();
              lctx.globalCompositeOperation =
                clip.trackMatte === 'alpha-inverted' ? 'destination-out' : 'destination-in';
              lctx.drawImage(maskBuf, 0, 0);
              lctx.restore();
            }

            ctx.save();
            ctx.globalCompositeOperation = toCompositeOp(clip.blendMode);
            ctx.drawImage(layerBuf, 0, 0);
            ctx.restore();
            continue;
          }
        }
      }

      const box = drawSingleClipToContext(ctx, clip, false);
      if (box) selectedBox = box;
    }
  }

  // Pen Tool Interactive Path Draft Overlay
  if (penDraftPoints.length > 0) {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 3;
    drawVectorPathPoints(ctx, penDraftPoints, false, 0, 100);
    ctx.stroke();

    // Show tangent handles while a Bézier point is being shaped.
    penDraftPoints.forEach((pt) => {
      for (const handle of [
        { x: pt.handleInX, y: pt.handleInY },
        { x: pt.handleOutX, y: pt.handleOutY },
      ]) {
        if (handle.x === undefined || handle.y === undefined) continue;
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.75)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(handle.x, handle.y);
        ctx.stroke();
        ctx.fillStyle = '#BFDBFE';
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    if (penDraftPoints.length >= 2) {
      const first = penDraftPoints[0];
      ctx.beginPath();
      ctx.arc(first.x, first.y, 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    penDraftPoints.forEach((pt, idx) => {
      ctx.fillStyle = idx === 0 ? '#F59E0B' : '#FFFFFF';
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(pt.x - 5, pt.y - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  if (showSafeMargins) {
    ctx.save();
    ctx.strokeStyle = 'rgba(230, 232, 236, 0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(width * 0.05, height * 0.05, width * 0.9, height * 0.9);
    ctx.strokeRect(width * 0.1, height * 0.1, width * 0.8, height * 0.8);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(width / 2 - 12, height / 2);
    ctx.lineTo(width / 2 + 12, height / 2);
    ctx.moveTo(width / 2, height / 2 - 12);
    ctx.lineTo(width / 2, height / 2 + 12);
    ctx.stroke();
    ctx.restore();
  }

  const selectedBoxClip = selectedBox ? clips.find((clip) => clip.id === selectedBox.clipId) : null;
  const selectedBoxOpacity = selectedBoxClip ? resolveWorldTransform(selectedBoxClip, clips, playheadTime).opacity : 100;
  if (drawGizmo && selectedBox && selectedBoxOpacity > 0.01) {
    ctx.save();
    ctx.translate(selectedBox.cx, selectedBox.cy);
    ctx.rotate(selectedBox.rotationRad);
    const hw = selectedBox.width / 2;
    const hh = selectedBox.height / 2;

    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2;
    ctx.strokeRect(-hw, -hh, selectedBox.width, selectedBox.height);

    const corners = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    for (const [x, y] of corners) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 2;
      ctx.fillRect(x - 5, y - 5, 10, 10);
      ctx.strokeRect(x - 5, y - 5, 10, 10);
    }

    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#3B82F6';
    ctx.stroke();
    ctx.restore();
  }

  return selectedBox;
}
