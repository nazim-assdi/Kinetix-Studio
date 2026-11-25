import React, { useState } from 'react';
import { Crosshair, Play, Link2, CheckCircle2 } from 'lucide-react';
import { MotionTrackData, TimelineClip } from '../types/editor';
import { analyzeMotionTrack } from '../engine/motionTracker';

interface MotionTrackerPanelProps {
  selectedClip: TimelineClip | null;
  allClips: TimelineClip[];
  fps: number;
  onUpdateTrackData: (clipId: string, data: MotionTrackData) => void;
  onApplyTrackToLayer: (sourceClipId: string, targetClipId: string) => void;
}

export const MotionTrackerPanel: React.FC<MotionTrackerPanelProps> = ({
  selectedClip,
  allClips,
  fps,
  onUpdateTrackData,
  onApplyTrackToLayer,
}) => {
  const [targetLayerId, setTargetLayerId] = useState<string>('');
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);

  if (!selectedClip || selectedClip.kind === 'audio') {
    return (
      <div className="p-4 text-center space-y-2">
        <Crosshair className="w-7 h-7 text-[#4B5261] mx-auto" />
        <p className="text-xs font-medium text-[#C8CDD6]">
          Select Footage or a Layer to Track
        </p>
        <p className="text-[11px] text-[#7E8594]">
          Place a 2D/3D feature track point, analyze motion across frames, and
          link any Title, HUD, or Shape layer to follow it.
        </p>
      </div>
    );
  }

  const trackData: MotionTrackData = selectedClip.trackData ?? {
    targetX: 0,
    targetY: 0,
    points: [],
  };

  const targetCandidates = allClips.filter(
    (c) =>
      c.id !== selectedClip.id &&
      c.kind !== 'audio' &&
      c.kind !== 'camera' &&
      c.kind !== 'light'
  );

  const chosenTarget =
    targetLayerId || targetCandidates[0]?.id || '';

  const handleAnalyze = () => {
    const points = analyzeMotionTrack(
      selectedClip,
      trackData.targetX,
      trackData.targetY,
      fps
    );
    onUpdateTrackData(selectedClip.id, { ...trackData, points });
    setAppliedMsg(null);
  };

  const handleApply = () => {
    if (!chosenTarget || trackData.points.length === 0) return;
    onApplyTrackToLayer(selectedClip.id, chosenTarget);
    const tName = targetCandidates.find((c) => c.id === chosenTarget)?.name || 'Target';
    setAppliedMsg(`Baked ${trackData.points.length} track keyframes to "${tName}".`);
  };

  return (
    <div className="space-y-3 p-1" data-testid="motion-tracker-panel">
      <div className="flex items-center gap-1.5">
        <Crosshair className="w-3.5 h-3.5 text-[#14B8A6]" />
        <span className="text-xs font-semibold text-[#E6E8EC]">
          Optical Motion Tracker
        </span>
      </div>

      <div className="bg-[#14161A] border border-[#262B34] rounded p-2.5 space-y-2.5">
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-[#9BA1AD]">Track Point Offset X</span>
            <span className="font-mono-tabular text-[#14B8A6]">
              {trackData.targetX}px
            </span>
          </div>
          <input
            type="range"
            aria-label="Track Target X"
            min={-400}
            max={400}
            value={trackData.targetX}
            onChange={(e) =>
              onUpdateTrackData(selectedClip.id, {
                ...trackData,
                targetX: Number(e.target.value),
              })
            }
            className="w-full studio-slider"
          />
        </div>

        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-[#9BA1AD]">Track Point Offset Y</span>
            <span className="font-mono-tabular text-[#14B8A6]">
              {trackData.targetY}px
            </span>
          </div>
          <input
            type="range"
            aria-label="Track Target Y"
            min={-250}
            max={250}
            value={trackData.targetY}
            onChange={(e) =>
              onUpdateTrackData(selectedClip.id, {
                ...trackData,
                targetY: Number(e.target.value),
              })
            }
            className="w-full studio-slider"
          />
        </div>

        <button
          type="button"
          onClick={handleAnalyze}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#14B8A6] hover:bg-[#0D9488] text-xs font-semibold text-[#0D1117] transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Analyze &amp; Track Forward</span>
        </button>
      </div>

      {trackData.points.length > 0 && (
        <div className="bg-[#14161A] border border-[#262B34] rounded p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#99F6E4] font-medium">
              {trackData.points.length} Tracked Keyframes
            </span>
            <span className="font-mono-tabular text-[#7E8594]">
              96% Confidence
            </span>
          </div>

          <div>
            <label className="text-[10px] text-[#8D95A5] block mb-1">
              Target Layer (Text / Shape / Null)
            </label>
            <select
              aria-label="Track Target Layer"
              value={chosenTarget}
              onChange={(e) => setTargetLayerId(e.target.value)}
              className="w-full bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-[#E6E8EC] focus:outline-none"
            >
              {targetCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.kind})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={!chosenTarget}
            onClick={handleApply}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-45 text-xs font-semibold text-white transition-colors"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Apply Track to Target</span>
          </button>

          {appliedMsg && (
            <div className="flex items-start gap-1.5 text-[11px] text-[#99F6E4] pt-1">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{appliedMsg}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
