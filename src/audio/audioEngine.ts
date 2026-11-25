import { SynthPreset, TimelineClip, TimelineTrack } from '../types/editor';

export function dbToGain(db: number): number {
  if (db <= -36) return 0;
  return Math.pow(10, db / 20);
}

/**
 * Fairlight-grade Web Audio engine with per-track 3-Band EQ, Stereo Panning,
 * Dynamics Compressor, HTMLAudio sync, and Transition SFX synthesis.
 */
class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private pulseInterval: number | null = null;
  private audioElements = new Map<string, HTMLAudioElement>();
  private mediaSources = new Map<
    string,
    {
      source: MediaElementAudioSourceNode;
      low: BiquadFilterNode;
      mid: BiquadFilterNode;
      high: BiquadFilterNode;
      compressor: DynamicsCompressorNode;
      pan: StereoPannerNode;
      gain: GainNode;
    }
  >();
  private triggeredSfxClips = new Set<string>();

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public previewSfx(
    preset: Extract<
      SynthPreset,
      'sfx-whoosh' | 'sfx-glitch' | 'sfx-boom' | 'sfx-shimmer'
    >
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.triggerTransitionSfx(ctx, preset, 0.22);
  }

  public startPlayback(
    getPlayhead: () => number,
    getClips: () => TimelineClip[],
    getTracks: () => TimelineTrack[]
  ) {
    this.stopPlayback();
    this.isPlaying = true;
    this.triggeredSfxClips.clear();
    const ctx = this.ensureContext();

    let lastStepIndex = -1;

    this.pulseInterval = window.setInterval(() => {
      if (!this.isPlaying) return;
      const t = getPlayhead();
      const clips = getClips();
      const tracks = getTracks();

      const hasSolo = tracks.some((tr) => tr.solo);

      // Sync real audio & video embedded audio + Fairlight 3-Band EQ / Comp / Pan / dB gain
      for (const clip of clips) {
        if (clip.kind !== 'audio' && clip.kind !== 'video') continue;
        if (!clip.src) continue;

        const track = tracks.find((tr) => tr.id === clip.trackId);
        const active =
          track &&
          !track.muted &&
          (!hasSolo || track.solo) &&
          t >= clip.start &&
          t <= clip.start + clip.duration;

        let el = this.audioElements.get(clip.id);
        if (!el) {
          el = new Audio(clip.src);
          el.crossOrigin = 'anonymous';
          this.audioElements.set(clip.id, el);
        }

        if (ctx && !this.mediaSources.has(clip.id)) {
          try {
            const source = ctx.createMediaElementSource(el);
            const low = ctx.createBiquadFilter();
            low.type = 'lowshelf';
            low.frequency.value = 120;

            const mid = ctx.createBiquadFilter();
            mid.type = 'peaking';
            mid.frequency.value = 1000;
            mid.Q.value = 1.0;

            const high = ctx.createBiquadFilter();
            high.type = 'highshelf';
            high.frequency.value = 6000;

            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = -18;
            compressor.ratio.value = 1;

            const pan = ctx.createStereoPanner();
            const gain = ctx.createGain();

            source.connect(low);
            low.connect(mid);
            mid.connect(high);
            high.connect(compressor);
            compressor.connect(pan);
            pan.connect(gain);
            gain.connect(ctx.destination);

            this.mediaSources.set(clip.id, {
              source,
              low,
              mid,
              high,
              compressor,
              pan,
              gain,
            });
          } catch {
            // Ignore CORS/element reuse fallback
          }
        }

        const chain = this.mediaSources.get(clip.id);
        if (chain && track) {
          chain.low.gain.value = track.eqLow ?? 0;
          chain.mid.gain.value = track.eqMid ?? 0;
          chain.high.gain.value = track.eqHigh ?? 0;
          chain.compressor.ratio.value = track.compressor ? 4 : 1;
          chain.compressor.threshold.value = track.compressor ? -20 : 0;
          chain.pan.pan.value = track.pan ?? 0;
          const dbGain = dbToGain(track.volumeDb ?? 0);
          chain.gain.gain.value = Math.min(
            1.6,
            Math.max(0, (clip.volume / 100) * dbGain)
          );
        }

        if (active) {
          const speed = clip.speed ?? 1;
          el.playbackRate = Math.max(0.25, Math.min(4, speed));
          const targetTime = clip.sourceIn + (t - clip.start) * speed;
          if (Math.abs(el.currentTime - targetTime) > 0.25) {
            el.currentTime = targetTime;
          }
          const dbGain = dbToGain(track?.volumeDb ?? 0);
          el.volume = chain
            ? 1
            : Math.min(1, Math.max(0, (clip.volume / 100) * dbGain * 0.8));
          if (el.paused) {
            el.play().catch(() => {});
          }
        } else if (!el.paused) {
          el.pause();
        }
      }

      // Trigger one-shot transition SFX when playhead enters an SFX clip
      if (ctx) {
        for (const clip of clips) {
          if (
            clip.kind !== 'audio' ||
            !clip.synthPreset ||
            !clip.synthPreset.startsWith('sfx-')
          ) {
            continue;
          }
          const inWindow =
            t >= clip.start &&
            t <= Math.min(clip.start + 0.18, clip.start + clip.duration);
          if (!inWindow) {
            if (t < clip.start || t > clip.start + clip.duration) {
              this.triggeredSfxClips.delete(clip.id);
            }
            continue;
          }
          if (this.triggeredSfxClips.has(clip.id)) continue;
          const track = tracks.find((tr) => tr.id === clip.trackId);
          if (!track || track.muted || (hasSolo && !track.solo)) continue;

          this.triggeredSfxClips.add(clip.id);
          const dbMult = dbToGain(track.volumeDb ?? 0);
          const gainVal = Math.max(
            0.03,
            Math.min(0.5, (clip.volume / 100) * dbMult * 0.24)
          );
          this.triggerTransitionSfx(
            ctx,
            clip.synthPreset as Extract<
              SynthPreset,
              'sfx-whoosh' | 'sfx-glitch' | 'sfx-boom' | 'sfx-shimmer'
            >,
            gainVal,
            track
          );
        }
      }

      // Trigger procedural cinema synth notes on 250ms grid for built-in stems
      const stepIndex = Math.floor(t * 4);
      if (stepIndex === lastStepIndex || !ctx) return;
      lastStepIndex = stepIndex;

      for (const clip of clips) {
        if (
          clip.kind !== 'audio' ||
          !clip.synthPreset ||
          clip.synthPreset.startsWith('sfx-')
        ) {
          continue;
        }
        if (t < clip.start || t > clip.start + clip.duration) continue;
        const track = tracks.find((tr) => tr.id === clip.trackId);
        if (!track || track.muted || (hasSolo && !track.solo)) continue;

        const localT = t - clip.start;
        let fadeGain = 1;
        if (clip.fadeIn > 0 && localT < clip.fadeIn) {
          fadeGain = localT / clip.fadeIn;
        }
        if (clip.fadeOut > 0 && clip.duration - localT < clip.fadeOut) {
          fadeGain = Math.min(
            fadeGain,
            (clip.duration - localT) / clip.fadeOut
          );
        }
        const dbMult = dbToGain(track.volumeDb ?? 0);
        const gainVal = Math.max(
          0,
          Math.min(1, (clip.volume / 100) * fadeGain * dbMult * 0.08)
        );
        if (gainVal <= 0.002) continue;

        this.triggerSynthStep(
          ctx,
          clip.synthPreset as 'ambient-pulse' | 'percussion-drive',
          stepIndex,
          gainVal,
          track
        );
      }
    }, 50);
  }

  private connectWithTrackFx(
    ctx: AudioContext,
    sourceNode: AudioNode,
    track?: TimelineTrack
  ) {
    if (!track) {
      sourceNode.connect(ctx.destination);
      return;
    }
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 120;
    low.gain.value = track.eqLow ?? 0;

    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 1.0;
    mid.gain.value = track.eqMid ?? 0;

    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 6000;
    high.gain.value = track.eqHigh ?? 0;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = track.compressor ? -20 : 0;
    comp.ratio.value = track.compressor ? 4 : 1;

    const pan = ctx.createStereoPanner();
    pan.pan.value = track.pan ?? 0;

    sourceNode.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(comp);
    comp.connect(pan);
    pan.connect(ctx.destination);
  }

  private triggerTransitionSfx(
    ctx: AudioContext,
    preset: 'sfx-whoosh' | 'sfx-glitch' | 'sfx-boom' | 'sfx-shimmer',
    gainVal: number,
    track?: TimelineTrack
  ) {
    try {
      const now = ctx.currentTime;
      if (preset === 'sfx-whoosh') {
        const bufferSize = Math.floor(ctx.sampleRate * 0.45);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.setValueAtTime(2.5, now);
        filter.frequency.setValueAtTime(180, now);
        filter.frequency.exponentialRampToValueAtTime(2400, now + 0.18);
        filter.frequency.exponentialRampToValueAtTime(260, now + 0.44);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.14);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);

        noise.connect(filter);
        filter.connect(gain);
        this.connectWithTrackFx(ctx, gain, track);
        noise.start(now);
        noise.stop(now + 0.45);
      } else if (preset === 'sfx-glitch') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(840, now);
        osc.frequency.setValueAtTime(210, now + 0.05);
        osc.frequency.setValueAtTime(1240, now + 0.1);
        osc.frequency.setValueAtTime(140, now + 0.15);
        gain.gain.setValueAtTime(gainVal * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
        osc.connect(gain);
        this.connectWithTrackFx(ctx, gain, track);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (preset === 'sfx-boom') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(145, now);
        osc.frequency.exponentialRampToValueAtTime(34, now + 0.45);
        gain.gain.setValueAtTime(gainVal * 1.4, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
        osc.connect(gain);
        this.connectWithTrackFx(ctx, gain, track);
        osc.start(now);
        osc.stop(now + 0.56);
      } else {
        const freqs = [523.25, 659.25, 783.99, 1046.5];
        freqs.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now + idx * 0.03);
          gain.gain.setValueAtTime(0.0001, now + idx * 0.03);
          gain.gain.exponentialRampToValueAtTime(
            gainVal * 0.35,
            now + idx * 0.03 + 0.06
          );
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
          osc.connect(gain);
          this.connectWithTrackFx(ctx, gain, track);
          osc.start(now + idx * 0.03);
          osc.stop(now + 0.56);
        });
      }
    } catch {
      // Ignore audio errors
    }
  }

  private triggerSynthStep(
    ctx: AudioContext,
    preset: 'ambient-pulse' | 'percussion-drive',
    stepIndex: number,
    gainVal: number,
    track?: TimelineTrack
  ) {
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (preset === 'ambient-pulse') {
        const scale = [110, 130.81, 164.81, 196, 220, 164.81, 146.83, 130.81];
        const freq = scale[stepIndex % scale.length];
        osc.type = stepIndex % 4 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        osc.connect(gain);
        this.connectWithTrackFx(ctx, gain, track);
        osc.start(now);
        osc.stop(now + 0.3);
      } else {
        osc.type = 'sine';
        const isHit = stepIndex % 2 === 0;
        osc.frequency.setValueAtTime(isHit ? 95 : 150, now);
        osc.frequency.exponentialRampToValueAtTime(36, now + 0.14);
        gain.gain.setValueAtTime(gainVal * 1.4, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        osc.connect(gain);
        this.connectWithTrackFx(ctx, gain, track);
        osc.start(now);
        osc.stop(now + 0.18);
      }
    } catch {
      // Ignore audio errors
    }
  }

  public stopPlayback() {
    this.isPlaying = false;
    this.triggeredSfxClips.clear();
    if (this.pulseInterval !== null) {
      window.clearInterval(this.pulseInterval);
      this.pulseInterval = null;
    }
    this.audioElements.forEach((el) => {
      if (!el.paused) el.pause();
    });
  }
}

