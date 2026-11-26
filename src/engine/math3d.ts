import { TimelineClip, TransformState } from '../types/editor';
import { evaluateClipTransform } from './keyframes';
import { clamp } from './timecode';

export type Vector3 = { x: number; y: number; z: number };
export type Quaternion = { x: number; y: number; z: number; w: number };

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const IDENTITY_QUATERNION: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

export interface WorldTransform3D extends Vector3 {
  anchorX?: number;
  anchorY?: number;
  scale: number;
  rotation: number;
  rotationX: number;
  rotationY: number;
  opacity: number;
  /** Full world orientation, composed from every parent and local transform. */
  orientation?: Quaternion;
}

export function quaternionMultiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function quaternionFromEuler(
  rotationX: number,
  rotationY: number,
  rotationZ: number
): Quaternion {
  const hx = rotationX * DEG * 0.5;
  const hy = rotationY * DEG * 0.5;
  const hz = rotationZ * DEG * 0.5;
  const qx = { x: Math.sin(hx), y: 0, z: 0, w: Math.cos(hx) };
  const qy = { x: 0, y: Math.sin(hy), z: 0, w: Math.cos(hy) };
  const qz = { x: 0, y: 0, z: Math.sin(hz), w: Math.cos(hz) };
  return quaternionMultiply(quaternionMultiply(qz, qy), qx);
}

export function rotateVector3(vector: Vector3, orientation: Quaternion): Vector3 {
  const qv: Quaternion = { x: vector.x, y: vector.y, z: vector.z, w: 0 };
  const inverse: Quaternion = {
    x: -orientation.x,
    y: -orientation.y,
    z: -orientation.z,
    w: orientation.w,
  };
  const rotated = quaternionMultiply(
    quaternionMultiply(orientation, qv),
    inverse
  );
  return { x: rotated.x, y: rotated.y, z: rotated.z };
}

function getWorldOrientation(world: WorldTransform3D): Quaternion {
  return world.orientation ?? quaternionFromEuler(world.rotationX, world.rotationY, world.rotation);
}

