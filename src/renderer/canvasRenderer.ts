import {
  BlendMode,
  ColorWheelGrade,
  CompositionSettings,
  EffectItem,
  LayerMask,
  PathPoint,
  TimelineClip,
  TimelineTrack,
  ViewportCameraAngle,
} from '../types/editor';
import {
  applyLumaMatteToPixels,
  computeAnchorScreenCenter,
  computeLightShading,
  projectLayerThroughCamera,
  resolveWorldTransform,
} from '../engine/math3d';
import { evaluateClipTransform, getClipLocalTime } from '../engine/keyframes';

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
  onReady?: () => void
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
    if (isPlaying) {
      if (video.paused) video.play().catch(() => {});
      if (Math.abs(video.currentTime - clampedTarget) > 0.25) {
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
  playheadTime: number
): Promise<void> {
  const activeMediaClips = clips.filter(
    (c) =>
      (c.kind === 'image' || c.kind === 'video') &&
      Boolean(c.src) &&
      playheadTime >= c.start &&
      playheadTime <= c.start + c.duration
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
    filters.push(
      `brightness(${Math.max(20, Math.round(lumaShift))}%) contrast(${Math.max(
        40,
        Math.round(curveContrast)
      )}%) saturate(${Math.round(colorGrade.saturation)}%)`
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

function applyMaskClipPath(
  ctx: CanvasRenderingContext2D,
  mask: LayerMask,
  layerW: number,
  layerH: number
) {
  const mw = Math.max(12, (mask.width / 100) * layerW);
  const mh = Math.max(12, (mask.height / 100) * layerH);
  const mx = (mask.x / 100) * layerW;
  const my = (mask.y / 100) * layerH;

  ctx.beginPath();
  if (mask.inverted) {
    ctx.rect(-layerW * 2, -layerH * 2, layerW * 4, layerH * 4);
  }
  if (mask.shape === 'ellipse') {
    ctx.ellipse(mx, my, mw / 2, mh / 2, 0, 0, Math.PI * 2, mask.inverted);
  } else {
    if (mask.inverted) {
      ctx.moveTo(mx - mw / 2, my - mh / 2);
      ctx.lineTo(mx - mw / 2, my + mh / 2);
      ctx.lineTo(mx + mw / 2, my + mh / 2);
      ctx.lineTo(mx + mw / 2, my - mh / 2);
      ctx.closePath();
    } else {
      ctx.rect(mx - mw / 2, my - mh / 2, mw, mh);
    }
  }
  ctx.clip(mask.inverted ? 'evenodd' : 'nonzero');
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
    ctx.closePath();
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
  selectedClipId: string | null
) {
  ctx.fillStyle = '#0D0F14';
  ctx.fillRect(0, 0, width, height);

  // Draw orthographic grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  const step = 64;
  for (let x = 0; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Center axes
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.35)';
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  const activeTracks = new Set(
    tracks.filter((t) => t.kind === 'video' && t.visible).map((t) => t.id)
  );
  const activeClips = clips.filter(
    (c) =>
      activeTracks.has(c.trackId) &&
      playheadTime >= c.start &&
      playheadTime <= c.start + c.duration
  );

  const scale = 0.42;

  for (const clip of activeClips) {
    const world = resolveWorldTransform(clip, clips, playheadTime);
    const isSelected = clip.id === selectedClipId;

    let sx = width / 2;
    let sy = height / 2;
    if (angle === 'top') {
      sx = width / 2 + world.x * scale;
      sy = height / 2 + world.z * scale;
    } else if (angle === 'front') {
      sx = width / 2 + world.x * scale;
      sy = height / 2 + world.y * scale;
    } else {
      // right
      sx = width / 2 + world.z * scale;
      sy = height / 2 + world.y * scale;
    }

    ctx.save();
    ctx.translate(sx, sy);

    if (clip.kind === 'camera') {
      // Camera frustum pyramid
      ctx.strokeStyle = isSelected ? '#FBBF24' : '#F59E0B';
      ctx.lineWidth = isSelected ? 2.5 : 1.8;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
      ctx.beginPath();
      if (angle === 'top' || angle === 'right') {
        const camOffset = angle === 'top' ? -900 * scale : -900 * scale;
        ctx.translate(angle === 'right' ? camOffset : 0, angle === 'top' ? camOffset : 0);
        ctx.moveTo(0, 0);
        ctx.lineTo(-90, 180);
        ctx.lineTo(90, 180);
        ctx.closePath();
      } else {
        ctx.rect(-34, -22, 68, 44);
      }
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FCD34D';
      ctx.font = '600 13px "JetBrains Mono", monospace';
      ctx.fillText('CAM', 12, -10);
    } else if (clip.kind === 'light') {
      const color = clip.lightProps?.color ?? '#93C5FD';
      ctx.strokeStyle = isSelected ? '#FFFFFF' : color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-44, 95);
      ctx.lineTo(44, 95);
      ctx.closePath();
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillText('LIGHT', 14, 4);
    } else if (clip.kind !== 'audio') {
      // Layer plane wireframe
      ctx.strokeStyle = isSelected ? '#3B82F6' : clip.is3D ? '#A78BFA' : '#64748B';
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      if (angle === 'front') {
        const w = 180 * (world.scale / 100);
        const h = 100 * (world.scale / 100);
        ctx.strokeRect(-w / 2, -h / 2, w, h);
      } else {
        const span = 180 * (world.scale / 100);
        ctx.beginPath();
        ctx.moveTo(-span / 2, 0);
        ctx.lineTo(span / 2, 0);
        ctx.stroke();
      }
      ctx.fillStyle = isSelected ? '#93C5FD' : '#9BA1AD';
      ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(clip.name.slice(0, 16), 8, -8);
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
  } = options;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { width, height } = composition;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

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
      selectedClipId
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
    ignoreBlendMode: boolean = false
  ): BoundingBox | null => {
    const world = resolveWorldTransform(clip, clips, playheadTime);
    let cx = width / 2 + world.x;
    let cy = height / 2 + world.y;
    let effScaleX = world.scale / 100;
    let effScaleY = world.scale / 100;
    let skewX = 0;

    if (clip.is3D) {
      const proj = projectLayerThroughCamera(
        world,
        activeCamera,
        clips,
        playheadTime,
        width,
        height
      );
      if (!proj.visible) return null;
      cx = proj.screenX;
      cy = proj.screenY;
      effScaleX = proj.perspectiveScale * proj.scaleX;
      effScaleY = proj.perspectiveScale * proj.scaleY;
      skewX = proj.skewX;
    }

    const shading = clip.is3D
      ? computeLightShading(world, activeLights, clips, playheadTime)
      : { brightnessFactor: 1, tintColor: '#ffffff', tintAlpha: 0 };

    const rotRad = (world.rotation * Math.PI) / 180;

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

    targetCtx.save();
    targetCtx.globalAlpha = Math.max(0, Math.min(1, world.opacity / 100));
    if (!ignoreBlendMode) {
      targetCtx.globalCompositeOperation = toCompositeOp(clip.blendMode);
    }
    const baseFilter = buildFilterString(
      clip.effects,
      shading.brightnessFactor,
      clip.colorGrade
    );
    if (clip.mask?.enabled && clip.mask.feather > 0) {
      const maskBlur = `blur(${(clip.mask.feather * 0.15).toFixed(1)}px)`;
      targetCtx.filter = baseFilter === 'none' ? maskBlur : `${baseFilter} ${maskBlur}`;
    } else {
      targetCtx.filter = baseFilter;
    }

    const glowFx = clip.effects.find((f) => f.enabled && f.type === 'glow');
    const shadowFx = clip.effects.find((f) => f.enabled && f.type === 'dropshadow');
    if (glowFx) {
      targetCtx.shadowColor = 'rgba(96, 165, 250, 0.8)';
      targetCtx.shadowBlur =
        (glowFx.params.radius ?? 16) * ((glowFx.params.intensity ?? 50) / 50);
    } else if (shadowFx) {
      const op = (shadowFx.params.opacity ?? 70) / 100;
      targetCtx.shadowColor = `rgba(0, 0, 0, ${op})`;
      targetCtx.shadowBlur = shadowFx.params.blur ?? 16;
      targetCtx.shadowOffsetX = (shadowFx.params.distance ?? 10) * 0.5;
      targetCtx.shadowOffsetY = shadowFx.params.distance ?? 10;
    }

    targetCtx.translate(cx, cy);
    targetCtx.rotate(rotRad);
    if (skewX !== 0) {
      targetCtx.transform(1, 0, skewX, 1, 0, 0);
    }
    targetCtx.scale(effScaleX, effScaleY);
    if (ax !== 0 || ay !== 0) {
      targetCtx.translate(-ax, -ay);
    }

    if (clip.mask?.enabled) {
      targetCtx.globalAlpha *= Math.max(0, Math.min(1, clip.mask.opacity / 100));
      applyMaskClipPath(targetCtx, clip.mask, width, height);
    }

    let baseW = width;
    let baseH = height;
    const chromaFx = clip.effects.find((f) => f.enabled && f.type === 'chromakey');
    const localPlayT = getClipLocalTime(clip, playheadTime);

    if (clip.kind === 'solid' && clip.solidProps) {
      baseW = clip.solidProps.width;
      baseH = clip.solidProps.height;
      targetCtx.fillStyle = clip.solidProps.color;
      targetCtx.fillRect(-baseW / 2, -baseH / 2, baseW, baseH);
    } else if (clip.kind === 'image' && clip.src) {
      const img = getOrLoadImage(mediaCache, clip.src, onMediaLoaded);
      if (img) {
        const aspect = img.naturalWidth / img.naturalHeight;
        const compAspect = width / height;
        if (aspect > compAspect) {
          baseW = width;
          baseH = width / aspect;
        } else {
          baseH = height;
          baseW = height * aspect;
        }
        if (chromaFx) {
          const keyed = applyChromaKeyToSource(
            mediaCache,
            img,
            baseW,
            baseH,
            chromaFx.params.hueTarget ?? 120,
            chromaFx.params.tolerance ?? 42,
            chromaFx.params.softness ?? 16
          );
          targetCtx.drawImage(keyed, -baseW / 2, -baseH / 2, baseW, baseH);
        } else {
          targetCtx.drawImage(img, -baseW / 2, -baseH / 2, baseW, baseH);
        }
      }
    } else if (clip.kind === 'video' && clip.src) {
      const mediaTime = clip.sourceIn + localPlayT;
      const video = getOrLoadVideo(
        mediaCache,
        clip.src,
        mediaTime,
        isPlaying,
        onMediaLoaded
      );
      if (video) {
        const aspect = video.videoWidth / video.videoHeight || 16 / 9;
        const compAspect = width / height;
        if (aspect > compAspect) {
          baseW = width;
          baseH = width / aspect;
        } else {
          baseH = height;
          baseW = height * aspect;
        }
        if (chromaFx) {
          const keyed = applyChromaKeyToSource(
            mediaCache,
            video,
            baseW,
            baseH,
            chromaFx.params.hueTarget ?? 120,
            chromaFx.params.tolerance ?? 42,
            chromaFx.params.softness ?? 16
          );
          targetCtx.drawImage(keyed, -baseW / 2, -baseH / 2, baseW, baseH);
        } else {
          targetCtx.drawImage(video, -baseW / 2, -baseH / 2, baseW, baseH);
        }
      }
    } else if (clip.kind === 'text' && clip.textProps) {
      const tp = clip.textProps;
      const localT = localPlayT;
      const anim = tp.animator ?? 'none';
      let renderText = tp.text;
      let animOffsetY = 0;
      let animScale = 1;

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
        targetCtx.globalAlpha *= ease;
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

      targetCtx.font = `${tp.fontWeight} ${tp.fontSize}px "Plus Jakarta Sans", sans-serif`;
      targetCtx.textAlign = tp.align;
      targetCtx.textBaseline = 'middle';
      if ('letterSpacing' in targetCtx) {
        (targetCtx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${tp.letterSpacing}px`;
      }
      const metrics = targetCtx.measureText(tp.text);
      baseW = Math.max(120, metrics.width + 40);
      baseH = Math.max(48, tp.fontSize * 1.45);

      targetCtx.save();
      targetCtx.translate(0, animOffsetY);
      if (animScale !== 1) targetCtx.scale(animScale, animScale);
      if (tp.backgroundColor) {
        targetCtx.fillStyle = tp.backgroundColor;
        const rx =
          tp.align === 'left' ? -16 : tp.align === 'right' ? -baseW + 16 : -baseW / 2;
        targetCtx.beginPath();
        targetCtx.roundRect(rx, -baseH / 2, baseW, baseH, 6);
        targetCtx.fill();
      }
      targetCtx.fillStyle = tp.color;
      targetCtx.fillText(renderText, 0, 0);
      targetCtx.restore();
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
        targetCtx.save();
        targetCtx.fillStyle = pp.color;
        targetCtx.globalAlpha *= pp.style === 'bokeh' ? 0.35 : 0.78;
        targetCtx.beginPath();
        if (pp.style === 'confetti') {
          targetCtx.translate(px, py);
          targetCtx.rotate(localT * 3 + i);
          targetCtx.fillRect(-radius, -radius * 0.5, radius * 2, radius);
        } else if (pp.style === 'matrix') {
          targetCtx.fillRect(px, py, Math.max(2, radius * 0.6), radius * 3.2);
        } else {
          targetCtx.arc(px, py, radius, 0, Math.PI * 2);
          targetCtx.fill();
        }
        targetCtx.restore();
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
          targetCtx.strokeStyle = i % 2 === 0 ? vp.color : vp.accentColor;
          targetCtx.lineWidth = 4;
          targetCtx.beginPath();
          targetCtx.moveTo(Math.cos(ang) * baseR, Math.sin(ang) * baseR);
          targetCtx.lineTo(Math.cos(ang) * (baseR + mag), Math.sin(ang) * (baseR + mag));
          targetCtx.stroke();
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
          targetCtx.fillStyle = i % 3 === 0 ? vp.accentColor : vp.color;
          targetCtx.beginPath();
          targetCtx.roundRect(bx, baseH / 2 - mag, barW, Math.max(6, mag), 2);
          targetCtx.fill();
        }
      }
    } else if (clip.kind === 'caption' && clip.captionProps) {
      const cp = clip.captionProps;
      const activeCue = cp.cues.find(
        (q) => playheadTime >= q.start && playheadTime <= q.end
      );
      baseW = 680;
      baseH = 72;
      if (activeCue) {
        const yPos = cp.position === 'bottom' ? height * 0.34 : 0;
        targetCtx.font = `700 ${cp.fontSize}px "Plus Jakarta Sans", sans-serif`;
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';
        const tw = targetCtx.measureText(activeCue.text).width;
        const boxW = tw + 36;
        const boxH = cp.fontSize * 1.55;
        targetCtx.fillStyle = cp.bgColor;
        targetCtx.beginPath();
        targetCtx.roundRect(-boxW / 2, yPos - boxH / 2, boxW, boxH, 8);
        targetCtx.fill();
        targetCtx.fillStyle = cp.color;
        targetCtx.fillText(activeCue.text, 0, yPos);
      }
    } else if (clip.kind === 'shape' && clip.shapeProps) {
      const sp = clip.shapeProps;
      const shapeTransform = evaluateClipTransform(clip, playheadTime);
      const shapeWidth = Math.max(1, shapeTransform.shapeWidth ?? shapeWidth);
      const shapeHeight = Math.max(1, shapeTransform.shapeHeight ?? shapeHeight);
      baseW = shapeWidth;
      baseH = shapeHeight;

      if (sp.shapeType === 'circle' || sp.shapeType === 'ring') {
        const r = Math.min(shapeWidth, shapeHeight) / 2;
        targetCtx.beginPath();
        targetCtx.arc(0, 0, r, 0, Math.PI * 2);
        if (sp.shapeType === 'circle' && sp.fillColor !== 'transparent') {
          targetCtx.fillStyle = sp.fillColor;
          targetCtx.fill();
        }
        if (sp.strokeWidth > 0) {
          targetCtx.strokeStyle = sp.strokeColor;
          targetCtx.lineWidth = sp.strokeWidth;
          if (sp.shapeType === 'ring') targetCtx.setLineDash([28, 12, 8, 12]);
          targetCtx.stroke();
          targetCtx.setLineDash([]);
        }
      } else if (sp.shapeType === 'polygon') {
        const sides = Math.max(3, sp.sides ?? 6);
        const r = Math.min(shapeWidth, shapeHeight) / 2;
        targetCtx.beginPath();
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) targetCtx.moveTo(px, py);
          else targetCtx.lineTo(px, py);
        }
        targetCtx.closePath();
        if (sp.fillColor !== 'transparent') {
          targetCtx.fillStyle = sp.fillColor;
          targetCtx.fill();
        }
        if (sp.strokeWidth > 0) {
          targetCtx.strokeStyle = sp.strokeColor;
          targetCtx.lineWidth = sp.strokeWidth;
          targetCtx.stroke();
        }
      } else {
        targetCtx.beginPath();
        targetCtx.roundRect(
          -shapeWidth / 2,
          -shapeHeight / 2,
          shapeWidth,
          shapeHeight,
          sp.cornerRadius
        );
        if (sp.fillColor !== 'transparent') {
          targetCtx.fillStyle = sp.fillColor;
          targetCtx.fill();
        }
        if (sp.strokeWidth > 0) {
          targetCtx.strokeStyle = sp.strokeColor;
          targetCtx.lineWidth = sp.strokeWidth;
          targetCtx.stroke();
        }
      }
    } else if (clip.kind === 'path' && clip.pathProps) {
      const pp = clip.pathProps;
      baseW = 360;
      baseH = 260;
      if (pp.dashed) targetCtx.setLineDash([14, 10]);
      drawVectorPathPoints(targetCtx, pp.points, pp.closed, pp.trimStart, pp.trimEnd);
      if (pp.closed && pp.fillColor !== 'transparent') {
        targetCtx.fillStyle = pp.fillColor;
        targetCtx.fill();
      }
      if (pp.strokeWidth > 0) {
        targetCtx.strokeStyle = pp.strokeColor;
        targetCtx.lineWidth = pp.strokeWidth;
        targetCtx.lineCap = 'round';
        targetCtx.lineJoin = 'round';
        targetCtx.stroke();
      }
      targetCtx.setLineDash([]);
    }

    // Clear shadow & filter before DaVinci color wash and 3D light tint so halos never bleed
    targetCtx.shadowBlur = 0;
    targetCtx.shadowOffsetX = 0;
    targetCtx.shadowOffsetY = 0;
    targetCtx.shadowColor = 'transparent';
    targetCtx.filter = 'none';

    if (clip.colorGrade?.enabled) {
      applyDaVinciToneOverlay(targetCtx, clip.colorGrade, baseW, baseH);
    }

    if (shading.tintAlpha > 0.01) {
      targetCtx.globalCompositeOperation = 'overlay';
      targetCtx.globalAlpha = shading.tintAlpha;
      targetCtx.fillStyle = shading.tintColor;
      targetCtx.fillRect(-baseW / 2, -baseH / 2, baseW, baseH);
    }

    targetCtx.restore();

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
      applyPostOverlays(targetCtx, width, height, clip.effects, playheadTime, mediaCache);
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

    if (drawGizmo && clip.id === selectedClipId && clip.kind === 'shape' && clip.shapeProps) {
      targetCtx.save();
      targetCtx.translate(cx, cy);
      targetCtx.rotate(rotRad);
      if (skewX !== 0) targetCtx.transform(1, 0, skewX, 1, 0, 0);
      targetCtx.scale(effScaleX, effScaleY);
      if (ax !== 0 || ay !== 0) targetCtx.translate(-ax, -ay);
      targetCtx.strokeStyle = '#60A5FA';
      targetCtx.lineWidth = 1.5 / Math.max(0.01, Math.abs(effScaleX));
      targetCtx.setLineDash([7, 4]);
      targetCtx.strokeRect(-baseW / 2, -baseH / 2, baseW, baseH);
      targetCtx.setLineDash([]);
      targetCtx.fillStyle = '#FFFFFF';
      targetCtx.strokeStyle = '#3B82F6';
      const handleSize = 9 / Math.max(0.01, Math.abs(effScaleX));
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          targetCtx.fillRect(sx * baseW / 2 - handleSize / 2, sy * baseH / 2 - handleSize / 2, handleSize, handleSize);
          targetCtx.strokeRect(sx * baseW / 2 - handleSize / 2, sy * baseH / 2 - handleSize / 2, handleSize, handleSize);
        }
      }
      targetCtx.restore();
    }

    if (drawGizmo && clip.id === selectedClipId && clip.mask?.enabled) {
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

    if (drawGizmo && clip.id === selectedClipId) {
      targetCtx.save();
      targetCtx.fillStyle = '#FDE68A';
      targetCtx.strokeStyle = '#111827';
      targetCtx.lineWidth = 2;
      targetCtx.beginPath();
      targetCtx.arc(screenCx, screenCy, 5, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.stroke();
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
        playheadTime >= c.start &&
        playheadTime <= c.start + c.duration
    );

    // Sort 3D clips back-to-front within track if multiple 3D layers share track
    activeClips.sort((a, b) => {
      if (!a.is3D && !b.is3D) return 0;
      const wa = resolveWorldTransform(a, clips, playheadTime);
      const wb = resolveWorldTransform(b, clips, playheadTime);
      return wb.z - wa.z;
    });

    for (const clip of activeClips) {
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
    ctx.beginPath();
    penDraftPoints.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

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

  if (drawGizmo && selectedBox) {
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
