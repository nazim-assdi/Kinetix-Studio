export interface WebMVideoFrame {
  timestamp: number;
  keyFrame: boolean;
  data: Uint8Array;
}

function bytesFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function encodeSize(size: number): Uint8Array {
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid EBML element size.');
  for (let length = 1; length <= 8; length++) {
    const marker = 2 ** (7 * length);
    if (size < marker - 1) {
      let value = size + marker;
      const out = new Uint8Array(length);
      for (let i = length - 1; i >= 0; i--) {
        out[i] = value & 0xff;
        value = Math.floor(value / 256);
      }
      return out;
    }
  }
  throw new Error('EBML element is too large.');
}

function element(id: string, payload: Uint8Array): Uint8Array {
  return concatBytes([bytesFromHex(id), encodeSize(payload.length), payload]);
}

function uintElement(id: string, value: number): Uint8Array {
  let v = Math.max(0, Math.floor(value));
  const out: number[] = [];
  do {
    out.unshift(v & 0xff);
    v = Math.floor(v / 256);
  } while (v > 0);
  return element(id, new Uint8Array(out));
}

function floatElement(id: string, value: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, false);
  return element(id, new Uint8Array(buffer));
}

function stringElement(id: string, value: string): Uint8Array {
  return element(id, new TextEncoder().encode(value));
}

function masterElement(id: string, children: Uint8Array[]): Uint8Array {
  return element(id, concatBytes(children));
}

function signed16(value: number): Uint8Array {
  const clamped = Math.max(-32768, Math.min(32767, Math.round(value)));
  const encoded = clamped < 0 ? 0x10000 + clamped : clamped;
  return new Uint8Array([(encoded >> 8) & 0xff, encoded & 0xff]);
}

function makeSimpleBlock(frame: WebMVideoFrame, clusterTimeMs: number): Uint8Array {
  const timestampMs = Math.round(frame.timestamp / 1000);
  const relative = timestampMs - clusterTimeMs;
  const header = new Uint8Array([0x81, ...signed16(relative), frame.keyFrame ? 0x80 : 0x00]);
  return element('A3', concatBytes([header, frame.data]));
}

function makeCluster(frames: WebMVideoFrame[]): { bytes: Uint8Array; timeMs: number } {
  const timeMs = Math.max(0, Math.round((frames[0]?.timestamp ?? 0) / 1000));
  const clusterTimeMs = Math.round((frames[0]?.timestamp ?? 0) / 1000);
  const children = [uintElement('E7', clusterTimeMs)];
  for (const frame of frames) children.push(makeSimpleBlock(frame, clusterTimeMs));
  return { bytes: masterElement('1F43B675', children), timeMs };
}

function makeCues(clusters: { bytes: Uint8Array; timeMs: number; offset: number }[]): Uint8Array {
  const points = clusters.map((cluster) =>
    masterElement('BB', [
      uintElement('B3', cluster.timeMs),
      masterElement('B7', [
        uintElement('F7', 1),
        uintElement('F1', cluster.offset),
      ]),
    ])
  );
  return masterElement('1C53BB6B', points);
}

/**
 * Package already encoded VP8/VP9 frames into a seekable WebM file.
 * Timestamps are microseconds, as emitted by WebCodecs EncodedVideoChunk.
 */
export function muxWebMVideo(
  frames: WebMVideoFrame[],
  width: number,
  height: number,
  fps: number,
  codec: 'vp8' | 'vp9'
): Uint8Array {
  if (frames.length === 0) throw new Error('There are no encoded video frames to mux.');
  if (width < 1 || height < 1 || fps < 1) throw new Error('Invalid WebM video dimensions or frame rate.');

  const ebmlHeader = masterElement('1A45DFA3', [
    uintElement('4286', 1),
    uintElement('42F7', 1),
    uintElement('42F2', 4),
    uintElement('42F3', 8),
    stringElement('4282', 'webm'),
    uintElement('4287', 4),
    uintElement('4285', 2),
  ]);

  const durationMs = (frames[frames.length - 1].timestamp + Math.round(1_000_000 / fps)) / 1000;
  const info = masterElement('1549A966', [
    uintElement('2AD7B1', 1_000_000),
    floatElement('4489', durationMs),
    stringElement('4D80', 'Kinetix Studio'),
    stringElement('5741', 'Kinetix Studio WebCodecs Renderer'),
  ]);

  const video = masterElement('E0', [
    uintElement('B0', width),
    uintElement('BA', height),
  ]);
  const trackEntry = masterElement('AE', [
    uintElement('D7', 1),
    uintElement('73C5', 1),
    uintElement('83', 1),
    uintElement('9C', 0),
    uintElement('23E383', Math.round(1_000_000_000 / fps)),
    stringElement('86', codec === 'vp9' ? 'V_VP9' : 'V_VP8'),
    video,
  ]);
  const tracks = masterElement('1654AE6B', [trackEntry]);

  const grouped: WebMVideoFrame[][] = [];
  let group: WebMVideoFrame[] = [];
  let clusterStart = 0;
  for (const frame of frames) {
    const timeMs = Math.round(frame.timestamp / 1000);
    if (group.length > 0 && timeMs - clusterStart > 25_000) {
      grouped.push(group);
      group = [];
    }
    if (group.length === 0) clusterStart = timeMs;
    group.push(frame);
  }
  if (group.length) grouped.push(group);

  const clusterParts = grouped.map((items) => makeCluster(items));
  const segmentPrefix = concatBytes([info, tracks]);
  let offset = segmentPrefix.length;
  const clusterEntries = clusterParts.map((cluster) => {
    const entry = { ...cluster, offset };
    offset += cluster.bytes.length;
    return entry;
  });
  const cues = makeCues(clusterEntries);
  const segmentPayload = concatBytes([
    segmentPrefix,
    ...clusterEntries.map((entry) => entry.bytes),
    cues,
  ]);
  // Unknown Segment size allows the muxer to write all frames without a second pass.
  const unknownSegmentSize = new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  return concatBytes([ebmlHeader, bytesFromHex('18538067'), unknownSegmentSize, segmentPayload]);
}
