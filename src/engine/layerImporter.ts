import { PathPoint, ProjectAsset } from '../types/editor';

export interface ParsedLayerBatch {
  groupName: string;
  assets: ProjectAsset[];
}

function parseColor(val: string | null | undefined, fallback = '#3B82F6'): string {
  if (!val || val === 'none' || val === 'transparent') return fallback;
  return val;
}

function parseSvgPathData(d: string, offsetX = 0, offsetY = 0): PathPoint[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)/g);
  if (!tokens) return [];
  const points: PathPoint[] = [];
  let cx = 0;
  let cy = 0;
  let i = 0;
  let cmd = 'M';

  const readNum = () => {
    const n = Number(tokens[i++]);
    return Number.isFinite(n) ? n : 0;
  };

  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) {
      cmd = tokens[i++];
      if (cmd === 'Z' || cmd === 'z') continue;
    }
    if (cmd === 'M' || cmd === 'L') {
      cx = readNum();
      cy = readNum();
      points.push({ x: Math.round(cx - offsetX), y: Math.round(cy - offsetY) });
      cmd = cmd === 'M' ? 'L' : cmd;
    } else if (cmd === 'm' || cmd === 'l') {
      cx += readNum();
      cy += readNum();
      points.push({ x: Math.round(cx - offsetX), y: Math.round(cy - offsetY) });
      cmd = cmd === 'm' ? 'l' : cmd;
    } else if (cmd === 'H') {
      cx = readNum();
      points.push({ x: Math.round(cx - offsetX), y: Math.round(cy - offsetY) });
    } else if (cmd === 'h') {
      cx += readNum();
      points.push({ x: Math.round(cx - offsetX), y: Math.round(cy - offsetY) });
    } else if (cmd === 'V') {
      cy = readNum();
      points.push({ x: Math.round(cx - offsetX), y: Math.round(cy - offsetY) });
    } else if (cmd === 'v') {
      cy += readNum();
      points.push({ x: Math.round(cx - offsetX), y: Math.round(cy - offsetY) });
    } else if (cmd === 'C') {
      const h1x = readNum();
      const h1y = readNum();
      const h2x = readNum();
      const h2y = readNum();
      cx = readNum();
      cy = readNum();
      points.push({
        x: Math.round(cx - offsetX),
        y: Math.round(cy - offsetY),
        handleInX: Math.round(h2x - offsetX),
        handleInY: Math.round(h2y - offsetY),
        handleOutX: Math.round(h1x - offsetX),
        handleOutY: Math.round(h1y - offsetY),
      });
    } else if (cmd === 'c') {
      readNum();
      readNum();
      readNum();
      readNum();
      cx += readNum();
      cy += readNum();
      points.push({ x: Math.round(cx - offsetX), y: Math.round(cy - offsetY) });
    } else if (cmd === 'Q') {
      readNum();
      readNum();
      cx = readNum();
      cy = readNum();
      points.push({ x: Math.round(cx - offsetX), y: Math.round(cy - offsetY) });
    } else if (cmd === 'q') {
      readNum();
      readNum();
      cx += readNum();
      cy += readNum();
      points.push({ x: Math.round(cx - offsetX), y: Math.round(cy - offsetY) });
    } else {
      i++;
    }
  }
  return points;
}

/**
 * Parses an SVG string layer-by-layer (shapes, paths, text elements) into editable ProjectAssets.
 */
