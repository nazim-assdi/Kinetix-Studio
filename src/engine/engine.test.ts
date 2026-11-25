import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTimecode, snapToFrame, findSnapTime } from './timecode';
import {
  interpolateKeyframes,
  evaluateClipTransform,
  upsertKeyframe,
  togglePropertyKeyframing,
  solveCubicBezier,
  getClipLocalTime,
} from './keyframes';
import {
  splitClipAtTime,
  trimClipEdge,
  createEffectInstance,
  EFFECT_LIBRARY,
  rippleDeleteClip,
  duplicateClip,
  freezeFrameClip,
} from './timelineOps';
import {
  resolveWorldTransform,
  projectLayerThroughCamera,
  computeLightShading,
  computeAnchorScreenCenter,
  applyLumaMatteToPixels,
} from './math3d';
import { applyMotionPresetToClip } from '../data/motionPresets';
import { MEGA_CATALOG, DAVINCI_LUTS } from '../data/megaCatalog';
import {
  parsePsdLayersFromBuffer,
  parseIllustratorLayersFromText,
} from './layerImporter';
import { analyzeMotionTrack, applyTrackPointsToTargetClip } from './motionTracker';
import { evaluateExpression, validateExpressionSyntax } from './expressions';
import { computeVideoScopes, generateSrtSubtitles } from './scopes';
import { TimelineClip } from '../types/editor';

function makeClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'clip_test',
    assetId: 'asset_1',
    trackId: 'track_v1',
    name: 'Test Clip',
    kind: 'image',
    start: 2,
    duration: 4,
    sourceIn: 0,
    is3D: false,
    blendMode: 'normal',
    transform: {
      x: 0,
      y: 0,
      z: 0,
      scale: 100,
      rotation: 0,
      rotationX: 0,
      rotationY: 0,
      opacity: 100,
    },
    keyframes: {},
    effects: [],
    volume: 100,
    fadeIn: 0,
    fadeOut: 0,
    colorLabel: '#3B82F6',
    ...overrides,
  };
}

test('SMPTE timecode formats 30fps accurately', () => {
  assert.equal(formatTimecode(0, 30), '00:00:00:00');
  assert.equal(formatTimecode(1.5, 30), '00:00:01:15');
  assert.equal(formatTimecode(65.1, 30), '00:01:05:03');
});

test('snapToFrame rounds to nearest frame boundary', () => {
  assert.equal(snapToFrame(1.01, 30), 1);
  assert.equal(Math.abs(snapToFrame(0.5, 30) - 0.5) < 1e-6, true);
});

test('findSnapTime snaps to playhead and adjacent clip edges', () => {
  const other = makeClip({ id: 'other', start: 5, duration: 3 });
  assert.equal(findSnapTime(4.92, [other], 'moving', 10, 0.15), 5);
  assert.equal(findSnapTime(7.9, [other], 'moving', 10, 0.15), 8);
  assert.equal(findSnapTime(2.92, [other], 'moving', 10, 0.15, 2), 3);
});

test('interpolateKeyframes and solveCubicBezier compute linear and custom curves', () => {
  const kfs = [
    { id: 'k1', time: 0, value: 0, easing: 'linear' as const },
    { id: 'k2', time: 2, value: 100, easing: 'linear' as const },
  ];
  assert.equal(interpolateKeyframes(kfs, 1, 50), 50);

  const bez = solveCubicBezier(0.5, 0.16, 1, 0.3, 1);
  assert.ok(bez > 0.8 && bez <= 1);
});

test('togglePropertyKeyframing seeds and freezes keyframes cleanly', () => {
  let clip = makeClip({
    transform: { x: 120, y: 0, z: 0, scale: 100, rotation: 0, rotationX: 0, rotationY: 0, opacity: 100 },
  });
  clip = togglePropertyKeyframing(clip, 'x', 1.0);
  assert.equal(clip.keyframes.x?.length, 1);
  clip = upsertKeyframe(clip, 'x', 3.0, 240);
  assert.equal(evaluateClipTransform(clip, 4.0).x, 180);
  clip = togglePropertyKeyframing(clip, 'x', 2.0);
  assert.equal(clip.keyframes.x, undefined);
  assert.equal(clip.transform.x, 180);
});

