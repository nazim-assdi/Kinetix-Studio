import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTimecode, snapToFrame, findSnapTime } from './timecode';
import { createTimelineTransition, findAdjacentOutgoingClip, resolveTransitionPairForClip, getTransitionProgress } from './transitions';
import {
  interpolateKeyframes,
  evaluateClipTransform,
  moveKeyframe,
  upsertKeyframe,
  togglePropertyKeyframing,
  solveCubicBezier,
  getClipLocalTime,
  getClipSpeedAtLocalTime,
  getClipSourceElapsedTime,
} from './keyframes';
import {
  splitClipAtTime,
  trimClipEdge,
  createEffectInstance,
  dedupeEffectStack,
  EFFECT_LIBRARY,
  rippleDeleteClip,
  duplicateClip,
  freezeFrameClip,
} from './timelineOps';
import {
  resolveWorldTransform,
  projectLayerThroughCamera,
  projectLayerPointThroughCamera,
  resolveCameraViewState,
  computeLightShading,
  computeAnchorScreenCenter,
  applyLumaMatteToPixels,
  quaternionFromEuler,
  rotateVector3,
} from './math3d';
import { applyMotionPresetToClip } from '../data/motionPresets';
import { applyCatalogMotionVariant, buildCatalogColorGrade } from './catalogVariants';
import { MEGA_CATALOG, DAVINCI_LUTS } from '../data/megaCatalog';
import { SFX_LIBRARY } from '../data/sfxLibrary';
import {
  parsePsdLayersFromBuffer,
  parseIllustratorLayersFromText,
} from './layerImporter';
import { analyzeMotionTrack, applyTrackPointsToTargetClip } from './motionTracker';
import { evaluateExpression, validateExpressionSyntax } from './expressions';
import { computeVideoScopes, generateSrtSubtitles } from './scopes';
import { parseSrtSubtitles } from './srt';
import { muxWebMVideo } from './webmMuxer';
import { TimelineClip } from '../types/editor';
import { TEXT_ANIMATORS, getTextAnimatorDefinition } from '../data/textAnimators';
import { COLOR_PALETTES } from '../data/colorPalettes';
import { addFusionConnection, createDefaultFusionGraph, mergeFusionGraphWithClip, orderFusionEffectIds, wouldCreateFusionCycle } from './fusionGraph';

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


test('edit-point transitions resolve only adjacent clips on the same track', () => {
  const outgoing = makeClip({ id: 'outgoing', trackId: 'track_v1', start: 0, duration: 3 });
  const incoming = makeClip({ id: 'incoming', trackId: 'track_v1', start: 3, duration: 4 });
  const wrongTrack = makeClip({ id: 'wrong-track', trackId: 'track_v2', start: 3, duration: 2 });
  assert.equal(findAdjacentOutgoingClip([outgoing, incoming, wrongTrack], incoming, 30)?.id, 'outgoing');
  assert.equal(resolveTransitionPairForClip([outgoing, incoming], outgoing, 30)?.incoming.id, 'incoming');
  assert.equal(findAdjacentOutgoingClip([outgoing, { ...incoming, start: 3.2 }], incoming, 30), null);
});

test('transition preset maps to a real edit-point style and computes centered progress', () => {
  const transition = createTimelineTransition({
    id: 'mega_tr_test',
    name: 'Cyber Glitch Cut · From Left · Medium',
    vendor: 'FX',
    category: 'Transition',
    description: 'test transition',
    accentColor: '#F43F5E',
    motionVariant: { direction: 'left', duration: 0.6, intensity: 1 },
  }, 30);
  assert.equal(transition.style, 'wipe');
  assert.equal(transition.duration, 0.6);
  assert.equal(getTransitionProgress(transition, 5, 4.7), 0);
  assert.equal(getTransitionProgress(transition, 5, 5), 0.5);
  assert.equal(getTransitionProgress(transition, 5, 5.3), 1);
});

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