function normalizeQuaternion(q: Quaternion): Quaternion {
  const length = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function quaternionToEuler(qInput: Quaternion): {
  rotationX: number;
  rotationY: number;
  rotation: number;
} {
  const q = normalizeQuaternion(qInput);
  const sinX = 2 * (q.w * q.x + q.y * q.z);
  const cosX = 1 - 2 * (q.x * q.x + q.y * q.y);
  const sinY = 2 * (q.w * q.y - q.z * q.x);
  const sinZ = 2 * (q.w * q.z + q.x * q.y);
  const cosZ = 1 - 2 * (q.y * q.y + q.z * q.z);
  return {
    rotationX: Math.atan2(sinX, cosX) * RAD,
    rotationY: Math.asin(clamp(sinY, -1, 1)) * RAD,
    rotation: Math.atan2(sinZ, cosZ) * RAD,
  };
}

/**
 * Resolves the complete 3D parent hierarchy.
 * Local translation is transformed by the parent's world quaternion and scale;
 * local orientation is composed with the parent's quaternion (Z * Y * X Euler order).
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
    current = allClips.find((candidate) => candidate.id === current!.parentId);
  }

  let position: Vector3 = { x: 0, y: 0, z: 0 };
  let scale = 100;
  let opacity = 100;
  let orientation = IDENTITY_QUATERNION;

  for (let index = chain.length - 1; index >= 0; index--) {
    const tf = chain[index];
    const localOffset = rotateVector3(
      {
        x: tf.x * (scale / 100),
        y: tf.y * (scale / 100),
        z: tf.z * (scale / 100),
      },
      orientation
    );
    position = {
      x: position.x + localOffset.x,
      y: position.y + localOffset.y,
      z: position.z + localOffset.z,
    };
    orientation = normalizeQuaternion(
      quaternionMultiply(
        orientation,
        quaternionFromEuler(tf.rotationX, tf.rotationY, tf.rotation)
      )
    );
    scale = (scale * tf.scale) / 100;
    opacity = (opacity * tf.opacity) / 100;
  }

  const euler = quaternionToEuler(orientation);
  return {
    ...position,
    anchorX: chain[0]?.anchorX ?? 0,
    anchorY: chain[0]?.anchorY ?? 0,
    scale,
    rotation: euler.rotation,
    rotationX: euler.rotationX,
    rotationY: euler.rotationY,
    opacity,
    orientation,
  };
}

export interface CameraViewState {
  position: Vector3;
  inverseOrientation: Quaternion;
  focalPixels: number;
  nearClip: number;
  farClip: number;
}

/** Resolves the active camera's world pose and physical lens parameters once per frame. */
export function resolveCameraViewState(
  cameraClip: TimelineClip | null,
  allClips: TimelineClip[],
  globalTime: number,
  compWidth: number
): CameraViewState {
  let position: Vector3 = { x: 0, y: 0, z: -900 };
  let orientation = IDENTITY_QUATERNION;
  let focalLength = 35;
  let sensorWidth = 36;
  let nearClip = 10;
  let farClip = 100000;

  if (cameraClip?.cameraProps) {
    const props = cameraClip.cameraProps;
    const cameraWorld = resolveWorldTransform(cameraClip, allClips, globalTime);
    position = { x: cameraWorld.x, y: cameraWorld.y, z: -900 + cameraWorld.z };
    focalLength = clamp(props.focalLength || 35, 8, 300);
    sensorWidth = clamp(props.sensorWidth ?? 36, 18, 70);
    nearClip = clamp(props.nearClip ?? 10, 0.1, 1000);
    farClip = Math.max(nearClip + 1, props.farClip ?? 100000);

    if (props.useTarget) {
      const direction = {
        x: props.lookAtX - position.x,
        y: props.lookAtY - position.y,
        z: props.lookAtZ - position.z,
      };
      const horizontalLength = Math.max(0.0001, Math.hypot(direction.x, direction.z));
      const yaw = Math.atan2(direction.x, direction.z) * RAD;
      const pitch = -Math.atan2(direction.y, horizontalLength) * RAD;
      orientation = quaternionFromEuler(pitch, yaw, cameraWorld.rotation);
    } else {
      orientation = cameraWorld.orientation ?? quaternionFromEuler(
        cameraWorld.rotationX,
        cameraWorld.rotationY,
        cameraWorld.rotation
      );
    }
  }

  return {
    position,
    inverseOrientation: {
      x: -orientation.x,
      y: -orientation.y,
      z: -orientation.z,
      w: orientation.w,
    },
    focalPixels: (compWidth * focalLength) / sensorWidth,
    nearClip,
    farClip,
  };
}

/** Projects a point on a layer's local plane through the active camera. */
export function projectLayerPointThroughCamera(
  world: WorldTransform3D,
  cameraClip: TimelineClip | null,
  allClips: TimelineClip[],
  globalTime: number,
  compWidth: number,
  compHeight: number,
  localX: number,
  localY: number
): { x: number; y: number; depth: number; visible: boolean } {
  const camera = resolveCameraViewState(cameraClip, allClips, globalTime, compWidth);
  const localOffset = rotateVector3(
    {
      x: localX * world.scale / 100,
      y: localY * world.scale / 100,
      z: 0,
    },
    getWorldOrientation(world)
  );
  const worldPoint = {
    x: world.x + localOffset.x,
    y: world.y + localOffset.y,
    z: world.z + localOffset.z,
  };
  const view = rotateVector3(
    {
      x: worldPoint.x - camera.position.x,
      y: worldPoint.y - camera.position.y,
      z: worldPoint.z - camera.position.z,
    },
    camera.inverseOrientation
  );
  const visible = view.z >= camera.nearClip && view.z <= camera.farClip;
  if (!visible) return { x: 0, y: 0, depth: view.z, visible: false };
  return {
    x: compWidth / 2 + camera.focalPixels * view.x / view.z,
    y: compHeight / 2 + camera.focalPixels * view.y / view.z,
    depth: view.z,
    visible: true,
  };
}

export interface CameraProjectionResult {
  screenX: number;
  screenY: number;
  perspectiveScale: number;
  /** Local X/Y plane basis decomposed into Canvas2D rotate + shear + scale. */
  skewX: number;
  scaleX: number;
  scaleY: number;
  rotationRad: number;
  visible: boolean;
  depthZ: number;
}

/**
 * Physically based pinhole-camera projection for a 3D layer plane.
 * Camera +Z is forward, +Y is down, and all rotations (including camera roll)
 * are evaluated as quaternions. Focal length is interpreted against a 36mm sensor.
 */
export function projectLayerThroughCamera(
  world: WorldTransform3D,
  cameraClip: TimelineClip | null,
  allClips: TimelineClip[],
  globalTime: number,
  compWidth: number,
  compHeight: number
): CameraProjectionResult {
  const camera = resolveCameraViewState(cameraClip, allClips, globalTime, compWidth);
  const cameraPosition = camera.position;
  const cameraInverse = camera.inverseOrientation;
  const focalPx = camera.focalPixels;
  const nearClip = camera.nearClip;
  const farClip = camera.farClip;
  const relative = {
    x: world.x - cameraPosition.x,
    y: world.y - cameraPosition.y,
    z: world.z - cameraPosition.z,
  };
  const viewCenter = rotateVector3(relative, cameraInverse);
  const focalPx = (compWidth * focalLength) / sensorWidth;
  const depth = viewCenter.z;
  const safeDepth = Math.max(nearClip, depth);
  const perspectiveScale = focalPx / safeDepth;

  const worldAxisX = rotateVector3({ x: 1, y: 0, z: 0 }, getWorldOrientation(world));
  const worldAxisY = rotateVector3({ x: 0, y: 1, z: 0 }, getWorldOrientation(world));
  const viewAxisX = rotateVector3(worldAxisX, cameraInverse);
  const viewAxisY = rotateVector3(worldAxisY, cameraInverse);
  const layerScale = world.scale / 100;
  const ux = viewAxisX.x * layerScale;
  const uy = viewAxisX.y * layerScale;
  const uz = viewAxisX.z * layerScale;
  const vx = viewAxisY.x * layerScale;
  const vy = viewAxisY.y * layerScale;
  const vz = viewAxisY.z * layerScale;

  // Differential of the perspective divide at the layer origin.
  const depthSquared = safeDepth * safeDepth;
  const a = focalPx * (ux * safeDepth - viewCenter.x * uz) / depthSquared;
  const b = focalPx * (uy * safeDepth - viewCenter.y * uz) / depthSquared;
  const c = focalPx * (vx * safeDepth - viewCenter.x * vz) / depthSquared;
  const d = focalPx * (vy * safeDepth - viewCenter.y * vz) / depthSquared;
  const rotationRad = Math.atan2(b, a);
  const cosRotation = Math.cos(rotationRad);
  const sinRotation = Math.sin(rotationRad);
  const scaleXActual = Math.hypot(a, b);
  const shearX = cosRotation * c + sinRotation * d;
  const scaleYActual = -sinRotation * c + cosRotation * d;

  return {
    screenX: compWidth / 2 + viewCenter.x * perspectiveScale,
    screenY: compHeight / 2 + viewCenter.y * perspectiveScale,
    perspectiveScale,
    scaleX: scaleXActual / Math.max(0.0001, perspectiveScale),
    scaleY: scaleYActual / Math.max(0.0001, perspectiveScale),
    skewX: Math.abs(scaleYActual) > 0.0001 ? shearX / scaleYActual : 0,
    rotationRad,
    visible: depth >= nearClip && depth <= farClip,
    depthZ: depth,
  };
}

export interface LightShading {
  brightnessFactor: number; // 0.25 .. 1.6
  tintColor: string;
  tintAlpha: number; // 0 .. 0.5
}

/** Computes diffuse + ambient + point/spot attenuation from active 3D Light layers. */
export function computeLightShading(
  layerWorld: WorldTransform3D,
  lights: TimelineClip[],
  allClips: TimelineClip[],
  globalTime: number
): LightShading {
  if (lights.length === 0) {
    return { brightnessFactor: 1, tintColor: '#ffffff', tintAlpha: 0 };
  }

  let totalLight = 0.22;
  let dominantTint = '#ffffff';
  let highestContribution = 0;
  const normal = rotateVector3({ x: 0, y: 0, z: -1 }, getWorldOrientation(layerWorld));

  for (const light of lights) {
    const props = light.lightProps;
    if (!props) continue;
    const lightWorld = resolveWorldTransform(light, allClips, globalTime);
    const intensity = clamp(props.intensity / 100, 0, 2);

    if (props.lightType === 'ambient') {
      totalLight += 0.65 * intensity;
      if (intensity > highestContribution) {
        highestContribution = intensity;
        dominantTint = props.color;
      }
      continue;
    }

    const lightPosition = { x: lightWorld.x, y: lightWorld.y, z: -420 + lightWorld.z };
    const vector = {
      x: lightPosition.x - layerWorld.x,
      y: lightPosition.y - layerWorld.y,
      z: lightPosition.z - layerWorld.z,
    };
    const distance = Math.max(1, Math.hypot(vector.x, vector.y, vector.z));
    const direction = {
      x: vector.x / distance,
      y: vector.y / distance,
      z: vector.z / distance,
    };
    const diffuse = Math.max(0, normal.x * direction.x + normal.y * direction.y + normal.z * direction.z);
    const falloff = props.lightType === 'parallel'
      ? 1
      : clamp(680 / (distance + 220), 0.25, 1.35);

    let spotFactor = 1;
    if (props.lightType === 'spot') {
      const radial = Math.hypot(vector.x, vector.y);
      const spread = Math.tan(((props.coneAngle * 0.5) * DEG)) * Math.max(200, Math.abs(vector.z));
      spotFactor = clamp(1 - radial / Math.max(80, spread * 1.4), 0.08, 1);
    }

    const contribution = diffuse * intensity * falloff * spotFactor;
    totalLight += contribution;
    if (contribution > highestContribution && props.color.toLowerCase() !== '#ffffff') {
      highestContribution = contribution;
      dominantTint = props.color;
    }
  }

  return {
    brightnessFactor: clamp(totalLight, 0.25, 1.65),
    tintColor: dominantTint,
    tintAlpha: dominantTint.toLowerCase() === '#ffffff'
      ? 0
      : clamp(highestContribution * 0.24, 0, 0.42),
  };
}

/** Computes screen-space center when a layer uses an anchor offset. */
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
  if (anchorX === 0 && anchorY === 0) return { screenCx: cx, screenCy: cy };
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

/** Applies a Rec.709 luma matte in-place on RGBA image pixels. */
export function applyLumaMatteToPixels(
  targetRgba: Uint8ClampedArray,
  matteRgba: Uint8ClampedArray
): void {
  const length = Math.min(targetRgba.length, matteRgba.length);
  for (let index = 0; index < length; index += 4) {
    const r = matteRgba[index];
    const g = matteRgba[index + 1];
    const b = matteRgba[index + 2];
    const alpha = matteRgba[index + 3] / 255;
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    targetRgba[index + 3] = Math.round(targetRgba[index + 3] * luma * alpha);
  }
}
