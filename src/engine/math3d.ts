import { TimelineClip, TransformState } from '../types/editor';
import { evaluateClipTransform } from './keyframes';
import { clamp } from './timecode';

export interface WorldTransform3D {
  x: number;
  y: number;
  z: number;
  anchorX?: number;
  anchorY?: number;
  scale: number;
  rotation: number;
  rotationX: number;
  rotationY: number;
  opacity: number;
}

/**
 * Resolves parent-child Null Object / layer hierarchy chains safely (cycle-guarded).
 */
export function resolveWorldTransform(
  clip: TimelineClip,
  allClips: TimelineClip[],
  globalTime: number
): WorldTransform3D {
  const chain: TransformState[] = [];
  const visited = new Set<string>();
  let current: TimelineClip | undefined = clip;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(evaluateClipTransform(current, globalTime));
    if (!current.parentId) break;
    current = allClips.find((c) => c.id === current!.parentId);
  }

  // Accumulate from root parent down to child
  let x = 0;
  let y = 0;
  let z = 0;
  let scale = 100;
  let rotation = 0;
  let rotationX = 0;
  let rotationY = 0;
  let opacity = 100;

  for (let i = chain.length - 1; i >= 0; i--) {
    const tf = chain[i];
    const scaleMult = scale / 100;
    const rad = (rotation * Math.PI) / 180;
    const rx = tf.x * Math.cos(rad) - tf.y * Math.sin(rad);
    const ry = tf.x * Math.sin(rad) + tf.y * Math.cos(rad);
    x += rx * scaleMult;
    y += ry * scaleMult;
    z += tf.z * scaleMult;
    scale = (scale * tf.scale) / 100;
    rotation += tf.rotation;
    rotationX += tf.rotationX;
    rotationY += tf.rotationY;
    opacity = (opacity * tf.opacity) / 100;
  }

  return {
    x,
    y,
    z,
    anchorX: chain[0]?.anchorX ?? 0,
    anchorY: chain[0]?.anchorY ?? 0,
    scale,
    rotation,
    rotationX,
    rotationY,
    opacity,
  };
}

export interface CameraProjectionResult {
  screenX: number;
  screenY: number;
  perspectiveScale: number;
  skewX: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
  depthZ: number;
}

/**
 * Projects a 3D layer transform through an optional Active Camera into 2D screen space.
 */
export function projectLayerThroughCamera(
  world: WorldTransform3D,
  cameraClip: TimelineClip | null,
  allClips: TimelineClip[],
  globalTime: number,
  compWidth: number,
  compHeight: number
): CameraProjectionResult {
  let camX = 0;
  let camY = 0;
  let camZ = -900;
  let fov = 55;
  let camRotX = 0;
  let camRotY = 0;
  let camRotZ = 0;

  if (cameraClip && cameraClip.cameraProps) {
    const camTf = resolveWorldTransform(cameraClip, allClips, globalTime);
    camX = camTf.x;
    camY = camTf.y;
    camZ = -900 + camTf.z;
    fov = clamp(cameraClip.cameraProps.fov || 55, 20, 120);
    camRotX = camTf.rotationX;
    camRotY = camTf.rotationY;
    camRotZ = camTf.rotation;
  }

  // Relative to camera position
  let dx = world.x - camX;
  let dy = world.y - camY;
  const dz = world.z - camZ;

  // Apply inverse camera yaw/pitch subtly for realistic 3D parallax
  const yawRad = (-camRotY * Math.PI) / 180;
  const pitchRad = (-camRotX * Math.PI) / 180;
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);
  const rx = dx * cosY - dz * sinY;
  const rz1 = dx * sinY + dz * cosY;

  const cosX = Math.cos(pitchRad);
  const sinX = Math.sin(pitchRad);
  const ry = dy * cosX - rz1 * sinX;
  const rz = dy * sinX + rz1 * cosX;

  const focalPx = (compWidth * 0.5) / Math.tan(((fov * 0.5) * Math.PI) / 180);
  const safeDepth = Math.max(80, rz);
  const perspectiveScale = focalPx / safeDepth;

  // Screen coordinates
  const screenX = compWidth / 2 + rx * perspectiveScale;
  const screenY = compHeight / 2 + ry * perspectiveScale;

  // Apparent 3D foreshortening from layer rotationX / rotationY
  const layerPitchRad = ((world.rotationX - camRotX) * Math.PI) / 180;
  const layerYawRad = ((world.rotationY - camRotY) * Math.PI) / 180;
  const scaleX = Math.cos(layerYawRad);
  const scaleY = Math.cos(layerPitchRad);
  const skewX = Math.sin(layerYawRad) * Math.sin(layerPitchRad) * 0.35;

  return {
    screenX,
    screenY,
    perspectiveScale: perspectiveScale * (world.scale / 100),
    skewX,
    scaleX: Math.abs(scaleX) < 0.04 ? 0.04 * Math.sign(scaleX || 1) : scaleX,
    scaleY: Math.abs(scaleY) < 0.04 ? 0.04 * Math.sign(scaleY || 1) : scaleY,
    visible: rz > 30,
    depthZ: rz + camRotZ * 0.0001,
  };
}