test('moveKeyframe updates one keyframe repeatedly and keeps the list ordered', () => {
  let clip = makeClip({
    keyframes: {
      x: [
        { id: 'left', time: 0, value: 0, easing: 'linear' },
        { id: 'middle', time: 1, value: 100, easing: 'bezier', bezier: [0.16, 1, 0.3, 1] },
        { id: 'right', time: 2, value: 200, easing: 'linear' },
      ],
    },
  });

  clip = moveKeyframe(clip, 'x', 'middle', 1.5, 140);
  assert.deepEqual(clip.keyframes.x?.map((keyframe) => [keyframe.id, keyframe.time, keyframe.value]), [
    ['left', 0, 0],
    ['right', 2, 200],
    ['middle', 1.5, 140],
  ].sort((a, b) => Number(a[1]) - Number(b[1])));

  clip = moveKeyframe(clip, 'x', 'middle', 0.5, 60);
  assert.deepEqual(clip.keyframes.x?.map((keyframe) => [keyframe.id, keyframe.time, keyframe.value]), [
    ['left', 0, 0],
    ['middle', 0.5, 60],
    ['right', 2, 200],
  ]);
  assert.deepEqual(clip.keyframes.x?.[1].bezier, [0.16, 1, 0.3, 1]);
  assert.equal(moveKeyframe(clip, 'x', 'missing', 1, 50), clip);
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

test('adjacent-frame keyframes are preserved and shape dimensions can be animated', () => {
  const shape = makeClip({
    kind: 'shape',
    shapeProps: {
      shapeType: 'rect',
      width: 200,
      height: 120,
      fillColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 0,
      cornerRadius: 0,
    },
  });
  let clip = upsertKeyframe(shape, 'x', 1, 10, 'linear');
  clip = upsertKeyframe(clip, 'x', 1 + 1 / 60, 20, 'linear');
  assert.equal(clip.keyframes.x?.length, 2, 'a 60fps neighbouring frame must not overwrite the prior key');

  clip = upsertKeyframe(clip, 'shapeWidth', 0, 100, 'linear');
  clip = upsertKeyframe(clip, 'shapeWidth', 2, 300, 'linear');
  assert.equal(evaluateClipTransform(clip, 3).shapeWidth, 200);
  clip = togglePropertyKeyframing(clip, 'shapeWidth', 1);
  assert.equal(clip.keyframes.shapeWidth, undefined);
  assert.ok(Math.abs((clip.shapeProps?.width ?? 0) - 200) < 0.01, 'stopping size keyframing must freeze the evaluated width into the shape');
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

test('splitting a clip keeps its incoming transition only on the original left segment', () => {
  const incomingTransition = {
    id: 'transition_existing',
    presetId: 'crossfade',
    name: 'Cross Dissolve',
    style: 'cross-dissolve' as const,
    direction: 'left' as const,
    duration: 0.6,
    intensity: 1,
  };
  const clip = makeClip({ start: 2, duration: 6, transitionIn: incomingTransition });
  const result = splitClipAtTime(clip, 5);
  assert.ok(result);
  const [left, right] = result;
  assert.equal(left.transitionIn?.id, 'transition_existing');
  assert.equal(right.transitionIn, undefined);
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

test('3D parent hierarchy composes pitch, yaw and roll in world space', () => {
  const parent = makeClip({
    id: 'parent_3d',
    kind: 'null',
    transform: { x: 10, y: 20, z: 30, scale: 150, rotation: 0, rotationX: 0, rotationY: 90, opacity: 100 },
  });
  const child = makeClip({
    id: 'child_3d',
    parentId: 'parent_3d',
    is3D: true,
    transform: { x: 100, y: 0, z: 0, scale: 100, rotation: 0, rotationX: 0, rotationY: 0, opacity: 100 },
  });
  const world = resolveWorldTransform(child, [parent, child], 2);
  assert.ok(Math.abs(world.x - 10) < 0.001);
  assert.ok(Math.abs(world.y - 20) < 0.001);
  assert.ok(Math.abs(world.z + 120) < 0.001, 'parent yaw must rotate child X offset into world depth');
  assert.ok(Math.abs(world.rotationY - 90) < 0.001);

  const rotated = rotateVector3({ x: 0, y: 1, z: 0 }, quaternionFromEuler(90, 0, 0));
  assert.ok(Math.abs(rotated.y) < 0.001);
  assert.ok(Math.abs(rotated.z - 1) < 0.001);
});

test('physical camera lens, near/far clipping, roll and target aim affect projection', () => {
  const makeCamera = (overrides: Partial<NonNullable<TimelineClip['cameraProps']>> = {}) =>
    makeClip({
      id: 'physical_camera',
      kind: 'camera',
      is3D: true,
      cameraProps: {
        fov: 60,
        focalLength: 36,
        sensorWidth: 36,
        lookAtX: 0,
        lookAtY: 0,
        lookAtZ: 0,
        depthOfField: false,
        aperture: 2.8,
        ...overrides,
      },
    });
  const world = resolveWorldTransform(makeClip({ is3D: true }), [], 2);
  const normalCamera = makeCamera();
  const base = projectLayerThroughCamera(world, normalCamera, [normalCamera], 2, 1280, 720);
  assert.equal(base.visible, true);
  assert.ok(Math.abs(base.screenX - 640) < 0.001);
  assert.ok(Math.abs(base.screenY - 360) < 0.001);

  const telephoto = makeCamera({ focalLength: 100 });
  const tele = projectLayerThroughCamera(world, telephoto, [telephoto], 2, 1280, 720);
  assert.ok(tele.perspectiveScale > base.perspectiveScale, 'longer focal length must magnify');

  const clipped = makeCamera({ nearClip: 950, farClip: 1200 });
  assert.equal(projectLayerThroughCamera(world, clipped, [clipped], 2, 1280, 720).visible, false);
  const beyondFar = makeCamera({ nearClip: 10, farClip: 800 });
  assert.equal(projectLayerThroughCamera(world, beyondFar, [beyondFar], 2, 1280, 720).visible, false);

  const rollCamera = makeCamera();
  rollCamera.transform.rotation = 90;
  const rolled = projectLayerThroughCamera(
    world,
    rollCamera,
    [rollCamera],
    2,
    1280,
    720
  );
  const rightOfCenter = resolveWorldTransform(makeClip({
    transform: { x: 100, y: 0, z: 0, scale: 100, rotation: 0, rotationX: 0, rotationY: 0, opacity: 100 },
    is3D: true,
  }), [], 2);
  const rollProbe = projectLayerThroughCamera(rightOfCenter, rollCamera, [rollCamera], 2, 1280, 720);
  assert.ok(rollProbe.screenY < 360, 'camera roll rotates horizontal world motion into screen vertical motion');

  const targetCamera = makeCamera({
    useTarget: true,
    lookAtX: 500,
    lookAtY: 0,
    lookAtZ: 0,
  });
  const targetWorld = resolveWorldTransform(makeClip({
    transform: { x: 500, y: 0, z: 0, scale: 100, rotation: 0, rotationX: 0, rotationY: 0, opacity: 100 },
    is3D: true,
  }), [], 2);
  const targetProjection = projectLayerThroughCamera(targetWorld, targetCamera, [targetCamera], 2, 1280, 720);
  assert.ok(Math.abs(targetProjection.screenX - 640) < 0.01, 'look-at target should sit on the optical axis');
});

test('3D plane vertices project with local depth and shared physical camera state', () => {
  const camera = makeClip({
    id: 'mesh_camera',
    kind: 'camera',
    is3D: true,
    cameraProps: {
      fov: 60,
      focalLength: 36,
      sensorWidth: 36,
      lookAtX: 0,
      lookAtY: 0,
      lookAtZ: 0,
      depthOfField: false,
      aperture: 2.8,
    },
  });
  const layer = resolveWorldTransform(makeClip({ is3D: true }), [], 0);
  const cameraState = resolveCameraViewState(camera, [camera], 0, 1280);
  const flat = projectLayerPointThroughCamera(
    layer, camera, [camera], 0, 1280, 720, 120, 0, 0, cameraState
  );
  const extrudedFront = projectLayerPointThroughCamera(
    layer, camera, [camera], 0, 1280, 720, 120, 0, 100, cameraState
  );
  assert.equal(flat.visible, true);
  assert.equal(extrudedFront.visible, true);
  assert.ok(extrudedFront.depth > flat.depth, 'positive local Z moves vertices away from the camera');
  assert.ok(extrudedFront.x < flat.x, 'greater depth reduces the apparent offset of off-center vertices');
  assert.ok(extrudedFront.y === 360);
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

test('duplicate effect instances are removed by shader type while different effects remain', () => {
  const firstBlur = createEffectInstance('blur');
  const secondBlur = { ...createEffectInstance('blur'), name: 'Duplicate Blur' };
  const glow = createEffectInstance('glow');
  const unique = dedupeEffectStack([firstBlur, secondBlur, glow]);
  assert.deepEqual(unique.map((effect) => effect.type), ['blur', 'glow']);
  assert.equal(unique[0].id, firstBlur.id);
});

test('MEGA_CATALOG contains 1000+ presets, transitions with SFX, and DaVinci LUTs', () => {
  assert.ok(MEGA_CATALOG.length >= 1000, `Expected >=1000 items, got ${MEGA_CATALOG.length}`);
  const sfxTransitions = MEGA_CATALOG.filter(
    (item) => item.category === 'Transition' && Boolean(item.sfxPreset)
  );
  assert.ok(sfxTransitions.length >= 100);
  assert.ok(DAVINCI_LUTS.length >= 6);
  assert.ok(MEGA_CATALOG.every((item) => item.vendor === 'FX'));
});

test('creative library exposes thousands of unique catalog entries with expanded asset categories', () => {
  assert.ok(MEGA_CATALOG.length > 8000 && MEGA_CATALOG.length <= 8474, `Expected duplicate-free catalog, got ${MEGA_CATALOG.length}`);
  const effectSignatures = MEGA_CATALOG
    .filter((item) => item.category === 'Effects' && item.effectType)
    .map((item) => `${item.effectType}:${JSON.stringify(Object.entries(item.effectParams ?? {}).sort(([a], [b]) => a.localeCompare(b)))}`);
  assert.equal(new Set(effectSignatures).size, effectSignatures.length, 'Effect presets must not repeat identical shader settings');
  assert.equal(new Set(MEGA_CATALOG.map((item) => item.id)).size, MEGA_CATALOG.length);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Shapes').length, 1680);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Titles').length, 100);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Particles').length, 300);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Visualizers').length, 120);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Backgrounds').length, 340);
  assert.equal(MEGA_CATALOG.filter((item) => item.assetTemplate || item.assetTemplates?.length).length, 6220);
  assert.equal(MEGA_CATALOG.filter((item) => item.assetTemplates?.length).length, 3920);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Icons').length, 640);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Frames').length, 480);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Callouts').length, 560);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Dividers').length, 640);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Captions').length, 160);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Infographics').length, 240);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Social Kits').length, 240);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'UI Elements').length, 240);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Decorative').length, 480);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Backgrounds').length, 340);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Textures').length, 192);
  assert.ok(MEGA_CATALOG.filter((item) => item.category === 'Icons').every((item) => item.assetTemplates?.some((layer) => layer.kind === 'path')));
  assert.ok(MEGA_CATALOG.filter((item) => item.category === 'Captions').every((item) => item.assetTemplates?.some((layer) => layer.kind === 'caption')));
  assert.ok(MEGA_CATALOG.filter((item) => item.assetTemplates && item.assetTemplates.length > 1).length > 2500);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Animation' && item.motionVariant).length, 1400);
  assert.equal(MEGA_CATALOG.filter((item) => item.category === 'Transition' && item.motionVariant).length, 240);
});

