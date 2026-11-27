import React, { useState } from 'react';
import { Film, MonitorPlay } from 'lucide-react';
import { CompositionSettings } from '../types/editor';

interface SequenceSetupModalProps {
  isOpen: boolean;
  initialValue: CompositionSettings;
  onCreate: (settings: CompositionSettings) => void;
}

const SEQUENCE_PRESETS = [
  { id: '1080p', label: 'Full HD · 1920 × 1080', width: 1920, height: 1080, fps: 30 },
  { id: '4k', label: '4K UHD · 3840 × 2160', width: 3840, height: 2160, fps: 30 },
  { id: '720p', label: 'HD · 1280 × 720', width: 1280, height: 720, fps: 30 },
  { id: 'vertical', label: 'Vertical · 1080 × 1920', width: 1080, height: 1920, fps: 30 },
  { id: 'square', label: 'Square · 1080 × 1080', width: 1080, height: 1080, fps: 30 },
  { id: 'cinema', label: 'Cinema · 2560 × 1072', width: 2560, height: 1072, fps: 24 },
] as const;

export const SequenceSetupModal: React.FC<SequenceSetupModalProps> = ({
  isOpen,
  initialValue,
  onCreate,
}) => {
  const [presetId, setPresetId] = useState('1080p');
  const [name, setName] = useState('Untitled Sequence');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(30);

  if (!isOpen) return null;

  const choosePreset = (value: string) => {
    setPresetId(value);
    const next = SEQUENCE_PRESETS.find((item) => item.id === value);
    if (next) {
      setWidth(next.width);
      setHeight(next.height);
      setFps(next.fps);
    } else {
    }
  };

  const create = () => {
    const safeWidth = Math.round(Math.max(320, Math.min(8192, width)));
    const safeHeight = Math.round(Math.max(240, Math.min(8192, height)));
    const safeFps = Math.max(12, Math.min(120, fps));
    const safeDuration = Math.max(0.5, Math.min(3600, duration));
    onCreate({
      ...initialValue,
      name: name.trim() || 'Untitled Sequence',
      width: safeWidth,
      height: safeHeight,
      fps: safeFps,
      duration: safeDuration,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sequence-setup-title"
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-[#343B49] bg-[#171A20] shadow-2xl">
        <div className="border-b border-[#2B303A] bg-[#13161B] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#253A58] text-[#93C5FD]">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <h2 id="sequence-setup-title" className="text-base font-semibold text-white">Create a Sequence</h2>
              <p className="text-xs text-[#8D95A5]">Set your frame size, frame rate and timeline length before editing</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-[#C8CDD6]">Sequence Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              className="w-full rounded border border-[#343B49] bg-[#0E1013] px-3 py-2 text-sm text-white outline-none focus:border-[#60A5FA]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-[#C8CDD6]">Resolution Preset</span>
            <select
              value={presetId}
              onChange={(event) => choosePreset(event.target.value)}
              className="w-full rounded border border-[#343B49] bg-[#0E1013] px-3 py-2 text-sm text-white outline-none focus:border-[#60A5FA]"
            >
              {SEQUENCE_PRESETS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
              <option value="custom">Custom Resolution</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[#C8CDD6]">Width (px)</span>
              <input type="number" min={320} max={8192} value={width}
                onChange={(event) => { setWidth(Number(event.target.value)); setPresetId('custom'); }}
                className="w-full rounded border border-[#343B49] bg-[#0E1013] px-3 py-2 text-sm text-white outline-none focus:border-[#60A5FA]" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[#C8CDD6]">Height (px)</span>
              <input type="number" min={240} max={8192} value={height}
                onChange={(event) => { setHeight(Number(event.target.value)); setPresetId('custom'); }}
                className="w-full rounded border border-[#343B49] bg-[#0E1013] px-3 py-2 text-sm text-white outline-none focus:border-[#60A5FA]" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[#C8CDD6]">Frame Rate (FPS)</span>
              <select value={fps} onChange={(event) => setFps(Number(event.target.value))}
                className="w-full rounded border border-[#343B49] bg-[#0E1013] px-3 py-2 text-sm text-white outline-none focus:border-[#60A5FA]">
                {[23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 120].map((value) =>
                  <option key={value} value={value}>{value} fps</option>
                )}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[#C8CDD6]">Duration (seconds)</span>
              <input type="number" min={0.5} max={3600} step={0.5} value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                className="w-full rounded border border-[#343B49] bg-[#0E1013] px-3 py-2 text-sm text-white outline-none focus:border-[#60A5FA]" />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#2B303A] bg-[#11151B] px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs text-[#AEB7C5]">
              <MonitorPlay className="h-4 w-4 text-[#60A5FA]" />
              <span>Sequence Preview</span>
            </div>
            <span className="font-mono text-xs text-white">{width} × {height} · {fps} fps · {duration}s</span>
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-[#2B303A] bg-[#13161B] px-5 py-4">
          <button type="button" onClick={create}
            disabled={!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(duration) || duration <= 0}
            className="rounded-md bg-[#2563EB] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-40">
            Create Sequence
          </button>
        </div>
      </div>
    </div>
  );
};
