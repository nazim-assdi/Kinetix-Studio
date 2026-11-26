import React, { useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  ZoomIn,
  ZoomOut,
  Diamond,
  Scissors,
  Volume2,
  VolumeX,
  Bookmark,
  Trash2,
} from 'lucide-react';
import {
  AnimatableProperty,
  CompositionSettings,
  EasingType,
  EffectType,
  MotionPresetItem,
  TimelineClip,
  TimelineMarker,
  TimelineTrack,
  ToolMode,
  WorkAreaRange,
} from '../types/editor';
import { findSnapTime, formatRulerTime, formatTimecode } from '../engine/timecode';
import { VoiceoverRecorder } from './VoiceoverRecorder';

interface TimelinePanelProps {
  composition: CompositionSettings;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  playheadTime: number;
  selectedClipId: string | null;
  tool: ToolMode;
  snapEnabled: boolean;
  markers?: TimelineMarker[];
  workArea?: WorkAreaRange;
  onAddMarker?: (time: number) => void;
  onRemoveMarker?: (markerId: string) => void;
  onSetWorkArea?: (edge: 'in' | 'out', time: number) => void;
  onToggleWorkArea?: () => void;
  onSeek: (time: number) => void;
  onSelectClip: (clipId: string | null) => void;
  onMoveClip: (clipId: string, newStart: number, newTrackId?: string) => void;
  onTrimClip: (clipId: string, edge: 'left' | 'right', newEdgeTime: number) => void;
  onSplitClip: (clipId: string, splitTime: number) => void;
  onRippleDeleteClip?: (clipId: string) => void;
  onToggleTrackFlag: (
    trackId: string,
    flag: 'visible' | 'muted' | 'solo' | 'locked'
  ) => void;
  onAddTrack: (kind: 'video' | 'audio') => void;
  onDropAssetOnTrack: (assetId: string, trackId: string, time: number) => void;
  onUpdateKeyframeEasing: (
    clipId: string,
    prop: AnimatableProperty,
    kfId: string,
    easing: EasingType
  ) => void;
  onMoveKeyframe?: (
    clipId: string,
    prop: AnimatableProperty,
    kfId: string,
    time: number,
    value: number
  ) => void;
  onAddVoiceover?: (file: File) => void;
  onDropEffect?: (clipId: string, effectType: EffectType) => void;
  onDropPreset?: (clipId: string, item: MotionPresetItem) => void;
  panelHeight?: number;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  composition,
  tracks,
  clips,
  playheadTime,
  selectedClipId,
  tool,
  snapEnabled,
  markers = [],
  workArea,
  onAddMarker,
  onRemoveMarker,
  onSetWorkArea,
  onToggleWorkArea,
  onSeek,
  onSelectClip,
  onMoveClip,
  onTrimClip,
  onSplitClip,
  onRippleDeleteClip,
  onToggleTrackFlag,
  onAddTrack,
  onDropAssetOnTrack,
  onUpdateKeyframeEasing,
  onMoveKeyframe,
  onAddVoiceover,
  onDropEffect,
  onDropPreset,
  panelHeight = 300,
}) => {
  const [pxPerSecond, setPxPerSecond] = useState(72);
  const [verticalZoom, setVerticalZoom] = useState(100);
  const [showKeyframeDopeSheet, setShowKeyframeDopeSheet] = useState(true);
  const [selectedKf, setSelectedKf] = useState<{
    clipId: string;
    prop: AnimatableProperty;
    kfId: string;
    easing: EasingType;
  } | null>(null);

  const lanesScrollRef = useRef<HTMLDivElement>(null);
  const keyframeDragDidMoveRef = useRef(false);

  const totalWidth = Math.max(1100, Math.ceil((composition.duration + 4) * pxPerSecond));

  const timeFromClientX = (clientX: number): number => {
    const el = lanesScrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, Number((x / pxPerSecond).toFixed(3)));
  };

  // Ruler Scrubbing
  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    onSeek(timeFromClientX(e.clientX));
    const onMove = (ev: PointerEvent) => {
      onSeek(timeFromClientX(ev.clientX));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Clip Dragging / Trimming / Razor Splitting
  const handleClipPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    clip: TimelineClip,
    track: TimelineTrack
  ) => {
    e.stopPropagation();
    const clickTime = timeFromClientX(e.clientX);

    if (track.locked) {
      onSelectClip(clip.id);
      return;
    }

    if (tool === 'razor') {
      onSplitClip(clip.id, clickTime);
      return;
    }

    onSelectClip(clip.id);

    const startX = e.clientX;
    const origStart = clip.start;
    const snapThreshold = 10 / pxPerSecond;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const deltaT = dx / pxPerSecond;
      let candidate = Math.max(0, Number((origStart + deltaT).toFixed(3)));
      if (snapEnabled) {
        candidate = findSnapTime(
          candidate,
          clips,
          clip.id,
          playheadTime,
          snapThreshold,
          clip.duration
        );
      }

      // Check vertical track target if hovered over another compatible track
      let targetTrackId = clip.trackId;
      const elem = document.elementFromPoint(ev.clientX, ev.clientY);
      const trackAttr = elem?.closest('[data-track-id]')?.getAttribute('data-track-id');
      if (trackAttr) {
        const hoveredTrack = tracks.find((t) => t.id === trackAttr);
        if (hoveredTrack && !hoveredTrack.locked) {
          const isClipAudio = clip.kind === 'audio';
          if (
            (isClipAudio && hoveredTrack.kind === 'audio') ||
            (!isClipAudio && hoveredTrack.kind === 'video')
          ) {
            targetTrackId = hoveredTrack.id;
          }
        }
      }

      onMoveClip(clip.id, candidate, targetTrackId);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleTrimPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    clip: TimelineClip,
    edge: 'left' | 'right',
    track: TimelineTrack
  ) => {
    e.stopPropagation();
    if (track.locked || tool === 'razor') return;

    const onMove = (ev: PointerEvent) => {
      let t = timeFromClientX(ev.clientX);
      if (snapEnabled) {
        t = findSnapTime(t, clips, clip.id, playheadTime, 10 / pxPerSecond);
      }
      onTrimClip(clip.id, edge, t);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleKeyframePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    clip: TimelineClip,
    prop: AnimatableProperty,
    keyframe: NonNullable<TimelineClip['keyframes'][AnimatableProperty]>[number]
  ) => {
    event.stopPropagation();
    if (!onMoveKeyframe) return;
    keyframeDragDidMoveRef.current = false;
    const track = tracks.find((item) => item.id === clip.trackId);
    if (track?.locked) return;
    onSelectClip(clip.id);
    setSelectedKf({
      clipId: clip.id,
      prop,
      kfId: keyframe.id,
      easing: keyframe.easing,
    });

    const startX = event.clientX;
    const startY = event.clientY;
    const startTime = keyframe.time;
    const startValue = keyframe.value;
    const unitsPerPixel =
      prop === 'rotation' || prop === 'rotationX' || prop === 'rotationY' ? 2 :
      prop === 'scale' || prop === 'opacity' || prop === 'volume' ? 1 : 2;

    const onMove = (moveEvent: PointerEvent) => {
      const pixelDeltaX = moveEvent.clientX - startX;
      const pixelDeltaY = moveEvent.clientY - startY;
      if (Math.abs(pixelDeltaX) + Math.abs(pixelDeltaY) > 2) {
        keyframeDragDidMoveRef.current = true;
      }
      const deltaX = pixelDeltaX / pxPerSecond;
      let nextTime = Math.max(0, Math.min(clip.duration, startTime + deltaX));
      if (snapEnabled) nextTime = Math.round(nextTime * composition.fps) / composition.fps;
      const deltaValue = -pixelDeltaY * unitsPerPixel;
      let nextValue = startValue + deltaValue;
      if (prop === 'opacity') nextValue = Math.max(0, Math.min(100, nextValue));
      else if (prop === 'volume') nextValue = Math.max(0, Math.min(200, nextValue));
      else if (prop === 'shapeWidth' || prop === 'shapeHeight') nextValue = Math.max(1, nextValue);
      onMoveKeyframe(
        clip.id,
        prop,
        keyframe.id,
        Number(nextTime.toFixed(4)),
        Number(nextValue.toFixed(2))
      );
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const selectedClip = clips.find((c) => c.id === selectedClipId) ?? null;

  // Build tick marks every second
  const maxRulerSec = Math.ceil(totalWidth / pxPerSecond);
  const ticks: number[] = [];
  for (let s = 0; s <= maxRulerSec; s++) {
    ticks.push(s);
  }

  return (
    <section
      aria-label="Multi-Track Timeline"
      style={{ height: panelHeight }}
      className="shrink-0 bg-[#14161A] border-t border-[#2B303A] flex flex-col select-none"
    >
      {/* Timeline Top Control Strip */}
      <div className="h-9 shrink-0 px-3 bg-[#181A1F] border-b border-[#2B303A] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono-tabular text-xs font-semibold text-[#E6E8EC]">
            {formatTimecode(playheadTime, composition.fps)}
          </span>
          <div className="h-3.5 w-px bg-[#2B303A]" />
          <button
            type="button"
            onClick={() => onAddTrack('video')}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#232730] hover:bg-[#2C313D] text-[11px] font-medium text-[#C8CDD6] hover:text-white transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Video Track</span>
          </button>
          <button
            type="button"
            onClick={() => onAddTrack('audio')}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#232730] hover:bg-[#2C313D] text-[11px] font-medium text-[#C8CDD6] hover:text-white transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Audio Track</span>
          </button>
          {onAddVoiceover && <VoiceoverRecorder onRecorded={onAddVoiceover} />}

          <button
            type="button"
            onClick={() => setShowKeyframeDopeSheet((v) => !v)}
            aria-pressed={showKeyframeDopeSheet}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              showKeyframeDopeSheet
                ? 'bg-[#8B5CF6]/20 text-[#C4B5FD] border border-[#8B5CF6]/40'
                : 'bg-[#232730] text-[#9BA1AD] hover:text-white'
            }`}
          >
            <Diamond className="w-3 h-3" />
            <span>Keyframes</span>
          </button>

          {selectedClip && (
            <>
              <button
                type="button"
                onClick={() => onSplitClip(selectedClip.id, playheadTime)}
                title="Split selected clip at playhead"
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#232730] hover:bg-[#3B82F6] text-[11px] font-medium text-[#E6E8EC] transition-colors"
              >
                <Scissors className="w-3 h-3" />
                <span>Split</span>
              </button>
              {onRippleDeleteClip && (
                <button
                  type="button"
                  onClick={() => onRippleDeleteClip(selectedClip.id)}
                  title="Ripple Delete selected clip (Shift+Del)"
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#232730] hover:bg-[#EF4444]/80 text-[11px] font-medium text-[#FCA5A5] hover:text-white transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Ripple</span>
                </button>
              )}
            </>
          )}

          {onAddMarker && (
            <button
              type="button"
              onClick={() => onAddMarker(playheadTime)}
              title="Add Timeline Marker at Playhead (M)"
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#232730] hover:bg-[#F59E0B]/20 text-[11px] font-medium text-[#FCD34D] transition-colors"
            >
              <Bookmark className="w-3 h-3" />
              <span>Marker</span>
            </button>
          )}

          {workArea && onSetWorkArea && onToggleWorkArea && (
            <div className="flex items-center gap-0.5 bg-[#111215] border border-[#2B303A] rounded px-1 py-0.5">
              <button
                type="button"
                onClick={() => onSetWorkArea('in', playheadTime)}
                title="Set Work Area In Point (I)"
                className="px-1.5 py-0.5 rounded text-[10px] font-mono-tabular text-[#93C5FD] hover:bg-[#232730]"
              >
                In
              </button>
              <button
                type="button"
                onClick={() => onSetWorkArea('out', playheadTime)}
                title="Set Work Area Out Point (O)"
                className="px-1.5 py-0.5 rounded text-[10px] font-mono-tabular text-[#93C5FD] hover:bg-[#232730]"
              >
                Out
              </button>
              <button
                type="button"
                onClick={onToggleWorkArea}
                aria-pressed={workArea.enabled}
                title="Toggle Work Area Loop / Export Range"
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                  workArea.enabled
                    ? 'bg-[#3B82F6] text-white'
                    : 'text-[#8D95A5] hover:text-white'
                }`}
              >
                WA
              </button>
            </div>
          )}
        </div>

        {/* Draggable Keyframe FX + independent timeline zoom */}
        <div className="flex items-center gap-2">
          {selectedKf && (
            <div className="flex items-center gap-1 bg-[#111215] border border-[#2B303A] rounded px-2 py-1">
              <span className="text-[10px] text-[#9BA1AD] mr-1 whitespace-nowrap">KF FX</span>
              {([
                ['linear', 'Linear'],
                ['ease-in', 'In'],
                ['ease-out', 'Out'],
                ['ease-in-out', 'Ease'],
                ['bezier', 'Bezier'],
                ['elastic', 'Elastic'],
                ['overshoot', 'Back'],
              ] as [EasingType, string][]).map(([easing, label]) => (
                <button
                  key={easing}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-kinetix-easing', easing);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => {
                    onUpdateKeyframeEasing(selectedKf.clipId, selectedKf.prop, selectedKf.kfId, easing);
                    setSelectedKf({ ...selectedKf, easing });
                  }}
                  title={`Drag ${label} onto a keyframe diamond or click to apply`}
                  className={`px-1.5 py-1 rounded text-[9px] font-semibold cursor-grab active:cursor-grabbing transition-colors ${selectedKf.easing === easing ? 'bg-[#8B5CF6] text-white' : 'bg-[#232730] text-[#C8CDD6] hover:bg-[#343B49]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 border-l border-[#2B303A] pl-2">
            <div className="flex items-center gap-1" title="Horizontal timeline zoom">
              <span className="text-[9px] text-[#7E8594]">H</span>
              <button type="button" aria-label="Zoom Out Timeline Horizontally" onClick={() => setPxPerSecond((p) => Math.max(20, p - 16))} className="p-1 text-[#9BA1AD] hover:text-white">
                <ZoomOut className="w-3 h-3" />
              </button>
              <input type="range" aria-label="Horizontal Timeline Zoom" min={20} max={300} value={pxPerSecond} onChange={(e) => setPxPerSecond(Number(e.target.value))} className="w-20 studio-slider" />
              <button type="button" aria-label="Zoom In Timeline Horizontally" onClick={() => setPxPerSecond((p) => Math.min(300, p + 16))} className="p-1 text-[#9BA1AD] hover:text-white">
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-center gap-1" title="Vertical track height zoom">
              <span className="text-[9px] text-[#7E8594]">V</span>
              <button type="button" aria-label="Reduce Vertical Track Height" onClick={() => setVerticalZoom((p) => Math.max(50, p - 10))} className="px-1 text-[10px] text-[#9BA1AD] hover:text-white">−</button>
              <input type="range" aria-label="Vertical Timeline Zoom" min={50} max={200} step={5} value={verticalZoom} onChange={(e) => setVerticalZoom(Number(e.target.value))} className="w-16 studio-slider" />
              <button type="button" aria-label="Increase Vertical Track Height" onClick={() => setVerticalZoom((p) => Math.min(200, p + 10))} className="px-1 text-[10px] text-[#9BA1AD] hover:text-white">+</button>
              <span className="text-[9px] text-[#7E8594] w-7">{verticalZoom}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Track Headers + Scrollable Lanes */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Track Header Column */}
        <div className="w-52 shrink-0 bg-[#181A1F] border-r border-[#2B303A] flex flex-col">
          {/* Ruler spacer */}
          <div className="h-7 shrink-0 border-b border-[#2B303A] px-3 flex items-center text-[11px] font-medium text-[#7E8594]">
            Tracks
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#22262F]">
            {tracks.map((track) => (
              <div
                key={track.id}
                style={{ height: Math.max(32, Math.round(track.height * verticalZoom / 100)) }}
                className="px-2.5 flex items-center justify-between gap-2 bg-[#181A1F]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-1.5 h-6 rounded-sm shrink-0 ${
                      track.kind === 'video' ? 'bg-[#3B82F6]' : 'bg-[#14B8A6]'
                    }`}
                  />
                  <span className="text-xs font-medium text-[#E6E8EC] truncate">
                    {track.name}
                  </span>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  {track.kind === 'video' ? (
                    <button
                      type="button"
                      onClick={() => onToggleTrackFlag(track.id, 'visible')}
                      aria-label={`Toggle visibility for ${track.name}`}
                      className={`p-1 rounded transition-colors ${
                        track.visible
                          ? 'text-[#C8CDD6] hover:text-white'
                          : 'text-[#555C6B]'
                      }`}
                    >
                      {track.visible ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleTrackFlag(track.id, 'muted')}
                      aria-label={`Toggle mute for ${track.name}`}
                      className={`p-1 rounded transition-colors ${
                        track.muted
                          ? 'text-[#EF4444]'
                          : 'text-[#14B8A6] hover:text-white'
                      }`}
                    >
                      {track.muted ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onToggleTrackFlag(track.id, 'solo')}
                    aria-label={`Solo ${track.name}`}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                      track.solo
                        ? 'bg-[#F59E0B] text-black'
                        : 'text-[#7E8594] hover:text-white'
                    }`}
                  >
                    S
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggleTrackFlag(track.id, 'locked')}
                    aria-label={`Lock ${track.name}`}
                    className={`p-1 rounded transition-colors ${
                      track.locked
                        ? 'text-[#F59E0B]'
                        : 'text-[#6E7685] hover:text-white'
                    }`}
                  >
                    {track.locked ? (
                      <Lock className="w-3 h-3" />
                    ) : (
                      <Unlock className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Scrollable Ruler + Track Lanes */}
        <div
          ref={lanesScrollRef}
          className="flex-1 overflow-auto relative bg-[#111215]"
          onClick={() => setSelectedKf(null)}
        >
          <div style={{ width: totalWidth }} className="relative min-h-full">
            {/* Time Ruler */}
            <div
              data-testid="timeline-ruler"
              onPointerDown={handleRulerPointerDown}
              className="h-7 sticky top-0 z-20 bg-[#16181D] border-b border-[#2B303A] relative cursor-ew-resize"
            >
              {ticks.map((sec) => {
                const left = sec * pxPerSecond;
                return (
                  <div
                    key={sec}
                    style={{ left }}
                    className="absolute top-0 bottom-0 border-l border-[#2F3541] pointer-events-none"
                  >
                    <span className="font-mono-tabular text-[10px] text-[#7E8594] pl-1 leading-none block pt-1">
                      {formatRulerTime(sec)}
                    </span>
                  </div>
                );
              })}

              {/* Work Area In/Out Highlight Bracket */}
              {workArea && workArea.outTime > workArea.inTime && (
                <div
                  style={{
                    left: workArea.inTime * pxPerSecond,
                    width: (workArea.outTime - workArea.inTime) * pxPerSecond,
                  }}
                  className={`absolute bottom-0 h-1.5 pointer-events-none border-x ${
                    workArea.enabled
                      ? 'bg-[#3B82F6]/60 border-[#93C5FD]'
                      : 'bg-[#3B82F6]/20 border-[#4B5563]'
                  }`}
                />
              )}

              {/* Timeline Markers */}
              {markers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={`${m.label} (${m.time.toFixed(2)}s) — Click to seek, Double-click to remove`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSeek(m.time);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onRemoveMarker?.(m.id);
                  }}
                  style={{
                    left: m.time * pxPerSecond - 5,
                    backgroundColor: m.color,
                  }}
                  className="absolute top-0.5 w-2.5 h-3 rounded-b-sm shadow cursor-pointer z-20"
                />
              ))}
            </div>

            {/* Track Lanes */}
            <div className="divide-y divide-[#20242C]">
              {tracks.map((track) => {
                const trackClips = clips.filter((c) => c.trackId === track.id);
                return (
                  <div
                    key={track.id}
                    data-track-id={track.id}
                    style={{ height: Math.max(32, Math.round(track.height * verticalZoom / 100)) }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const assetId = e.dataTransfer.getData('application/x-kinetix-asset');
                      if (assetId) {
                        onDropAssetOnTrack(assetId, track.id, timeFromClientX(e.clientX));
                      }
                    }}
                    className={`relative ${
                      track.locked ? 'opacity-60' : ''
                    } ${tool === 'razor' ? 'cursor-crosshair' : ''}`}
                  >
                    {trackClips.map((clip) => {
                      const left = clip.start * pxPerSecond;
                      const width = Math.max(18, clip.duration * pxPerSecond);
                      const isSelected = clip.id === selectedClipId;
                      const allKfs = Object.entries(clip.keyframes) as [
                        AnimatableProperty,
                        NonNullable<TimelineClip['keyframes'][AnimatableProperty]>
                      ][];

                      return (
                        <div
                          key={clip.id}
                          data-testid={`timeline-clip-${clip.id}`}
                          onPointerDown={(e) => handleClipPointerDown(e, clip, track)}
                          onDragOver={(e) => {
                            if (Array.from(e.dataTransfer.types).some((type) => type === 'application/x-kinetix-effect' || type === 'application/x-kinetix-preset')) e.preventDefault();
                          }}
                          onDrop={(e) => {
                            const effectType = e.dataTransfer.getData('application/x-kinetix-effect');
                            const presetRaw = e.dataTransfer.getData('application/x-kinetix-preset');
                            if (!effectType && !presetRaw) return;
                            e.preventDefault();
                            e.stopPropagation();
                            if (effectType) onDropEffect?.(clip.id, effectType as EffectType);
                            if (presetRaw) {
                              try { onDropPreset?.(clip.id, JSON.parse(presetRaw) as MotionPresetItem); }
                              catch { /* ignore invalid drag payload */ }
                            }
                          }}
                          style={{
                            left,
                            width,
                            backgroundColor: `${clip.colorLabel}26`,
                            borderColor: isSelected ? '#FFFFFF' : clip.colorLabel,
                          }}
                          className={`absolute top-1.5 bottom-1.5 rounded border overflow-hidden group transition-shadow ${
                            isSelected ? 'ring-1 ring-white/80 z-10' : ''
                          } ${tool === 'razor' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
                        >
                          {/* Top Color Accent Bar */}
                          <div
                            style={{ backgroundColor: clip.colorLabel }}
                            className="h-1.5 w-full"
                          />

                          {/* Clip Header Label */}
                          <div className="px-2 py-0.5 flex items-center justify-between gap-1 pointer-events-none">
                            <span className="text-[11px] font-medium text-[#F1F3F7] truncate">
                              {clip.name}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {(clip.speed && clip.speed !== 1) || clip.reversed ? (
                                <span className="text-[9px] font-mono-tabular px-1 rounded bg-[#14B8A6]/30 text-[#5EEAD4]">
                                  {clip.reversed ? 'REV ' : ''}
                                  {clip.speed ? `${clip.speed}x` : ''}
                                </span>
                              ) : null}
                              {clip.is3D && clip.kind !== 'camera' && clip.kind !== 'light' && (
                                <span className="text-[9px] font-mono-tabular px-1 rounded bg-[#3B82F6]/30 text-[#93C5FD]">
                                  3D
                                </span>
                              )}
                              {clip.effects.length > 0 && (
                                <span className="text-[9px] font-mono-tabular px-1 rounded bg-[#8B5CF6]/40 text-[#DDD6FE]">
                                  FX·{clip.effects.length}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Audio Waveform Bars */}
                          {clip.kind === 'audio' && clip.waveform && (
                            <div className="absolute inset-x-1 bottom-1 top-6 flex items-end gap-[2px] opacity-75 pointer-events-none">
                              {clip.waveform
                                .slice(0, Math.max(12, Math.floor(width / 5)))
                                .map((peak, i) => (
                                  <div
                                    key={i}
                                    style={{ height: `${Math.round(peak * 100)}%` }}
                                    className="flex-1 bg-[#2DD4BF] rounded-t-[1px] min-w-[2px]"
                                  />
                                ))}
                            </div>
                          )}

                          {/* AE Keyframe Diamonds inside Clip */}
                          {showKeyframeDopeSheet && (
                            <div className="absolute inset-x-0 bottom-1 h-4 pointer-events-none">
                              {allKfs.map(([prop, list]) =>
                                list.map((kf) => {
                                  const kfLeft = kf.time * pxPerSecond;
                                  const isKfSelected = selectedKf?.kfId === kf.id;
                                  return (
                                    <button
                                      key={kf.id}
                                      type="button"
                                      title={`${prop} keyframe @ ${kf.time.toFixed(2)}s (${kf.easing})`}
                                      aria-label={`${prop} keyframe at ${kf.time.toFixed(2)}s`}
                                      onDragOver={(ev) => {
                                        if (Array.from(ev.dataTransfer.types).includes('application/x-kinetix-easing')) ev.preventDefault();
                                      }}
                                      onDrop={(ev) => {
                                        const easing = ev.dataTransfer.getData('application/x-kinetix-easing') as EasingType;
                                        const valid = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'bezier', 'elastic', 'overshoot'].includes(easing);
                                        if (!valid) return;
                                        ev.preventDefault();
                                        ev.stopPropagation();
                                        onUpdateKeyframeEasing(clip.id, prop, kf.id, easing);
                                        setSelectedKf({ clipId: clip.id, prop, kfId: kf.id, easing });
                                      }}
                                      onPointerDown={(ev) => handleKeyframePointerDown(ev, clip, prop, kf)}
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        if (keyframeDragDidMoveRef.current) {
                                          keyframeDragDidMoveRef.current = false;
                                          return;
                                        }
                                        onSeek(clip.start + kf.time);
                                        onSelectClip(clip.id);
                                        setSelectedKf({
                                          clipId: clip.id,
                                          prop,
                                          kfId: kf.id,
                                          easing: kf.easing,
                                        });
                                      }}
                                      data-testid={`keyframe-${kf.id}`}
                                      style={{ left: Math.max(2, kfLeft - 5), touchAction: 'none' }}
                                      className={`pointer-events-auto absolute top-0.5 cursor-ew-resize transition-transform hover:scale-125 ${
                                        isKfSelected
                                          ? 'text-white'
                                          : 'text-[#F59E0B]'
                                      }`}
                                    >
                                      <Diamond className="w-2.5 h-2.5 fill-current" />
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          )}

                          {/* Left & Right Trim Handles */}
                          <div
                            onPointerDown={(e) =>
                              handleTrimPointerDown(e, clip, 'left', track)
                            }
                            title="Trim Clip In"
                            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/40 transition-colors"
                          />
                          <div
                            onPointerDown={(e) =>
                              handleTrimPointerDown(e, clip, 'right', track)
                            }
                            title="Trim Clip Out"
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/40 transition-colors"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Playhead Needle across Ruler & All Tracks */}
            <div
              data-testid="timeline-playhead"
              style={{ left: playheadTime * pxPerSecond }}
              className="absolute top-0 bottom-0 w-[1.5px] bg-[#3B82F6] pointer-events-none z-30"
            >
              <div className="w-2.5 h-3 bg-[#3B82F6] -translate-x-[4.5px] rounded-b-sm" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
