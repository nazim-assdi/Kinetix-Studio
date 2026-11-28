import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Grid,
  Scan,
  Box,
  Columns2,
  Rows2,
  LayoutGrid,
  Square,
  Check,
  X,
} from 'lucide-react';
import {
  CompositionSettings,
  LayerMask,
  PathPoint,
  TimelineClip,
  TimelineTrack,
  MotionPresetItem,
  ToolMode,
  ViewLayoutMode,
  ViewportCameraAngle,
  ViewportOrbitState,
} from '../types/editor';
import { formatTimecode } from '../engine/timecode';
import { evaluateClipMask, evaluateClipTransform } from '../engine/keyframes';
import { applyMotionPresetToClip } from '../data/motionPresets';
import { applyCatalogMotionVariant, buildCatalogColorGrade } from '../engine/catalogVariants';
import { DAVINCI_LUTS } from '../data/megaCatalog';
import { createEffectInstance } from '../engine/timelineOps';
import {
  computeAnchorScreenCenter,
  projectLayerPointThroughCamera,
  projectLayerThroughCamera,
  resolveCameraViewState,
  resolveWorldTransform,
} from '../engine/math3d';
import {
  MediaCache,
  renderCompositionFrame,
} from '../renderer/canvasRenderer';

function pointInProjectedQuad(
  x: number,
  y: number,
  vertices: { x: number; y: number }[]
): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    const crosses = (a.y > y) !== (b.y > y) &&
      x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 0.000001) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function getCompositionCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement, width: number, height: number) {
  const rect = canvas.getBoundingClientRect();
  const fitScale = Math.max(0.0001, Math.min(rect.width / width, rect.height / height));
  const offsetX = (rect.width - width * fitScale) / 2;
  const offsetY = (rect.height - height * fitScale) / 2;
  return { x: (event.clientX - rect.left - offsetX) / fitScale, y: (event.clientY - rect.top - offsetY) / fitScale, scaleX: 1 / fitScale, scaleY: 1 / fitScale };
}

const SEQUENCE_PRESETS = [
  { id: 'youtube1080', label: 'YouTube · 16:9 · Full HD', width: 1920, height: 1080, fps: 30 },
  { id: 'youtube4k', label: 'YouTube · 16:9 · 4K UHD', width: 3840, height: 2160, fps: 30 },
  { id: 'hd720', label: '16:9 HD · 1280×720', width: 1280, height: 720, fps: 30 },
  { id: 'reels916', label: 'Instagram Reels · 9:16', width: 1080, height: 1920, fps: 60 },
  { id: 'tiktok916', label: 'TikTok · 9:16', width: 1080, height: 1920, fps: 30 },
  { id: 'shorts916', label: 'YouTube Shorts · 9:16', width: 1080, height: 1920, fps: 60 },
  { id: 'facebookSquare', label: 'Facebook Feed · 1:1 Square', width: 1080, height: 1080, fps: 30 },
  { id: 'facebookPortrait', label: 'Facebook / Instagram · 4:5', width: 1080, height: 1350, fps: 30 },
  { id: 'cinema239', label: 'Cinema · 2.39:1', width: 2560, height: 1072, fps: 24 },
  { id: 'scope21', label: '21:9 Cinema · 2560×1080', width: 2560, height: 1080, fps: 24 },
  { id: 'square2k', label: 'Square · 2160×2160', width: 2160, height: 2160, fps: 30 },
  { id: 'story4k', label: 'Vertical · 4K', width: 2160, height: 3840, fps: 30 },
] as const;

const DEFAULT_ORBIT_VIEW: ViewportOrbitState = {
  yaw: 34, pitch: 24, zoom: 1, panX: 0, panY: 0,
};

interface ProgramMonitorProps {
  composition: CompositionSettings;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  playheadTime: number;
  isPlaying: boolean;
  loopEnabled: boolean;
  selectedClipId: string | null;
  tool: ToolMode;
  mediaCache: MediaCache;
  previewPreset: MotionPresetItem | null;
  viewLayout: ViewLayoutMode;
  onChangeViewLayout: (layout: ViewLayoutMode) => void;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onStepFrame: (dir: -1 | 1) => void;
  onToggleLoop: () => void;
  onSelectClip: (clipId: string | null) => void;
  onMoveClipCanvas: (clipId: string, x: number, y: number, z?: number) => void;
  onSetAnchorCanvas: (clipId: string, anchorX: number, anchorY: number) => void;
  onTransformClipCanvas: (clipId: string, patch: { scale?: number; rotation?: number; rotationX?: number; rotationY?: number }) => void;
  onResizeShapeCanvas: (clipId: string, width: number, height: number) => void;
  onUpdateMaskCanvas: (clipId: string, mask: LayerMask) => void;
  onCreatePathClip: (points: PathPoint[], closed: boolean) => void;
  onUpdateComposition?: (patch: Partial<CompositionSettings>) => void;
}

interface ViewportSlotProps {
  angle: ViewportCameraAngle;
  tool: ToolMode;
  composition: CompositionSettings;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  playheadTime: number;
  selectedClipId: string | null;
  showSafeMargins: boolean;
  showTransparencyGrid: boolean;
  showWireframes: boolean;
  penDraftPoints: PathPoint[];
  isPlaying: boolean;
  mediaCache: MediaCache;
  renderTick: number;
  onMediaLoaded: () => void;
  zoomLevel: number;
  renderScale: number;
  viewportOrbit: ViewportOrbitState;
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement, angle: ViewportCameraAngle) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement, angle: ViewportCameraAngle) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement, angle: ViewportCameraAngle) => void;
}

const ViewportCanvasSlot: React.FC<ViewportSlotProps> = ({
  angle,
  composition,
  tracks,
  clips,
  playheadTime,
  selectedClipId,
  showSafeMargins,
  showTransparencyGrid,
  showWireframes,
  penDraftPoints,
  tool,
  isPlaying,
  mediaCache,
  renderTick,
  onMediaLoaded,
  zoomLevel,
  renderScale,
  viewportOrbit,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderCompositionFrame({
      canvas,
      composition,
      tracks,
      clips,
      playheadTime,
      selectedClipId,
      showSafeMargins: angle === 'active' ? showSafeMargins : false,
      showTransparencyGrid: angle === 'active' ? showTransparencyGrid : false,
      showWireframes,
      cameraAngle: angle,
      penDraftPoints: angle === 'active' ? penDraftPoints : [],
      isPlaying,
      mediaCache,
      onMediaLoaded,
      drawGizmo: angle === 'active',
      activeTool: tool,
      renderScale,
      viewportOrbit,
    });
  }, [
    angle,
    composition,
    tracks,
    clips,
    playheadTime,
    selectedClipId,
    showSafeMargins,
    showTransparencyGrid,
    showWireframes,
    penDraftPoints,
    tool,
    isPlaying,
    mediaCache,
    renderTick,
    onMediaLoaded,
    renderScale,
    viewportOrbit,
  ]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={angle === 'active' ? 'composition-canvas' : `viewport-${angle}`}
      onPointerDown={(e) => canvasRef.current && onPointerDown?.(e, canvasRef.current, angle)}
      onPointerMove={(e) => canvasRef.current && onPointerMove?.(e, canvasRef.current, angle)}
      onPointerUp={(e) => canvasRef.current && onPointerUp?.(e, canvasRef.current, angle)}
      onPointerCancel={(e) => canvasRef.current && onPointerUp?.(e, canvasRef.current, angle)}
      style={{
        width: `${Math.min(100, zoomLevel)}%`,
        height: `${Math.min(100, zoomLevel)}%`,
        flex: 'none',
        objectFit: 'contain',
      }}
      className={`object-contain block max-w-none max-h-none ${angle === 'orbit' || tool === 'hand' ? 'cursor-grab' : tool === 'pen' || tool === 'pin' || tool === 'mask' ? 'cursor-crosshair' : 'cursor-default'}`}
    />
  );
};

