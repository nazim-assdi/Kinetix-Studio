import React from 'react';
import {
  Clock,
  Diamond,
  Trash2,
  Eye,
  EyeOff,
  Sliders,
  Plus,
  RotateCcw,
  Box,
  Activity,
  GripVertical,
  Copy,
  Zap,
  Snowflake,
  FunctionSquare,
} from 'lucide-react';
import {
  AnimatableProperty,
  BlendMode,
  EffectType,
  LayerMask,
  TextAnimatorPreset,
  TimelineClip,
  TrackMatteMode,
  SpeedRampPoint,
} from '../types/editor';
import { evaluateClipTransform } from '../engine/keyframes';
import { EFFECT_LIBRARY } from '../engine/timelineOps';
import { EXPRESSION_TEMPLATES } from '../engine/expressions';
import { TEXT_ANIMATORS } from '../data/textAnimators';
import { ColorPalettePicker } from './ColorPalettePicker';

interface EffectControlsPanelProps {
  selectedClip: TimelineClip | null;
  allClips: TimelineClip[];
  playheadTime: number;
  onUpdateProperty: (
    clipId: string,
    prop: AnimatableProperty,
    value: number
  ) => void;
  onUpdateExpression: (
    clipId: string,
    prop: AnimatableProperty,
    expr: string | null
  ) => void;
  onToggleStopwatch: (clipId: string, prop: AnimatableProperty) => void;
  onToggleKeyframeAtPlayhead: (clipId: string, prop: AnimatableProperty) => void;
  onToggle3D: (clipId: string) => void;
  onSetParent: (clipId: string, parentId: string | null) => void;
  onResetTransform: (clipId: string) => void;
  onUpdateBlendMode: (clipId: string, mode: BlendMode) => void;
  onUpdateTrackMatte: (clipId: string, mode: TrackMatteMode) => void;
  onUpdateSpeed: (clipId: string, patch: { speed?: number; reversed?: boolean }) => void;
  onUpdateSpeedRamp: (clipId: string, points: SpeedRampPoint[]) => void;
  onFreezeFrame: (clipId: string) => void;
  onDuplicateClip: (clipId: string) => void;
  onRippleDeleteClip: (clipId: string) => void;
  onUpdateTextProps: (
    clipId: string,
    patch: Partial<NonNullable<TimelineClip['textProps']>>
  ) => void;
  onUpdateShapeProps: (
    clipId: string,
    patch: Partial<NonNullable<TimelineClip['shapeProps']>>
  ) => void;
  onUpdatePathProps: (
    clipId: string,
    patch: Partial<NonNullable<TimelineClip['pathProps']>>
  ) => void;
  onUpdateSolidProps: (
    clipId: string,
    patch: Partial<NonNullable<TimelineClip['solidProps']>>
  ) => void;
  onUpdateCameraProps: (
    clipId: string,
    patch: Partial<NonNullable<TimelineClip['cameraProps']>>
  ) => void;
  onUpdateLightProps: (
    clipId: string,
    patch: Partial<NonNullable<TimelineClip['lightProps']>>
  ) => void;
  onUpdateParticleProps: (
    clipId: string,
    patch: Partial<NonNullable<TimelineClip['particleProps']>>
  ) => void;
  onUpdateVisualizerProps: (
    clipId: string,
    patch: Partial<NonNullable<TimelineClip['visualizerProps']>>
  ) => void;
  onUpdateAudioProps: (
    clipId: string,
    patch: {
      volume?: number;
      fadeIn?: number;
      fadeOut?: number;
      noiseReduction?: number;
      isVoiceover?: boolean;
      duckingEnabled?: boolean;
      duckingAmount?: number;
    }
  ) => void;
  onAddEffect: (clipId: string, type: EffectType) => void;
  onToggleEffect: (clipId: string, effectId: string) => void;
  onUpdateEffectParam: (
    clipId: string,
    effectId: string,
    paramKey: string,
    value: number
  ) => void;
  onRemoveEffect: (clipId: string, effectId: string) => void;
  onUpdateMask: (clipId: string, mask: LayerMask) => void;
  onOpenGraphEditor: () => void;
  onDeleteClip: (clipId: string) => void;
  panelWidth?: number;
  onSwapDockPanels?: () => void;
}

const BASE_ROWS: {
  prop: AnimatableProperty;
  label: string;
  min?: number;
  max?: number;
  step: number;
  unit: string;
  only3D?: boolean;
  onlyShape?: boolean;
}[] = [
  { prop: 'x', label: 'Position X', step: 1, unit: 'px' },
  { prop: 'y', label: 'Position Y', step: 1, unit: 'px' },
  { prop: 'z', label: 'Position Z (Depth)', step: 1, unit: 'px', only3D: true },
  { prop: 'anchorX', label: 'Anchor Point X', step: 1, unit: 'px' },
  { prop: 'anchorY', label: 'Anchor Point Y', step: 1, unit: 'px' },
  { prop: 'scale', label: 'Scale', step: 1, unit: '%' },
  { prop: 'rotationX', label: 'X Rotation', step: 1, unit: '°', only3D: true },
  { prop: 'rotationY', label: 'Y Rotation', step: 1, unit: '°', only3D: true },
  { prop: 'rotation', label: 'Z Rotation', step: 1, unit: '°' },
  { prop: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, unit: '%' },
  { prop: 'shapeWidth', label: 'Shape Width', min: 1, step: 1, unit: 'px', onlyShape: true },
  { prop: 'shapeHeight', label: 'Shape Height', min: 1, step: 1, unit: 'px', onlyShape: true },
];

