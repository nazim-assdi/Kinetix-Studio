import { CaptionCue } from '../types/editor';

const TIMESTAMP_LINE =
  /^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})(?:\s+.*)?$/;

function timestampToSeconds(
  hours: string,
  minutes: string,
  seconds: string,
  milliseconds: string
): number | null {
  const h = Number(hours);
  const m = Number(minutes);
  const s = Number(seconds);
  if (!Number.isFinite(h) || m > 59 || s > 59) return null;
  const ms = Number(milliseconds.padEnd(3, '0').slice(0, 3));
  return h * 3600 + m * 60 + s + ms / 1000;
}

function cleanSubtitleText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .trim();
}

/**
 * Parses SubRip subtitle text into clip-local caption cues.
 * Supports numbered or unnumbered blocks, CRLF/LF, comma or dot milliseconds,
 * cue settings, multi-line dialogue, and common inline HTML formatting tags.
 * Invalid blocks are skipped so one malformed cue does not discard the file.
 */
export function parseSrtSubtitles(source: string): CaptionCue[] {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues: CaptionCue[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    while (cursor < lines.length && !lines[cursor].trim()) cursor++;
    if (cursor >= lines.length) break;

    if (/^\d+$/.test(lines[cursor].trim())) cursor++;
    const timing = lines[cursor]?.trim().match(TIMESTAMP_LINE);
    if (!timing) {
      while (cursor < lines.length && lines[cursor].trim()) cursor++;
      continue;
    }

    const start = timestampToSeconds(timing[1], timing[2], timing[3], timing[4]);
    const end = timestampToSeconds(timing[5], timing[6], timing[7], timing[8]);
    cursor++;

    const textLines: string[] = [];
    while (cursor < lines.length && lines[cursor].trim()) {
      textLines.push(lines[cursor].trimEnd());
      cursor++;
    }

    const text = cleanSubtitleText(textLines.join('\n'));
    if (start === null || end === null || end <= start || !text) continue;

    cues.push({
      id: `srt_cue_${cues.length + 1}`,
      start,
      end,
      text,
    });
  }

  return cues;
}