export function parseSvgLayersFromText(
  svgText: string,
  fileName: string
): ProjectAsset[] {
  const assets: ProjectAsset[] = [];
  const baseId = `svg_${Date.now()}`;

  // Fallback-safe lightweight XML/SVG regex + DOMParser
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    const viewBox = svgEl?.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
    const vbW = viewBox && viewBox.length === 4 ? viewBox[2] : Number(svgEl?.getAttribute('width') || 1280);
    const vbH = viewBox && viewBox.length === 4 ? viewBox[3] : Number(svgEl?.getAttribute('height') || 720);
    const cx = (Number.isFinite(vbW) ? vbW : 1280) / 2;
    const cy = (Number.isFinite(vbH) ? vbH : 720) / 2;

    const elements = doc.querySelectorAll('rect, circle, ellipse, path, polygon, text');
    elements.forEach((el, idx) => {
      const tag = el.tagName.toLowerCase();
      const layerLabel = el.getAttribute('id') || `${fileName} · ${tag} ${idx + 1}`;
      const fill = el.getAttribute('fill');
      const stroke = el.getAttribute('stroke');
      const strokeWidth = Number(el.getAttribute('stroke-width') || 2);

      if (tag === 'rect') {
        const w = Number(el.getAttribute('width') || 200);
        const h = Number(el.getAttribute('height') || 120);
        const rx = Number(el.getAttribute('rx') || 0);
        assets.push({
          id: `${baseId}_rect_${idx}`,
          name: layerLabel,
          kind: 'shape',
          duration: 5,
          defaultShape: {
            shapeType: 'rect',
            width: Math.max(12, Math.round(w)),
            height: Math.max(12, Math.round(h)),
            fillColor: fill === 'none' ? 'transparent' : parseColor(fill, '#3B82F6'),
            strokeColor: parseColor(stroke, '#E6E8EC'),
            strokeWidth: Number.isFinite(strokeWidth) ? strokeWidth : 2,
            cornerRadius: Number.isFinite(rx) ? rx : 0,
          },
        });
      } else if (tag === 'circle' || tag === 'ellipse') {
        const r = Number(el.getAttribute('r') || el.getAttribute('rx') || 80);
        const ry = Number(el.getAttribute('ry') || r);
        assets.push({
          id: `${baseId}_circ_${idx}`,
          name: layerLabel,
          kind: 'shape',
          duration: 5,
          defaultShape: {
            shapeType: fill === 'none' ? 'ring' : 'circle',
            width: Math.max(16, Math.round(r * 2)),
            height: Math.max(16, Math.round(ry * 2)),
            fillColor: fill === 'none' ? 'transparent' : parseColor(fill, '#8B5CF6'),
            strokeColor: parseColor(stroke, '#60A5FA'),
            strokeWidth: Number.isFinite(strokeWidth) ? strokeWidth : 3,
            cornerRadius: 0,
          },
        });
      } else if (tag === 'path') {
        const d = el.getAttribute('d') || '';
        const pts = parseSvgPathData(d, cx, cy);
        if (pts.length >= 2) {
          assets.push({
            id: `${baseId}_path_${idx}`,
            name: layerLabel,
            kind: 'path',
            duration: 5,
            defaultPath: {
              points: pts,
              closed: /[Zz]\s*$/.test(d.trim()),
              strokeColor: parseColor(stroke, parseColor(fill, '#3B82F6')),
              strokeWidth: Math.max(1, Number.isFinite(strokeWidth) ? strokeWidth : 3),
              fillColor: fill && fill !== 'none' ? fill : 'transparent',
              trimStart: 0,
              trimEnd: 100,
              dashed: false,
            },
          });
        }
      } else if (tag === 'polygon') {
        const rawPts = (el.getAttribute('points') || '')
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        const pts: PathPoint[] = [];
        for (let p = 0; p + 1 < rawPts.length; p += 2) {
          pts.push({
            x: Math.round(rawPts[p] - cx),
            y: Math.round(rawPts[p + 1] - cy),
          });
        }
        if (pts.length >= 3) {
          assets.push({
            id: `${baseId}_poly_${idx}`,
            name: layerLabel,
            kind: 'path',
            duration: 5,
            defaultPath: {
              points: pts,
              closed: true,
              strokeColor: parseColor(stroke, '#60A5FA'),
              strokeWidth: 2,
              fillColor: fill === 'none' ? 'transparent' : parseColor(fill, '#3B82F6'),
              trimStart: 0,
              trimEnd: 100,
              dashed: false,
            },
          });
        }
      } else if (tag === 'text') {
        const txt = (el.textContent || '').trim();
        if (txt) {
          const fs = Number(el.getAttribute('font-size') || 42);
          assets.push({
            id: `${baseId}_txt_${idx}`,
            name: layerLabel,
            kind: 'text',
            duration: 5,
            defaultText: {
              text: txt,
              fontSize: Math.max(14, Math.min(120, Number.isFinite(fs) ? fs : 42)),
              color: parseColor(fill, '#F8FAFC'),
              fontWeight: 700,
              letterSpacing: 2,
              align: 'center',
            },
          });
        }
      }
    });
  }

  return assets;
}

/**
 * Decodes PackBits RLE channel bytes inside a PSD Layer Record.
 */
function decodePackBits(
  view: DataView,
  offset: number,
  height: number,
  expectedRowBytes: number
): Uint8Array {
  const rowCounts: number[] = [];
  let ptr = offset;
  for (let r = 0; r < height; r++) {
    rowCounts.push(view.getUint16(ptr, false));
    ptr += 2;
  }
  const out = new Uint8Array(height * expectedRowBytes);
  let outPos = 0;
  for (let r = 0; r < height; r++) {
    const rowEnd = ptr + rowCounts[r];
    let written = 0;
    while (ptr < rowEnd && written < expectedRowBytes) {
      const header = view.getInt8(ptr++);
      if (header >= 0) {
        const count = header + 1;
        for (let k = 0; k < count && ptr < rowEnd && written < expectedRowBytes; k++) {
          out[outPos + written++] = view.getUint8(ptr++);
        }
      } else if (header > -128) {
        const count = 1 - header;
        const val = view.getUint8(ptr++);
        for (let k = 0; k < count && written < expectedRowBytes; k++) {
          out[outPos + written++] = val;
        }
      }
    }
    outPos += expectedRowBytes;
    ptr = rowEnd;
  }
  return out;
}

