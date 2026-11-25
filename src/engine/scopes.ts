import { CaptionCue } from '../types/editor';

export interface VideoScopesData {
  /** 32 normalized bins (0..1) for R, G, B, Luma */
  histogram: {
    r: number[];
    g: number[];
    b: number[];
    luma: number[];
  };
  /** 48 columns x 24 vertical intensity buckets (0..1) */
  waveform: number[][];
  /** R, G, B each 16 columns x 24 vertical intensity buckets (0..1) */
  parade: {
    r: number[][];
    g: number[][];
    b: number[][];
  };
  /** Normalized Cb/Cr scatter samples (-0.5..0.5) with RGB tint for coloring */
  vectorscope: { u: number; v: number; r: number; g: number; b: number }[];
  avgLuma: number;
  peakLuma: number;
}

/**
 * Computes DaVinci Resolve-grade Waveform, RGB Parade, Histogram, and Vectorscope
 * from raw RGBA pixel buffer using strided sampling for smooth 30fps performance.
 */
export function computeVideoScopes(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): VideoScopesData {
  const histBins = 32;
  const rHist = new Array<number>(histBins).fill(0);
  const gHist = new Array<number>(histBins).fill(0);
  const bHist = new Array<number>(histBins).fill(0);
  const lHist = new Array<number>(histBins).fill(0);

  const wfCols = 48;
  const wfRows = 24;
  const waveform: number[][] = Array.from({ length: wfCols }, () =>
    new Array<number>(wfRows).fill(0)
  );

  const pCols = 16;
  const paradeR: number[][] = Array.from({ length: pCols }, () =>
    new Array<number>(wfRows).fill(0)
  );
  const paradeG: number[][] = Array.from({ length: pCols }, () =>
    new Array<number>(wfRows).fill(0)
  );
  const paradeB: number[][] = Array.from({ length: pCols }, () =>
    new Array<number>(wfRows).fill(0)
  );

  const vectorscope: { u: number; v: number; r: number; g: number; b: number }[] = [];

  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 36));
  let sampleCount = 0;
  let lumaSum = 0;
  let peakLuma = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumaSum += luma;
      if (luma > peakLuma) peakLuma = luma;
      sampleCount++;

      const rb = Math.min(histBins - 1, (r >> 3));
      const gb = Math.min(histBins - 1, (g >> 3));
      const bb = Math.min(histBins - 1, (b >> 3));
      const lb = Math.min(histBins - 1, Math.floor((luma / 255) * (histBins - 1)));
      rHist[rb]++;
      gHist[gb]++;
      bHist[bb]++;
      lHist[lb]++;

      const wfCol = Math.min(wfCols - 1, Math.floor((x / Math.max(1, width)) * wfCols));
      const wfRow = Math.min(wfRows - 1, Math.floor((luma / 255) * (wfRows - 1)));
      waveform[wfCol][wfRow]++;

      const pCol = Math.min(pCols - 1, Math.floor((x / Math.max(1, width)) * pCols));
      paradeR[pCol][Math.min(wfRows - 1, Math.floor((r / 255) * (wfRows - 1)))]++;
      paradeG[pCol][Math.min(wfRows - 1, Math.floor((g / 255) * (wfRows - 1)))]++;
      paradeB[pCol][Math.min(wfRows - 1, Math.floor((b / 255) * (wfRows - 1)))]++;

      if (vectorscope.length < 480) {
        // Rec.709 Pb / Pr normalized -0.5..0.5
        const rn = r / 255;
        const gn = g / 255;
        const bn = b / 255;
        const u = -0.1146 * rn - 0.3854 * gn + 0.5 * bn;
        const v = 0.5 * rn - 0.4542 * gn - 0.0458 * bn;
        vectorscope.push({ u, v, r, g, b });
      }
    }
  }

  const normalize1D = (arr: number[]) => {
    const mx = Math.max(1, ...arr);
    return arr.map((v) => v / mx);
  };

  const normalize2D = (grid: number[][]) => {
    let mx = 1;
    for (const col of grid) {
      for (const v of col) if (v > mx) mx = v;
    }
    return grid.map((col) => col.map((v) => Math.min(1, v / (mx * 0.6))));
  };

  return {
    histogram: {
      r: normalize1D(rHist),
      g: normalize1D(gHist),
      b: normalize1D(bHist),
      luma: normalize1D(lHist),
    },
    waveform: normalize2D(waveform),
    parade: {
      r: normalize2D(paradeR),
      g: normalize2D(paradeG),
      b: normalize2D(paradeB),
    },
    vectorscope,
    avgLuma: sampleCount > 0 ? Math.round((lumaSum / sampleCount / 255) * 100) : 0,
    peakLuma: Math.round((peakLuma / 255) * 100),
  };
}

function formatSrtTimestamp(sec: number): string {
  const s = Math.max(0, sec);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

export function generateSrtSubtitles(cues: CaptionCue[]): string {
  return [...cues]
    .sort((a, b) => a.start - b.start)
    .map(
      (c, i) =>
        `${i + 1}\n${formatSrtTimestamp(c.start)} --> ${formatSrtTimestamp(c.end)}\n${c.text}\n`
    )
    .join('\n');
}