test('catalog motion variants change direction, strength, timing and LUT grade', () => {
  const leftPreset = MEGA_CATALOG.find((item) =>
    item.category === 'Animation' && item.motionVariant?.direction === 'left'
  );
  assert.ok(leftPreset?.basePresetId && leftPreset.motionVariant);
  const source = makeClip({ duration: 4, transform: { ...makeClip().transform, x: 30, y: -20 } });
  const animated = applyCatalogMotionVariant(
    applyMotionPresetToClip(source, leftPreset.basePresetId),
    leftPreset.motionVariant
  );
  assert.equal(animated.keyframes.x?.length, 2);
  assert.ok((animated.keyframes.x?.[0].value ?? 0) < source.transform.x);
  assert.equal(animated.keyframes.x?.[1].value, source.transform.x);
  assert.equal(animated.keyframes.x?.[1].time, leftPreset.motionVariant.duration);

  const lutPreset = MEGA_CATALOG.find((item) =>
    item.category === 'Color LUT' && item.lutStrength === 0.5 && item.lutMood === 'sci-fi'
  );
  assert.ok(lutPreset?.lutName);
  const lut = DAVINCI_LUTS.find((item) => item.name === lutPreset.lutName);
  assert.ok(lut);
  const grade = buildCatalogColorGrade(lutPreset, lut.grade);
  assert.equal(grade.enabled, true);
  assert.ok(grade.lut.includes('sci-fi'));
  assert.ok(grade.lut.includes('50%'));
  assert.notEqual(grade.contrast, lut.grade.contrast);
});