export const audioEngine = new StudioAudioEngine();

export function computeTrackVuLevels(
  track: TimelineTrack,
  clips: TimelineClip[],
  playheadTime: number,
  hasSolo: boolean
): { left: number; right: number } {
  if (track.muted || (hasSolo && !track.solo)) {
    return { left: 0, right: 0 };
  }
  const active = clips.filter(
    (c) =>
      c.trackId === track.id &&
      (c.kind === 'audio' || c.kind === 'video') &&
      playheadTime >= c.start &&
      playheadTime <= c.start + c.duration
  );
  if (active.length === 0) return { left: 0, right: 0 };

  let level = 0;
  for (const c of active) {
    const wf = c.waveform;
    const progress = (playheadTime - c.start) / Math.max(0.1, c.duration);
    const peak = wf && wf.length > 0
      ? wf[Math.min(wf.length - 1, Math.floor(progress * wf.length))]
      : 0.45 + 0.35 * Math.abs(Math.sin(playheadTime * 6));
    level = Math.max(level, peak * (c.volume / 100));
  }
  const dbFactor = dbToGain(track.volumeDb ?? 0);
  const compFactor = track.compressor ? 1.15 : 1.0;
  const master = Math.min(1, level * dbFactor * compFactor);
  const pan = track.pan ?? 0;
  const left = Math.min(1, master * (pan <= 0 ? 1 : 1 - pan * 0.75));
  const right = Math.min(1, master * (pan >= 0 ? 1 : 1 + pan * 0.75));
  return { left, right };
}