/**
 * Binary Adobe Photoshop (.psd) Layer-by-Layer Parser.
 * Extracts PSD layer records, bounding boxes, layer names, and raw/RLE pixel channels into PNG data URLs.
 */
export function parsePsdLayersFromBuffer(
  buffer: ArrayBuffer,
  fileName: string
): ProjectAsset[] {
  const view = new DataView(buffer);
  const assets: ProjectAsset[] = [];
  if (buffer.byteLength < 34) return assets;

  // Verify 8BPS signature
  const sig =
    String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
  if (sig !== '8BPS') return assets;

  const docHeight = view.getUint32(14, false);
  const docWidth = view.getUint32(18, false);
  const depth = view.getUint16(22, false);

  let pos = 26;
  // Color Mode Data
  const colorModeLen = view.getUint32(pos, false);
  pos += 4 + colorModeLen;
  if (pos + 4 > buffer.byteLength) return assets;

  // Image Resources
  const imgResLen = view.getUint32(pos, false);
  pos += 4 + imgResLen;
  if (pos + 8 > buffer.byteLength) return assets;

  // Layer and Mask Info
  const layerMaskLen = view.getUint32(pos, false);
  pos += 4;
  if (layerMaskLen === 0 || pos + 6 > buffer.byteLength) return assets;

  const layerInfoLen = view.getUint32(pos, false);
  pos += 4;
  if (layerInfoLen === 0 || pos + 2 > buffer.byteLength) return assets;

  const rawCount = view.getInt16(pos, false);
  const layerCount = Math.abs(rawCount);
  pos += 2;

  interface PsdLayerMeta {
    name: string;
    top: number;
    left: number;
    bottom: number;
    right: number;
    opacity: number;
    channels: { id: number; dataLen: number }[];
  }

  const metas: PsdLayerMeta[] = [];
  for (let i = 0; i < layerCount && pos + 18 <= buffer.byteLength; i++) {
    const top = view.getInt32(pos, false);
    const left = view.getInt32(pos + 4, false);
    const bottom = view.getInt32(pos + 8, false);
    const right = view.getInt32(pos + 12, false);
    const numChannels = view.getUint16(pos + 16, false);
    pos += 18;

    const channels: { id: number; dataLen: number }[] = [];
    for (let c = 0; c < numChannels && pos + 6 <= buffer.byteLength; c++) {
      const chId = view.getInt16(pos, false);
      const dataLen = view.getUint32(pos + 2, false);
      channels.push({ id: chId, dataLen });
      pos += 6;
    }

    // 4 signature ('8BIM') + 4 blend + 1 opacity + 1 clipping + 1 flags + 1 filler = 12 bytes
    const opacity = pos + 8 < buffer.byteLength ? view.getUint8(pos + 8) : 255;
    pos += 12;

    const extraLen = pos + 4 <= buffer.byteLength ? view.getUint32(pos, false) : 0;
    pos += 4;
    const extraEnd = Math.min(buffer.byteLength, pos + extraLen);

    let layerName = `PSD Layer ${i + 1}`;
    if (pos + 8 <= extraEnd) {
      const maskDataLen = view.getUint32(pos, false);
      pos += 4 + maskDataLen;
    }
    if (pos + 4 <= extraEnd) {
      const blendRangeLen = view.getUint32(pos, false);
      pos += 4 + blendRangeLen;
    }
    if (pos < extraEnd) {
      const nameLen = view.getUint8(pos);
      if (nameLen > 0 && pos + 1 + nameLen <= extraEnd) {
        let decoded = '';
        for (let k = 0; k < nameLen; k++) {
          decoded += String.fromCharCode(view.getUint8(pos + 1 + k));
        }
        if (decoded.trim()) layerName = decoded.trim();
      }
    }

    pos = extraEnd;
    metas.push({ name: layerName, top, left, bottom, right, opacity, channels });
  }

  // Decode Channel Pixel Data for each layer if 8-bit and DOM canvas exists
  const baseId = `psd_${Date.now()}`;
  metas.forEach((meta, idx) => {
    const w = Math.max(0, meta.right - meta.left);
    const h = Math.max(0, meta.bottom - meta.top);
    let dataUrl: string | undefined;

    if (
      depth === 8 &&
      w > 0 &&
      h > 0 &&
      w <= 4096 &&
      h <= 4096 &&
      typeof document !== 'undefined'
    ) {
      const channelPlanes: Record<number, Uint8Array> = {};
      for (const ch of meta.channels) {
        if (pos + 2 > buffer.byteLength) break;
        const compression = view.getUint16(pos, false);
        const chDataStart = pos + 2;
        if (compression === 0 && chDataStart + w * h <= buffer.byteLength) {
          channelPlanes[ch.id] = new Uint8Array(buffer, chDataStart, w * h);
        } else if (compression === 1 && chDataStart + h * 2 <= buffer.byteLength) {
          try {
            channelPlanes[ch.id] = decodePackBits(view, chDataStart, h, w);
          } catch {
            // Skip malformed RLE
          }
        }
        pos += ch.dataLen;
      }

      if (channelPlanes[0] && channelPlanes[1] && channelPlanes[2]) {
        const canvas = document.createElement('canvas');
        canvas.width = docWidth || w;
        canvas.height = docHeight || h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const img = ctx.createImageData(w, h);
          const rArr = channelPlanes[0];
          const gArr = channelPlanes[1];
          const bArr = channelPlanes[2];
          const aArr = channelPlanes[-1];
          for (let p = 0; p < w * h; p++) {
            img.data[p * 4] = rArr[p];
            img.data[p * 4 + 1] = gArr[p];
            img.data[p * 4 + 2] = bArr[p];
            img.data[p * 4 + 3] = aArr
              ? Math.round((aArr[p] * meta.opacity) / 255)
              : meta.opacity;
          }
          ctx.putImageData(img, Math.max(0, meta.left), Math.max(0, meta.top));
          dataUrl = canvas.toDataURL('image/png');
        }
      }
    } else {
      for (const ch of meta.channels) {
        pos += ch.dataLen;
      }
    }

    if (dataUrl) {
      assets.push({
        id: `${baseId}_lyr_${idx}`,
        name: `${meta.name} (${fileName})`,
        kind: 'image',
        src: dataUrl,
        thumbnail: dataUrl,
        duration: 5,
        width: docWidth,
        height: docHeight,
      });
    } else if (w > 0 && h > 0) {
      assets.push({
        id: `${baseId}_solid_${idx}`,
        name: `${meta.name} (${fileName})`,
        kind: 'shape',
        duration: 5,
        defaultShape: {
          shapeType: 'rect',
          width: Math.min(800, Math.max(40, w)),
          height: Math.min(500, Math.max(40, h)),
          fillColor: ['#3B82F6', '#8B5CF6', '#14B8A6', '#F59E0B'][idx % 4],
          strokeColor: '#E6E8EC',
          strokeWidth: 2,
          cornerRadius: 6,
        },
      });
    }
  });

  return assets;
}