test('splitClipAtTime splits clip and preserves 3D keyframes', () => {
  let clip = makeClip({ start: 1, duration: 4, is3D: true });
  clip = upsertKeyframe(clip, 'rotationY', 0, 0, 'linear');
  clip = upsertKeyframe(clip, 'rotationY', 4, 90, 'linear');

  const result = splitClipAtTime(clip, 3);
  assert.ok(result);
  const [left, right] = result;
  assert.equal(evaluateClipTransform(left, 3).rotationY, 45);
  assert.equal(evaluateClipTransform(right, 3).rotationY, 45);
});

test('trimClipEdge adjusts right and left edges while shifting keyframes', () => {
  let clip = makeClip({ start: 2, duration: 6, sourceIn: 1 });
  clip = upsertKeyframe(clip, 'scale', 2, 120, 'linear');
  const trimmedLeft = trimClipEdge(clip, 'left', 3);
  assert.equal(trimmedLeft.start, 3);
  assert.equal(trimmedLeft.keyframes.scale?.[0].time, 1);
});

test('resolveWorldTransform inherits Null parent position and scale', () => {
  const nullParent = makeClip({
    id: 'null_1',
    kind: 'null',
    transform: { x: 100, y: -50, z: 20, scale: 150, rotation: 0, rotationX: 0, rotationY: 0, opacity: 100 },
  });
  const child = makeClip({
    id: 'child_1',
    parentId: 'null_1',
    transform: { x: 40, y: 0, z: 0, scale: 100, rotation: 0, rotationX: 0, rotationY: 0, opacity: 80 },
  });
  const world = resolveWorldTransform(child, [nullParent, child], 3);
  assert.equal(world.x, 160); // 100 + 40 * 1.5
  assert.equal(world.y, -50);
  assert.equal(world.scale, 150);
  assert.equal(world.opacity, 80);
});

test('projectLayerThroughCamera and computeLightShading compute 3D depth and light', () => {
  const cam = makeClip({
    id: 'cam_1',
    kind: 'camera',
    is3D: true,
    cameraProps: { fov: 60, focalLength: 35, lookAtX: 0, lookAtY: 0, lookAtZ: 0, depthOfField: false, aperture: 2.8 },
  });
  const light = makeClip({
    id: 'light_1',
    kind: 'light',
    is3D: true,
    lightProps: { lightType: 'spot', color: '#60A5FA', intensity: 120, coneAngle: 70, falloff: 40, castShadows: true },
  });
  const layerWorld = { x: 0, y: 0, z: 100, scale: 100, rotation: 0, rotationX: 0, rotationY: 0, opacity: 100 };
  const proj = projectLayerThroughCamera(layerWorld, cam, [cam], 3, 1280, 720);
  assert.equal(proj.visible, true);
  assert.ok(proj.screenX === 640 && proj.screenY === 360);

  const shade = computeLightShading(layerWorld, [light], [light], 3);
  assert.ok(shade.brightnessFactor > 0.5);
  assert.equal(shade.tintColor, '#60A5FA');
});

test('EFFECT_LIBRARY has 18 effects including Chroma Key and Halation, and applyMotionPresetToClip configures presets', () => {
  assert.equal(EFFECT_LIBRARY.length, 18);
  assert.ok(createEffectInstance('lensflare').type === 'lensflare');
  assert.ok(createEffectInstance('chromakey').type === 'chromakey');
  assert.ok(createEffectInstance('halation').type === 'halation');
  const clip = makeClip({ duration: 4 });
  const flipped = applyMotionPresetToClip(clip, 'flip_3d_in');
  assert.equal(flipped.is3D, true);
  assert.ok((flipped.keyframes.rotationY?.length ?? 0) >= 2);
});