export interface LightShading {
  brightnessFactor: number; // 0.25 .. 1.6
  tintColor: string;
  tintAlpha: number; // 0 .. 0.5
}

/**
 * Computes combined diffuse + ambient + spot attenuation from active Light layers.
 */
export function computeLightShading(
  layerWorld: WorldTransform3D,
  lights: TimelineClip[],
  allClips: TimelineClip[],
  globalTime: number
): LightShading {
  if (lights.length === 0) {
    return { brightnessFactor: 1, tintColor: '#ffffff', tintAlpha: 0 };
  }

  let totalLight = 0.28; // base ambient bounce
  let dominantTint = '#ffffff';
  let highestContribution = 0;

  const pitchRad = (layerWorld.rotationX * Math.PI) / 180;
  const yawRad = (layerWorld.rotationY * Math.PI) / 180;
  // Layer surface normal vector
  const nx = Math.sin(yawRad) * Math.cos(pitchRad);
  const ny = -Math.sin(pitchRad);
  const nz = -Math.cos(yawRad) * Math.cos(pitchRad);

  for (const light of lights) {
    const lp = light.lightProps;
    if (!lp) continue;
    const lTf = resolveWorldTransform(light, allClips, globalTime);
    const intensity = clamp(lp.intensity / 100, 0, 2);

    if (lp.lightType === 'ambient') {
      totalLight += 0.65 * intensity;
      if (intensity > highestContribution) {
        highestContribution = intensity;
        dominantTint = lp.color;
      }
      continue;
    }

    const lightZ = -420 + lTf.z;
    const vx = lTf.x - layerWorld.x;
    const vy = lTf.y - layerWorld.y;
    const vz = lightZ - layerWorld.z;
    const dist = Math.max(1, Math.hypot(vx, vy, vz));
    const lx = vx / dist;
    const ly = vy / dist;
    const lz = vz / dist;

    const dot = Math.max(0.15, Math.abs(nx * lx + ny * ly + nz * lz));
    const falloff = lp.lightType === 'parallel' ? 1 : clamp(680 / (dist + 220), 0.25, 1.35);

    let spotFactor = 1;
    if (lp.lightType === 'spot') {
      const radial = Math.hypot(vx, vy);
      const maxSpread = Math.tan(((lp.coneAngle * 0.5) * Math.PI) / 180) * Math.max(200, Math.abs(vz));
      spotFactor = clamp(1 - radial / Math.max(80, maxSpread * 1.4), 0.15, 1);
    }

    const contrib = dot * intensity * falloff * spotFactor;
    totalLight += contrib;

    if (contrib > highestContribution && lp.color.toLowerCase() !== '#ffffff') {
      highestContribution = contrib;
      dominantTint = lp.color;
    }
  }

  return {
    brightnessFactor: clamp(totalLight, 0.3, 1.65),
    tintColor: dominantTint,
    tintAlpha: dominantTint.toLowerCase() === '#ffffff' ? 0 : clamp(highestContribution * 0.24, 0, 0.42),
  };
}

/**
 * Computes screen-space geometry center when layer has non-zero anchor point,
 * scale, skew, and rotation applied around (cx, cy).
 */
export function computeAnchorScreenCenter(
  cx: number,
  cy: number,
  anchorX: number,
  anchorY: number,
  effScaleX: number,
  effScaleY: number,
  rotationRad: number,
  skewX: number = 0
): { screenCx: number; screenCy: number } {
  if (anchorX === 0 && anchorY === 0) {
    return { screenCx: cx, screenCy: cy };
  }
  const lx = -anchorX * effScaleX;
  const ly = -anchorY * effScaleY;
  const sx = lx + skewX * ly;
  const sy = ly;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return {
    screenCx: cx + sx * cos - sy * sin,
    screenCy: cy + sx * sin + sy * cos,
  };
}

/**
 * Applies a Luma Track Matte in-place on RGBA image pixel arrays using Rec.709 luminance * matte alpha.
 */
export function applyLumaMatteToPixels(
  targetRgba: Uint8ClampedArray,
  matteRgba: Uint8ClampedArray
): void {
  const len = Math.min(targetRgba.length, matteRgba.length);
  for (let i = 0; i < len; i += 4) {
    const r = matteRgba[i];
    const g = matteRgba[i + 1];
    const b = matteRgba[i + 2];
    const ma = matteRgba[i + 3] / 255;
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    targetRgba[i + 3] = Math.round(targetRgba[i + 3] * luma * ma);
  }
}

