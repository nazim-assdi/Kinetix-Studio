import { TimelineClip } from '../types/editor';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function snapToFrame(seconds: number, fps: number): number {
  if (fps <= 0) return seconds;
  return Math.round(seconds * fps) / fps;
}

/**
 * Formats seconds into SMPTE non-drop timecode HH:MM:SS:FF
 */
export function formatTimecode(seconds: number, fps: number = 30): string {
  const safeSeconds = Math.max(0, seconds);
  const totalFrames = Math.round(safeSeconds * fps);
  const frames = totalFrames % fps;
  const totalWholeSeconds = Math.floor(totalFrames / fps);
  const secs = totalWholeSeconds % 60;
  const totalMinutes = Math.floor(totalWholeSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
}

/**
 * Formats compact ruler labels e.g. 0:00, 0:05, 0:12
 */
export function formatRulerTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

/**
 * Finds nearest snap target (playhead, 0, or other clip edges) within thresholdSeconds.
 */
export function findSnapTime(
  candidateTime: number,
  clips: TimelineClip[],
  excludeClipId: string,
  playheadTime: number,
  thresholdSeconds: number,
  clipDurationForEndSnap?: number
): number {
  const targets: number[] = [0, playheadTime];
  for (const clip of clips) {
    if (clip.id === excludeClipId) continue;
    targets.push(clip.start, clip.start + clip.duration);
  }

  let bestTime = candidateTime;
  let bestDist = thresholdSeconds;

  // Check start edge snapping
  for (const target of targets) {
    const dist = Math.abs(candidateTime - target);
    if (dist < bestDist) {
      bestDist = dist;
      bestTime = target;
    }
  }

  // Check end edge snapping if clip duration provided
  if (clipDurationForEndSnap !== undefined && clipDurationForEndSnap > 0) {
    const endCandidate = candidateTime + clipDurationForEndSnap;
    for (const target of targets) {
      const dist = Math.abs(endCandidate - target);
      if (dist < bestDist) {
        bestDist = dist;
        bestTime = Math.max(0, target - clipDurationForEndSnap);
      }
    }
  }

  return Math.max(0, bestTime);
}
