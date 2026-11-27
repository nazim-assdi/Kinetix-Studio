import {
  MotionPresetItem,
  TimelineClip,
  TimelineTransition,
  TimelineTransitionDirection,
} from '../types/editor';

const NON_TRANSITIONABLE_KINDS = new Set(['audio', 'camera', 'light', 'null', 'adjustment']);

export interface TimelineTransitionPair {
  outgoing: TimelineClip;
  incoming: TimelineClip;
}

/** A safe, predictable default for one-click edit-point transitions. */
export const DEFAULT_TIMELINE_TRANSITION: MotionPresetItem = {
  id: 'default-cross-dissolve',
  name: 'Cross Dissolve',
  vendor: 'FX',
  category: 'Transition',
  description: 'A clean, centered dissolve between two adjacent visual clips.',
  accentColor: '#A78BFA',
  motionVariant: {
    direction: 'left',
    duration: 0.75,
    intensity: 1,
  },
};

/**
 * Resolve the nearest real edit point on a track. This powers forgiving
 * drag-and-drop: users can drop a transition near a cut instead of hitting a
 * tiny pixel-perfect handle.
 */
export function findNearestTransitionPair(
  clips: TimelineClip[],
  trackId: string,
  time: number,
  fps: number,
  maxDistance: number
): TimelineTransitionPair | null {
  let nearest: TimelineTransitionPair | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const tolerance = Math.max(0, maxDistance);

  for (const incoming of clips) {
    if (incoming.trackId !== trackId || !isTransitionableClip(incoming)) continue;
    const outgoing = findAdjacentOutgoingClip(clips, incoming, fps);
    if (!outgoing) continue;

    const distance = Math.abs(incoming.start - time);
    if (distance <= tolerance && distance < nearestDistance) {
      nearest = { outgoing, incoming };
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function isTransitionableClip(clip: TimelineClip): boolean {
  return !NON_TRANSITIONABLE_KINDS.has(clip.kind);
}

/** Locate the clip that ends at the incoming clip's edit point on the same track. */
export function findAdjacentOutgoingClip(
  clips: TimelineClip[],
  incoming: TimelineClip,
  fps: number
): TimelineClip | null {
  if (!isTransitionableClip(incoming)) return null;
  const tolerance = 1.5 / Math.max(1, fps);
  return clips
    .filter((clip) =>
      clip.id !== incoming.id &&
      clip.trackId === incoming.trackId &&
      isTransitionableClip(clip) &&
      Math.abs(clip.start + clip.duration - incoming.start) <= tolerance
    )
    .sort((a, b) =>
      Math.abs(a.start + a.duration - incoming.start) -
      Math.abs(b.start + b.duration - incoming.start)
    )[0] ?? null;
}

/** Locate the next clip that starts at the outgoing clip's edit point. */
export function findAdjacentIncomingClip(
  clips: TimelineClip[],
  outgoing: TimelineClip,
  fps: number
): TimelineClip | null {
  if (!isTransitionableClip(outgoing)) return null;
  const tolerance = 1.5 / Math.max(1, fps);
  return clips
    .filter((clip) =>
      clip.id !== outgoing.id &&
      clip.trackId === outgoing.trackId &&
      isTransitionableClip(clip) &&
      Math.abs(clip.start - (outgoing.start + outgoing.duration)) <= tolerance
    )
    .sort((a, b) =>
      Math.abs(a.start - (outgoing.start + outgoing.duration)) -
      Math.abs(b.start - (outgoing.start + outgoing.duration))
    )[0] ?? null;
}

/** Resolve a cut for either side of the edit point, preferring the selected clip's in-point. */
export function resolveTransitionPairForClip(
  clips: TimelineClip[],
  anchor: TimelineClip,
  fps: number
): TimelineTransitionPair | null {
  const outgoing = findAdjacentOutgoingClip(clips, anchor, fps);
  if (outgoing) return { outgoing, incoming: anchor };
  const incoming = findAdjacentIncomingClip(clips, anchor, fps);
  return incoming ? { outgoing: anchor, incoming } : null;
}

export function createTimelineTransition(
  item: MotionPresetItem,
  fps: number
): TimelineTransition {
  const identity = `${item.id} ${item.name} ${item.basePresetId ?? ''}`.toLowerCase();
  const style: TimelineTransition['style'] = identity.includes('zoom') || identity.includes('punch')
    ? 'zoom'
    : identity.includes('whip') || identity.includes('spin') || identity.includes('slam')
      ? 'push'
      : identity.includes('glitch') || identity.includes('sweep')
        ? 'wipe'
        : identity.includes('light') || identity.includes('flash') || identity.includes('burn')
          ? 'dip-white'
          : identity.includes('impact')
            ? 'dip-black'
            : 'cross-dissolve';
  const rawDirection = item.motionVariant?.direction ?? 'left';
  const direction: TimelineTransitionDirection = rawDirection === 'up' || rawDirection === 'down'
    ? rawDirection
    : rawDirection === 'right' || rawDirection === 'top-right' || rawDirection === 'bottom-right'
      ? 'right'
      : rawDirection === 'top-left' || rawDirection === 'bottom-left'
        ? 'left'
        : 'left';
  const minDuration = 2 / Math.max(1, fps);
  const requestedDuration = item.motionVariant?.duration ?? 0.75;
  const duration = Math.max(minDuration, Math.min(3.5, requestedDuration));
  const intensity = Math.max(0.5, Math.min(1.8, item.motionVariant?.intensity ?? 1));

  return {
    id: `transition_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    presetId: item.id,
    name: item.name,
    style,
    direction,
    duration,
    intensity,
  };
}

/** Progress from 0 (before the cut) to 1 (after the cut), centered on the edit point. */
export function getTransitionProgress(
  transition: TimelineTransition,
  cutTime: number,
  playheadTime: number
): number {
  const duration = Math.max(0.0001, transition.duration);
  const start = cutTime - duration / 2;
  const progress = (playheadTime - start) / duration;
  // Frame evaluation can produce tiny floating-point overshoots at either edge.
  return Math.max(0, Math.min(1, Number(progress.toFixed(6))));
}