test('MEGA_CATALOG contains 1000+ presets, transitions with SFX, and DaVinci LUTs', () => {
  assert.ok(MEGA_CATALOG.length >= 1000, `Expected >=1000 items, got ${MEGA_CATALOG.length}`);
  const sfxTransitions = MEGA_CATALOG.filter(
    (item) => item.category === 'Transition' && Boolean(item.sfxPreset)
  );
  assert.ok(sfxTransitions.length >= 100);
  assert.ok(DAVINCI_LUTS.length >= 6);
});

test('parsePsdLayersFromBuffer extracts binary 8BPS PSD layers and parseIllustratorLayersFromText extracts AI vector paths', () => {
  // Construct minimal valid 8BPS PSD buffer with 1 layer ("HeroTitle")
  const buf = new ArrayBuffer(128);
  const view = new DataView(buf);
  // '8BPS'
  view.setUint8(0, 56);
  view.setUint8(1, 66);
  view.setUint8(2, 80);
  view.setUint8(3, 83);
  view.setUint16(4, 1, false); // version 1
  view.setUint16(12, 4, false); // channels
  view.setUint32(14, 720, false); // height
  view.setUint32(18, 1280, false); // width
  view.setUint16(22, 8, false); // depth
  view.setUint32(26, 0, false); // color mode len = 0
  view.setUint32(30, 0, false); // img resources len = 0

  // Layer & Mask Info section at offset 34
  let p = 34;
  view.setUint32(p, 64, false); p += 4; // layerMaskLen
  view.setUint32(p, 56, false); p += 4; // layerInfoLen
  view.setInt16(p, 1, false); p += 2;   // layerCount = 1
  view.setInt32(p, 10, false); p += 4;  // top
  view.setInt32(p, 20, false); p += 4;  // left
  view.setInt32(p, 210, false); p += 4; // bottom
  view.setInt32(p, 420, false); p += 4; // right
  view.setUint16(p, 0, false); p += 2;  // 0 channels for metadata test
  p += 12; // 8BIM + blend + opacity + flags
  view.setUint32(p, 20, false); p += 4; // extraLen
  view.setUint32(p, 0, false); p += 4;  // maskDataLen
  view.setUint32(p, 0, false); p += 4;  // blendRangeLen
  const name = 'HeroTitle';
  view.setUint8(p++, name.length);
  for (let i = 0; i < name.length; i++) {
    view.setUint8(p++, name.charCodeAt(i));
  }

  const psdLayers = parsePsdLayersFromBuffer(buf, 'banner.psd');
  assert.equal(psdLayers.length, 1);
  assert.ok(psdLayers[0].name.includes('HeroTitle'));

  const aiText = `%!PS-Adobe-3.0\n100 200 m\n300 200 l\n300 400 l\nf\n`;
  const aiLayers = parseIllustratorLayersFromText(aiText, 'logo.ai');
  assert.equal(aiLayers.length, 1);
  assert.equal(aiLayers[0].kind, 'path');
  assert.equal(aiLayers[0].defaultPath?.points.length, 3);
});

test('analyzeMotionTrack and applyTrackPointsToTargetClip generate tracking keyframes', () => {
  const source = makeClip({ start: 0, duration: 4 });
  const points = analyzeMotionTrack(source, 50, -30, 30);
  assert.ok(points.length >= 4);
  const overlay = makeClip({ id: 'overlay_txt', kind: 'text', duration: 4 });
  const tracked = applyTrackPointsToTargetClip(overlay, points);
  assert.equal(tracked.keyframes.x?.length, points.length);
  assert.equal(tracked.keyframes.y?.length, points.length);
});

