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
} from '../types/editor';
import { formatTimecode } from '../engine/timecode';
import { evaluateClipTransform } from '../engine/keyframes';
import { applyMotionPresetToClip } from '../data/motionPresets';
import { DAVINCI_LUTS } from '../data/megaCatalog';
import { createEffectInstance } from '../engine/timelineOps';
import {
  computeAnchorScreenCenter,
  projectLayerThroughCamera,
  resolveWorldTransform,
} from '../engine/math3d';
import {
  MediaCache,
  renderCompositionFrame,
} from '../renderer/canvasRenderer';

const SEQUENCE_PRESETS = [
  { id: 'hd720', label: '16:9 HD · 1280×720', width: 1280, height: 720, fps: 30 },
  { id: 'fhd1080', label: '16:9 Full HD · 1920×1080', width: 1920, height: 1080, fps: 30 },
  { id: 'uhd4k', label: '16:9 4K UHD · 3840×2160', width: 3840, height: 2160, fps: 30 },
  { id: 'reels916', label: '9:16 Reels · 1080×1920', width: 1080, height: 1920, fps: 60 },
  { id: 'sq1080', label: '1:1 Square · 1080×1080', width: 1080, height: 1080, fps: 30 },
  { id: 'scope21', label: '21:9 Cinema · 2560×1080', width: 2560, height: 1080, fps: 24 },
] as const;

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
  onMoveClipCanvas: (clipId: string, x: number, y: number) => void;
  onSetAnchorCanvas: (clipId: string, anchorX: number, anchorY: number) => void;
  onResizeShapeCanvas: (clipId: string, width: number, height: number) => void;
  onUpdateMaskCanvas: (clipId: string, mask: LayerMask) => void;
  onCreatePathClip: (points: PathPoint[], closed: boolean) => void;
  onUpdateComposition?: (patch: Partial<CompositionSettings>) => void;
}

