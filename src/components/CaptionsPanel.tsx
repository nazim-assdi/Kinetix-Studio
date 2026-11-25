import React from 'react';
import { Captions, Plus, Trash2, Download, Sparkles } from 'lucide-react';
import { CaptionCue, TimelineClip } from '../types/editor';
import { generateSrtSubtitles } from '../engine/scopes';

interface CaptionsPanelProps {
  allClips: TimelineClip[];
  selectedClip: TimelineClip | null;
  playheadTime: number;
  onCreateCaptionClip: () => void;
  onUpdateCaptions: (
    clipId: string,
    patch: Partial<NonNullable<TimelineClip['captionProps']>>
  ) => void;
}

export const CaptionsPanel: React.FC<CaptionsPanelProps> = ({
  allClips,
  selectedClip,
  playheadTime,
  onCreateCaptionClip,
  onUpdateCaptions,
}) => {
  const captionClip =
    (selectedClip?.kind === 'caption' ? selectedClip : null) ??
    allClips.find((c) => c.kind === 'caption') ??
    null;

  if (!captionClip || !captionClip.captionProps) {
    return (
      <div className="p-3 space-y-3" data-testid="captions-empty-panel">
        <div className="flex items-center gap-1.5">
          <Captions className="w-4 h-4 text-[#3B82F6]" />
          <span className="text-xs font-semibold text-[#E6E8EC]">
            Subtitles &amp; Broadcast Captions
          </span>
        </div>
        <p className="text-[11px] text-[#7E8594] leading-relaxed">
          Create a Premiere-style synced caption track with live burn-in styling
          and one-click `.srt` subtitle export.
        </p>
        <button
          type="button"
          onClick={onCreateCaptionClip}
          className="w-full py-2 px-3 rounded bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-semibold text-white flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Create Captions Track</span>
        </button>
      </div>
    );
  }

  const cp = captionClip.captionProps;

  const handleAddCue = () => {
    const start = Number(playheadTime.toFixed(2));
    const nextCue: CaptionCue = {
      id: `cue_${Date.now()}`,
      start,
      end: Number((start + 2.4).toFixed(2)),
      text: 'New studio caption line',
    };
    onUpdateCaptions(captionClip.id, { cues: [...cp.cues, nextCue] });
  };

  const handleAutoSyncCues = () => {
    const generated: CaptionCue[] = [
      { id: 'auto_1', start: 0.4, end: 2.8, text: 'Precision 3D Motion Graphics' },
      { id: 'auto_2', start: 3.0, end: 5.4, text: 'Multi-Track NLE & Speed Ramping' },
      { id: 'auto_3', start: 5.7, end: 8.8, text: 'DaVinci Color Wheels & Fairlight Mix' },
      { id: 'auto_4', start: 9.1, end: 12.6, text: 'Export Master up to 8K UHD' },
    ];
    onUpdateCaptions(captionClip.id, { cues: generated });
  };

  const handleExportSrt = () => {
    const srt = generateSrtSubtitles(cp.cues);
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${captionClip.name.replace(/\s+/g, '_')}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2.5 p-1" data-testid="captions-panel">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <Captions className="w-3.5 h-3.5 text-[#3B82F6]" />
          <span className="text-xs font-semibold text-[#E6E8EC]">
            Captions ({cp.cues.length})
          </span>
        </div>
        <button
          type="button"
          onClick={handleExportSrt}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#232730] hover:bg-[#2C313D] text-[10px] text-[#93C5FD]"
        >
          <Download className="w-3 h-3" />
          <span>Export .SRT</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={handleAddCue}
          className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-[#3B82F6] hover:bg-[#2563EB] text-[11px] font-medium text-white"
        >
          <Plus className="w-3 h-3" />
          <span>Add Cue</span>
        </button>
        <button
          type="button"
          onClick={handleAutoSyncCues}
          className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-[#232730] hover:bg-[#2C313D] text-[11px] font-medium text-[#E6E8EC]"
        >
          <Sparkles className="w-3 h-3 text-[#F59E0B]" />
          <span>Auto Sync</span>
        </button>
      </div>

      {/* Style Row */}
      <div className="grid grid-cols-2 gap-2 bg-[#14161A] border border-[#262B34] rounded p-2">
        <div>
          <span className="text-[10px] text-[#8D95A5] block mb-0.5">
            Size ({cp.fontSize}px)
          </span>
          <input
            type="range"
            aria-label="Caption Font Size"
            min={18}
            max={54}
            value={cp.fontSize}
            onChange={(e) =>
              onUpdateCaptions(captionClip.id, { fontSize: Number(e.target.value) })
            }
            className="w-full studio-slider"
          />
        </div>
        <div>
          <span className="text-[10px] text-[#8D95A5] block mb-0.5">Position</span>
          <select
            aria-label="Caption Position"
            value={cp.position}
            onChange={(e) =>
              onUpdateCaptions(captionClip.id, {
                position: e.target.value as 'bottom' | 'center',
              })
            }
            className="w-full bg-[#111215] border border-[#2B303A] rounded px-1.5 py-0.5 text-[11px] text-[#E6E8EC]"
          >
            <option value="bottom">Bottom Third</option>
            <option value="center">Center Reel</option>
          </select>
        </div>
      </div>

      {/* Cue List */}
      <div className="space-y-1.5">
        {cp.cues.map((cue) => (
          <div
            key={cue.id}
            className="bg-[#14161A] border border-[#262B34] rounded p-2 space-y-1.5"
          >
            <div className="flex items-center justify-between gap-1.5 text-[10px] font-mono-tabular text-[#8D95A5]">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  aria-label={`Cue start ${cue.id}`}
                  value={cue.start}
                  onChange={(e) =>
                    onUpdateCaptions(captionClip.id, {
                      cues: cp.cues.map((c) =>
                        c.id === cue.id
                          ? { ...c, start: Math.max(0, Number(e.target.value)) }
                          : c
                      ),
                    })
                  }
                  className="w-12 bg-[#111215] border border-[#2B303A] rounded px-1 py-0.5 text-[#60A5FA]"
                />
                <span>→</span>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  aria-label={`Cue end ${cue.id}`}
                  value={cue.end}
                  onChange={(e) =>
                    onUpdateCaptions(captionClip.id, {
                      cues: cp.cues.map((c) =>
                        c.id === cue.id
                          ? { ...c, end: Math.max(c.start + 0.2, Number(e.target.value)) }
                          : c
                      ),
                    })
                  }
                  className="w-12 bg-[#111215] border border-[#2B303A] rounded px-1 py-0.5 text-[#60A5FA]"
                />
              </div>
              <button
                type="button"
                aria-label="Delete caption cue"
                onClick={() =>
                  onUpdateCaptions(captionClip.id, {
                    cues: cp.cues.filter((c) => c.id !== cue.id),
                  })
                }
                className="text-[#6E7685] hover:text-[#EF4444]"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <input
              type="text"
              aria-label="Caption cue text"
              value={cue.text}
              onChange={(e) =>
                onUpdateCaptions(captionClip.id, {
                  cues: cp.cues.map((c) =>
                    c.id === cue.id ? { ...c, text: e.target.value } : c
                  ),
                })
              }
              className="w-full bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#3B82F6]"
            />
          </div>
        ))}
      </div>
    </div>
  );
};