test('SFX library contains 100 unique draggable presets', () => {
  assert.equal(SFX_LIBRARY.length, 100);
  assert.equal(new Set(SFX_LIBRARY.map((item) => item.id)).size, 100);
  assert.equal(new Set(SFX_LIBRARY.map((item) => item.name)).size, 100);
  assert.ok(SFX_LIBRARY.every((item) => item.sfxPreset?.startsWith('sfx-pack-')));
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

test('parseSrtSubtitles imports numbered, multi-line and cue-settings SRT blocks', () => {
  const cues = parseSrtSubtitles(
    '\uFEFF1\r\n00:00:01,250 --> 00:00:03,500\r\n<i>Hello</i> &amp; welcome\r\nsecond line\r\n\r\n' +
    '00:01:02.5 --> 00:01:04.000 align:start position:10%\r\nGoodbye\r\n\r\n' +
    '3\r\n00:00:05,000 --> 00:00:04,000\r\nInvalid timing\r\n'
  );

  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 1.25);
  assert.equal(cues[0].end, 3.5);
  assert.equal(cues[0].text, 'Hello & welcome\nsecond line');
  assert.equal(cues[1].start, 62.5);
  assert.equal(cues[1].end, 64);
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



test('smooth speed ramps integrate source time and expose varying playback rates', () => {
  const clip = makeClip({
    start: 10,
    duration: 4,
    speed: 1,
    speedRamp: [
      { id: 'ramp-start', time: 0, speed: 1 },
      { id: 'ramp-mid', time: 2, speed: 2 },
      { id: 'ramp-end', time: 4, speed: 1 },
    ],
  });

  assert.equal(getClipSpeedAtLocalTime(clip, 0), 1);
  assert.equal(getClipSpeedAtLocalTime(clip, 2), 2);
  assert.equal(getClipSpeedAtLocalTime(clip, 4), 1);
  assert.ok(Math.abs(getClipSpeedAtLocalTime(clip, 1) - 1.5) < 0.0001);
  assert.ok(Math.abs(getClipSourceElapsedTime(clip, 2) - 3) < 0.0001);
  assert.ok(Math.abs(getClipLocalTime(clip, 12) - 3) < 0.0001);
  assert.ok(Math.abs(getClipSourceElapsedTime(clip, 4) - 6) < 0.0001);

  const reversed = { ...clip, reversed: true };
  assert.ok(Math.abs(getClipLocalTime(reversed, 12) - 1) < 0.0001);
});

test('volume keyframes evaluate independently from transform properties', () => {
  const clip = makeClip({ volume: 80 });
  const keyed = upsertKeyframe(clip, 'volume', 0, 20, 'linear');
  const keyed2 = upsertKeyframe(keyed, 'volume', 4, 100, 'linear');
  assert.equal(evaluateClipTransform(keyed2, 2).volume, 20);
  assert.equal(evaluateClipTransform(keyed2, 4).volume, 60);
  const frozen = togglePropertyKeyframing(keyed2, 'volume', 2);
  assert.equal(frozen.volume, 60);
  assert.equal(frozen.keyframes.volume, undefined);
});

test('text animator catalogue has 100 distinct usable animation presets', () => {
  assert.equal(TEXT_ANIMATORS.length, 100);
  assert.equal(new Set(TEXT_ANIMATORS.map((item) => item.id)).size, 100);
  assert.ok(TEXT_ANIMATORS.every((item) => item.duration > 0 && item.intensity > 0));
  assert.equal(getTextAnimatorDefinition('animator-100')?.variant, 10);
  assert.equal(getTextAnimatorDefinition('none'), undefined);
});

test('color palette library provides named five-color palettes', () => {
  assert.ok(COLOR_PALETTES.length >= 15);
  assert.equal(new Set(COLOR_PALETTES.map((palette) => palette.id)).size, COLOR_PALETTES.length);
  assert.ok(COLOR_PALETTES.every((palette) =>
    palette.name.length > 0 &&
    palette.colors.length === 5 &&
    palette.colors.every((color) => /^#[0-9A-F]{6}$/i.test(color))
  ));
});


test('WebM muxer writes an EBML document with VP9 video track, clusters and seek cues', () => {
  const bytes = muxWebMVideo([
    { timestamp: 0, keyFrame: true, data: new Uint8Array([1, 2, 3, 4]) },
    { timestamp: 33_333, keyFrame: false, data: new Uint8Array([5, 6, 7]) },
    { timestamp: 66_666, keyFrame: false, data: new Uint8Array([8, 9]) },
  ], 1920, 1080, 30, 'vp9');
  const text = Array.from(bytes.slice(0, 4)).map((value) => value.toString(16).padStart(2, '0')).join('');
  assert.equal(text, '1a45dfa3');
  const document = new TextDecoder('latin1').decode(bytes);
  assert.ok(document.includes('webm'));
  assert.ok(document.includes('V_VP9'));
  assert.ok(document.includes('Kinetix Studio WebCodecs Renderer'));
  const containsBytes = (needle: number[]) => bytes.some((_, offset) =>
    needle.every((value, index) => bytes[offset + index] === value)
  );
  assert.ok(containsBytes([0x1f, 0x43, 0xb6, 0x75]));
  assert.ok(containsBytes([0x1c, 0x53, 0xbb, 0x6b]));
  assert.ok(bytes.length > 100);
});

test('WebM muxer rejects empty frame lists and invalid dimensions', () => {
  assert.throws(() => muxWebMVideo([], 1920, 1080, 30, 'vp9'), /no encoded video frames/i);
  assert.throws(() => muxWebMVideo([{ timestamp: 0, keyFrame: true, data: new Uint8Array([1]) }], 0, 1080, 30, 'vp9'), /invalid webm video/i);
});

test('Fusion graph persists draggable node positions and validates cable cycles', () => {
  const clip = makeClip({ effects: [createEffectInstance('glow'), createEffectInstance('blur')] });
  const graph = createDefaultFusionGraph(clip);
  const mediaIn = graph.nodes.find((node) => node.type === 'media-in')!;
  const mediaOut = graph.nodes.find((node) => node.type === 'media-out')!;
  assert.equal(wouldCreateFusionCycle(graph, mediaOut.id, mediaIn.id), true);
  assert.throws(() => addFusionConnection(graph, mediaOut.id, mediaIn.id), /feedback loop/i);
  const withConnection = addFusionConnection(graph, mediaIn.id, mediaOut.id);
  assert.ok(withConnection.connections.some((edge) => edge.from === mediaIn.id && edge.to === mediaOut.id));
  const moved = { ...graph, nodes: graph.nodes.map((node) => node.id === mediaIn.id ? { ...node, x: 420, y: 90 } : node) };
  const restored = mergeFusionGraphWithClip(moved, clip);
  assert.equal(restored.nodes.find((node) => node.id === mediaIn.id)?.x, 420);
});

test('Fusion graph merge preserves intentionally disconnected cables', () => {
  const clip = makeClip({ effects: [createEffectInstance('glow'), createEffectInstance('blur')] });
  const graph = createDefaultFusionGraph(clip);
  const disconnected = { ...graph, connections: graph.connections.slice(1) };
  const restored = mergeFusionGraphWithClip(disconnected, clip);
  assert.deepEqual(restored.connections, disconnected.connections);
  assert.equal(restored.nodes.length, graph.nodes.length);
});

test('Fusion node cable order controls effect processing order', () => {
  const clip = makeClip({ effects: [createEffectInstance('glow'), createEffectInstance('blur')] });
  const graph = createDefaultFusionGraph(clip);
  const effectNodes = graph.nodes.filter((node) => node.type === 'effect');
  const [first, second] = effectNodes;
  const custom = {
    ...graph,
    connections: graph.connections.filter((edge) => edge.from !== first.id && edge.to !== second.id)
      .concat([{ id: 'custom-reorder', from: second.id, to: first.id }]),
  };
  const ordered = orderFusionEffectIds(custom);
  assert.equal(ordered[0], second.effectId);
  assert.equal(ordered[1], first.effectId);
});