interface ViewportSlotProps {
  angle: ViewportCameraAngle;
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
  onPointerDown?: (
    e: React.PointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => void;
  onPointerMove?: (
    e: React.PointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => void;
  onPointerUp?: (
    e: React.PointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => void;
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
  isPlaying,
  mediaCache,
  renderTick,
  onMediaLoaded,
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
    isPlaying,
    mediaCache,
    renderTick,
    onMediaLoaded,
  ]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={angle === 'active' ? 'composition-canvas' : `viewport-${angle}`}
      onPointerDown={(e) => canvasRef.current && onPointerDown?.(e, canvasRef.current)}
      onPointerMove={(e) => canvasRef.current && onPointerMove?.(e, canvasRef.current)}
      onPointerUp={(e) => canvasRef.current && onPointerUp?.(e, canvasRef.current)}
      className="w-full h-full object-contain block cursor-crosshair"
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
  onResizeShapeCanvas,
  onUpdateMaskCanvas,
  onCreatePathClip,
  onUpdateComposition,
}) => {
  const [zoomMode, setZoomMode] = useState<'fit' | '50' | '100'>('fit');
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
      preview = { ...original, effects: [...original.effects, effect] };
    } else if (previewPreset.lutName) {
      const lut = DAVINCI_LUTS.find((entry) => entry.name === previewPreset.lutName);
      if (lut) preview = { ...original, colorGrade: { ...lut.grade, enabled: true } };
    } else if (previewPreset.basePresetId) {
      preview = applyMotionPresetToClip(original, previewPreset.basePresetId);
    }
    return clips.map((clip, index) => index === selectedIndex ? preview : clip);
  }, [clips, selectedClipId, previewPreset]);

  type CanvasDrag =
    | { mode: 'move'; clipId: string; startClientX: number; startClientY: number; origX: number; origY: number }
    | { mode: 'resize-shape'; clipId: string; startClientX: number; startClientY: number; origWidth: number; origHeight: number; signX: number; signY: number; rotationRad: number; scaleX: number; scaleY: number }
    | { mode: 'move-mask' | 'resize-mask' | 'draw-mask'; clipId: string; startClientX: number; startClientY: number; startLocalX: number; startLocalY: number; origMask: LayerMask; signX?: number; signY?: number; rotationRad: number; scaleX: number; scaleY: number };
  const dragRef = useRef<CanvasDrag | null>(null);
  const penHandleRef = useRef<{ index: number; startX: number; startY: number } | null>(null);

  const handleCanvasPointerDown = (
    e: React.PointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = composition.width / rect.width;
    const scaleY = composition.height / rect.height;
    const compX = (e.clientX - rect.left) * scaleX;
    const compY = (e.clientY - rect.top) * scaleY;

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

    let hitInfo: {
      clip: TimelineClip;
      localX: number;
      localY: number;
      halfW: number;
      halfH: number;
      scaleX: number;
      scaleY: number;
      rotationRad: number;
    } | null = null;

    for (const track of visibleTracks) {
      const candidates = clips.filter((c) =>
        c.trackId === track.id && !['adjustment', 'camera', 'light', 'audio'].includes(c.kind) &&
        playheadTime >= c.start && playheadTime <= c.start + c.duration
      );
      for (const c of candidates) {
        const world = resolveWorldTransform(c, clips, playheadTime);
        let cx = composition.width / 2 + world.x;
        let cy = composition.height / 2 + world.y;
        let effScaleX = world.scale / 100;
        let effScaleY = world.scale / 100;
        let skewX = 0;
        if (c.is3D) {
          const proj = projectLayerThroughCamera(world, activeCamera, clips, playheadTime, composition.width, composition.height);
          if (!proj.visible) continue;
          cx = proj.screenX;
          cy = proj.screenY;
          effScaleX = proj.perspectiveScale * proj.scaleX;
          effScaleY = proj.perspectiveScale * proj.scaleY;
          skewX = proj.skewX;
        }

        const rotationRad = (world.rotation * Math.PI) / 180;
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
        if (Math.abs(localX) <= halfW + hitPadding && Math.abs(localY) <= halfH + hitPadding) {
          hitInfo = { clip: c, localX, localY, halfW, halfH, scaleX: effScaleX, scaleY: effScaleY, rotationRad };
          break;
        }
      }
      if (hitInfo) break;
    }

    if (!hitInfo) {
      if (tool !== 'mask') onSelectClip(null);
      return;
    }

    const { clip: hitClip, localX, localY, halfW, halfH, scaleX: layerScaleX, scaleY: layerScaleY, rotationRad } = hitInfo;
    onSelectClip(hitClip.id);
    const transform = evaluateClipTransform(hitClip, playheadTime);

    if (tool === 'pin') {
      const nextAnchorX = (transform.anchorX ?? 0) + localX / (layerScaleX || 1);
      const nextAnchorY = (transform.anchorY ?? 0) + localY / (layerScaleY || 1);
      onSetAnchorCanvas(hitClip.id, nextAnchorX, nextAnchorY);
      return;
    }

    if (tool === 'mask') {
      const originalMask: LayerMask = hitClip.mask ?? {
        enabled: true, shape: 'rect', x: 0, y: 0, width: 65, height: 65,
        feather: 0, inverted: false, opacity: 100,
      };
      const mask = { ...originalMask, enabled: true };
      if (!hitClip.mask?.enabled) {
        const fresh = { ...mask, x: (localX / composition.width) * 100, y: (localY / composition.height) * 100, width: 1, height: 1 };
        onUpdateMaskCanvas(hitClip.id, fresh);
        dragRef.current = {
          mode: 'draw-mask', clipId: hitClip.id, startClientX: e.clientX, startClientY: e.clientY,
          startLocalX: localX, startLocalY: localY, origMask: fresh, rotationRad, scaleX: layerScaleX, scaleY: layerScaleY,
        };
      } else {
        const mx = (mask.x / 100) * composition.width;
        const my = (mask.y / 100) * composition.height;
        const mw = (mask.width / 100) * composition.width;
        const mh = (mask.height / 100) * composition.height;
        const signs = [
          { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
        ];
        const radius = 16 / Math.max(0.01, Math.min(Math.abs(layerScaleX), Math.abs(layerScaleY)));
        const corner = signs.find((sign) => Math.hypot(localX - (mx + sign.x * mw / 2), localY - (my + sign.y * mh / 2)) <= radius);
        const inside = mask.shape === 'ellipse'
          ? (((localX - mx) / Math.max(1, mw / 2)) ** 2 + ((localY - my) / Math.max(1, mh / 2)) ** 2) <= 1
          : Math.abs(localX - mx) <= mw / 2 && Math.abs(localY - my) <= mh / 2;
        const mode = corner ? 'resize-mask' : inside ? 'move-mask' : 'draw-mask';
        const selectedMask = mode === 'draw-mask'
          ? { ...mask, x: (localX / composition.width) * 100, y: (localY / composition.height) * 100, width: 1, height: 1 }
          : mask;
        if (mode === 'draw-mask') onUpdateMaskCanvas(hitClip.id, selectedMask);
        dragRef.current = {
          mode, clipId: hitClip.id, startClientX: e.clientX, startClientY: e.clientY,
          startLocalX: localX, startLocalY: localY, origMask: selectedMask,
          ...(corner ? { signX: corner.x, signY: corner.y } : {}),
          rotationRad, scaleX: layerScaleX, scaleY: layerScaleY,
        };
      }
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (hitClip.kind === 'shape' && hitClip.shapeProps) {
      const corners = [
        { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
      ];
      const radius = 16 / Math.max(0.01, Math.min(Math.abs(layerScaleX), Math.abs(layerScaleY)));
      const corner = corners.find((sign) => Math.hypot(localX - sign.x * halfW, localY - sign.y * halfH) <= radius);
      if (corner) {
        const shapeTransform = evaluateClipTransform(hitClip, playheadTime);
        dragRef.current = {
          mode: 'resize-shape', clipId: hitClip.id, startClientX: e.clientX, startClientY: e.clientY,
          origWidth: shapeTransform.shapeWidth ?? hitClip.shapeProps.width,
          origHeight: shapeTransform.shapeHeight ?? hitClip.shapeProps.height,
          signX: corner.x, signY: corner.y, rotationRad, scaleX: layerScaleX, scaleY: layerScaleY,
        };
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
    const rect = canvas.getBoundingClientRect();
    const scaleX = composition.width / rect.width;
    const scaleY = composition.height / rect.height;
    if (tool === 'pen' && penHandleRef.current) {
      const compX = (e.clientX - rect.left) * scaleX;
      const compY = (e.clientY - rect.top) * scaleY;
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
    const dx = (e.clientX - drag.startClientX) * scaleX;
    const dy = (e.clientY - drag.startClientY) * scaleY;
    if (drag.mode === 'move') {
      onMoveClipCanvas(drag.clipId, Math.round(drag.origX + dx), Math.round(drag.origY + dy));
      return;
    }
    const localDx = dx * Math.cos(-drag.rotationRad) - dy * Math.sin(-drag.rotationRad);
    const localDy = dx * Math.sin(-drag.rotationRad) + dy * Math.cos(-drag.rotationRad);
    const unscaledDx = localDx / (Math.abs(drag.scaleX) || 1);
    const unscaledDy = localDy / (Math.abs(drag.scaleY) || 1);
    if (drag.mode === 'resize-shape') {
      const width = Math.max(1, drag.origWidth + unscaledDx * 2 * drag.signX);
      const height = Math.max(1, drag.origHeight + unscaledDy * 2 * drag.signY);
      onResizeShapeCanvas(drag.clipId, width, height);
      return;
    }
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
      <div className="h-9 shrink-0 px-3 bg-[#16181D] border-b border-[#2B303A] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-[#E6E8EC] truncate">
            {composition.name}
          </span>
          {onUpdateComposition ? (
            <select
              aria-label="Sequence Aspect & Resolution Preset"
              value={
                SEQUENCE_PRESETS.find(
                  (p) => p.width === composition.width && p.height === composition.height
                )?.id ?? 'custom'
              }
              onChange={(e) => {
                const p = SEQUENCE_PRESETS.find((x) => x.id === e.target.value);
                if (p) {
                  onUpdateComposition({ width: p.width, height: p.height, fps: p.fps });
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
                (p) => p.width === composition.width && p.height === composition.height
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
            </select>
          )}

          <select
            aria-label="Monitor Zoom"
            value={zoomMode}
            onChange={(e) => setZoomMode(e.target.value as 'fit' | '50' | '100')}
            className="bg-[#111215] border border-[#2B303A] rounded px-1.5 py-0.5 text-[11px] text-[#C8CDD6] focus:outline-none"
          >
            <option value="fit">Fit</option>
            <option value="50">50%</option>
            <option value="100">100%</option>
          </select>

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

      {/* Viewport Grid (1 / 2H / 2V / 4 Quad) */}
      <div className="flex-1 min-h-0 p-3 overflow-auto bg-[#0D0E11] flex items-center justify-center">
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
              className={`relative border border-[#2B303A] overflow-hidden flex items-center justify-center ${
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
                      width:
                        composition.width >= composition.height ? '100%' : 'auto',
                      height:
                        composition.height > composition.width ? '100%' : 'auto',
                    }
                  : viewLayout === '1-view' && zoomMode !== 'fit'
                  ? {
                      width: composition.width * (zoomMode === '50' ? 0.5 : 1),
                      height: composition.height * (zoomMode === '50' ? 0.5 : 1),
                    }
                  : undefined
              }
            >
              {(viewLayout !== '1-view' || angle !== 'active') && (
                <div className="pointer-events-none absolute top-1.5 left-2 z-10 px-1.5 py-0.5 rounded bg-[#111215]/85 border border-[#2B303A] text-[10px] font-mono-tabular font-semibold tracking-wider text-[#E6E8EC] uppercase">
                  {angle === 'active' ? 'Active Camera' : `${angle} · Ortho`}
                </div>
              )}
              <ViewportCanvasSlot
                angle={angle}
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
                onPointerDown={
                  angle === 'active' ? handleCanvasPointerDown : undefined
                }
                onPointerMove={
                  angle === 'active' ? handleCanvasPointerMove : undefined
                }
                onPointerUp={angle === 'active' ? handleCanvasPointerUp : undefined}
              />
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
