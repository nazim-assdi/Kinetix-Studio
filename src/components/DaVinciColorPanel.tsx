import React, { useRef, useState } from 'react';
import { RotateCcw, Palette, Upload } from 'lucide-react';
import {
  ColorWheelChannel,
  ColorWheelGrade,
  TimelineClip,
} from '../types/editor';
import { DAVINCI_LUTS, DEFAULT_COLOR_GRADE } from '../data/megaCatalog';
import { VideoScopesPanel } from './VideoScopesPanel';
import { parseCubeLut } from '../engine/lut';

interface DaVinciColorPanelProps {
  selectedClip: TimelineClip | null;
  playheadTime?: number;
  scopeRefreshKey?: string;
  onUpdateColorGrade: (clipId: string, grade: ColorWheelGrade) => void;
}

interface ColorWheelControlProps {
  label: string;
  channel: ColorWheelChannel;
  onChange: (next: ColorWheelChannel) => void;
}

const ColorWheelControl: React.FC<ColorWheelControlProps> = ({
  label,
  channel,
  onChange,
}) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Convert channel r/b/g approx into 2D puck x, y (-1..1)
  const puckX = Math.max(-0.85, Math.min(0.85, channel.r - channel.b * 0.6));
  const puckY = Math.max(-0.85, Math.min(0.85, -channel.g + channel.b * 0.4));

  const updateFromPointer = (clientX: number, clientY: number) => {
    const el = wheelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = rect.width / 2;
    let dx = (clientX - cx) / radius;
    let dy = (clientY - cy) / radius;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.9) {
      dx = (dx / dist) * 0.9;
      dy = (dy / dist) * 0.9;
    }
    const angle = Math.atan2(dy, dx);
    const mag = Math.min(1, Math.hypot(dx, dy));
    const r = Number((Math.cos(angle) * mag).toFixed(2));
    const g = Number((-Math.sin(angle) * mag * 0.85).toFixed(2));
    const b = Number((-Math.cos(angle - Math.PI / 3) * mag).toFixed(2));
    onChange({ ...channel, r, g, b });
  };

  return (
    <div className="flex flex-col items-center gap-1.5 bg-[#14161A] border border-[#262B34] rounded p-2">
      <div className="w-full flex items-center justify-between text-[10px]">
        <span className="font-semibold text-[#E6E8EC]">{label}</span>
        <button
          type="button"
          onClick={() => onChange({ r: 0, g: 0, b: 0, luma: 0 })}
          title={`Reset ${label}`}
          className="text-[#7E8594] hover:text-white"
        >
          <RotateCcw className="w-2.5 h-2.5" />
        </button>
      </div>

      <div
        ref={wheelRef}
        role="slider"
        aria-label={`${label} Color Wheel`}
        aria-valuenow={Math.round(channel.luma)}
        tabIndex={0}
        onPointerDown={(e) => {
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (dragging) updateFromPointer(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (dragging) {
            setDragging(false);
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              // ignore
            }
          }
        }}
        style={{
          background:
            'conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)',
        }}
        className="relative w-[5.5rem] h-[5.5rem] rounded-full border border-[#46505F] cursor-crosshair shadow-inner ring-1 ring-white/5"
      >
        <div
          style={{
            background:
              'radial-gradient(circle, rgba(24,26,31,0.92) 10%, rgba(24,26,31,0.35) 68%, rgba(24,26,31,0.08) 100%)',
          }}
          className="absolute inset-0 rounded-full pointer-events-none"
        />
        <div
          style={{
            left: `${50 + puckX * 42}%`,
            top: `${50 + puckY * 42}%`,
          }}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#111215] shadow-[0_0_0_2px_rgba(255,255,255,0.2)] pointer-events-none"
        />
      </div>

      <div className="w-full grid grid-cols-3 gap-1">
        {(['r', 'g', 'b'] as const).map((component) => (
          <label key={component} className="block min-w-0">
            <span className="block text-[9px] uppercase text-[#8D95A5] mb-0.5">{component}</span>
            <input
              type="number"
              aria-label={`${label} ${component.toUpperCase()} value`}
              min={-1}
              max={1}
              step={0.01}
              value={Number(channel[component].toFixed(2))}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) onChange({ ...channel, [component]: Math.max(-1, Math.min(1, value)) });
              }}
              className="w-full min-w-0 bg-[#0E1013] border border-[#2B303A] rounded px-1 py-1 text-[10px] text-[#E6E8EC] font-mono-tabular"
            />
          </label>
        ))}
      </div>

      <div className="w-full space-y-0.5">
        <div className="flex justify-between text-[9px] text-[#8D95A5] font-mono-tabular">
          <span>Luma</span>
          <span>{channel.luma > 0 ? `+${channel.luma}` : channel.luma}</span>
        </div>
        <input
          type="range"
          aria-label={`${label} Master Luma`}
          min={-60}
          max={60}
          value={channel.luma}
          onChange={(e) =>
            onChange({ ...channel, luma: Number(e.target.value) })
          }
          className="w-full studio-slider"
        />
      </div>
    </div>
  );
};