export const ProgramMonitor: React.FC<ProgramMonitorProps> = ({
  composition,
  tracks,
  clips,
  playheadTime,
  isPlaying,
  loopEnabled,
  selectedClipId,
  tool,
  mediaCache,
  previewPreset,
  viewLayout,
  onChangeViewLayout,
  onTogglePlay,
  onSeek,
  onStepFrame,
  onToggleLoop,
  onSelectClip,
  onMoveClipCanvas,
  onSetAnchorCanvas,
  onTransformClipCanvas,
  onResizeShapeCanvas,
  onUpdateMaskCanvas,
  onCreatePathClip,
  onUpdateComposition,
}) => {
  const [viewportZooms, setViewportZooms] = useState<Record<ViewportCameraAngle, number>>({
    active: 100, top: 100, front: 100, right: 100, orbit: 100,
  });
  const [activeZoomAngle, setActiveZoomAngle] = useState<ViewportCameraAngle>('active');
  const zoomLevel = viewportZooms[activeZoomAngle];
  const zoomMode = (zoomLevel === 100 ? 'fit' : String(zoomLevel)) as 'fit' | '50' | '75' | '100' | '125' | '150' | '200' | '250';
  const setZoomMode = (mode: 'fit' | '50' | '75' | '100' | '125' | '150' | '200' | '250') => {
    setViewportZooms((current) => ({ ...current, [activeZoomAngle]: mode === 'fit' ? 100 : Number(mode) }));
  };
  const adjustZoom = (direction: -1 | 1) => {
    setViewportZooms((current) => ({
      ...current,
      [activeZoomAngle]: Math.min(250, Math.max(50, current[activeZoomAngle] + direction * 25)),
    }));
  };
  const [previewQuality, setPreviewQuality] = useState<'auto' | 'draft' | 'balanced' | 'high' | 'ultra'>('auto');
  const [orbitView, setOrbitView] = useState<ViewportOrbitState>(DEFAULT_ORBIT_VIEW);
  const previewRenderScale = previewQuality === 'draft' ? 0.5
    : previewQuality === 'balanced' ? 0.75
    : previewQuality === 'high' ? 1
    : previewQuality === 'ultra' ? 1.25
    : viewLayout === '4-views' ? 0.5
    : isPlaying ? 0.65 : 1;
  const handlePreviewWheel = (event: React.WheelEvent<HTMLDivElement>, angle: ViewportCameraAngle) => {
    // Alt + wheel remains native panel scrolling. Normal wheel zooms only the
    // hovered view, so all four cameras can be framed independently.
    if (event.altKey || event.shiftKey) return;
    event.preventDefault();
    if (angle === 'orbit') {
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      setOrbitView((current) => ({ ...current, zoom: Math.max(0.2, Math.min(5, current.zoom * factor)) }));
      return;
    }
    setViewportZooms((current) => ({
      ...current,
      [angle]: Math.min(250, Math.max(50, current[angle] + (event.deltaY < 0 ? 25 : -25))),
    }));
    setActiveZoomAngle(angle);
  };
  const [singleAngle, setSingleAngle] = useState<ViewportCameraAngle>('active');
  const [showSafeMargins, setShowSafeMargins] = useState(false);
  const [showTransparencyGrid, setShowTransparencyGrid] = useState(false);
  const [showWireframes, setShowWireframes] = useState(false);
  const [penDraftPoints, setPenDraftPoints] = useState<PathPoint[]>([]);
  const [renderTick, setRenderTick] = useState(0);

  const previewClips = React.useMemo(() => {
    if (!previewPreset || !selectedClipId) return clips;
    const selectedIndex = clips.findIndex((clip) => clip.id === selectedClipId);
    if (selectedIndex < 0) return clips;
    const original = clips[selectedIndex];
    let preview = original;
    if (previewPreset.effectType) {
      const effect = createEffectInstance(previewPreset.effectType);
      effect.name = previewPreset.name;
      effect.params = { ...effect.params, ...(previewPreset.effectParams ?? {}) };
      const existingIndex = original.effects.findIndex((item) => item.type === effect.type);
      const effects = existingIndex >= 0
        ? original.effects.map((item, index) => index === existingIndex ? { ...effect, id: item.id } : item)
        : [...original.effects, effect];
      preview = { ...original, effects };
    } else if (previewPreset.lutName) {
      const lut = DAVINCI_LUTS.find((entry) => entry.name === previewPreset.lutName);
      if (lut) preview = { ...original, colorGrade: buildCatalogColorGrade(previewPreset, lut.grade) };
    } else if (previewPreset.basePresetId) {
      preview = applyCatalogMotionVariant(applyMotionPresetToClip(original, previewPreset.basePresetId), previewPreset.motionVariant);
    }
    return clips.map((clip, index) => index === selectedIndex ? preview : clip);
  }, [clips, selectedClipId, previewPreset]);

  type CanvasDrag =
    | { mode: 'orbit'; startClientX: number; startClientY: number; origYaw: number; origPitch: number; origPanX: number; origPanY: number; panMode: boolean }
    | { mode: 'move-camera' | 'move-ortho-object'; clipId: string; startClientX: number; startClientY: number; origX: number; origY: number; origZ: number; angle: Exclude<ViewportCameraAngle, 'active' | 'orbit'> }
    | { mode: 'rotate-ortho-object'; clipId: string; startClientX: number; startClientY: number; origRotation: number; origRotationX: number; origRotationY: number; angle: Exclude<ViewportCameraAngle, 'active' | 'orbit'> }
    | { mode: 'move'; clipId: string; startClientX: number; startClientY: number; origX: number; origY: number }
    | { mode: 'resize-shape'; clipId: string; startClientX: number; startClientY: number; origWidth: number; origHeight: number; signX: number; signY: number; rotationRad: number; scaleX: number; scaleY: number }
    | { mode: 'resize-text'; clipId: string; startClientX: number; startClientY: number; origWidth: number; origHeight: number; origScale: number; signX: number; signY: number; rotationRad: number; scaleX: number; scaleY: number }
    | { mode: 'rotate'; clipId: string; centerX: number; centerY: number; startAngle: number; origRotation: number }
    | { mode: 'move-anchor'; clipId: string; startClientX: number; startClientY: number; origAnchorX: number; origAnchorY: number; rotationRad: number; scaleX: number; scaleY: number }
    | { mode: 'move-mask' | 'resize-mask' | 'draw-mask'; clipId: string; startClientX: number; startClientY: number; startLocalX: number; startLocalY: number; origMask: LayerMask; signX?: number; signY?: number; rotationRad: number; scaleX: number; scaleY: number };
  const dragRef = useRef<CanvasDrag | null>(null);
  const penHandleRef = useRef<{ index: number; startX: number; startY: number } | null>(null);

  const handleCanvasPointerDown = (
    e: React.PointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
    angle: ViewportCameraAngle = 'active'
  ) => {
    const geometry = getCompositionCanvasPoint(e, canvas, composition.width, composition.height);
    if (angle === 'orbit') {
      dragRef.current = {
        mode: 'orbit', startClientX: e.clientX, startClientY: e.clientY,
        origYaw: orbitView.yaw, origPitch: orbitView.pitch,
        origPanX: orbitView.panX, origPanY: orbitView.panY, panMode: e.shiftKey,
      };
      canvas.setPointerCapture(e.pointerId);
      e.stopPropagation();
      return;
    }
    if (angle !== 'active') {
      const selected = clips.find((clip) =>
        clip.id === selectedClipId &&
        playheadTime >= clip.start &&
        playheadTime <= clip.start + clip.duration
      );
      const selectedTrack = selected ? tracks.find((track) => track.id === selected.trackId) : null;
      if (!selected || !selected.is3D || selectedTrack?.locked) return;
      const transform = evaluateClipTransform(selected, playheadTime);
      dragRef.current = e.altKey ? {
        mode: 'rotate-ortho-object',
        clipId: selected.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origRotation: transform.rotation,
        origRotationX: transform.rotationX,
        origRotationY: transform.rotationY,
        angle,
      } : {
        mode: selected.kind === 'camera' ? 'move-camera' : 'move-ortho-object',
        clipId: selected.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: transform.x,
        origY: transform.y,
        origZ: transform.z,
        angle,
      };
      canvas.setPointerCapture(e.pointerId);
      e.stopPropagation();
      return;
    }
    const scaleX = geometry.scaleX;
    const scaleY = geometry.scaleY;
    const compX = geometry.x;
    const compY = geometry.y;
    if (compX < 0 || compY < 0 || compX > composition.width || compY > composition.height) return;

    if (tool === 'pen') {
      const relX = Math.round(compX - composition.width / 2);
      const relY = Math.round(compY - composition.height / 2);
      if (penDraftPoints.length >= 2) {
        const first = penDraftPoints[0];
        if (Math.hypot(relX - first.x, relY - first.y) < 18) {
          onCreatePathClip(penDraftPoints, true);
          setPenDraftPoints([]);
          return;
        }
      }
      const index = penDraftPoints.length;
      setPenDraftPoints((pts) => [...pts, { x: relX, y: relY }]);
      penHandleRef.current = { index, startX: compX, startY: compY };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    const videoTracks = tracks.filter((t) => t.kind === 'video');
    const hasSoloVideo = videoTracks.some((t) => t.solo);
    const visibleTracks = videoTracks.filter((t) => t.visible && (!hasSoloVideo || t.solo));
    const visibleTrackIds = new Set(visibleTracks.map((t) => t.id));
    const activeCamera = clips.find((c) =>
      c.kind === 'camera' && visibleTrackIds.has(c.trackId) &&
      playheadTime >= c.start && playheadTime <= c.start + c.duration
    ) ?? null;
    const activeCameraView = resolveCameraViewState(
      activeCamera,
      clips,
      playheadTime,
      composition.width,
      composition.height
    );

    let hitInfo: {
      clip: TimelineClip;
      localX: number;
      localY: number;
      halfW: number;
      halfH: number;
      scaleX: number;
      scaleY: number;
      rotationRad: number;
      centerX: number;
      centerY: number;
      baseWidth: number;
      baseHeight: number;
    } | null = null;

    for (const track of visibleTracks) {
      const candidates = clips.filter((c) =>
        c.trackId === track.id && !['adjustment', 'camera', 'light', 'audio'].includes(c.kind) &&
        playheadTime >= c.start && playheadTime <= c.start + c.duration
      ).sort((a, b) => Number(b.id === selectedClipId) - Number(a.id === selectedClipId));
      for (const c of candidates) {
        const world = resolveWorldTransform(c, clips, playheadTime);
        let cx = composition.width / 2 + world.x;
        let cy = composition.height / 2 + world.y;
        let effScaleX = world.scale / 100;
        let effScaleY = world.scale / 100;
        let skewX = 0;
        let rotationRad = (world.rotation * Math.PI) / 180;
        if (c.is3D) {
          const projection = projectLayerThroughCamera(world, activeCamera, clips, playheadTime, composition.width, composition.height);
          if (!projection.visible) continue;
          cx = projection.screenX;
          cy = projection.screenY;
          effScaleX = projection.perspectiveScale * projection.scaleX;
          effScaleY = projection.perspectiveScale * projection.scaleY;
          skewX = projection.skewX;
          rotationRad = projection.rotationRad;
        }
        const { screenCx, screenCy } = computeAnchorScreenCenter(
          cx, cy, world.anchorX ?? 0, world.anchorY ?? 0,
          effScaleX, effScaleY, rotationRad, skewX
        );
        let baseW = composition.width;
        let baseH = composition.height;
        if (c.kind === 'solid' && c.solidProps) {
          baseW = c.solidProps.width;
          baseH = c.solidProps.height;
        } else if (c.kind === 'shape' && c.shapeProps) {
          const shapeTransform = evaluateClipTransform(c, playheadTime);
          baseW = Math.max(1, shapeTransform.shapeWidth ?? c.shapeProps.width);
          baseH = Math.max(1, shapeTransform.shapeHeight ?? c.shapeProps.height);
        } else if (c.kind === 'text' && c.textProps) {
          baseW = Math.max(280, c.textProps.text.length * c.textProps.fontSize * 0.65);
          baseH = Math.max(80, c.textProps.fontSize * 1.8);
        } else if (c.kind === 'path') {
          baseW = 360;
          baseH = 260;
        } else if (c.kind === 'visualizer') {
          baseW = 580;
          baseH = 200;
        } else if (c.kind === 'caption') {
          baseW = 680;
          baseH = 120;
        } else if (c.kind === 'null') {
          baseW = 90;
          baseH = 90;
        }

        const halfW = Math.abs(baseW * effScaleX) / 2;
        const halfH = Math.abs(baseH * effScaleY) / 2;
        const dx = compX - screenCx;
        const dy = compY - screenCy;
        const localX = dx * Math.cos(-rotationRad) - dy * Math.sin(-rotationRad);
        const localY = dx * Math.sin(-rotationRad) + dy * Math.cos(-rotationRad);
        const hitPadding = 16 / Math.max(0.01, Math.min(Math.abs(effScaleX), Math.abs(effScaleY)));
        const rotatePadding = 14 / Math.max(0.01, Math.min(Math.abs(effScaleX), Math.abs(effScaleY)));
        const rotationHandleHit =
          c.id === selectedClipId &&
          (c.kind === 'text' || c.kind === 'shape') &&
          Math.abs(localX) <= rotatePadding &&
          Math.abs(localY + halfH + 34 / Math.max(0.01, Math.abs(effScaleY))) <= rotatePadding;
        const pivotHandleHit =
          c.id === selectedClipId &&
          tool === 'pin' &&
          Math.hypot(compX - cx, compY - cy) <= 16;
        // Mask controls live in the layer's full-composition local plane. Convert
        // their 0..100% center to the centered coordinates used by the hit-test.
        let maskControlHit = false;
        const evaluatedMask = evaluateClipMask(c, playheadTime);
        if (c.id === selectedClipId && evaluatedMask?.enabled && (tool === 'select' || tool === 'pin' || tool === 'mask')) {
          const mask = evaluatedMask;
          const maskLocalX = localX / (effScaleX || 1);
          const maskLocalY = localY / (effScaleY || 1);
          const mx = (mask.x / 100) * composition.width;
          const my = (mask.y / 100) * composition.height;
          const mw = (mask.width / 100) * composition.width;
          const mh = (mask.height / 100) * composition.height;
          const handleRadius = 18 / Math.max(0.01, Math.min(Math.abs(effScaleX), Math.abs(effScaleY)));
          const maskHandles = [
            { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
            { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
            { x: -1, y: 1 }, { x: -1, y: 0 },
          ];
          maskControlHit = maskHandles.some((handle) =>
            Math.hypot(maskLocalX - (mx + handle.x * mw / 2), maskLocalY - (my + handle.y * mh / 2)) <= handleRadius
          ) || (Math.abs(maskLocalX - mx) <= mw / 2 && Math.abs(maskLocalY - my) <= mh / 2);
        }
        let isInside =
          (Math.abs(localX) <= halfW + hitPadding && Math.abs(localY) <= halfH + hitPadding) ||
          rotationHandleHit ||
          pivotHandleHit ||
          maskControlHit;

        if (c.is3D) {
          const anchorX = world.anchorX ?? 0;
          const anchorY = world.anchorY ?? 0;
          const frontDepth = c.kind === 'shape' ? -(c.shapeProps?.depth ?? 0) : 0;
          const localCorners = [
            { x: -baseW / 2 - anchorX, y: -baseH / 2 - anchorY },
            { x: baseW / 2 - anchorX, y: -baseH / 2 - anchorY },
            { x: baseW / 2 - anchorX, y: baseH / 2 - anchorY },
            { x: -baseW / 2 - anchorX, y: baseH / 2 - anchorY },
          ];
          const projectedCorners = localCorners.map((point) =>
            projectLayerPointThroughCamera(
              world,
              activeCamera,
              clips,
              playheadTime,
              composition.width,
              composition.height,
              point.x,
              point.y,
              frontDepth,
              activeCameraView
            )
          );
          isInside = maskControlHit || (
            projectedCorners.every((point) => point.visible) &&
            pointInProjectedQuad(compX, compY, projectedCorners)
          );
        }

        if (isInside) {
          hitInfo = { clip: c, localX, localY, halfW, halfH, scaleX: effScaleX, scaleY: effScaleY, rotationRad, centerX: cx, centerY: cy, baseWidth: baseW, baseHeight: baseH };
          break;
        }
      }
      if (hitInfo) break;
    }

    if (!hitInfo) {
      if (tool !== 'mask') onSelectClip(null);
      return;
    }

    const { clip: hitClip, localX, localY, halfW, halfH, scaleX: layerScaleX, scaleY: layerScaleY, rotationRad, centerX, centerY, baseWidth, baseHeight } = hitInfo;
    onSelectClip(hitClip.id);
    const transform = evaluateClipTransform(hitClip, playheadTime);

    // Select, Mask and Pin tools can all grab an enabled mask directly in the preview.
    // Mask handles take priority over the pivot so a mask never becomes unreachable.
    const evaluatedMask = evaluateClipMask(hitClip, playheadTime);
    const canEditExistingMask = Boolean(
      evaluatedMask?.enabled && (tool === 'select' || tool === 'pin' || tool === 'mask')
    );
    if (tool === 'mask' || canEditExistingMask) {
      const originalMask: LayerMask = evaluatedMask ?? {
        enabled: true, shape: 'rect', x: 0, y: 0, width: 65, height: 65,
        feather: 0, inverted: false, opacity: 100,
      };
      const mask = { ...originalMask, enabled: true };
      const layerLocalX = localX / (layerScaleX || 1);
      const layerLocalY = localY / (layerScaleY || 1);
      const mx = (mask.x / 100) * composition.width;
      const my = (mask.y / 100) * composition.height;
      const mw = (mask.width / 100) * composition.width;
      const mh = (mask.height / 100) * composition.height;
      const signs = [
        { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
        { x: -1, y: 1 }, { x: -1, y: 0 },
      ];
      const radius = 18 / Math.max(0.01, Math.min(Math.abs(layerScaleX), Math.abs(layerScaleY)));
      const handle = signs.find((sign) =>
        Math.hypot(layerLocalX - (mx + sign.x * mw / 2), layerLocalY - (my + sign.y * mh / 2)) <= radius
      );
      const dxMask = Math.abs(layerLocalX - mx);
      const dyMask = Math.abs(layerLocalY - my);
      const inside = mask.shape === 'ellipse'
        ? ((dxMask / Math.max(1, mw / 2)) ** 2 + (dyMask / Math.max(1, mh / 2)) ** 2) <= 1
        : dxMask <= mw / 2 && dyMask <= mh / 2;
      const shouldDrawNewMask = tool === 'mask' && !handle && !inside;
      const shouldEditMask = Boolean(handle || inside || shouldDrawNewMask);

      if (shouldEditMask) {
        const mode: 'resize-mask' | 'move-mask' | 'draw-mask' =
          handle ? 'resize-mask' : inside ? 'move-mask' : 'draw-mask';
        const selectedMask: LayerMask = mode === 'draw-mask'
          ? {
              ...mask,
              x: (layerLocalX / composition.width) * 100,
              y: (layerLocalY / composition.height) * 100,
              width: 1,
              height: 1,
            }
          : mask;
        if (mode === 'draw-mask' || !hitClip.mask?.enabled) {
          onUpdateMaskCanvas(hitClip.id, selectedMask);
        }
        dragRef.current = {
          mode,
          clipId: hitClip.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startLocalX: layerLocalX,
          startLocalY: layerLocalY,
          origMask: selectedMask,
          ...(handle ? { signX: handle.x, signY: handle.y } : {}),
          rotationRad,
          scaleX: layerScaleX,
          scaleY: layerScaleY,
        };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    if (tool === 'pin') {
      // If the pointer is not on an enabled mask, retain normal pan-behind pivot editing.
      const draggingExistingPivot = Math.hypot(compX - centerX, compY - centerY) <= 16;
      const nextAnchorX = draggingExistingPivot
        ? (transform.anchorX ?? 0)
        : localX / (layerScaleX || 1);
      const nextAnchorY = draggingExistingPivot
        ? (transform.anchorY ?? 0)
        : localY / (layerScaleY || 1);
      if (!draggingExistingPivot) onSetAnchorCanvas(hitClip.id, nextAnchorX, nextAnchorY);
      dragRef.current = {
        mode: 'move-anchor',
        clipId: hitClip.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origAnchorX: nextAnchorX,
        origAnchorY: nextAnchorY,
        rotationRad,
        scaleX: layerScaleX,
        scaleY: layerScaleY,
      };
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (tool === 'select' && hitClip.id === selectedClipId && (hitClip.kind === 'shape' || hitClip.kind === 'text')) {
      const minScale = Math.max(0.01, Math.min(Math.abs(layerScaleX), Math.abs(layerScaleY)));
      const radius = 12 / minScale;
      const rotateDistance = 34 / Math.max(0.01, Math.abs(layerScaleY));
      if (Math.abs(localX) <= radius * 1.5 && Math.abs(localY + halfH + rotateDistance) <= radius * 1.5) {
        dragRef.current = {
          mode: 'rotate',
          clipId: hitClip.id,
          centerX,
          centerY,
          startAngle: Math.atan2(compY - centerY, compX - centerX),
          origRotation: transform.rotation,
        };
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      const handles = [
        { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
        { x: -1, y: 1 }, { x: -1, y: 0 },
      ];
      const handle = handles.find((sign) => {
        const hx = sign.x * halfW;
        const hy = sign.y * halfH;
        return Math.hypot(localX - hx, localY - hy) <= radius;
      });
      if (handle) {
        if (hitClip.kind === 'shape' && hitClip.shapeProps) {
          const shapeTransform = evaluateClipTransform(hitClip, playheadTime);
          dragRef.current = {
            mode: 'resize-shape',
            clipId: hitClip.id,
            startClientX: e.clientX,
            startClientY: e.clientY,
            origWidth: shapeTransform.shapeWidth ?? hitClip.shapeProps.width,
            origHeight: shapeTransform.shapeHeight ?? hitClip.shapeProps.height,
            signX: handle.x,
            signY: handle.y,
            rotationRad,
            scaleX: layerScaleX,
            scaleY: layerScaleY,
          };
        } else {
          dragRef.current = {
            mode: 'resize-text',
            clipId: hitClip.id,
            startClientX: e.clientX,
            startClientY: e.clientY,
            origWidth: baseWidth,
            origHeight: baseHeight,
            origScale: transform.scale,
            signX: handle.x,
            signY: handle.y,
            rotationRad,
            scaleX: layerScaleX,
            scaleY: layerScaleY,
          };
        }
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    dragRef.current = {
      mode: 'move', clipId: hitClip.id, startClientX: e.clientX, startClientY: e.clientY,
      origX: transform.x, origY: transform.y,
    };
    canvas.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (
    e: React.PointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const geometry = getCompositionCanvasPoint(e, canvas, composition.width, composition.height);
    const scaleX = geometry.scaleX;
    const scaleY = geometry.scaleY;
    if (tool === 'pen' && penHandleRef.current) {
      const compX = geometry.x;
      const compY = geometry.y;
      const point = penDraftPoints[penHandleRef.current.index];
      if (point) {
        const dx = compX - penHandleRef.current.startX;
        const dy = compY - penHandleRef.current.startY;
        const handleX = dx;
        const handleY = dy;
        setPenDraftPoints((pts) => pts.map((p, index) => index === penHandleRef.current?.index
          ? { ...p, handleOutX: p.x + handleX, handleOutY: p.y + handleY, handleInX: p.x - handleX, handleInY: p.y - handleY }
          : p));
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === 'orbit') {
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      setOrbitView((current) => ({
        ...current,
        yaw: drag.panMode ? drag.origYaw : drag.origYaw + dx * 0.42,
        pitch: drag.panMode ? drag.origPitch : Math.max(-82, Math.min(82, drag.origPitch + dy * 0.38)),
        panX: drag.panMode ? drag.origPanX - dx * 2.2 : drag.origPanX,
        panY: drag.panMode ? drag.origPanY - dy * 2.2 : drag.origPanY,
      }));
      return;
    }
    if (drag.mode === 'move-camera' || drag.mode === 'move-ortho-object') {
      // Ortho preview uses 0.42 screen pixels per 3D scene unit.
      const worldPerPixel = 1 / 0.42;
      const dx = (e.clientX - drag.startClientX) * scaleX * worldPerPixel;
      const dy = (e.clientY - drag.startClientY) * scaleY * worldPerPixel;
      let x = drag.origX, y = drag.origY, z = drag.origZ;
      if (drag.angle === 'top') { x += dx; z += dy; }
      else if (drag.angle === 'front') { x += dx; y += dy; }
      else { z += dx; y += dy; }
      onMoveClipCanvas(drag.clipId, Math.round(x), Math.round(y), Math.round(z));
      return;
    }
    if (drag.mode === 'rotate-ortho-object') {
      const dx = (e.clientX - drag.startClientX) * scaleX;
      const dy = (e.clientY - drag.startClientY) * scaleY;
      const amountX = dx * 0.35;
      const amountY = dy * 0.35;
      if (drag.angle === 'top') {
        onTransformClipCanvas(drag.clipId, {
          rotationY: drag.origRotationY + amountX,
          rotation: drag.origRotation + amountY,
        });
      } else if (drag.angle === 'front') {
        onTransformClipCanvas(drag.clipId, {
          rotation: drag.origRotation + amountX,
          rotationX: drag.origRotationX + amountY,
        });
      } else {
        onTransformClipCanvas(drag.clipId, {
          rotationY: drag.origRotationY + amountX,
          rotationX: drag.origRotationX + amountY,
        });
      }
      return;
    }
    if (drag.mode === 'rotate') {
      const compX = geometry.x;
      const compY = geometry.y;
      const angle = Math.atan2(compY - drag.centerY, compX - drag.centerX);
      let rotation = drag.origRotation + ((angle - drag.startAngle) * 180) / Math.PI;
      if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
      onTransformClipCanvas(drag.clipId, { rotation });
      return;
    }
    const dx = (e.clientX - drag.startClientX) * scaleX;
    const dy = (e.clientY - drag.startClientY) * scaleY;
    if (drag.mode === 'move') {
      onMoveClipCanvas(drag.clipId, Math.round(drag.origX + dx), Math.round(drag.origY + dy));
      return;
    }
    // Only layer-shape and mask drags carry these local-plane transform values.
    if (!('rotationRad' in drag) || !('scaleX' in drag) || !('scaleY' in drag)) return;
    const localDx = dx * Math.cos(drag.rotationRad) + dy * Math.sin(drag.rotationRad);
    const localDy = -dx * Math.sin(drag.rotationRad) + dy * Math.cos(drag.rotationRad);
    const unscaledDx = localDx / (Math.abs(drag.scaleX) || 1);
    const unscaledDy = localDy / (Math.abs(drag.scaleY) || 1);
    if (drag.mode === 'move-anchor') {
      onSetAnchorCanvas(drag.clipId, drag.origAnchorX + unscaledDx, drag.origAnchorY + unscaledDy);
      return;
    }
    if (drag.mode === 'resize-shape') {
      const width = Math.max(1, drag.origWidth + unscaledDx * 2 * drag.signX);
      const height = Math.max(1, drag.origHeight + unscaledDy * 2 * drag.signY);
      onResizeShapeCanvas(drag.clipId, width, height);
      return;
    }
    if (drag.mode === 'resize-text') {
      const ratioX = drag.signX === 0 ? 1 : Math.max(0.02, (drag.origWidth + unscaledDx * 2 * drag.signX) / drag.origWidth);
      const ratioY = drag.signY === 0 ? 1 : Math.max(0.02, (drag.origHeight + unscaledDy * 2 * drag.signY) / drag.origHeight);
      const ratio = drag.signX === 0 ? ratioY : drag.signY === 0 ? ratioX : Math.max(ratioX, ratioY);
      onTransformClipCanvas(drag.clipId, { scale: Math.max(1, drag.origScale * ratio) });
      return;
    }
    if (!('origMask' in drag)) return;
    const original = drag.origMask;
    let nextMask: LayerMask;
    if (drag.mode === 'move-mask') {
      nextMask = {
        ...original,
        x: original.x + (unscaledDx / composition.width) * 100,
        y: original.y + (unscaledDy / composition.height) * 100,
      };
    } else if (drag.mode === 'resize-mask') {
      nextMask = {
        ...original,
        width: Math.max(1, original.width + (unscaledDx / composition.width) * 200 * (drag.signX ?? 1)),
        height: Math.max(1, original.height + (unscaledDy / composition.height) * 200 * (drag.signY ?? 1)),
      };
    } else {
      const endX = drag.startLocalX + unscaledDx;
      const endY = drag.startLocalY + unscaledDy;
      nextMask = {
        ...original,
        x: ((drag.startLocalX + endX) / 2 / composition.width) * 100,
        y: ((drag.startLocalY + endY) / 2 / composition.height) * 100,
        width: Math.max(1, (Math.abs(endX - drag.startLocalX) / composition.width) * 100),
        height: Math.max(1, (Math.abs(endY - drag.startLocalY) / composition.height) * 100),
      };
    }
    onUpdateMaskCanvas(drag.clipId, nextMask);
  };

  const handleCanvasPointerUp = (
    e: React.PointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    if (dragRef.current || penHandleRef.current) {
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      dragRef.current = null;
      penHandleRef.current = null;
    }
  };

  const viewAngles: ViewportCameraAngle[] =
    viewLayout === '1-view'
      ? [singleAngle]
      : viewLayout === '2-views-h' || viewLayout === '2-views-v'
      ? ['active', 'top']
      : ['active', 'top', 'front', 'right'];

  return (
    <section
      aria-label="Composition Program Monitor"
      className="flex-1 min-w-0 bg-[#111215] flex flex-col min-h-0"
    >
      {/* Monitor Header Strip with View Modes (1 / 2H / 2V / 4 Quad) */}
      <div className="h-9 shrink-0 px-3 bg-[#16181D] border-b border-[#2B303A] flex items-center justify-between gap-2 relative z-30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-[#E6E8EC] truncate">
            {composition.name}
          </span>
          {onUpdateComposition ? (
            <select
              aria-label="Sequence Aspect & Resolution Preset"
              value={
                SEQUENCE_PRESETS.find(
                  (p) =>
                    p.width === composition.width &&
                    p.height === composition.height &&
                    p.fps === composition.fps
                )?.id ?? 'custom'
              }
              onChange={(e) => {
                const p = SEQUENCE_PRESETS.find((x) => x.id === e.target.value);
                if (p) {
                  onUpdateComposition({
                    width: p.width,
                    height: p.height,
                    fps: p.fps,
                    fitMode: 'cover',
                    fitPositionX: 50,
                    fitPositionY: 50,
                  });
                }
              }}
              className="bg-[#111215] border border-[#2B303A] rounded px-1.5 py-0.5 text-[11px] font-mono-tabular text-[#C8CDD6] focus:outline-none hover:border-[#3B82F6]"
            >
              {SEQUENCE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.fps}fps
                </option>
              ))}
              {!SEQUENCE_PRESETS.some(
                (p) =>
                  p.width === composition.width &&
                  p.height === composition.height &&
                  p.fps === composition.fps
              ) && (
                <option value="custom">
                  {composition.width}×{composition.height} · {composition.fps}fps
                </option>
              )}
            </select>
          ) : (
            <span className="text-[11px] text-[#7E8594] font-mono-tabular whitespace-nowrap">
              {composition.width}×{composition.height} · {composition.fps}fps
            </span>
          )}
          {onUpdateComposition && (
            <details className="relative">
              <summary className="list-none cursor-pointer rounded border border-[#2B303A] bg-[#111215] px-2 py-0.5 text-[10px] text-[#C8CDD6] hover:border-[#3B82F6]">Custom</summary>
              <div className="absolute left-0 top-full mt-1 w-56 rounded border border-[#303744] bg-[#181A1F] p-2.5 shadow-2xl z-[90] space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-[#9BA1AD]">Width
                    <input
                      type="number"
                      aria-label="Custom Sequence Width"
                      min={1}
                      max={8192}
                      step={2}
                      value={composition.width}
                      onChange={(e) => {
                        const width = Math.max(1, Math.min(8192, Math.round(Number(e.target.value) || composition.width)));
                        onUpdateComposition({ width });
                      }}
                      onBlur={() => {
                        if (composition.width < 64) onUpdateComposition({ width: 64 });
                      }}
                      className="mt-1 w-full bg-[#0B0D10] border border-[#2B303A] rounded px-1.5 py-1 text-[11px] text-white"
                    />
                  </label>
                  <label className="text-[10px] text-[#9BA1AD]">Height
                    <input
                      type="number"
                      aria-label="Custom Sequence Height"
                      min={1}
                      max={8192}
                      step={2}
                      value={composition.height}
                      onChange={(e) => {
                        const height = Math.max(1, Math.min(8192, Math.round(Number(e.target.value) || composition.height)));
                        onUpdateComposition({ height });
                      }}
                      onBlur={() => {
                        if (composition.height < 64) onUpdateComposition({ height: 64 });
                      }}
                      className="mt-1 w-full bg-[#0B0D10] border border-[#2B303A] rounded px-1.5 py-1 text-[11px] text-white"
                    />
                  </label>
                </div>
                <label className="block text-[10px] text-[#9BA1AD]">Frame Rate · {composition.fps}fps
                  <input
                    type="range"
                    aria-label="Custom Sequence Frame Rate"
                    min={12}
                    max={120}
                    step={1}
                    value={composition.fps}
                    onChange={(e) => onUpdateComposition({ fps: Number(e.target.value) })}
                    className="mt-1 w-full studio-slider"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onUpdateComposition({ fitMode: 'cover', fitPositionX: 50, fitPositionY: 50 })}
                  className="text-[9px] text-[#93C5FD] hover:text-white"
                >Reset crop to center</button>
              </div>
            </details>
          )}
          {onUpdateComposition && (
            <select
              aria-label="Sequence Media Fit Mode"
              title="Choose how footage fits or crops in this sequence"
              value={composition.fitMode ?? 'contain'}
              onChange={(e) => onUpdateComposition({ fitMode: e.target.value as 'contain' | 'cover' | 'stretch' })}
              className="bg-[#111215] border border-[#2B303A] rounded px-1.5 py-0.5 text-[10px] text-[#C8CDD6] focus:outline-none"
            >
              <option value="cover">Crop to Fill</option>
              <option value="contain">Fit / Letterbox</option>
              <option value="stretch">Stretch</option>
            </select>
          )}
          {onUpdateComposition && composition.fitMode === 'cover' && (
            <details className="relative">
              <summary className="list-none cursor-pointer rounded border border-[#2B303A] bg-[#111215] px-2 py-0.5 text-[10px] text-[#C8CDD6] hover:border-[#3B82F6]">Crop Position</summary>
              <div className="absolute left-0 top-full mt-1 w-56 rounded border border-[#303744] bg-[#181A1F] p-2.5 shadow-2xl z-[90] space-y-2">
                <label className="block text-[10px] text-[#9BA1AD]">
                  Horizontal · {Math.round(composition.fitPositionX ?? 50)}%
                  <input
                    type="range"
                    aria-label="Crop Horizontal Position"
                    min={0}
                    max={100}
                    value={composition.fitPositionX ?? 50}
                    onChange={(e) => onUpdateComposition({ fitPositionX: Number(e.target.value) })}
                    className="mt-1 w-full studio-slider"
                  />
                </label>
                <label className="block text-[10px] text-[#9BA1AD]">
                  Vertical · {Math.round(composition.fitPositionY ?? 50)}%
                  <input
                    type="range"
                    aria-label="Crop Vertical Position"
                    min={0}
                    max={100}
                    value={composition.fitPositionY ?? 50}
                    onChange={(e) => onUpdateComposition({ fitPositionY: Number(e.target.value) })}
                    className="mt-1 w-full studio-slider"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onUpdateComposition({ fitPositionX: 50, fitPositionY: 50 })}
                  className="text-[9px] text-[#93C5FD] hover:text-white"
                >Center Crop</button>
              </div>
            </details>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* View Mode Switcher: 1 View / 2H / 2V / 4 Quad */}
          <div
            role="group"
            aria-label="Viewport Layout Mode"
            className="flex items-center gap-0.5 bg-[#111215] p-0.5 rounded border border-[#2B303A]"
          >
            <button
              type="button"
              onClick={() => onChangeViewLayout('1-view')}
              title="1 View"
              aria-label="1 View"
              aria-pressed={viewLayout === '1-view'}
              className={`p-1 rounded transition-colors ${
                viewLayout === '1-view'
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#9BA1AD] hover:text-white'
              }`}
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onChangeViewLayout('2-views-h')}
              title="2 Views Horizontal"
              aria-label="2 Views Horizontal"
              aria-pressed={viewLayout === '2-views-h'}
              className={`p-1 rounded transition-colors ${
                viewLayout === '2-views-h'
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#9BA1AD] hover:text-white'
              }`}
            >
              <Columns2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onChangeViewLayout('2-views-v')}
              title="2 Views Vertical"
              aria-label="2 Views Vertical"
              aria-pressed={viewLayout === '2-views-v'}
              className={`p-1 rounded transition-colors ${
                viewLayout === '2-views-v'
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#9BA1AD] hover:text-white'
              }`}
            >
              <Rows2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onChangeViewLayout('4-views')}
              title="4 Views Quad (Active Camera + Top + Front + Right)"
              aria-label="4 Views Quad"
              aria-pressed={viewLayout === '4-views'}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                viewLayout === '4-views'
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#9BA1AD] hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
              <span>4</span>
            </button>
          </div>

          {viewLayout === '1-view' && (
            <select
              aria-label="3D Camera View Angle"
              value={singleAngle}
              onChange={(e) =>
                setSingleAngle(e.target.value as ViewportCameraAngle)
              }
              className="bg-[#111215] border border-[#2B303A] rounded px-2 py-0.5 text-[11px] text-[#C8CDD6] focus:outline-none"
            >
              <option value="active">Active Camera</option>
              <option value="top">Top (Ortho)</option>
              <option value="front">Front (Ortho)</option>
              <option value="right">Right (Ortho)</option>
              <option value="orbit">Orbit 3D · Drag to rotate</option>
            </select>
          )}
          {viewLayout === '1-view' && singleAngle === 'orbit' && (
            <button type="button" onClick={() => setOrbitView(DEFAULT_ORBIT_VIEW)} title="Reset 3D Orbit View" className="px-2 py-0.5 rounded border border-[#2B303A] bg-[#111215] text-[10px] text-[#C8CDD6] hover:border-[#8B5CF6]">Reset 3D</button>
          )}

          <select
            aria-label="Monitor Zoom"
            value={zoomMode}
            onChange={(e) => setZoomMode(e.target.value as typeof zoomMode)}
            className="bg-[#111215] border border-[#2B303A] rounded px-1.5 py-0.5 text-[11px] text-[#C8CDD6] focus:outline-none"
          >
            <option value="fit">Fit</option><option value="50">50%</option><option value="75">75%</option>
            <option value="100">100%</option><option value="125">125%</option><option value="150">150%</option>
            <option value="200">200%</option><option value="250">250%</option>
          </select>
          <select
            aria-label="Preview Render Quality"
            title="Adaptive preview resolution balances playback speed and image detail"
            value={previewQuality}
            onChange={(e) => setPreviewQuality(e.target.value as typeof previewQuality)}
            className="bg-[#111215] border border-[#2B303A] rounded px-1.5 py-0.5 text-[10px] text-[#C8CDD6] focus:outline-none"
          >
            <option value="auto">Auto Quality</option>
            <option value="draft">Draft · ½</option>
            <option value="balanced">Balanced · ¾</option>
            <option value="high">High · 1×</option>
            <option value="ultra">Ultra · up to 1.25×</option>
          </select>

          <button type="button" onClick={() => adjustZoom(-1)} title="Zoom Out" aria-label="Zoom Out" className="p-1 rounded text-[#9BA1AD] hover:text-white hover:bg-[#232730]">−</button>
          <button type="button" onClick={() => adjustZoom(1)} title="Zoom In" aria-label="Zoom In" className="p-1 rounded text-[#9BA1AD] hover:text-white hover:bg-[#232730]">+</button>
          <button
            type="button"
            onClick={() => setShowWireframes((v) => !v)}
            title="Toggle 3D Wireframes & Guides"
            aria-label="Toggle 3D Wireframes"
            aria-pressed={showWireframes}
            className={`p-1 rounded transition-colors ${
              showWireframes
                ? 'bg-[#2B303A] text-[#A78BFA]'
                : 'text-[#9BA1AD] hover:text-white hover:bg-[#232730]'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setShowSafeMargins((v) => !v)}
            title="Toggle Title & Action Safe Guides"
            aria-label="Toggle Safe Margins"
            aria-pressed={showSafeMargins}
            className={`p-1 rounded transition-colors ${
              showSafeMargins
                ? 'bg-[#2B303A] text-[#3B82F6]'
                : 'text-[#9BA1AD] hover:text-white hover:bg-[#232730]'
            }`}
          >
            <Scan className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setShowTransparencyGrid((v) => !v)}
            title="Toggle Transparency Grid"
            aria-label="Toggle Transparency Grid"
            aria-pressed={showTransparencyGrid}
            className={`p-1 rounded transition-colors ${
              showTransparencyGrid
                ? 'bg-[#2B303A] text-[#3B82F6]'
                : 'text-[#9BA1AD] hover:text-white hover:bg-[#232730]'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Pen Tool Draft Action Bar */}
      {tool === 'pen' && (
        <div className="px-3 py-1.5 bg-[#1C2029] border-b border-[#3B82F6]/40 flex items-center justify-between text-xs">
          <span className="text-[#93C5FD]">
            Pen Tool Active: Click on canvas to place points ({penDraftPoints.length} placed)
          </span>
          <div className="flex items-center gap-1.5">
            {penDraftPoints.length >= 2 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onCreatePathClip(penDraftPoints, false);
                    setPenDraftPoints([]);
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#3B82F6] text-white text-[11px] font-medium"
                >
                  <Check className="w-3 h-3" />
                  <span>Finish Open Path</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCreatePathClip(penDraftPoints, true);
                    setPenDraftPoints([]);
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#8B5CF6] text-white text-[11px] font-medium"
                >
                  <Check className="w-3 h-3" />
                  <span>Close Shape</span>
                </button>
              </>
            )}
            {penDraftPoints.length > 0 && (
              <button
                type="button"
                onClick={() => setPenDraftPoints([])}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#282D37] text-[#E6E8EC] text-[11px]"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>
      )}

      {tool === 'pin' && (
        <div className="px-3 py-1.5 bg-[#211D14] border-b border-[#F59E0B]/40 flex items-center justify-between text-xs">
          <span className="text-[#FDE68A]">Pin Tool Active · Click or drag inside a layer to move its pivot without shifting the artwork</span>
          <button
            type="button"
            disabled={!selectedClipId}
            onClick={() => selectedClipId && onSetAnchorCanvas(selectedClipId, 0, 0)}
            className="px-2 py-0.5 rounded bg-[#3A2B12] text-[#FDE68A] hover:bg-[#523B15] disabled:opacity-40 disabled:cursor-not-allowed text-[11px]"
          >Center Anchor</button>
        </div>
      )}

      {/* Viewport Grid (1 / 2H / 2V / 4 Quad) */}
      <div className="flex-1 min-h-0 p-3 overflow-hidden bg-[#0D0E11] flex items-center justify-center">
        <div
          data-testid="viewport-grid"
          data-layout={viewLayout}
          className={`w-full h-full grid gap-2 ${
            viewLayout === '1-view'
              ? 'grid-cols-1 grid-rows-1 place-items-center'
              : viewLayout === '2-views-h'
              ? 'grid-cols-2 grid-rows-1'
              : viewLayout === '2-views-v'
              ? 'grid-cols-1 grid-rows-2'
              : 'grid-cols-2 grid-rows-2'
          }`}
        >
          {viewAngles.map((angle) => (
            <div
              key={angle}
              data-view-angle={angle}
              onMouseEnter={() => setActiveZoomAngle(angle)}
              className={`relative border border-[#2B303A] overflow-hidden ${
                angle === 'active' && showTransparencyGrid
                  ? 'checkerboard-bg'
                  : 'bg-black'
              } ${
                viewLayout === '1-view' && zoomMode === 'fit'
                  ? 'max-w-full max-h-full'
                  : 'w-full h-full'
              }`}
              style={
                viewLayout === '1-view' && zoomMode === 'fit'
                  ? {
                      aspectRatio: `${composition.width} / ${composition.height}`,
                      width: composition.width >= composition.height ? '100%' : 'auto',
                      height: composition.height > composition.width ? '100%' : 'auto',
                    }
                  : undefined
              }
            >
              {(viewLayout !== '1-view' || angle !== 'active') && (
                <div className="pointer-events-none absolute top-1.5 left-2 z-10 px-1.5 py-0.5 rounded bg-[#111215]/85 border border-[#2B303A] text-[10px] font-mono-tabular font-semibold tracking-wider text-[#E6E8EC] uppercase">
                  {angle === 'active' ? 'Active Camera' : `${angle} · Ortho`}
                </div>
              )}
              {selectedClipId && angle !== 'active' && angle !== 'orbit' && (
                <div className="pointer-events-none absolute bottom-2 right-2 z-20 rounded bg-[#111215]/85 border border-[#303744] px-2 py-1 text-[9px] text-[#9BA1AD]">
                  Drag: Move · Alt + Drag: Rotate
                </div>
              )}
              <div
                className="absolute inset-0 overflow-auto"
                data-testid={`viewport-scroll-${angle}`}
                onWheel={(event) => handlePreviewWheel(event, angle)}
                onMouseEnter={() => setActiveZoomAngle(angle)}
              >
                <div
                  className="min-w-full min-h-full flex items-center justify-center"
                  style={{
                    width: `${Math.max(100, viewportZooms[angle])}%`,
                    height: `${Math.max(100, viewportZooms[angle])}%`,
                  }}
                >
              <ViewportCanvasSlot
                angle={angle}
                tool={tool}
                composition={composition}
                tracks={tracks}
                clips={previewClips}
                playheadTime={playheadTime}
                selectedClipId={selectedClipId}
                showSafeMargins={showSafeMargins}
                showTransparencyGrid={showTransparencyGrid}
                showWireframes={showWireframes}
                penDraftPoints={penDraftPoints}
                isPlaying={isPlaying}
                mediaCache={mediaCache}
                renderTick={renderTick}
                onMediaLoaded={() => setRenderTick((v) => v + 1)}
                zoomLevel={viewportZooms[angle]}
                renderScale={previewRenderScale}
                viewportOrbit={orbitView}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
              />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transport Controls Bar */}
      <div className="h-10 shrink-0 px-4 bg-[#16181D] border-t border-[#2B303A] flex items-center justify-between gap-4">
        <div
          data-testid="program-timecode"
          className="font-mono-tabular text-xs font-semibold text-[#60A5FA] min-w-[92px]"
        >
          {formatTimecode(playheadTime, composition.fps)}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSeek(0)}
            title="Jump to Start (Home)"
            aria-label="Jump to Start"
            className="p-1.5 rounded text-[#9BA1AD] hover:text-white hover:bg-[#232730] transition-colors"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onStepFrame(-1)}
            title="Step Back 1 Frame (Left Arrow)"
            aria-label="Step Back 1 Frame"
            className="p-1.5 rounded text-[#9BA1AD] hover:text-white hover:bg-[#232730] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-8 h-7 rounded bg-[#3B82F6] hover:bg-[#2563EB] text-white flex items-center justify-center transition-colors mx-1"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onStepFrame(1)}
            title="Step Forward 1 Frame (Right Arrow)"
            aria-label="Step Forward 1 Frame"
            className="p-1.5 rounded text-[#9BA1AD] hover:text-white hover:bg-[#232730] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onSeek(composition.duration)}
            title="Jump to End (End)"
            aria-label="Jump to End"
            className="p-1.5 rounded text-[#9BA1AD] hover:text-white hover:bg-[#232730] transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 min-w-[92px] justify-end">
          <button
            type="button"
            onClick={onToggleLoop}
            title="Loop Playback"
            aria-label="Loop Playback"
            aria-pressed={loopEnabled}
            className={`p-1.5 rounded transition-colors ${
              loopEnabled
                ? 'bg-[#252932] text-[#3B82F6]'
                : 'text-[#9BA1AD] hover:text-white hover:bg-[#232730]'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono-tabular text-[11px] text-[#7E8594]">
            {formatTimecode(composition.duration, composition.fps)}
          </span>
        </div>
      </div>
    </section>
  );
};
