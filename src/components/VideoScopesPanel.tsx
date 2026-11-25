import React, { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { computeVideoScopes, VideoScopesData } from '../engine/scopes';

export type ScopeMode = 'waveform' | 'parade' | 'vectorscope' | 'histogram';

interface VideoScopesPanelProps {
  playheadTime: number;
  gradeSignature: string;
  scopeRefreshKey?: string;
}

export const VideoScopesPanel: React.FC<VideoScopesPanelProps> = ({
  playheadTime,
  gradeSignature,
  scopeRefreshKey = '',
}) => {
  const [mode, setMode] = useState<ScopeMode>('waveform');
  const [stats, setStats] = useState<{ avg: number; peak: number }>({
    avg: 0,
    peak: 0,
  });
  const scopeCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      if (cancelled) return;
      const scopeCanvas = scopeCanvasRef.current;
      if (!scopeCanvas) return;
      const ctx = scopeCanvas.getContext('2d');
      if (!ctx) return;

      const programCanvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="composition-canvas"]'
      );
      let scopes: VideoScopesData | null = null;

      if (programCanvas && programCanvas.width > 0 && programCanvas.height > 0) {
        try {
          const sampleCanvas = document.createElement('canvas');
          sampleCanvas.width = 160;
          sampleCanvas.height = 90;
          const sctx = sampleCanvas.getContext('2d');
          if (sctx) {
            sctx.drawImage(programCanvas, 0, 0, 160, 90);
            const img = sctx.getImageData(0, 0, 160, 90);
            scopes = computeVideoScopes(img.data, 160, 90);
          }
        } catch {
          scopes = null;
        }
      }

      const w = scopeCanvas.width;
      const h = scopeCanvas.height;
      ctx.fillStyle = '#0D0E11';
      ctx.fillRect(0, 0, w, h);

      // Subtle IRE graticule lines
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = (h / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (!scopes) return;
      setStats({ avg: scopes.avgLuma, peak: scopes.peakLuma });

      if (mode === 'waveform') {
        const cols = scopes.waveform.length;
        const rows = scopes.waveform[0].length;
        const cw = w / cols;
        const rh = h / rows;
        for (let x = 0; x < cols; x++) {
          for (let y = 0; y < rows; y++) {
            const val = scopes.waveform[x][y];
            if (val <= 0.02) continue;
            ctx.fillStyle = `rgba(96, 165, 250, ${Math.min(1, 0.18 + val * 0.82)})`;
            ctx.fillRect(x * cw, h - (y + 1) * rh, Math.max(1.5, cw - 0.5), Math.max(1.5, rh));
          }
        }
      } else if (mode === 'parade') {
        const drawChannel = (
          grid: number[][],
          offsetX: number,
          chanW: number,
          color: string
        ) => {
          const cols = grid.length;
          const rows = grid[0].length;
          const cw = chanW / cols;
          const rh = h / rows;
          for (let x = 0; x < cols; x++) {
            for (let y = 0; y < rows; y++) {
              const val = grid[x][y];
              if (val <= 0.02) continue;
              ctx.fillStyle = color.replace('ALPHA', String(Math.min(1, 0.22 + val * 0.78)));
              ctx.fillRect(offsetX + x * cw, h - (y + 1) * rh, Math.max(1.5, cw), Math.max(1.5, rh));
            }
          }
        };
        const third = w / 3;
        drawChannel(scopes.parade.r, 0, third - 2, 'rgba(239, 68, 68, ALPHA)');
        drawChannel(scopes.parade.g, third, third - 2, 'rgba(34, 197, 94, ALPHA)');
        drawChannel(scopes.parade.b, third * 2, third - 2, 'rgba(59, 130, 246, ALPHA)');
      } else if (mode === 'histogram') {
        const bins = scopes.histogram.luma.length;
        const bw = w / bins;
        const drawCurve = (vals: number[], stroke: string, fill: string) => {
          ctx.beginPath();
          ctx.moveTo(0, h);
          vals.forEach((v, i) => {
            ctx.lineTo(i * bw + bw / 2, h - v * (h - 8));
          });
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1.3;
          ctx.stroke();
        };
        drawCurve(scopes.histogram.r, 'rgba(239,68,68,0.85)', 'rgba(239,68,68,0.16)');
        drawCurve(scopes.histogram.g, 'rgba(34,197,94,0.85)', 'rgba(34,197,94,0.16)');
        drawCurve(scopes.histogram.b, 'rgba(59,130,246,0.85)', 'rgba(59,130,246,0.16)');
        drawCurve(scopes.histogram.luma, 'rgba(230,232,236,0.9)', 'rgba(255,255,255,0.08)');
      } else {
        // Vectorscope
        const cx = w / 2;
        const cy = h / 2;
        const rad = Math.min(w, h) * 0.43;
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.stroke();
        // Skin tone indicator line (~123 deg)
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - rad * 0.55, cy - rad * 0.82);
        ctx.stroke();

        for (const pt of scopes.vectorscope) {
          const px = cx + pt.u * rad * 1.9;
          const py = cy - pt.v * rad * 1.9;
          ctx.fillStyle = `rgba(${pt.r}, ${pt.g}, ${pt.b}, 0.72)`;
          ctx.fillRect(px - 1, py - 1, 2.2, 2.2);
        }
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [mode, playheadTime, gradeSignature, scopeRefreshKey]);

  return (
    <div
      data-testid="video-scopes-panel"
      className="bg-[#14161A] border border-[#262B34] rounded p-2 space-y-2"
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#3B82F6]" />
          <span className="text-[11px] font-semibold text-[#E6E8EC]">
            Video Scopes
          </span>
        </div>
        <span className="font-mono-tabular text-[10px] text-[#8D95A5]">
          Avg {stats.avg}% · Peak {stats.peak}%
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1 bg-[#111215] p-0.5 rounded border border-[#262B34]">
        {(
          [
            ['waveform', 'Waveform'],
            ['parade', 'Parade'],
            ['vectorscope', 'Vector'],
            ['histogram', 'Hist'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`py-1 rounded text-[10px] font-medium transition-colors ${
              mode === id
                ? 'bg-[#282D37] text-white'
                : 'text-[#8D95A5] hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <canvas
        ref={scopeCanvasRef}
        width={280}
        height={136}
        data-testid="scopes-canvas"
        className="w-full h-[136px] rounded border border-[#22262F] bg-[#0D0E11] block"
      />
    </div>
  );
};