export const DaVinciColorPanel: React.FC<DaVinciColorPanelProps> = ({
  selectedClip,
  playheadTime = 0,
  scopeRefreshKey = '',
  onUpdateColorGrade,
}) => {
  const lutInputRef = useRef<HTMLInputElement>(null);
  const [lutStatus, setLutStatus] = useState<string | null>(null);
  if (
    !selectedClip ||
    selectedClip.kind === 'audio' ||
    selectedClip.kind === 'camera' ||
    selectedClip.kind === 'light' ||
    selectedClip.kind === 'null'
  ) {
    return (
      <div className="space-y-3 p-1">
        <VideoScopesPanel
          playheadTime={playheadTime}
          gradeSignature="idle"
          scopeRefreshKey={scopeRefreshKey}
        />
        <div className="p-3 text-center space-y-1.5 bg-[#14161A] border border-[#262B34] rounded">
          <Palette className="w-6 h-6 text-[#4B5261] mx-auto" />
          <p className="text-xs font-medium text-[#C8CDD6]">
            Select a Visual Layer or Adjustment Layer
          </p>
          <p className="text-[11px] text-[#7E8594]">
            DaVinci primary wheels (Lift / Gamma / Gain / Offset), log controls and Film LUTs grade
            any selected footage or title layer live.
          </p>
        </div>
      </div>
    );
  }

  const grade: ColorWheelGrade = selectedClip.colorGrade ?? {
    ...DEFAULT_COLOR_GRADE,
    enabled: true,
  };

  const patchGrade = (patch: Partial<ColorWheelGrade>) => {
    onUpdateColorGrade(selectedClip.id, {
      ...grade,
      ...patch,
      enabled: true,
    });
  };

  const secondary = grade.hslSecondary ?? { enabled: false, hueCenter: 45, hueWidth: 45, hueShift: 0, saturation: 0, luminance: 0, softness: 35 };
  const rgbCurves = grade.rgbCurves ?? {
    master: { shadows: 0, midtones: 0, highlights: 0 },
    red: { shadows: 0, midtones: 0, highlights: 0 },
    green: { shadows: 0, midtones: 0, highlights: 0 },
    blue: { shadows: 0, midtones: 0, highlights: 0 },
  };
  const curveSignature = (['master', 'red', 'green', 'blue'] as const)
    .map((channel) => `${rgbCurves[channel].shadows},${rgbCurves[channel].midtones},${rgbCurves[channel].highlights}`)
    .join('_');
  const gradeSig = `${selectedClip.id}_${grade.contrast}_${grade.saturation}_${grade.temp}_${grade.tint}_${grade.lift.luma}_${grade.gamma.luma}_${grade.gain.luma}_${grade.offset?.luma ?? 0}_${grade.exposureStops ?? 0}_${grade.hue ?? 0}_${grade.vibrance ?? 0}_${grade.colorBoost ?? 0}_${grade.midtoneDetail ?? 0}_${grade.shadows ?? 0}_${grade.highlights ?? 0}_${grade.blacks ?? 0}_${grade.whites ?? 0}_${grade.dehaze ?? 0}_${grade.clarity ?? 0}_${grade.sharpenAmount ?? 0}_${grade.curveBlacks ?? 0}_${grade.curveMidtones ?? 0}_${grade.curveWhites ?? 0}_${grade.vignetteAmount ?? 0}_${secondary.enabled}_${secondary.hueCenter}_${secondary.hueWidth}_${secondary.hueShift}_${secondary.saturation}_${secondary.luminance}_${curveSignature}_${grade.lut}`;
  const importCubeLut = async (file: File) => {
    try {
      const parsed = parseCubeLut(await file.text(), file.name);
      onUpdateColorGrade(selectedClip.id, {
        ...grade,
        enabled: true,
        lut: parsed.name,
        lutData: parsed,
      });
      setLutStatus(`Imported ${parsed.name} · ${parsed.size}³`);
    } catch (error) {
      setLutStatus(error instanceof Error ? error.message : 'Could not read the .cube LUT.');
    }
  };

  return (
    <div className="space-y-2.5 p-1" data-testid="davinci-color-panel">
      <VideoScopesPanel
        playheadTime={playheadTime}
        gradeSignature={gradeSig}
        scopeRefreshKey={scopeRefreshKey}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-[#F59E0B]" />
          <span className="text-xs font-semibold text-[#E6E8EC]">
            DaVinci Color · Primary &amp; Log
          </span>
        </div>
        <button
          type="button"
          onClick={() =>
            onUpdateColorGrade(selectedClip.id, {
              ...DEFAULT_COLOR_GRADE,
              enabled: false,
            })
          }
          className="flex items-center gap-1 text-[10px] text-[#9BA1AD] hover:text-white"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* LUT Selector and .cube Import */}
      <div className="rounded border border-[#262B34] bg-[#14161A] p-2 space-y-2">
        <input
          ref={lutInputRef}
          type="file"
          accept=".cube,text/plain"
          className="hidden"
          aria-label="Import 3D LUT file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importCubeLut(file);
            event.currentTarget.value = '';
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] text-[#8D95A5]">3D LUT</label>
          <button
            type="button"
            onClick={() => lutInputRef.current?.click()}
            className="flex items-center gap-1 rounded border border-[#384254] px-2 py-1 text-[10px] font-semibold text-[#C8D7F0] hover:bg-[#202B3B]"
          >
            <Upload className="w-3 h-3" /> Import .cube
          </button>
        </div>
        <select
          aria-label="DaVinci Film LUT"
          value={grade.lut}
          onChange={(event) => {
            const selected = event.target.value;
            if (selected === 'None') {
              onUpdateColorGrade(selectedClip.id, { ...grade, enabled: true, lut: 'None', lutData: undefined });
              setLutStatus('LUT bypassed · RGB controls remain active');
              return;
            }
            const preset = DAVINCI_LUTS.find((item) => item.name === selected);
            if (preset) {
              onUpdateColorGrade(selectedClip.id, {
                ...preset.grade,
                enabled: preset.id !== 'lut_neutral',
                lutData: undefined,
              });
              setLutStatus(null);
            }
          }}
          className="w-full bg-[#111215] border border-[#2B303A] rounded px-2 py-1.5 text-xs text-[#E6E8EC] focus:outline-none"
        >
          <option value="None">None · No LUT</option>
          {DAVINCI_LUTS.map((item) => (
            <option key={item.id} value={item.name}>{item.name}</option>
          ))}
          {grade.lutData && !DAVINCI_LUTS.some((item) => item.name === grade.lut) && (
            <option value={grade.lut}>{grade.lut} · Imported</option>
          )}
        </select>
        {lutStatus && <p className="text-[9px] leading-snug text-[#9BA1AD]">{lutStatus}</p>}
      </div>

      {/* 3-Way Color Wheels */}
      <div className="grid grid-cols-2 gap-2">
        <ColorWheelControl
          label="Lift"
          channel={grade.lift}
          onChange={(lift) => patchGrade({ lift })}
        />
        <ColorWheelControl
          label="Gamma"
          channel={grade.gamma}
          onChange={(gamma) => patchGrade({ gamma })}
        />
        <ColorWheelControl
          label="Gain"
          channel={grade.gain}
          onChange={(gain) => patchGrade({ gain })}
        />
        <ColorWheelControl
          label="Offset"
          channel={grade.offset ?? { r: 0, g: 0, b: 0, luma: 0 }}
          onChange={(offset) => patchGrade({ offset })}
        />
      </div>

      <details open className="rounded border border-[#303744] bg-[#12151A]">
        <summary className="cursor-pointer select-none px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#D6D9E0]">
          Lumetri · Basic Correction
        </summary>
        <div className="grid grid-cols-2 gap-3 border-t border-[#272E39] p-2.5">
          {([
            ['Blacks', 'blacks', -100, 100, 1],
            ['Whites', 'whites', -100, 100, 1],
            ['Dehaze', 'dehaze', -100, 100, 1],
            ['Clarity', 'clarity', -100, 100, 1],
            ['Sharpen', 'sharpenAmount', 0, 100, 1],
          ] as const).map(([label, key, min, max, step]) => (
            <label key={key} className="block text-[10px] text-[#9BA1AD]">
              <span className="mb-1 flex justify-between gap-2">
                <span>{label}</span>
                <span className="font-mono-tabular text-[#E6E8EC]">{Number(grade[key] ?? 0).toFixed(0)}</span>
              </span>
              <input
                type="range"
                aria-label={`Lumetri ${label}`}
                min={min}
                max={max}
                step={step}
                value={grade[key] ?? 0}
                onChange={(event) => patchGrade({ [key]: Number(event.target.value) })}
                className="w-full studio-slider"
              />
            </label>
          ))}
        </div>
      </details>

      <details className="rounded border border-[#303744] bg-[#12151A]">
        <summary className="cursor-pointer select-none px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#D6D9E0]">
          RGB Curves · Shadows / Midtones / Highlights
        </summary>
        <div className="grid grid-cols-3 gap-2 border-t border-[#272E39] p-2.5">
          {([
            ['Shadows', 'curveBlacks'],
            ['Midtones', 'curveMidtones'],
            ['Highlights', 'curveWhites'],
          ] as const).map(([label, key]) => (
            <label key={key} className="block min-w-0 text-[9px] text-[#9BA1AD]">
              <span className="mb-1 block text-center">{label}</span>
              <input
                type="range"
                aria-label={`RGB Curve ${label}`}
                min={-100}
                max={100}
                value={grade[key] ?? 0}
                onChange={(event) => patchGrade({ [key]: Number(event.target.value) })}
                className="w-full studio-slider"
              />
              <span className="block text-center font-mono-tabular text-[#C8CDD6]">{grade[key] ?? 0}</span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-[#272E39] p-2.5">
          {([
            ['Master', 'master'],
            ['Red', 'red'],
            ['Green', 'green'],
            ['Blue', 'blue'],
          ] as const).map(([label, channel]) => (
            <details key={channel} className="rounded border border-[#2B303A] bg-[#0E1013]">
              <summary className="cursor-pointer select-none px-2 py-1.5 text-[10px] font-semibold text-[#C8CDD6]">{label}</summary>
              <div className="space-y-2 px-2 pb-2 pt-1">
                {([
                  ['Shadows', 'shadows'],
                  ['Midtones', 'midtones'],
                  ['Highlights', 'highlights'],
                ] as const).map(([tone, key]) => (
                  <label key={key} className="block text-[9px] text-[#8D95A5]">
                    <span className="mb-0.5 flex justify-between">
                      <span>{tone}</span>
                      <span className="font-mono-tabular text-[#E6E8EC]">{rgbCurves[channel][key]}</span>
                    </span>
                    <input
                      type="range"
                      aria-label={`${label} curve ${tone}`}
                      min={-100}
                      max={100}
                      value={rgbCurves[channel][key]}
                      onChange={(event) => patchGrade({
                        rgbCurves: {
                          ...rgbCurves,
                          [channel]: { ...rgbCurves[channel], [key]: Number(event.target.value) },
                        },
                      })}
                      className="w-full studio-slider"
                    />
                  </label>
                ))}
              </div>
            </details>
          ))}
        </div>
      </details>

      <details className="rounded border border-[#303744] bg-[#12151A]">
        <summary className="cursor-pointer select-none px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#D6D9E0]">
          HSL Secondary · Qualifier
        </summary>
        <div className="space-y-3 border-t border-[#272E39] p-2.5">
          <label className="flex items-center justify-between text-[10px] text-[#C8CDD6]">
            <span>Enable HSL Secondary</span>
            <input
              type="checkbox"
              aria-label="Enable HSL Secondary"
              checked={secondary.enabled}
              onChange={(event) => patchGrade({ hslSecondary: { ...secondary, enabled: event.target.checked } })}
              className="accent-[#60A5FA]"
            />
          </label>
          <div className="h-2 overflow-hidden rounded-full bg-gradient-to-r from-red-500 via-yellow-400 via-green-500 via-cyan-400 via-blue-500 via-purple-500 to-red-500" />
          <div className="grid grid-cols-2 gap-3">
            {([
              ['Hue Center', 'hueCenter', 0, 360],
              ['Hue Width', 'hueWidth', 5, 180],
              ['Hue Shift', 'hueShift', -180, 180],
              ['Saturation', 'saturation', -100, 100],
              ['Luminance', 'luminance', -100, 100],
              ['Softness', 'softness', 0, 100],
            ] as const).map(([label, key, min, max]) => (
              <label key={key} className="block text-[9px] text-[#9BA1AD]">
                <span className="mb-1 flex justify-between gap-1">
                  <span>{label}</span>
                  <span className="font-mono-tabular text-[#E6E8EC]">{secondary[key]}</span>
                </span>
                <input
                  type="range"
                  aria-label={`HSL Secondary ${label}`}
                  min={min}
                  max={max}
                  step={1}
                  disabled={!secondary.enabled}
                  value={secondary[key]}
                  onChange={(event) => patchGrade({ hslSecondary: { ...secondary, [key]: Number(event.target.value) } })}
                  className="w-full studio-slider disabled:opacity-40"
                />
              </label>
            ))}
          </div>
          <p className="text-[9px] leading-snug text-[#7F8795]">Feathered hue selection changes only matching colors; tune hue width and softness to avoid hard edges</p>
        </div>
      </details>

      <details className="rounded border border-[#303744] bg-[#12151A]">
        <summary className="cursor-pointer select-none px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#D6D9E0]">
          Lumetri · Vignette
        </summary>
        <div className="grid grid-cols-2 gap-3 border-t border-[#272E39] p-2.5">
          {([
            ['Amount', 'vignetteAmount', -100, 100],
            ['Midpoint', 'vignetteMidpoint', 0, 100],
            ['Feather', 'vignetteFeather', 0, 100],
            ['Roundness', 'vignetteRoundness', -100, 100],
          ] as const).map(([label, key, min, max]) => (
            <label key={key} className="block text-[10px] text-[#9BA1AD]">
              <span className="mb-1 flex justify-between">
                <span>{label}</span>
                <span className="font-mono-tabular text-[#E6E8EC]">{grade[key] ?? 0}</span>
              </span>
              <input
                type="range"
                aria-label={`Lumetri Vignette ${label}`}
                min={min}
                max={max}
                value={grade[key] ?? (key === 'vignetteMidpoint' ? 50 : key === 'vignetteFeather' ? 70 : 0)}
                onChange={(event) => patchGrade({ [key]: Number(event.target.value) })}
                className="w-full studio-slider"
              />
            </label>
          ))}
        </div>
      </details>

      {/* Primary / Log controls */}
      <div className="bg-[#14161A] border border-[#262B34] rounded p-2.5 space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8D95A5]">Primary &amp; Log Controls</div>
        <div className="grid grid-cols-2 gap-3">
          {([
            ['Exposure', 'exposureStops', -5, 5, 0.1],
            ['Pivot', 'pivot', 0.1, 0.9, 0.01],
            ['Hue', 'hue', -180, 180, 1],
            ['Vibrance', 'vibrance', -100, 100, 1],
            ['Color Boost', 'colorBoost', -100, 100, 1],
            ['Midtone Detail', 'midtoneDetail', -100, 100, 1],
          ] as const).map(([label, key, min, max, step]) => (
            <label key={key} className="block text-[10px] text-[#9BA1AD]">
              <span className="flex justify-between mb-1"><span>{label}</span><span className="font-mono-tabular text-[#E6E8EC]">{Number(grade[key] ?? (key === 'pivot' ? 0.5 : 0)).toFixed(key === 'exposureStops' || key === 'pivot' ? 2 : 0)}</span></span>
              <input type="range" aria-label={label} min={min} max={max} step={step}
                value={grade[key] ?? (key === 'pivot' ? 0.5 : 0)}
                onChange={(event) => patchGrade({ [key]: Number(event.target.value) })}
                className="w-full studio-slider" />
            </label>
          ))}
        </div>
      </div>

      {/* Primary Bars + Luma Curve Shadows/Highlights */}
      <div className="bg-[#14161A] border border-[#262B34] rounded p-2.5 space-y-2">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-[#9BA1AD]">Temp</span>
              <span className="font-mono-tabular text-[#60A5FA]">{grade.temp}</span>
            </div>
            <input
              type="range"
              aria-label="Color Temp"
              min={-100}
              max={100}
              value={grade.temp}
              onChange={(e) => patchGrade({ temp: Number(e.target.value) })}
              className="w-full studio-slider"
            />
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-[#9BA1AD]">Tint</span>
              <span className="font-mono-tabular text-[#A78BFA]">{grade.tint}</span>
            </div>
            <input
              type="range"
              aria-label="Color Tint"
              min={-100}
              max={100}
              value={grade.tint}
              onChange={(e) => patchGrade({ tint: Number(e.target.value) })}
              className="w-full studio-slider"
            />
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-[#9BA1AD]">Contrast</span>
              <span className="font-mono-tabular text-[#C8CDD6]">
                {grade.contrast}%
              </span>
            </div>
            <input
              type="range"
              aria-label="Color Contrast"
              min={50}
              max={180}
              value={grade.contrast}
              onChange={(e) => patchGrade({ contrast: Number(e.target.value) })}
              className="w-full studio-slider"
            />
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-[#9BA1AD]">Saturation</span>
              <span className="font-mono-tabular text-[#C8CDD6]">
                {grade.saturation}%
              </span>
            </div>
            <input
              type="range"
              aria-label="Color Saturation"
              min={0}
              max={200}
              value={grade.saturation}
              onChange={(e) =>
                patchGrade({ saturation: Number(e.target.value) })
              }
              className="w-full studio-slider"
            />
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-[#9BA1AD]">Shadows</span>
              <span className="font-mono-tabular text-[#60A5FA]">
                {grade.shadows ?? 0}
              </span>
            </div>
            <input
              type="range"
              aria-label="Color Shadows"
              min={-50}
              max={50}
              value={grade.shadows ?? 0}
              onChange={(e) => patchGrade({ shadows: Number(e.target.value) })}
              className="w-full studio-slider"
            />
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-[#9BA1AD]">Highlights</span>
              <span className="font-mono-tabular text-[#FBBF24]">
                {grade.highlights ?? 0}
              </span>
            </div>
            <input
              type="range"
              aria-label="Color Highlights"
              min={-50}
              max={50}
              value={grade.highlights ?? 0}
              onChange={(e) =>
                patchGrade({ highlights: Number(e.target.value) })
              }
              className="w-full studio-slider"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