/**
 * Parses Adobe Illustrator (.ai) files by extracting embedded SVG layers or PDF/PostScript vector paths.
 */
export function parseIllustratorLayersFromText(
  rawText: string,
  fileName: string
): ProjectAsset[] {
  // Check for embedded SVG XML stream inside modern .ai files
  const svgMatch = rawText.match(/<svg[\s\S]*?<\/svg>/i);
  if (svgMatch) {
    const svgAssets = parseSvgLayersFromText(svgMatch[0], fileName);
    if (svgAssets.length > 0) return svgAssets;
  }

  // Fallback: extract PostScript / PDF path blocks (m / l / c / re operators)
  const assets: ProjectAsset[] = [];
  const lines = rawText.split(/\r?\n/);
  let currentPts: PathPoint[] = [];
  let idx = 0;

  const flushPath = (closed: boolean) => {
    if (currentPts.length >= 2) {
      assets.push({
        id: `ai_${Date.now()}_${idx++}`,
        name: `${fileName} · Vector Layer ${idx}`,
        kind: 'path',
        duration: 5,
        defaultPath: {
          points: currentPts,
          closed,
          strokeColor: '#3B82F6',
          strokeWidth: 3,
          fillColor: closed ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
          trimStart: 0,
          trimEnd: 100,
          dashed: false,
        },
      });
    }
    currentPts = [];
  };

  for (const line of lines) {
    const mMatch = line.match(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+[ml]\b/);
    if (mMatch) {
      currentPts.push({
        x: Math.round(Number(mMatch[1]) - 300),
        y: Math.round(300 - Number(mMatch[2])),
      });
    } else if (/\b[FfSsBb]\b/.test(line) && currentPts.length >= 2) {
      flushPath(/\b[fFbB]\b/.test(line));
      if (assets.length >= 24) break;
    }
  }
  flushPath(false);

  if (assets.length === 0) {
    // Provide editable base vector shape for Illustrator document container
    assets.push({
      id: `ai_${Date.now()}_artboard`,
      name: `${fileName} · Artboard Layer`,
      kind: 'shape',
      duration: 5,
      defaultShape: {
        shapeType: 'polygon',
        width: 240,
        height: 240,
        fillColor: 'rgba(245, 158, 11, 0.22)',
        strokeColor: '#F59E0B',
        strokeWidth: 3,
        cornerRadius: 0,
        sides: 6,
      },
    });
  }

  return assets;
}
