import React from 'react';
import { Volume2, VolumeX, Sliders } from 'lucide-react';
import { TimelineClip, TimelineTrack } from '../types/editor';
import { computeTrackVuLevels } from '../audio/audioEngine';

interface FairlightMixerPanelProps {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  playheadTime: number;
  onUpdateTrackAudio: (
    trackId: string,
    patch: Partial<
      Pick<
        TimelineTrack,
        'volumeDb' | 'pan' | 'eqLow' | 'eqMid' | 'eqHigh' | 'compressor'
      >
    >
  ) => void;
  onToggleTrackFlag: (
    trackId: string,
    flag: 'visible' | 'muted' | 'solo' | 'locked'
  ) => void;
}

export const FairlightMixerPanel: React.FC<FairlightMixerPanelProps> = ({
  tracks,
  clips,
  playheadTime,
  onUpdateTrackAudio,
  onToggleTrackFlag,
}) => {
  const audioTracks = tracks.filter((t) => t.kind === 'audio');
  const hasSolo = audioTracks.some((t) => t.solo);

  return (
    <div className="space-y-3 p-1" data-testid="fairlight-mixer-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#14B8A6]" />
          <span className="text-xs font-semibold text-[#E6E8EC]">
            Fairlight Audio Console
          </span>
        </div>
        <span className="text-[10px] font-mono-tabular text-[#7E8594]">
          {audioTracks.length} Bus Tracks
        </span>
      </div>

      {audioTracks.length === 0 ? (
        <div className="p-4 text-center text-xs text-[#7E8594] bg-[#14161A] border border-[#262B34] rounded">
          Add an audio track to mix EQ, Pan, and Dynamics.
        </div>
      ) : (
        <div className="space-y-2.5">
          {audioTracks.map((track) => {
            const db = track.volumeDb ?? 0;
            const pan = track.pan ?? 0;
            const eqLow = track.eqLow ?? 0;
            const eqMid = track.eqMid ?? 0;
            const eqHigh = track.eqHigh ?? 0;
            const vu = computeTrackVuLevels(track, clips, playheadTime, hasSolo);

            return (
              <div
                key={track.id}
                className="bg-[#14161A] border border-[#262B34] rounded p-2.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#E6E8EC] truncate">
                    {track.name}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleTrackFlag(track.id, 'muted')}
                      aria-label={`Mixer Mute ${track.name}`}
                      className={`p-1 rounded ${
                        track.muted
                          ? 'bg-[#EF4444]/20 text-[#EF4444]'
                          : 'bg-[#232730] text-[#14B8A6]'
                      }`}
                    >
                      {track.muted ? (
                        <VolumeX className="w-3 h-3" />
                      ) : (
                        <Volume2 className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleTrackFlag(track.id, 'solo')}
                      aria-label={`Mixer Solo ${track.name}`}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        track.solo
                          ? 'bg-[#F59E0B] text-black'
                          : 'bg-[#232730] text-[#9BA1AD]'
                      }`}
                    >
                      S
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateTrackAudio(track.id, {
                          compressor: !track.compressor,
                        })
                      }
                      aria-pressed={Boolean(track.compressor)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        track.compressor
                          ? 'bg-[#3B82F6] text-white'
                          : 'bg-[#232730] text-[#9BA1AD]'
                      }`}
                    >
                      COMP
                    </button>
                  </div>
                </div>

                {/* Live Stereo VU Meters */}
                <div className="space-y-1 bg-[#0E1013] p-1.5 rounded border border-[#22262F]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono-tabular text-[#7E8594] w-3">
                      L
                    </span>
                    <div className="flex-1 h-1.5 bg-[#1B1E25] rounded overflow-hidden">
                      <div
                        style={{ width: `${Math.round(vu.left * 100)}%` }}
                        className="h-full bg-gradient-to-r from-[#14B8A6] via-[#F59E0B] to-[#EF4444] transition-all duration-75"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono-tabular text-[#7E8594] w-3">
                      R
                    </span>
                    <div className="flex-1 h-1.5 bg-[#1B1E25] rounded overflow-hidden">
                      <div
                        style={{ width: `${Math.round(vu.right * 100)}%` }}
                        className="h-full bg-gradient-to-r from-[#14B8A6] via-[#F59E0B] to-[#EF4444] transition-all duration-75"
                      />
                    </div>
                  </div>
                </div>

                {/* Gain dB & Stereo Pan */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-[#9BA1AD]">Fader</span>
                      <span className="font-mono-tabular text-[#14B8A6]">
                        {db > 0 ? `+${db}` : db} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label={`${track.name} Gain dB`}
                      min={-36}
                      max={12}
                      step={1}
                      value={db}
                      onChange={(e) =>
                        onUpdateTrackAudio(track.id, {
                          volumeDb: Number(e.target.value),
                        })
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-[#9BA1AD]">Pan</span>
                      <span className="font-mono-tabular text-[#60A5FA]">
                        {pan === 0
                          ? 'C'
                          : pan < 0
                          ? `L${Math.round(Math.abs(pan) * 100)}`
                          : `R${Math.round(pan * 100)}`}
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label={`${track.name} Stereo Pan`}
                      min={-1}
                      max={1}
                      step={0.05}
                      value={pan}
                      onChange={(e) =>
                        onUpdateTrackAudio(track.id, {
                          pan: Number(e.target.value),
                        })
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                </div>

                {/* 3-Band Parametric EQ */}
                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-[#22262F]">
                  <div>
                    <div className="flex justify-between text-[9px] text-[#8D95A5] mb-0.5">
                      <span>Low</span>
                      <span className="font-mono-tabular">{eqLow}dB</span>
                    </div>
                    <input
                      type="range"
                      aria-label={`${track.name} EQ Low`}
                      min={-12}
                      max={12}
                      value={eqLow}
                      onChange={(e) =>
                        onUpdateTrackAudio(track.id, {
                          eqLow: Number(e.target.value),
                        })
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-[#8D95A5] mb-0.5">
                      <span>Mid</span>
                      <span className="font-mono-tabular">{eqMid}dB</span>
                    </div>
                    <input
                      type="range"
                      aria-label={`${track.name} EQ Mid`}
                      min={-12}
                      max={12}
                      value={eqMid}
                      onChange={(e) =>
                        onUpdateTrackAudio(track.id, {
                          eqMid: Number(e.target.value),
                        })
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-[#8D95A5] mb-0.5">
                      <span>High</span>
                      <span className="font-mono-tabular">{eqHigh}dB</span>
                    </div>
                    <input
                      type="range"
                      aria-label={`${track.name} EQ High`}
                      min={-12}
                      max={12}
                      value={eqHigh}
                      onChange={(e) =>
                        onUpdateTrackAudio(track.id, {
                          eqHigh: Number(e.target.value),
                        })
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