export const EffectControlsPanel: React.FC<EffectControlsPanelProps> = ({
  selectedClip,
  allClips,
  playheadTime,
  onUpdateProperty,
  onUpdateExpression,
  onToggleStopwatch,
  onToggleKeyframeAtPlayhead,
  onToggle3D,
  onSetParent,
  onResetTransform,
  onUpdateBlendMode,
  onUpdateTrackMatte,
  onUpdateSpeed,
  onUpdateSpeedRamp,
  onFreezeFrame,
  onDuplicateClip,
  onRippleDeleteClip,
  onUpdateTextProps,
  onUpdateShapeProps,
  onUpdatePathProps,
  onUpdateSolidProps,
  onUpdateCameraProps,
  onUpdateLightProps,
  onUpdateParticleProps,
  onUpdateVisualizerProps,
  onUpdateAudioProps,
  onAddEffect,
  onToggleEffect,
  onUpdateEffectParam,
  onRemoveEffect,
  onUpdateMask,
  onOpenGraphEditor,
  onDeleteClip,
  panelWidth = 320,
  onSwapDockPanels,
}) => {
  if (!selectedClip) {
    return (
      <aside
        aria-label="Effect Controls"
        style={{ width: panelWidth }}
        className="shrink-0 bg-[#181A1F] border-x border-[#2B303A] flex flex-col min-h-0"
      >
        <div
          draggable
          onDragStart={(e) => e.dataTransfer.setData('application/x-kinetix-panel', 'inspector')}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            if (e.dataTransfer.getData('application/x-kinetix-panel') === 'dock') {
              onSwapDockPanels?.();
            }
          }}
          title="Drag header to swap panel side"
          className="h-9 shrink-0 px-3 bg-[#14161A] border-b border-[#2B303A] flex items-center gap-2 cursor-grab"
        >
          <GripVertical className="w-3 h-3 text-[#6E7685]" />
          <Sliders className="w-3.5 h-3.5 text-[#8B5CF6]" />
          <span className="text-xs font-semibold text-[#E6E8EC]">
            Effect Controls
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Sliders className="w-7 h-7 text-[#4B5261] mb-2.5" />
          <p className="text-xs font-medium text-[#C8CDD6] mb-1">
            No Layer Selected
          </p>
          <p className="text-[11px] text-[#7E8594] leading-relaxed">
            Click any clip, Camera, Light, Null, or Pen Path to inspect 3D
            Transform, Parenting, and Effects.
          </p>
        </div>
      </aside>
    );
  }

  const localTime = Math.max(
    0,
    Math.min(selectedClip.duration, playheadTime - selectedClip.start)
  );
  const currentTransform = evaluateClipTransform(selectedClip, playheadTime);
  const isVisual =
    selectedClip.kind !== 'audio' &&
    selectedClip.kind !== 'camera' &&
    selectedClip.kind !== 'light';
  const showTransform = selectedClip.kind !== 'audio' && selectedClip.kind !== 'adjustment';
  const visibleRows = BASE_ROWS.filter(
    (r) => (!r.only3D || selectedClip.is3D || selectedClip.kind === 'camera' || selectedClip.kind === 'light') && (!r.onlyShape || selectedClip.kind === 'shape')
  );
  const parentCandidates = allClips.filter(
    (c) => c.id !== selectedClip.id && c.kind !== 'audio'
  );
  const speedRampPoints = selectedClip.speedRamp ?? [];
  const updateSpeedRampPoint = (pointId: string, patch: Partial<SpeedRampPoint>) => {
    onUpdateSpeedRamp(
      selectedClip.id,
      speedRampPoints
        .map((point) => point.id === pointId ? { ...point, ...patch } : point)
        .sort((a, b) => a.time - b.time)
    );
  };
  const addSpeedRampPoint = () => {
    const baseSpeed = selectedClip.speed ?? 1;
    const currentTime = Math.max(0, Math.min(selectedClip.duration, playheadTime - selectedClip.start));
    const points: SpeedRampPoint[] = speedRampPoints.length > 0
      ? [...speedRampPoints]
      : [
          { id: `speed-start-${selectedClip.id}`, time: 0, speed: baseSpeed },
          { id: `speed-end-${selectedClip.id}`, time: selectedClip.duration, speed: baseSpeed },
        ];
    const nearest = points.find((point) => Math.abs(point.time - currentTime) < 0.015);
    if (nearest) {
      onUpdateSpeedRamp(selectedClip.id, points);
      return;
    }
    points.push({
      id: `speed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: currentTime,
      speed: baseSpeed,
    });
    onUpdateSpeedRamp(selectedClip.id, points.sort((a, b) => a.time - b.time));
  };

  return (
    <aside
      aria-label="Effect Controls"
      style={{ width: panelWidth }}
      className="shrink-0 bg-[#181A1F] border-x border-[#2B303A] flex flex-col min-h-0"
    >
      {/* Header */}
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData('application/x-kinetix-panel', 'inspector')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (e.dataTransfer.getData('application/x-kinetix-panel') === 'dock') {
            onSwapDockPanels?.();
          }
        }}
        title="Drag header to swap panel side"
        className="h-9 shrink-0 px-3 bg-[#14161A] border-b border-[#2B303A] flex items-center justify-between gap-2 cursor-grab"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical className="w-3 h-3 text-[#6E7685] shrink-0" />
          <Sliders className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0" />
          <span className="text-xs font-semibold text-[#E6E8EC] truncate">
            {selectedClip.name}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isVisual && (
            <button
              type="button"
              onClick={() => onToggle3D(selectedClip.id)}
              title="Toggle 3D Layer"
              aria-label="Toggle 3D Layer"
              aria-pressed={selectedClip.is3D}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                selectedClip.is3D
                  ? 'bg-[#8B5CF6] text-white'
                  : 'bg-[#232730] text-[#9BA1AD] hover:text-white'
              }`}
            >
              <Box className="w-3 h-3" />
              <span>3D</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onDuplicateClip(selectedClip.id)}
            title="Duplicate Clip"
            aria-label="Duplicate Clip"
            className="p-1 rounded text-[#9BA1AD] hover:text-white hover:bg-[#232730] transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRippleDeleteClip(selectedClip.id)}
            title="Ripple Delete (Close Gap)"
            aria-label="Ripple Delete Clip"
            className="p-1 rounded text-[#9BA1AD] hover:text-[#F59E0B] hover:bg-[#232730] transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteClip(selectedClip.id)}
            title="Delete Selected Clip (Delete)"
            aria-label={`Delete clip ${selectedClip.name}`}
            className="p-1 rounded text-[#9BA1AD] hover:text-[#EF4444] hover:bg-[#232730] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Inspector */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#242831] min-h-0">
        {showTransform && (
          <div className="p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs font-semibold text-[#E6E8EC]">
                {selectedClip.is3D ? '3D Transform' : 'Motion & Transform'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenGraphEditor}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#232730] hover:bg-[#3B82F6] border border-[#323845] text-[10px] font-medium text-[#E6E8EC] hover:text-white transition-colors"
                >
                  <Activity className="w-3 h-3" />
                  <span>Open Graph Editor</span>
                </button>
                <button
                  type="button"
                  onClick={() => onResetTransform(selectedClip.id)}
                  title="Reset Transform"
                  aria-label="Reset Transform"
                  className="flex items-center gap-1 text-[11px] text-[#9BA1AD] hover:text-white transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {visibleRows.map((row) => {
                const kfs = selectedClip.keyframes[row.prop] ?? [];
                const keyframingActive = kfs.length > 0;
                const hasKfHere = kfs.some((k) => Math.abs(k.time - localTime) <= 0.05);
                const val = Number((currentTransform[row.prop] ?? 0).toFixed(1));
                const expr = selectedClip.expressions?.[row.prop];

                return (
                  <div key={row.prop} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            onToggleStopwatch(selectedClip.id, row.prop)
                          }
                          title={`Toggle ${row.label} Keyframes (Stopwatch)`}
                          aria-label={`Toggle ${row.label} keyframing`}
                          aria-pressed={keyframingActive}
                          className={`p-0.5 rounded transition-colors ${
                            keyframingActive
                              ? 'text-[#3B82F6] bg-[#3B82F6]/15'
                              : 'text-[#6E7685] hover:text-[#C8CDD6]'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateExpression(
                              selectedClip.id,
                              row.prop,
                              expr !== undefined ? null : 'value + wiggle(3, 18)'
                            )
                          }
                          title={`Toggle AE Expression for ${row.label}`}
                          aria-label={`Toggle expression for ${row.label}`}
                          aria-pressed={expr !== undefined}
                          className={`p-0.5 rounded transition-colors ${
                            expr !== undefined
                              ? 'text-[#14B8A6] bg-[#14B8A6]/15'
                              : 'text-[#6E7685] hover:text-[#C8CDD6]'
                          }`}
                        >
                          <FunctionSquare className="w-3 h-3" />
                        </button>
                        <span className="text-[11px] text-[#C8CDD6] truncate">
                          {row.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onToggleKeyframeAtPlayhead(selectedClip.id, row.prop)
                          }
                          title={`Add or remove ${row.label} keyframe at playhead`}
                          aria-label={`Add or remove ${row.label} keyframe`}
                          className={`p-0.5 rounded transition-colors ${
                            hasKfHere
                              ? 'text-[#F59E0B]'
                              : 'text-[#6E7685] hover:text-[#C8CDD6]'
                          }`}
                        >
                          <Diamond
                            className={`w-3 h-3 ${hasKfHere ? 'fill-current' : ''}`}
                          />
                        </button>

                        <span className="font-mono-tabular text-[11px] text-[#60A5FA] w-14 text-right">
                          {val}
                          {row.unit}
                        </span>
                      </div>
                    </div>

                    {(() => {
                      const bounds: Record<AnimatableProperty, [number, number]> = {
                        x: [-4000, 4000], y: [-4000, 4000], z: [-10000, 10000], scale: [0, 1000],
                        rotation: [-720, 720], rotationX: [-720, 720], rotationY: [-720, 720], opacity: [0, 100],
                        anchorX: [-4000, 4000], anchorY: [-4000, 4000], shapeWidth: [1, 8192], shapeHeight: [1, 8192], volume: [0, 200],
                      };
                      const [minimum, maximum] = bounds[row.prop];
                      return <input type="range" aria-label={`${row.label} Drag Control`} min={minimum} max={maximum}
                        step={row.prop === 'scale' || row.prop === 'opacity' ? 1 : row.step}
                        value={Math.min(maximum, Math.max(minimum, val))}
                        onChange={(e) => onUpdateProperty(selectedClip.id, row.prop, Number(e.target.value))}
                        className="w-full studio-slider" />;
                    })()}
                    <input
                      type="number"
                      aria-label={row.label}
                      min={row.min}
                      max={row.max}
                      step={row.step}
                      value={val}
                      onChange={(e) => {
                        if (e.target.value !== '' && Number.isFinite(Number(e.target.value))) {
                          onUpdateProperty(selectedClip.id, row.prop, Number(e.target.value));
                        }
                      }}
                      className="w-full bg-[#0E1013] border border-[#2B303A] rounded px-2 py-1 text-xs font-mono-tabular text-[#E6E8EC] focus:border-[#3B82F6] focus:outline-none"
                    />

                    {expr !== undefined && (
                      <div className="flex items-center gap-1 pt-0.5">
                        <input
                          type="text"
                          aria-label={`${row.label} Expression`}
                          value={expr}
                          onChange={(e) =>
                            onUpdateExpression(
                              selectedClip.id,
                              row.prop,
                              e.target.value
                            )
                          }
                          className="flex-1 bg-[#0E1013] border border-[#14B8A6]/50 rounded px-1.5 py-0.5 text-[10px] font-mono text-[#5EEAD4] focus:outline-none"
                        />
                        <select
                          aria-label={`${row.label} Expression Preset`}
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              onUpdateExpression(
                                selectedClip.id,
                                row.prop,
                                e.target.value
                              );
                            }
                          }}
                          className="bg-[#111215] border border-[#2B303A] rounded px-1 py-0.5 text-[10px] text-[#9BA1AD]"
                        >
                          <option value="">fx</option>
                          {EXPRESSION_TEMPLATES.map((t) => (
                            <option key={t.label} value={t.expr}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Parent Layer, Blend Mode, Track Matte & Speed Remapping */}
            <div className="pt-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="parent-layer-select"
                  className="text-[11px] text-[#C8CDD6]"
                >
                  Parent Link
                </label>
                <select
                  id="parent-layer-select"
                  value={selectedClip.parentId ?? ''}
                  onChange={(e) =>
                    onSetParent(
                      selectedClip.id,
                      e.target.value ? e.target.value : null
                    )
                  }
                  className="w-40 bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-[#E6E8EC] focus:outline-none"
                >
                  <option value="">None</option>
                  {parentCandidates.map((pc) => (
                    <option key={pc.id} value={pc.id}>
                      {pc.name} ({pc.kind})
                    </option>
                  ))}
                </select>
              </div>

              {isVisual && selectedClip.kind !== 'null' && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="blend-mode-select"
                      className="text-[11px] text-[#C8CDD6]"
                    >
                      Blend Mode
                    </label>
                    <select
                      id="blend-mode-select"
                      value={selectedClip.blendMode}
                      onChange={(e) =>
                        onUpdateBlendMode(
                          selectedClip.id,
                          e.target.value as BlendMode
                        )
                      }
                      className="w-40 bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-[#E6E8EC] focus:outline-none"
                    >
                      <option value="normal">Normal</option>
                      <option value="multiply">Multiply</option>
                      <option value="screen">Screen</option>
                      <option value="overlay">Overlay</option>
                      <option value="add">Add (Linear Dodge)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="track-matte-select"
                      className="text-[11px] text-[#C8CDD6]"
                    >
                      Track Matte
                    </label>
                    <select
                      id="track-matte-select"
                      value={selectedClip.trackMatte ?? 'none'}
                      onChange={(e) =>
                        onUpdateTrackMatte(
                          selectedClip.id,
                          e.target.value as TrackMatteMode
                        )
                      }
                      className="w-40 bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-[#E6E8EC] focus:outline-none"
                    >
                      <option value="none">No Matte</option>
                      <option value="alpha">Alpha Matte</option>
                      <option value="alpha-inverted">Alpha Inverted</option>
                      <option value="luma">Luma Matte</option>
                    </select>
                  </div>

                  {/* Speed / Reverse / Freeze Frame */}
                  <div className="bg-[#14161A] border border-[#262B34] rounded p-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#C8CDD6]">
                        Speed ({(selectedClip.speed ?? 1).toFixed(2)}x)
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-[10px] text-[#9BA1AD] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedClip.reversed)}
                            onChange={(e) =>
                              onUpdateSpeed(selectedClip.id, {
                                reversed: e.target.checked,
                              })
                            }
                            className="accent-[#3B82F6]"
                          />
                          <span>Reverse</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => onFreezeFrame(selectedClip.id)}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#232730] hover:bg-[#3B82F6] text-[10px] text-[#E6E8EC]"
                        >
                          <Snowflake className="w-2.5 h-2.5" />
                          <span>Freeze</span>
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      aria-label="Clip Speed"
                      min={0.1}
                      max={8}
                      step={0.05}
                      value={selectedClip.speed ?? 1}
                      onChange={(e) =>
                        onUpdateSpeed(selectedClip.id, {
                          speed: Number(e.target.value),
                        })
                      }
                      className="w-full studio-slider"
                    />
                    <div className="pt-2 border-t border-[#2B303A] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-[#C4B5FD]">
                          Speed Ramping {speedRampPoints.length > 0 ? `· ${speedRampPoints.length} points` : ''}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={addSpeedRampPoint}
                            className="px-1.5 py-0.5 rounded bg-[#343047] text-[9px] text-[#DDD6FE] hover:bg-[#514276]"
                          >+ Point Here</button>
                          {speedRampPoints.length > 0 && (
                            <button
                              type="button"
                              onClick={() => onUpdateSpeedRamp(selectedClip.id, [])}
                              className="px-1.5 py-0.5 rounded bg-[#232730] text-[9px] text-[#9BA1AD] hover:text-white"
                            >Reset</button>
                          )}
                        </div>
                      </div>
                      {speedRampPoints.length > 0 ? (
                        <div className="space-y-1.5">
                          {speedRampPoints.map((point, index) => (
                            <div key={point.id} className="rounded bg-[#111215] p-1.5">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[9px] text-[#9BA1AD]">Point {index + 1}</span>
                                <button
                                  type="button"
                                  aria-label={`Remove speed point ${index + 1}`}
                                  onClick={() => onUpdateSpeedRamp(selectedClip.id, speedRampPoints.filter((entry) => entry.id !== point.id))}
                                  className="text-[9px] text-[#F87171] hover:text-white"
                                >Remove</button>
                              </div>
                              <div className="grid grid-cols-[1fr_1fr] gap-2">
                                <label className="text-[9px] text-[#7E8594]">Time (s)
                                  <input
                                    type="number"
                                    aria-label={`Speed point ${index + 1} time`}
                                    min={0}
                                    max={selectedClip.duration}
                                    step={0.01}
                                    value={Number(point.time.toFixed(2))}
                                    onChange={(e) => updateSpeedRampPoint(point.id, {
                                      time: Math.max(0, Math.min(selectedClip.duration, Number(e.target.value) || 0)),
                                    })}
                                    className="mt-1 w-full bg-[#0B0D10] border border-[#2B303A] rounded px-1.5 py-1 text-[10px] text-white"
                                  />
                                </label>
                                <label className="text-[9px] text-[#7E8594]">Speed ({point.speed.toFixed(2)}x)
                                  <input
                                    type="range"
                                    aria-label={`Speed point ${index + 1} speed`}
                                    min={0.1}
                                    max={8}
                                    step={0.05}
                                    value={point.speed}
                                    onChange={(e) => updateSpeedRampPoint(point.id, { speed: Number(e.target.value) })}
                                    className="w-full studio-slider"
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[9px] text-[#737C8B]">Add points at different times, then change their speed to create smooth slow-motion and fast ramps.</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Physical Camera Layer Options */}
        {selectedClip.kind === 'camera' && selectedClip.cameraProps && (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#FBBF24]">Camera · Full Frame Lens</span>
              <span className="text-[9px] text-[#7E8594] rounded bg-[#252932] px-1.5 py-0.5">3D</span>
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#C8CDD6]">Field of View</span>
                <span className="font-mono-tabular text-[#FBBF24]">{selectedClip.cameraProps.fov.toFixed(1)}°</span>
              </div>
              <input
                type="range"
                aria-label="Camera FOV"
                min={12}
                max={110}
                step={0.5}
                value={selectedClip.cameraProps.fov}
                onChange={(e) => {
                  const fov = Number(e.target.value);
                  const sensorWidth = selectedClip.cameraProps?.sensorWidth ?? 36;
                  const focalLength = sensorWidth / (2 * Math.tan(fov * Math.PI / 360));
                  onUpdateCameraProps(selectedClip.id, { fov, focalLength });
                }}
                className="w-full studio-slider"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#C8CDD6]">Focal Length</span>
                <span className="font-mono-tabular text-[#FBBF24]">{selectedClip.cameraProps.focalLength.toFixed(1)}mm</span>
              </div>
              <input
                type="range"
                aria-label="Focal Length"
                min={8}
                max={200}
                step={1}
                value={selectedClip.cameraProps.focalLength}
                onChange={(e) => {
                  const focalLength = Number(e.target.value);
                  const sensorWidth = selectedClip.cameraProps?.sensorWidth ?? 36;
                  const fov = (2 * Math.atan(sensorWidth / (2 * focalLength))) * 180 / Math.PI;
                  onUpdateCameraProps(selectedClip.id, { focalLength, fov });
                }}
                className="w-full studio-slider"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#C8CDD6]">Sensor Width</span>
                <span className="font-mono-tabular text-[#FBBF24]">{selectedClip.cameraProps.sensorWidth ?? 36}mm</span>
              </div>
              <input
                type="range"
                aria-label="Camera Sensor Width"
                min={18}
                max={70}
                step={1}
                value={selectedClip.cameraProps.sensorWidth ?? 36}
                onChange={(e) => {
                  const sensorWidth = Number(e.target.value);
                  const focalLength = selectedClip.cameraProps?.focalLength ?? 35;
                  const fov = (2 * Math.atan(sensorWidth / (2 * focalLength))) * 180 / Math.PI;
                  onUpdateCameraProps(selectedClip.id, { sensorWidth, fov });
                }}
                className="w-full studio-slider"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[#2B303A] pt-2">
              {([
                ['Lens Shift X', 'lensShiftX'],
                ['Lens Shift Y', 'lensShiftY'],
              ] as const).map(([label, key]) => (
                <label key={key} className="block text-[10px] text-[#9BA1AD]">
                  <span className="mb-1 flex justify-between gap-1">
                    <span>{label}</span>
                    <span className="font-mono-tabular text-[#FBBF24]">{(selectedClip.cameraProps?.[key] ?? 0).toFixed(1)}%</span>
                  </span>
                  <input
                    type="range"
                    aria-label={label}
                    min={-20}
                    max={20}
                    step={0.1}
                    value={selectedClip.cameraProps?.[key] ?? 0}
                    onChange={(event) => onUpdateCameraProps(selectedClip.id, { [key]: Number(event.target.value) })}
                    className="w-full studio-slider"
                  />
                </label>
              ))}
            </div>

            <div className="border-t border-[#2B303A] pt-2 space-y-2">
              <label className="flex items-center justify-between text-[11px] text-[#C8CDD6]">
                <span>Aim at Target</span>
                <input
                  type="checkbox"
                  aria-label="Enable Camera Look At Target"
                  checked={Boolean(selectedClip.cameraProps.useTarget)}
                  onChange={(e) => onUpdateCameraProps(selectedClip.id, { useTarget: e.target.checked })}
                  className="accent-[#F59E0B]"
                />
              </label>
              {selectedClip.cameraProps.useTarget && (
                <div className="grid grid-cols-3 gap-1.5">
                  {(['lookAtX', 'lookAtY', 'lookAtZ'] as const).map((axis) => (
                    <label key={axis} className="text-[9px] text-[#9BA1AD]">
                      {axis.replace('lookAt', '')}
                      <input
                        type="number"
                        aria-label={`Camera Target ${axis}`}
                        value={selectedClip.cameraProps?.[axis] ?? 0}
                        onChange={(e) => onUpdateCameraProps(selectedClip.id, { [axis]: Number(e.target.value) })}
                        className="mt-1 w-full bg-[#0E1013] border border-[#2B303A] rounded px-1.5 py-1 text-[11px] text-white"
                      />
                    </label>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-[#9BA1AD]">Near Clip
                  <input
                    type="number"
                    aria-label="Camera Near Clip"
                    min={0.1}
                    max={5000}
                    step={1}
                    value={selectedClip.cameraProps.nearClip ?? 10}
                    onChange={(e) => onUpdateCameraProps(selectedClip.id, { nearClip: Math.max(0.1, Number(e.target.value)) })}
                    className="mt-1 w-full bg-[#0E1013] border border-[#2B303A] rounded px-2 py-1 text-xs text-white"
                  />
                </label>
                <label className="text-[10px] text-[#9BA1AD]">Far Clip
                  <input
                    type="number"
                    aria-label="Camera Far Clip"
                    min={100}
                    max={1000000}
                    step={100}
                    value={selectedClip.cameraProps.farClip ?? 100000}
                    onChange={(e) => onUpdateCameraProps(selectedClip.id, { farClip: Math.max((selectedClip.cameraProps?.nearClip ?? 10) + 1, Number(e.target.value)) })}
                    className="mt-1 w-full bg-[#0E1013] border border-[#2B303A] rounded px-2 py-1 text-xs text-white"
                  />
                </label>
              </div>
            </div>

            <div className="border-t border-[#2B303A] pt-2 space-y-2">
              <label className="flex items-center justify-between text-[11px] text-[#C8CDD6]">
                <span>Depth of Field</span>
                <input
                  type="checkbox"
                  aria-label="Enable Camera Depth of Field"
                  checked={selectedClip.cameraProps.depthOfField}
                  onChange={(e) => onUpdateCameraProps(selectedClip.id, { depthOfField: e.target.checked })}
                  className="accent-[#F59E0B]"
                />
              </label>
              {selectedClip.cameraProps.depthOfField && (
                <>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[#9BA1AD]">Focus Distance</span>
                      <span className="font-mono-tabular text-[#FBBF24]">{selectedClip.cameraProps.focusDistance ?? 900}</span>
                    </div>
                    <input
                      type="range"
                      aria-label="Camera Focus Distance"
                      min={20}
                      max={10000}
                      step={10}
                      value={selectedClip.cameraProps.focusDistance ?? 900}
                      onChange={(e) => onUpdateCameraProps(selectedClip.id, { focusDistance: Number(e.target.value) })}
                      className="w-full studio-slider"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[#9BA1AD]">Aperture · f-stop</span>
                      <span className="font-mono-tabular text-[#FBBF24]">f/{selectedClip.cameraProps.aperture.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      aria-label="Camera Aperture"
                      min={0.7}
                      max={16}
                      step={0.1}
                      value={selectedClip.cameraProps.aperture}
                      onChange={(e) => onUpdateCameraProps(selectedClip.id, { aperture: Number(e.target.value) })}
                      className="w-full studio-slider"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Light Layer Options */}
        {selectedClip.kind === 'light' && selectedClip.lightProps && (
          <div className="p-3 space-y-2.5">
            <span className="text-xs font-semibold text-[#FDE047] block">
              3D Light Settings
            </span>
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-[#C8CDD6]">Light Type</label>
              <select
                aria-label="Light Type"
                value={selectedClip.lightProps.lightType}
                onChange={(e) =>
                  onUpdateLightProps(selectedClip.id, {
                    lightType: e.target.value as NonNullable<
                      TimelineClip['lightProps']
                    >['lightType'],
                  })
                }
                className="bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-[#E6E8EC]"
              >
                <option value="spot">Spot</option>
                <option value="point">Point</option>
                <option value="parallel">Parallel</option>
                <option value="ambient">Ambient</option>
              </select>
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#C8CDD6]">Intensity</span>
                <span className="font-mono-tabular text-[#FDE047]">
                  {selectedClip.lightProps.intensity}%
                </span>
              </div>
              <input
                type="range"
                aria-label="Light Intensity"
                min={0}
                max={200}
                value={selectedClip.lightProps.intensity}
                onChange={(e) =>
                  onUpdateLightProps(selectedClip.id, {
                    intensity: Number(e.target.value),
                  })
                }
                className="w-full studio-slider"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-[#C8CDD6]">Light Color</label>
              <input
                type="color"
                aria-label="Light Color"
                value={selectedClip.lightProps.color}
                onChange={(e) =>
                  onUpdateLightProps(selectedClip.id, { color: e.target.value })
                }
                className="w-8 h-6 rounded bg-transparent border border-[#2B303A] cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Solid Layer Options */}
        {selectedClip.kind === 'solid' && selectedClip.solidProps && (
          <div className="p-3 space-y-2.5">
            <span className="text-xs font-semibold text-[#E6E8EC] block">
              Solid Matte Settings
            </span>
            <ColorPalettePicker
              onApply={(palette) => onUpdateSolidProps(selectedClip.id, { color: palette.colors[1] })}
            />
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-[#C8CDD6]">Solid Color</label>
              <input
                type="color"
                aria-label="Solid Color"
                value={selectedClip.solidProps.color}
                onChange={(e) =>
                  onUpdateSolidProps(selectedClip.id, { color: e.target.value })
                }
                className="w-8 h-6 rounded bg-transparent border border-[#2B303A] cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Pen Path Options */}
        {selectedClip.kind === 'path' && selectedClip.pathProps && (
          <div className="p-3 space-y-2.5">
            <span className="text-xs font-semibold text-[#60A5FA] block">
              Pen Vector Path &amp; Trim Paths
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-[#9BA1AD] block mb-1">
                  Trim Start ({selectedClip.pathProps.trimStart}%)
                </label>
                <input
                  type="range"
                  aria-label="Path Trim Start"
                  min={0}
                  max={100}
                  value={selectedClip.pathProps.trimStart}
                  onChange={(e) =>
                    onUpdatePathProps(selectedClip.id, {
                      trimStart: Number(e.target.value),
                    })
                  }
                  className="w-full studio-slider"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#9BA1AD] block mb-1">
                  Trim End ({selectedClip.pathProps.trimEnd}%)
                </label>
                <input
                  type="range"
                  aria-label="Path Trim End"
                  min={0}
                  max={100}
                  value={selectedClip.pathProps.trimEnd}
                  onChange={(e) =>
                    onUpdatePathProps(selectedClip.id, {
                      trimEnd: Number(e.target.value),
                    })
                  }
                  className="w-full studio-slider"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-[#C8CDD6]">Stroke Color</label>
              <input
                type="color"
                aria-label="Path Stroke Color"
                value={selectedClip.pathProps.strokeColor}
                onChange={(e) =>
                  onUpdatePathProps(selectedClip.id, {
                    strokeColor: e.target.value,
                  })
                }
                className="w-8 h-6 rounded bg-transparent border border-[#2B303A] cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Text Layer Properties — direct typography controls, no preset palette. */}
        {selectedClip.kind === 'text' && selectedClip.textProps && (
          <div className="p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#E6E8EC]">Text & Typography</span>
              <button
                type="button"
                onClick={() => onToggle3D(selectedClip.id)}
                aria-pressed={selectedClip.is3D}
                className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${selectedClip.is3D ? 'bg-[#8B5CF6] text-white' : 'bg-[#232730] text-[#C8CDD6] hover:text-white'}`}
              >
                {selectedClip.is3D ? '3D Text On' : 'Enable 3D Text'}
              </button>
            </div>
            <input
              type="text"
              aria-label="Text Content"
              value={selectedClip.textProps.text}
              onChange={(e) => onUpdateTextProps(selectedClip.id, { text: e.target.value })}
              className="w-full bg-[#111215] border border-[#2B303A] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#3B82F6]"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] text-[#9BA1AD]">Font Family
                <select
                  aria-label="Text Font Family"
                  value={selectedClip.textProps.fontFamily ?? 'Plus Jakarta Sans'}
                  onChange={(e) => onUpdateTextProps(selectedClip.id, { fontFamily: e.target.value })}
                  className="mt-1 w-full bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-[11px] text-white"
                >
                  <option>Plus Jakarta Sans</option>
                  <option>Arial</option>
                  <option>Arial Black</option>
                  <option>Impact</option>
                  <option>Georgia</option>
                  <option>Times New Roman</option>
                  <option>Trebuchet MS</option>
                  <option>Courier New</option>
                  <option>Verdana</option>
                  <option>Tahoma</option>
                </select>
              </label>
              <label className="text-[10px] text-[#9BA1AD]">Alignment
                <select
                  aria-label="Text Alignment"
                  value={selectedClip.textProps.align}
                  onChange={(e) => onUpdateTextProps(selectedClip.id, { align: e.target.value as 'left' | 'center' | 'right' })}
                  className="mt-1 w-full bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-[11px] text-white"
                >
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[10px] text-[#9BA1AD]">
                Font Size · {selectedClip.textProps.fontSize}px
                <input type="range" aria-label="Font Size" min={8} max={300} value={selectedClip.textProps.fontSize}
                  onChange={(e) => onUpdateTextProps(selectedClip.id, { fontSize: Number(e.target.value) })} className="mt-1 w-full studio-slider" />
              </label>
              <label className="block text-[10px] text-[#9BA1AD]">
                Font Weight · {selectedClip.textProps.fontWeight}
                <input type="range" aria-label="Font Weight" min={100} max={900} step={100} value={selectedClip.textProps.fontWeight}
                  onChange={(e) => onUpdateTextProps(selectedClip.id, { fontWeight: Number(e.target.value) })} className="mt-1 w-full studio-slider" />
              </label>
              <label className="block text-[10px] text-[#9BA1AD]">
                Tracking · {selectedClip.textProps.letterSpacing}px
                <input type="range" aria-label="Letter Spacing" min={-8} max={60} value={selectedClip.textProps.letterSpacing}
                  onChange={(e) => onUpdateTextProps(selectedClip.id, { letterSpacing: Number(e.target.value) })} className="mt-1 w-full studio-slider" />
              </label>
              <label className="block text-[10px] text-[#9BA1AD]">
                Outline · {selectedClip.textProps.strokeWidth ?? 0}px
                <input type="range" aria-label="Text Outline Width" min={0} max={16} step={0.5} value={selectedClip.textProps.strokeWidth ?? 0}
                  onChange={(e) => onUpdateTextProps(selectedClip.id, { strokeWidth: Number(e.target.value) })} className="mt-1 w-full studio-slider" />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[10px] text-[#9BA1AD]">Fill
                <input type="color" aria-label="Text Color" value={selectedClip.textProps.color}
                  onChange={(e) => onUpdateTextProps(selectedClip.id, { color: e.target.value })}
                  className="mt-1 w-full h-8 rounded bg-transparent border border-[#2B303A] cursor-pointer" />
              </label>
              <label className="text-[10px] text-[#9BA1AD]">Outline
                <input type="color" aria-label="Text Outline Color" value={selectedClip.textProps.strokeColor ?? '#0F172A'}
                  onChange={(e) => onUpdateTextProps(selectedClip.id, { strokeColor: e.target.value })}
                  className="mt-1 w-full h-8 rounded bg-transparent border border-[#2B303A] cursor-pointer" />
              </label>
              <label className="text-[10px] text-[#9BA1AD]">Background
                <input type="color" aria-label="Text Background Color" value={selectedClip.textProps.backgroundColor ?? '#111827'}
                  onChange={(e) => onUpdateTextProps(selectedClip.id, { backgroundColor: e.target.value })}
                  className="mt-1 w-full h-8 rounded bg-transparent border border-[#2B303A] cursor-pointer" />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onUpdateTextProps(selectedClip.id, { backgroundColor: undefined })}
                className="px-2 py-1 rounded bg-[#232730] text-[10px] text-[#9BA1AD] hover:text-white">No Background</button>
              <button type="button" onClick={() => onUpdateTextProps(selectedClip.id, { strokeWidth: 0 })}
                className="px-2 py-1 rounded bg-[#232730] text-[10px] text-[#9BA1AD] hover:text-white">No Outline</button>
            </div>

            {selectedClip.is3D && (
              <div className="rounded border border-[#8B5CF6]/40 bg-[#171422] p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#C4B5FD]">3D Text Extrusion</span>
                  <span className="text-[10px] font-mono-tabular text-[#DDD6FE]">{selectedClip.textProps.extrusionDepth ?? 24}px</span>
                </div>
                <input type="range" aria-label="3D Text Extrusion Depth" min={0} max={120} step={1}
                  value={selectedClip.textProps.extrusionDepth ?? 24}
                  onChange={(e) => onUpdateTextProps(selectedClip.id, { extrusionDepth: Number(e.target.value) })}
                  className="w-full studio-slider" />
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[10px] text-[#9BA1AD]">Side Material</label>
                  <input type="color" aria-label="3D Text Extrusion Color" value={selectedClip.textProps.extrusionColor ?? '#334155'}
                    onChange={(e) => onUpdateTextProps(selectedClip.id, { extrusionColor: e.target.value })}
                    className="w-10 h-7 rounded bg-transparent border border-[#2B303A] cursor-pointer" />
                </div>
                <span className="text-[9px] text-[#8B95A7]">Text is rasterized into the existing 3D camera plane; extrusion depth and material are editable per text layer.</span>
              </div>
            )}

            <div className="pt-2 border-t border-[#2B303A] space-y-2">
              <div className="text-[10px] font-semibold text-[#9BA1AD] uppercase tracking-wider">Text Animation</div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] text-[#C8CDD6]">Animator</label>
                <select
                  aria-label="Text Animator Preset"
                  value={selectedClip.textProps.animator ?? 'none'}
                  onChange={(e) => onUpdateTextProps(selectedClip.id, { animator: e.target.value as TextAnimatorPreset })}
                  className="w-48 bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-[#E6E8EC]"
                >
                  <option value="none">Static / Keyframed</option>
                  <option value="typewriter">Typewriter</option>
                  <option value="slide-up">Slide-Up</option>
                  <option value="word-pop">Word-by-Word Pop</option>
                  <option value="glitch-decode">Glitch Decode</option>
                  {Array.from(new Set(TEXT_ANIMATORS.map((animator) => animator.category))).map((category) => (
                    <optgroup key={category} label={category}>
                      {TEXT_ANIMATORS.filter((animator) => animator.category === category).map((animator) => (
                        <option key={animator.id} value={animator.id}>{animator.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Particle System Properties */}
        {selectedClip.kind === 'particles' && selectedClip.particleProps && (
          <div className="p-3 space-y-2.5">
            <span className="text-xs font-semibold text-[#F59E0B] block">
              CC Particle World
            </span>
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-[#C8CDD6]">Emitter Style</label>
              <select
                aria-label="Particle Style"
                value={selectedClip.particleProps.style}
                onChange={(e) =>
                  onUpdateParticleProps(selectedClip.id, {
                    style: e.target.value as NonNullable<
                      TimelineClip['particleProps']
                    >['style'],
                  })
                }
                className="w-36 bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-[#E6E8EC]"
              >
                <option value="sparks">Ember Sparks</option>
                <option value="snow">Winter Snow</option>
                <option value="bokeh">Cinema Bokeh</option>
                <option value="matrix">Digital Rain</option>
                <option value="confetti">Celebration Confetti</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[#9BA1AD] block mb-1">
                  Count ({selectedClip.particleProps.count})
                </label>
                <input
                  type="range"
                  aria-label="Particle Count"
                  min={20}
                  max={220}
                  value={selectedClip.particleProps.count}
                  onChange={(e) =>
                    onUpdateParticleProps(selectedClip.id, {
                      count: Number(e.target.value),
                    })
                  }
                  className="w-full studio-slider"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#9BA1AD] block mb-1">
                  Speed ({selectedClip.particleProps.speed}x)
                </label>
                <input
                  type="range"
                  aria-label="Particle Speed"
                  min={0.2}
                  max={4}
                  step={0.2}
                  value={selectedClip.particleProps.speed}
                  onChange={(e) =>
                    onUpdateParticleProps(selectedClip.id, {
                      speed: Number(e.target.value),
                    })
                  }
                  className="w-full studio-slider"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-[#C8CDD6]">Particle Color</label>
              <input
                type="color"
                aria-label="Particle Color"
                value={selectedClip.particleProps.color}
                onChange={(e) =>
                  onUpdateParticleProps(selectedClip.id, { color: e.target.value })
                }
                className="w-8 h-6 rounded bg-transparent border border-[#2B303A] cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Audio Visualizer Properties */}
        {selectedClip.kind === 'visualizer' && selectedClip.visualizerProps && (
          <div className="p-3 space-y-2.5">
            <span className="text-xs font-semibold text-[#14B8A6] block">
              Audio Spectrum Analyzer
            </span>
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-[#C8CDD6]">Style</label>
              <select
                aria-label="Visualizer Style"
                value={selectedClip.visualizerProps.style}
                onChange={(e) =>
                  onUpdateVisualizerProps(selectedClip.id, {
                    style: e.target.value as 'bars' | 'radial' | 'waveform',
                  })
                }
                className="w-36 bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-[#E6E8EC]"
              >
                <option value="bars">Frequency Bars</option>
                <option value="radial">Radial Polar Ring</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[#9BA1AD] block mb-1">
                Sensitivity ({selectedClip.visualizerProps.sensitivity.toFixed(1)}x)
              </label>
              <input
                type="range"
                aria-label="Visualizer Sensitivity"
                min={0.3}
                max={2.2}
                step={0.1}
                value={selectedClip.visualizerProps.sensitivity}
                onChange={(e) =>
                  onUpdateVisualizerProps(selectedClip.id, {
                    sensitivity: Number(e.target.value),
                  })
                }
                className="w-full studio-slider"
              />
            </div>
          </div>
        )}

        {/* Shape Layer Properties */}
        {selectedClip.kind === 'shape' && selectedClip.shapeProps && (
          <div className="p-3 space-y-2.5">
            <span className="text-xs font-semibold text-[#E6E8EC] block">
              Vector Shape
            </span>
            {selectedClip.is3D ? (
              <div className="rounded bg-[#111215] border border-[#8B5CF6]/30 p-2 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#C4B5FD] font-medium">3D Extrusion Depth</span>
                  <span className="font-mono-tabular text-[#C4B5FD]">{selectedClip.shapeProps.depth ?? 0}</span>
                </div>
                <input
                  type="range"
                  aria-label="3D Shape Extrusion Depth"
                  min={0}
                  max={600}
                  step={1}
                  value={selectedClip.shapeProps.depth ?? 0}
                  onChange={(e) => onUpdateShapeProps(selectedClip.id, { depth: Number(e.target.value) })}
                  className="w-full studio-slider"
                />
                <span className="text-[9px] text-[#7E8594] block">0 = flat plane · Increase to create visible 3D side faces</span>
              </div>
            ) : (
              <div className="text-[10px] text-[#7E8594]">Enable the 3D switch above to extrude this shape</div>
            )}
            <ColorPalettePicker
              onApply={(palette) => onUpdateShapeProps(selectedClip.id, {
                fillColor: palette.colors[0],
                strokeColor: palette.colors[2],
              })}
            />
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-[#C8CDD6]">Shape Style</label>
              <select
                aria-label="Shape Style"
                value={selectedClip.shapeProps.shapeType}
                onChange={(e) =>
                  onUpdateShapeProps(selectedClip.id, {
                    shapeType: e.target.value as NonNullable<
                      TimelineClip['shapeProps']
                    >['shapeType'],
                  })
                }
                className="bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-[#E6E8EC]"
              >
                <optgroup label="Basic">
                  <option value="rect">Rectangle</option>
                  <option value="rounded-rect">Rounded Rectangle</option>
                  <option value="circle">Circle</option>
                  <option value="ellipse">Ellipse</option>
                  <option value="ring">Ring</option>
                  <option value="line">Line</option>
                </optgroup>
                <optgroup label="Polygons">
                  <option value="triangle">Triangle</option>
                  <option value="diamond">Diamond</option>
                  <option value="pentagon">Pentagon</option>
                  <option value="hexagon">Hexagon</option>
                  <option value="heptagon">Heptagon</option>
                  <option value="octagon">Octagon</option>
                  <option value="polygon">Custom Polygon</option>
                </optgroup>
                <optgroup label="Stars & Symbols">
                  <option value="star">5-Point Star</option>
                  <option value="star-6">6-Point Star</option>
                  <option value="burst">Burst / Sun</option>
                  <option value="heart">Heart</option>
                  <option value="plus">Plus</option>
                  <option value="minus">Minus</option>
                  <option value="cross">Cross</option>
                  <option value="lightning">Lightning Bolt</option>
                </optgroup>
                <optgroup label="Arrows & UI">
                  <option value="arrow">Arrow</option>
                  <option value="chevron">Chevron</option>
                  <option value="trapezoid">Trapezoid</option>
                  <option value="parallelogram">Parallelogram</option>
                  <option value="speech-bubble">Speech Bubble</option>
                  <option value="cloud">Cloud</option>
                  <option value="lower-third">Lower Third Bar</option>
                </optgroup>
              </select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-[#C8CDD6]">Stroke Color</label>
              <input
                type="color"
                aria-label="Stroke Color"
                value={selectedClip.shapeProps.strokeColor}
                onChange={(e) =>
                  onUpdateShapeProps(selectedClip.id, {
                    strokeColor: e.target.value,
                  })
                }
                className="w-8 h-6 rounded bg-transparent border border-[#2B303A] cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Audio Volume & Fades */}
        {(selectedClip.kind === 'audio' || selectedClip.kind === 'video') && (
          <div className="p-3 space-y-2.5">
            <span className="text-xs font-semibold text-[#E6E8EC] block">
              Audio Level &amp; Fades
            </span>
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleStopwatch(selectedClip.id, 'volume')}
                    aria-label="Toggle audio volume keyframing"
                    aria-pressed={(selectedClip.keyframes.volume?.length ?? 0) > 0}
                    title="Enable / disable volume keyframes"
                    className={(selectedClip.keyframes.volume?.length ?? 0) > 0 ? 'text-[#3B82F6]' : 'text-[#6E7685] hover:text-white'}
                  ><Clock className="w-3.5 h-3.5" /></button>
                  <span className="text-[#C8CDD6]">Volume</span>
                  <button
                    type="button"
                    onClick={() => onToggleKeyframeAtPlayhead(selectedClip.id, 'volume')}
                    aria-label="Add or remove volume keyframe at playhead"
                    title="Add / remove volume keyframe"
                    className={(selectedClip.keyframes.volume ?? []).some((key) => Math.abs(key.time - localTime) < 0.05) ? 'text-[#F59E0B]' : 'text-[#6E7685] hover:text-white'}
                  ><Diamond className="w-3 h-3 fill-current" /></button>
                </div>
                <span className="font-mono-tabular text-[#14B8A6]">
                  {Math.round((currentTransform.volume ?? selectedClip.volume))}%
                </span>
              </div>
              <input
                type="range"
                aria-label="Audio Volume"
                min={0}
                max={150}
                value={Math.max(0, Math.min(150, currentTransform.volume ?? selectedClip.volume))}
                onChange={(e) =>
                  onUpdateProperty(selectedClip.id, 'volume', Number(e.target.value))
                }
                className="w-full studio-slider"
              />
            </div>
            <div className="rounded border border-[#2B303A] bg-[#111215] p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] text-[#C8CDD6]">Noise Reduction</label>
                <span className="text-[10px] font-mono-tabular text-[#14B8A6]">{selectedClip.noiseReduction ?? 0}%</span>
              </div>
              <input
                type="range"
                aria-label="Audio Noise Reduction"
                min={0}
                max={100}
                step={1}
                value={selectedClip.noiseReduction ?? 0}
                onChange={(e) => onUpdateAudioProps(selectedClip.id, { noiseReduction: Number(e.target.value) })}
                className="w-full studio-slider"
              />
              <span className="text-[9px] text-[#707A89]">Adaptive noise gate and low-frequency rumble cut</span>
            </div>
            <div className="rounded border border-[#2B303A] bg-[#111215] p-2 space-y-2">
              <label className="flex items-center justify-between text-[11px] text-[#C8CDD6]">
                <span>Voiceover Source</span>
                <input
                  type="checkbox"
                  aria-label="Mark clip as voiceover"
                  checked={Boolean(selectedClip.isVoiceover)}
                  onChange={(e) => onUpdateAudioProps(selectedClip.id, {
                    isVoiceover: e.target.checked,
                    ...(e.target.checked ? { duckingEnabled: true } : {}),
                  })}
                  className="accent-[#14B8A6]"
                />
              </label>
              {selectedClip.isVoiceover && (
                <>
                  <label className="flex items-center justify-between text-[10px] text-[#9BA1AD]">
                    <span>Duck Background Music</span>
                    <input
                      type="checkbox"
                      aria-label="Enable background music ducking"
                      checked={selectedClip.duckingEnabled !== false}
                      onChange={(e) => onUpdateAudioProps(selectedClip.id, { duckingEnabled: e.target.checked })}
                      className="accent-[#14B8A6]"
                    />
                  </label>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[#9BA1AD]">Duck Amount</span>
                      <span className="font-mono-tabular text-[#14B8A6]">{selectedClip.duckingAmount ?? 12} dB</span>
                    </div>
                    <input
                      type="range"
                      aria-label="Voiceover Ducking Amount"
                      min={0}
                      max={24}
                      step={1}
                      value={selectedClip.duckingAmount ?? 12}
                      onChange={(e) => onUpdateAudioProps(selectedClip.id, { duckingAmount: Number(e.target.value) })}
                      className="w-full studio-slider"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-[#9BA1AD] block mb-1">
                  Fade In ({selectedClip.fadeIn.toFixed(1)}s)
                </label>
                <input
                  type="range"
                  aria-label="Audio Fade In"
                  min={0}
                  max={3}
                  step={0.1}
                  value={selectedClip.fadeIn}
                  onChange={(e) =>
                    onUpdateAudioProps(selectedClip.id, {
                      fadeIn: Number(e.target.value),
                    })
                  }
                  className="w-full studio-slider"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#9BA1AD] block mb-1">
                  Fade Out ({selectedClip.fadeOut.toFixed(1)}s)
                </label>
                <input
                  type="range"
                  aria-label="Audio Fade Out"
                  min={0}
                  max={3}
                  step={0.1}
                  value={selectedClip.fadeOut}
                  onChange={(e) =>
                    onUpdateAudioProps(selectedClip.id, {
                      fadeOut: Number(e.target.value),
                    })
                  }
                  className="w-full studio-slider"
                />
              </div>
            </div>
          </div>
        )}

        {/* Layer Mask (Rectangle / Ellipse / Feather / Invert) */}
        {isVisual && selectedClip.kind !== 'null' && selectedClip.kind !== 'adjustment' && (
          <div className="p-3 space-y-2.5">
            {(() => {
              const mask: LayerMask = selectedClip.mask ?? {
                enabled: false,
                shape: 'rect',
                x: 0,
                y: 0,
                width: 65,
                height: 65,
                feather: 0,
                inverted: false,
                opacity: 100,
              };
              const patchMask = (patch: Partial<LayerMask>) =>
                onUpdateMask(selectedClip.id, { ...mask, ...patch });

              return (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#E6E8EC]">
                      Layer Mask
                    </span>
                    <button
                      type="button"
                      onClick={() => patchMask({ enabled: !mask.enabled })}
                      aria-pressed={mask.enabled}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                        mask.enabled
                          ? 'bg-[#F59E0B] text-[#111215]'
                          : 'bg-[#232730] text-[#9BA1AD] hover:text-white'
                      }`}
                    >
                      {mask.enabled ? 'Mask On' : '+ Enable Mask'}
                    </button>
                  </div>

                  {mask.enabled && (
                    <div className="space-y-2 bg-[#14161A] border border-[#262B34] rounded p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <select
                          aria-label="Mask Shape"
                          value={mask.shape}
                          onChange={(e) =>
                            patchMask({
                              shape: e.target.value as 'rect' | 'rounded-rect' | 'ellipse',
                            })
                          }
                          className="bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-[#E6E8EC]"
                        >
                          <option value="rect">Rectangle Mask</option>
                          <option value="rounded-rect">Rounded Rectangle Mask</option>
                          <option value="ellipse">Ellipse Mask</option>
                        </select>
                        <label className="flex items-center gap-1.5 text-[11px] text-[#C8CDD6] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={mask.inverted}
                            onChange={(e) =>
                              patchMask({ inverted: e.target.checked })
                            }
                            className="accent-[#F59E0B]"
                          />
                          <span>Inverted</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-[#9BA1AD] block mb-0.5">
                            Width ({mask.width}%)
                          </label>
                          <input
                            type="number"
                            aria-label="Mask Width"
                            min={1}
                            value={mask.width}
                            onChange={(e) =>
                              patchMask({ width: Number(e.target.value) })
                            }
                            className="w-full bg-[#0E1013] border border-[#2B303A] rounded px-2 py-1 text-xs text-[#E6E8EC]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#9BA1AD] block mb-0.5">
                            Height ({mask.height}%)
                          </label>
                          <input
                            type="number"
                            aria-label="Mask Height"
                            min={10}
                            max={100}
                            value={mask.height}
                            onChange={(e) =>
                              patchMask({ height: Number(e.target.value) })
                            }
                            className="w-full studio-slider"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#9BA1AD] block mb-0.5">
                            Offset X ({mask.x}%)
                          </label>
                          <input
                            type="number"
                            aria-label="Mask Offset X"
                            
                            value={mask.x}
                            onChange={(e) =>
                              patchMask({ x: Number(e.target.value) })
                            }
                            className="w-full studio-slider"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#9BA1AD] block mb-0.5">
                            Offset Y ({mask.y}%)
                          </label>
                          <input
                            type="number"
                            aria-label="Mask Offset Y"
                            value={mask.y}
                            onChange={(e) => patchMask({ y: Number(e.target.value) })}
                            className="w-full bg-[#0E1013] border border-[#2B303A] rounded px-2 py-1 text-xs text-[#E6E8EC]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[#9BA1AD] block mb-0.5">
                            Feather ({mask.feather}px)
                          </label>
                          <input
                            type="number"
                            aria-label="Mask Feather"
                            min={0}
                            value={mask.feather}
                            onChange={(e) =>
                              patchMask({ feather: Number(e.target.value) })
                            }
                            className="w-full studio-slider"
                          />
                        </div>
                      </div>
                      <label className="block text-[10px] text-[#9BA1AD]">
                        Mask Opacity · {mask.opacity}%
                        <input type="range" aria-label="Mask Opacity" min={0} max={100} value={mask.opacity}
                          onChange={(event) => patchMask({ opacity: Number(event.target.value) })}
                          className="mt-1 w-full studio-slider" />
                      </label>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Applied Effects Stack */}
        {isVisual && selectedClip.kind !== 'null' && (
          <div className="p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#E6E8EC]">
                Applied Effects ({selectedClip.effects.length})
              </span>
              <select
                aria-label="Add Effect"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    onAddEffect(selectedClip.id, e.target.value as EffectType);
                  }
                }}
                className="bg-[#232730] hover:bg-[#2B303A] border border-[#323845] rounded px-2 py-1 text-[11px] font-medium text-[#E6E8EC] focus:outline-none cursor-pointer"
              >
                <option value="">{EFFECT_LIBRARY.some((fx) => !selectedClip.effects.some((applied) => applied.type === fx.type)) ? '+ Add Effect' : 'All Effects Added'}</option>
                {[...new Set(EFFECT_LIBRARY
                  .filter((fx) => !selectedClip.effects.some((applied) => applied.type === fx.type))
                  .map((fx) => fx.category))].map((category) => (
                  <optgroup key={category} label={category}>
                    {EFFECT_LIBRARY
                      .filter((fx) => fx.category === category && !selectedClip.effects.some((applied) => applied.type === fx.type))
                      .map((fx) => <option key={fx.type} value={fx.type}>{fx.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            {selectedClip.effects.length === 0 ? (
              <div className="p-2.5 rounded bg-[#14161A] border border-[#242831] text-[11px] text-[#7E8594] flex items-center gap-2">
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Add from {EFFECT_LIBRARY.length} AE effects or Packs tab.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedClip.effects.map((fx) => (
                  <div
                    key={fx.id}
                    className="rounded bg-[#14161A] border border-[#262B34] p-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#E6E8EC]">
                        {fx.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onToggleEffect(selectedClip.id, fx.id)}
                          aria-label={`Toggle ${fx.name}`}
                          className={`p-1 rounded transition-colors ${
                            fx.enabled
                              ? 'text-[#8B5CF6]'
                              : 'text-[#6E7685] hover:text-white'
                          }`}
                        >
                          {fx.enabled ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveEffect(selectedClip.id, fx.id)}
                          aria-label={`Remove ${fx.name}`}
                          className="p-1 rounded text-[#6E7685] hover:text-[#EF4444] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {Object.entries(fx.params).map(([key, val]) => {
                      const range = getParamRange(fx.type, key);
                      return (
                        <div key={key} className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-[#9BA1AD] capitalize">{key}</span>
                            <span className="font-mono-tabular text-[#C8CDD6]">
                              {val}
                            </span>
                          </div>
                          <input
                            type="range"
                            aria-label={`${fx.name} ${key}`}
                            min={range.min}
                            max={range.max}
                            step={range.step}
                            value={val}
                            onChange={(e) =>
                              onUpdateEffectParam(
                                selectedClip.id,
                                fx.id,
                                key,
                                Number(e.target.value)
                              )
                            }
                            className="w-full studio-slider"
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

function getParamRange(
  type: EffectType,
  key: string
): { min: number; max: number; step: number } {
  if (type === 'blur' && key === 'radius') return { min: 0, max: 40, step: 1 };
  if (type === 'color' || type === 'hue_sat') {
    if (key === 'hue') return { min: -180, max: 180, step: 1 };
    return { min: 0, max: 200, step: 1 };
  }
  if (type === 'tint' && key === 'warmth') return { min: -100, max: 100, step: 1 };
  if (type === 'chromatic') return { min: 0, max: 24, step: 1 };
  if (type === 'glitch' && key === 'slices') return { min: 2, max: 24, step: 1 };
  if (type === 'posterize') return { min: 2, max: 16, step: 1 };
  if (type === 'chromakey') {
    if (key === 'hueTarget') return { min: 80, max: 260, step: 5 };
    return { min: 5, max: 120, step: 1 };
  }
  if (type === 'pixelate') return { min: 4, max: 48, step: 2 };
  return { min: 0, max: 100, step: 1 };
}