test('AE expression engine evaluates wiggle, loopOut, math, and rejects unsafe syntax', () => {
  const ctx = { time: 1.5, localTime: 1.5, duration: 4, value: 100 };
  const wig = evaluateExpression('value + wiggle(3, 25)', ctx);
  assert.ok(Number.isFinite(wig) && wig >= 75 && wig <= 125 && wig !== 100);

  const looped = evaluateExpression('loopOut(2) * 10', { ...ctx, localTime: 3.0 });
  assert.equal(looped, 1250);

  assert.equal(validateExpressionSyntax('wiggle(4, 20)'), true);
  assert.equal(validateExpressionSyntax('window.location'), false);
  assert.equal(evaluateExpression('globalThis.process', ctx), 100);
});

test('computeVideoScopes computes luma histogram/waveform/parade/vectorscope and generateSrtSubtitles formats SRT', () => {
  const rgba = new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
  ]);
  const scopes = computeVideoScopes(rgba, 2, 2);
  assert.equal(scopes.histogram.luma.length, 32);
  assert.equal(scopes.waveform.length, 48);
  assert.ok(scopes.peakLuma >= 90);
  assert.ok(scopes.vectorscope.length > 0);

  const srt = generateSrtSubtitles([
    { id: 'c1', start: 0.5, end: 2.25, text: 'Hello Kinetix' },
  ]);
  assert.ok(srt.includes('00:00:00,500 --> 00:00:02,250'));
  assert.ok(srt.includes('Hello Kinetix'));
});

test('rippleDeleteClip, duplicateClip, and freezeFrameClip preserve NLE invariants', () => {
  const c1 = makeClip({ id: 'c1', start: 0, duration: 2, trackId: 'track_v1' });
  const c2 = makeClip({ id: 'c2', start: 3, duration: 2, trackId: 'track_v1' });
  const cOther = makeClip({ id: 'c3', start: 4, duration: 2, trackId: 'track_v2' });

  const rippled = rippleDeleteClip([c1, c2, cOther], 'c1');
  assert.equal(rippled.length, 2);
  assert.equal(rippled.find((c) => c.id === 'c2')?.start, 1);
  assert.equal(rippled.find((c) => c.id === 'c3')?.start, 4);

  const dup = duplicateClip(c1);
  assert.notEqual(dup.id, c1.id);
  assert.ok(dup.start > c1.start);

  const fz = freezeFrameClip(c1, 1.2, {
    x: 42,
    y: 0,
    z: 0,
    scale: 100,
    rotation: 0,
    rotationX: 0,
    rotationY: 0,
    opacity: 100,
  });
  assert.equal(fz.transform.x, 42);
  assert.equal(fz.speed, 0.25);
});

test('computeAnchorScreenCenter and applyLumaMatteToPixels compute accurate geometry center and luma mattes', () => {
  const noAnchor = computeAnchorScreenCenter(640, 360, 0, 0, 1, 1, 0);
  assert.equal(noAnchor.screenCx, 640);
  assert.equal(noAnchor.screenCy, 360);

  // Anchor offset (100, 0) rotated 90 deg at scale 1.5 -> (-150, 0) rotated 90 deg = (0, -150)
  const rotated = computeAnchorScreenCenter(640, 360, 100, 0, 1.5, 1.5, Math.PI / 2);
  assert.ok(Math.abs(rotated.screenCx - 640) < 1e-6);
  assert.ok(Math.abs(rotated.screenCy - 210) < 1e-6);

  const target = new Uint8ClampedArray([
    255, 255, 255, 255,
    255, 255, 255, 255,
  ]);
  const matte = new Uint8ClampedArray([
    255, 255, 255, 255, // Full white opaque -> keeps 255 alpha
    0, 0, 0, 255,       // Black opaque -> 0 alpha
  ]);
  applyLumaMatteToPixels(target, matte);
  assert.equal(target[3], 255);
  assert.equal(target[7], 0);
});

test('getClipLocalTime handles speed multiplier and reversed playback', () => {
  const fast = makeClip({ start: 2, duration: 4, speed: 2 });
  assert.equal(getClipLocalTime(fast, 3), 2);

  const rev = makeClip({ start: 2, duration: 4, reversed: true, speed: 1 });
  assert.equal(getClipLocalTime(rev, 3), 3);
});

