import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Film, CheckCircle2, AlertCircle, Camera } from 'lucide-react';
import {
  CompositionSettings,
  TimelineClip,
  TimelineTrack,
  WorkAreaRange,
} from '../types/editor';
import {
  awaitMediaReadyForFrame,
  MediaCache,
  renderCompositionFrame,
} from '../renderer/canvasRenderer';
import { evaluateClipTransform, getClipLocalTime, getClipSpeedAtLocalTime } from '../engine/keyframes';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  composition: CompositionSettings;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  mediaCache: MediaCache;
  playheadTime?: number;
  workArea?: WorkAreaRange;
}

const RESOLUTION_PRESETS = [
  { id: '720p', label: '720p HD (1280×720)', width: 1280, height: 720, bitrate: 8_000_000 },
  { id: '1080p', label: '1080p Full HD (1920×1080)', width: 1920, height: 1080, bitrate: 16_000_000 },
  { id: '2k', label: '2K QHD (2560×1440)', width: 2560, height: 1440, bitrate: 24_000_000 },
  { id: '4k', label: '4K UHD (3840×2160)', width: 3840, height: 2160, bitrate: 40_000_000 },
  { id: '6k', label: '6K Cinema (6144×3160)', width: 6144, height: 3160, bitrate: 60_000_000 },
  { id: '8k', label: '8K UHD (7680×4320)', width: 7680, height: 4320, bitrate: 80_000_000 },
] as const;

const ASPECT_PRESETS = [
  { id: 'sequence', label: 'Use Sequence', ratio: null },
  { id: '16:9', label: 'YouTube · 16:9', ratio: 16 / 9 },
  { id: '9:16', label: 'Reels / TikTok · 9:16', ratio: 9 / 16 },
  { id: '1:1', label: 'Square · 1:1', ratio: 1 },
  { id: '4:5', label: 'Facebook Feed · 4:5', ratio: 4 / 5 },
  { id: '4:3', label: 'Classic · 4:3', ratio: 4 / 3 },
  { id: '2.39:1', label: 'Cinema · 2.39:1', ratio: 2.39 },
] as const;

type CaptureVideoTrack = MediaStreamTrack & { requestFrame?: () => void };

function createSafeMediaRecorder(
  stream: MediaStream,
  preferredCodec: 'webm' | 'mp4',
  bitrate: number
): { recorder: MediaRecorder; mimeType: string; ext: 'webm' | 'mp4' } {
  const candidates: { mime: string; ext: 'webm' | 'mp4' }[] =
    preferredCodec === 'mp4'
      ? [
          { mime: 'video/mp4', ext: 'mp4' },
          { mime: 'video/webm;codecs=vp9', ext: 'webm' },
          { mime: 'video/webm;codecs=vp8', ext: 'webm' },
          { mime: 'video/webm', ext: 'webm' },
        ]
      : [
          { mime: 'video/webm;codecs=vp9', ext: 'webm' },
          { mime: 'video/webm;codecs=vp8', ext: 'webm' },
          { mime: 'video/webm', ext: 'webm' },
          { mime: 'video/mp4', ext: 'mp4' },
        ];

  const supported = candidates.find(
    (c) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(c.mime)
  ) ?? { mime: 'video/webm', ext: 'webm' as const };

  try {
    const recorder = new MediaRecorder(stream, {
      mimeType: supported.mime,
      videoBitsPerSecond: bitrate,
    });
    return { recorder, mimeType: supported.mime, ext: supported.ext };
  } catch {
    try {
      const recorder = new MediaRecorder(stream, { mimeType: supported.mime });
      return { recorder, mimeType: supported.mime, ext: supported.ext };
    } catch {
      const recorder = new MediaRecorder(stream);
      return { recorder, mimeType: 'video/webm', ext: 'webm' };
    }
  }
}

interface ExportAudioChannel {
  clip: TimelineClip;
  element: HTMLAudioElement | HTMLVideoElement;
  gain: GainNode;
  rumbleCut: BiquadFilterNode;
  noiseAnalyser: AnalyserNode;
  noiseGate: GainNode;
  track: TimelineTrack;
}

interface ExportAudioSession {
  destination: MediaStreamAudioDestinationNode;
  updateAt: (time: number) => void;
  dispose: () => Promise<void>;
}

async function createExportAudioSession(
  clips: TimelineClip[],
  tracks: TimelineTrack[]
): Promise<ExportAudioSession | null> {
  const soundClips = clips.filter(
    (clip) => (clip.kind === 'audio' || clip.kind === 'video') && Boolean(clip.src)
  );
  if (soundClips.length === 0) return null;

  const AudioContextConstructor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error('This browser does not support audio mixing for video export.');
  }

  const context = new AudioContextConstructor();
  const destination = context.createMediaStreamDestination();
  const hasSolo = tracks.some((track) => track.solo);
  const channels: ExportAudioChannel[] = [];

  try {
    for (const clip of soundClips) {
      const track = tracks.find((item) => item.id === clip.trackId);
      if (!track || track.muted || (hasSolo && !track.solo)) continue;

      const element =
        clip.kind === 'video'
          ? document.createElement('video')
          : new Audio();
      element.preload = 'auto';
      element.crossOrigin = 'anonymous';
      element.src = clip.src!;
      if (element instanceof HTMLVideoElement) {
        element.playsInline = true;
        element.muted = false;
      }
      element.volume = 1;
      element.playbackRate = Math.max(0.25, Math.min(4, clip.speed ?? 1));

      const source = context.createMediaElementSource(element);
      const low = context.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 120;
      low.gain.value = track.eqLow ?? 0;

      const mid = context.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1000;
      mid.Q.value = 1;
      mid.gain.value = track.eqMid ?? 0;

      const high = context.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 6000;
      high.gain.value = track.eqHigh ?? 0;

      const rumbleCut = context.createBiquadFilter();
      rumbleCut.type = 'highpass';
      rumbleCut.frequency.value = 30;
      rumbleCut.Q.value = 0.7;

      const noiseAnalyser = context.createAnalyser();
      noiseAnalyser.fftSize = 512;
      noiseAnalyser.smoothingTimeConstant = 0.35;
      const noiseGate = context.createGain();
      noiseGate.gain.value = 1;

      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = track.compressor ? -20 : 0;
      compressor.ratio.value = track.compressor ? 4 : 1;

      const pan = context.createStereoPanner();
      pan.pan.value = track.pan ?? 0;
      const gain = context.createGain();
      gain.gain.value = 0;

      source.connect(rumbleCut);
      rumbleCut.connect(noiseAnalyser);
      noiseAnalyser.connect(noiseGate);
      noiseGate.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(compressor);
      compressor.connect(pan);
      pan.connect(gain);
      gain.connect(destination);

      channels.push({ clip, element, gain, rumbleCut, noiseAnalyser, noiseGate, track });
    }

    if (channels.length === 0) {
      await context.close();
      return null;
    }
    await context.resume();
  } catch (error) {
    channels.forEach(({ element }) => {
      element.pause();
      element.removeAttribute('src');
      element.load();
    });
    await context.close();
    throw error;
  }

  let disposed = false;
  return {
    destination,
    updateAt(time: number) {
      if (disposed) return;
      const activeVoiceovers = channels.filter(({ clip, track }) =>
        clip.isVoiceover &&
        clip.duckingEnabled !== false &&
        time >= clip.start &&
        time < clip.start + clip.duration &&
        !track.muted
      );
      const duckDb = activeVoiceovers.reduce(
        (maximum, { clip }) => Math.max(maximum, clip.duckingAmount ?? 12),
        0
      );
      for (const { clip, element, gain, track, rumbleCut, noiseAnalyser, noiseGate } of channels) {
        const clipEnd = clip.start + clip.duration;
        const active = time >= clip.start && time < clipEnd;
        if (!active) {
          if (!element.paused) element.pause();
          gain.gain.setTargetAtTime(0, context.currentTime, 0.015);
          continue;
        }

        const localTimeline = Math.max(0, Math.min(clip.duration, time - clip.start));
        const speed = getClipSpeedAtLocalTime(clip, localTimeline);
        const targetTime = Math.max(0, clip.sourceIn + getClipLocalTime(clip, time));
        element.playbackRate = Math.max(0.1, Math.min(8, speed));
        const reduction = Math.max(0, Math.min(100, clip.noiseReduction ?? 0));
        rumbleCut.frequency.value = reduction > 0 ? 80 + reduction * 1.25 : 30;
        if (reduction <= 0) {
          noiseGate.gain.setTargetAtTime(1, context.currentTime, 0.04);
        } else {
          const samples = new Uint8Array(noiseAnalyser.fftSize);
          noiseAnalyser.getByteTimeDomainData(samples);
          let sumSquares = 0;
          for (const sample of samples) {
            const normalized = (sample - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / samples.length);
          const threshold = Math.pow(10, (-72 + reduction * 0.32) / 20);
          const gateGain = rms >= threshold ? 1 : 0.035;
          noiseGate.gain.setTargetAtTime(
            gateGain,
            context.currentTime,
            gateGain > 0.5 ? 0.012 : 0.09
          );
        }
        if (Number.isFinite(element.duration) && element.duration > 0) {
          const safeTime = Math.min(targetTime, Math.max(0, element.duration - 0.04));
          if (Math.abs(element.currentTime - safeTime) > 0.22) {
            try {
              element.currentTime = safeTime;
            } catch {
              // Metadata may not be ready yet; the next frame will retry.
            }
          }
        } else if (Math.abs(element.currentTime - targetTime) > 0.22) {
          try {
            element.currentTime = targetTime;
          } catch {
            // Metadata may not be ready yet; the next frame will retry.
          }
        }

        const animatedVolume = (clip.keyframes.volume?.length ?? 0) > 0
          ? evaluateClipTransform(clip, time).volume ?? clip.volume
          : clip.volume;
        let level = (animatedVolume / 100) * Math.pow(10, (track.volumeDb ?? 0) / 20);
        if (clip.fadeIn > 0) level *= Math.min(1, Math.max(0, (time - clip.start) / clip.fadeIn));
        if (clip.fadeOut > 0) level *= Math.min(1, Math.max(0, (clipEnd - time) / clip.fadeOut));
        if (activeVoiceovers.length > 0 && !clip.isVoiceover) level *= Math.pow(10, -duckDb / 20);
        gain.gain.setTargetAtTime(Math.max(0, Math.min(1.6, level)), context.currentTime, 0.035);

        if (element.paused) {
          void element.play().catch(() => {
            // Media can be unavailable due to an unsupported codec or remote CORS policy.
          });
        }
      }
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      channels.forEach(({ element, gain }) => {
        element.pause();
        gain.disconnect();
        element.removeAttribute('src');
        element.load();
      });
      destination.stream.getTracks().forEach((track) => track.stop());
      await context.close().catch(() => {});
    },
  };
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  composition,
  tracks,
  clips,
  mediaCache,
  playheadTime = 0,
  workArea,
}) => {
  const [resId, setResId] = useState<string>('1080p');
  const [aspectId, setAspectId] = useState<string>('sequence');
  const [exportFps, setExportFps] = useState(composition.fps);
  const [codecPref, setCodecPref] = useState<'webm' | 'mp4'>('webm');
  const [rangeMode, setRangeMode] = useState<'full' | 'workArea'>(
    workArea?.enabled ? 'workArea' : 'full'
  );
  const [status, setStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>(
    'idle'
  );
  const [progress, setProgress] = useState(0);
  const [frameLabel, setFrameLabel] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadExt, setDownloadExt] = useState<'webm' | 'mp4'>('webm');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef(false);
  const activeRecorderRef = useRef<MediaRecorder | null>(null);
  const audioSessionRef = useRef<ExportAudioSession | null>(null);

  useEffect(() => {
    setExportFps(composition.fps);
  }, [composition.fps]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (activeRecorderRef.current && activeRecorderRef.current.state === 'recording') {
        try {
          activeRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      void audioSessionRef.current?.dispose();
    };
  }, [downloadUrl]);

  if (!isOpen) return null;

  const preset =
    RESOLUTION_PRESETS.find((r) => r.id === resId) ?? RESOLUTION_PRESETS[1];
  const aspectPreset = ASPECT_PRESETS.find((item) => item.id === aspectId) ?? ASPECT_PRESETS[0];
  const exportRatio = aspectPreset.ratio ?? composition.width / Math.max(1, composition.height);
  const portrait = exportRatio < 1;
  const outW = portrait ? preset.height : preset.width;
  const outH = Math.max(1, Math.round(outW / exportRatio));

  const startSec =
    rangeMode === 'workArea' && workArea ? Math.max(0, workArea.inTime) : 0;
  const endSec =
    rangeMode === 'workArea' && workArea
      ? Math.max(startSec + 0.2, Math.min(composition.duration, workArea.outTime))
      : composition.duration;
  const exportDuration = Number((endSec - startSec).toFixed(2));

  const handleSnapshotPng = async () => {
    try {
      await awaitMediaReadyForFrame(mediaCache, clips, playheadTime);
      const offscreen = document.createElement('canvas');
      offscreen.width = outW;
      offscreen.height = outH;
      renderCompositionFrame({
        canvas: offscreen,
        composition: { ...composition, width: outW, height: outH, fitMode: 'cover' },
        tracks,
        clips,
        playheadTime,
        selectedClipId: null,
        showSafeMargins: false,
        showTransparencyGrid: false,
        cameraAngle: 'active',
        isPlaying: false,
        mediaCache,
        drawGizmo: false,
      });
      const url = offscreen.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${composition.name}_frame_${resId}.png`;
      a.click();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Snapshot export failed.');
      setStatus('error');
    }
  };

  const handleStartRender = async () => {
    setStatus('rendering');
    setProgress(0);
    setFrameLabel('');
    setErrorMsg(null);
    abortRef.current = false;

    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    let stream: MediaStream | null = null;
    let audioSession: ExportAudioSession | null = null;
    try {
      audioSession = await createExportAudioSession(clips, tracks);
      audioSessionRef.current = audioSession;

      const offscreen = document.createElement('canvas');
      offscreen.width = outW;
      offscreen.height = outH;

      // Test canvas probe for requestFrame support so offline rendering doesn't drop slow 4K/8K frames
      const manualStream = offscreen.captureStream(0);
      const manualTrack = manualStream.getVideoTracks()[0] as CaptureVideoTrack | undefined;
      const supportsRequestFrame = Boolean(manualTrack && typeof manualTrack.requestFrame === 'function');
      if (!supportsRequestFrame) {
        manualStream.getTracks().forEach((t) => t.stop());
      }
      stream = supportsRequestFrame ? manualStream : offscreen.captureStream(exportFps);
      audioSession?.destination.stream.getAudioTracks().forEach((track) => stream?.addTrack(track));
      const activeVideoTrack = stream.getVideoTracks()[0] as CaptureVideoTrack | undefined;

      const { recorder, mimeType, ext } = createSafeMediaRecorder(
        stream,
        codecPref,
        preset.bitrate
      );
      activeRecorderRef.current = recorder;
      setDownloadExt(ext);

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const donePromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: mimeType }));
        };
        recorder.onerror = () => {
          reject(new Error('MediaRecorder encoding error during export.'));
        };
      });

      recorder.start(250);

      const totalFrames = Math.max(1, Math.ceil(exportDuration * exportFps));
      const frameIntervalMs = 1000 / exportFps;

      for (let f = 0; f <= totalFrames; f++) {
        if (abortRef.current) break;
        const t = Math.min(endSec, startSec + f / exportFps);
        await awaitMediaReadyForFrame(mediaCache, clips, t);
        if (abortRef.current) break;
        audioSession?.updateAt(t);

        renderCompositionFrame({
          canvas: offscreen,
          composition: { ...composition, width: outW, height: outH },
          tracks,
          clips,
          playheadTime: t,
          selectedClipId: null,
          showSafeMargins: false,
          showTransparencyGrid: false,
          cameraAngle: 'active',
          isPlaying: false,
          mediaCache,
          drawGizmo: false,
        });

        activeVideoTrack?.requestFrame?.();
        setProgress(Math.round((f / totalFrames) * 100));
        setFrameLabel(`${f} / ${totalFrames} frames`);
        await new Promise((r) => setTimeout(r, Math.min(32, Math.max(8, Math.round(frameIntervalMs)))));
      }

      audioSession?.updateAt(endSec);
      if (recorder.state === 'recording') {
        recorder.stop();
      }
      const blob = await donePromise;
      await audioSession?.dispose();
      audioSessionRef.current = null;
      stream.getTracks().forEach((tr) => tr.stop());
      activeRecorderRef.current = null;

      if (!abortRef.current) {
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setStatus('done');
      } else {
        setStatus('idle');
      }
    } catch (err) {
      stream?.getTracks().forEach((tr) => tr.stop());
      await audioSession?.dispose();
      audioSessionRef.current = null;
      activeRecorderRef.current = null;
      setErrorMsg(
        err instanceof Error ? err.message : 'Browser MediaRecorder failed.'
      );
      setStatus('error');
    }
  };

  const handleClose = () => {
    abortRef.current = true;
    void audioSessionRef.current?.dispose();
    audioSessionRef.current = null;
    if (activeRecorderRef.current && activeRecorderRef.current.state === 'recording') {
      try {
        activeRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setStatus('idle');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md bg-[#181A1F] border border-[#2B303A] rounded-lg shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-[#14161A] border-b border-[#2B303A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-[#3B82F6]" />
            <h2
              id="export-modal-title"
              className="text-sm font-semibold text-white"
            >
              Export Master Render (Up to 8K)
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close Export Modal"
            className="p-1 rounded text-[#9BA1AD] hover:text-white hover:bg-[#232730]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="export-aspect-select"
                className="block text-[11px] text-[#9BA1AD] mb-1"
              >
                Aspect Ratio / Crop
              </label>
              <select
                id="export-aspect-select"
                disabled={status === 'rendering'}
                value={aspectId}
                onChange={(e) => setAspectId(e.target.value)}
                className="w-full bg-[#111215] border border-[#2B303A] rounded px-2.5 py-1.5 text-xs text-white"
              >
                {ASPECT_PRESETS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="export-res-select"
                className="block text-[11px] text-[#9BA1AD] mb-1"
              >
                Resolution (HD → 8K)
              </label>
              <select
                id="export-res-select"
                disabled={status === 'rendering'}
                value={resId}
                onChange={(e) => setResId(e.target.value)}
                className="w-full bg-[#111215] border border-[#2B303A] rounded px-2.5 py-1.5 text-xs text-white"
              >
                {RESOLUTION_PRESETS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="export-fps-select"
                className="block text-[11px] text-[#9BA1AD] mb-1"
              >
                Frame Rate
              </label>
              <select
                id="export-fps-select"
                disabled={status === 'rendering'}
                value={exportFps}
                onChange={(e) => setExportFps(Number(e.target.value))}
                className="w-full bg-[#111215] border border-[#2B303A] rounded px-2.5 py-1.5 text-xs text-white"
              >
                <option value={24}>24 fps (Cinema)</option>
                <option value={30}>30 fps (Standard)</option>
                <option value={60}>60 fps (High Motion)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="export-range-select"
                className="block text-[11px] text-[#9BA1AD] mb-1"
              >
                Render Range
              </label>
              <select
                id="export-range-select"
                disabled={status === 'rendering'}
                value={rangeMode}
                onChange={(e) => setRangeMode(e.target.value as 'full' | 'workArea')}
                className="w-full bg-[#111215] border border-[#2B303A] rounded px-2.5 py-1.5 text-xs text-white"
              >
                <option value="full">Entire Comp (0.0s – {composition.duration.toFixed(1)}s)</option>
                {workArea && (
                  <option value="workArea">
                    Work Area ({workArea.inTime.toFixed(1)}s – {workArea.outTime.toFixed(1)}s)
                  </option>
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="export-codec-select"
                className="block text-[11px] text-[#9BA1AD] mb-1"
              >
                Container Format
              </label>
              <select
                id="export-codec-select"
                disabled={status === 'rendering'}
                value={codecPref}
                onChange={(e) => setCodecPref(e.target.value as 'webm' | 'mp4')}
                className="w-full bg-[#111215] border border-[#2B303A] rounded px-2.5 py-1.5 text-xs text-white"
              >
                <option value="webm">WebM (VP9 Master)</option>
                <option value="mp4">MP4 (H.264 / Auto Fallback)</option>
              </select>
            </div>
          </div>

          <div className="rounded bg-[#111215] border border-[#262B34] p-3 text-xs text-[#9BA1AD] space-y-1">
            <div className="flex justify-between">
              <span>Output Dimensions</span>
              <span className="text-[#E6E8EC] font-mono-tabular">
                {outW} × {outH}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Target Bitrate</span>
              <span className="text-[#E6E8EC] font-mono-tabular">
                {Math.round(preset.bitrate / 1_000_000)} Mbps ({codecPref.toUpperCase()})
              </span>
            </div>
            <div className="flex justify-between">
              <span>Render Duration</span>
              <span className="text-[#E6E8EC] font-mono-tabular">
                {exportDuration.toFixed(1)}s ({startSec.toFixed(1)}s → {endSec.toFixed(1)}s)
              </span>
            </div>
          </div>

          {status === 'rendering' && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[#C8CDD6]">
                  Rendering {resId.toUpperCase()} {frameLabel ? `(${frameLabel})` : 'frames...'}
                </span>
                <span className="font-mono-tabular text-[#3B82F6]">
                  {progress}%
                </span>
              </div>
              <div className="h-2 bg-[#111215] rounded overflow-hidden border border-[#2B303A]">
                <div
                  style={{ width: `${progress}%` }}
                  className="h-full bg-[#3B82F6] transition-all duration-100"
                />
              </div>
            </div>
          )}

          {status === 'done' && downloadUrl && (
            <div className="p-3 rounded bg-[#14B8A6]/10 border border-[#14B8A6]/40 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-[#5EEAD4]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Render complete ({outW}×{outH})</span>
              </div>
              <a
                href={downloadUrl}
                download={`${composition.name}_${resId}.${downloadExt}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#14B8A6] hover:bg-[#0D9488] text-[#042F2E] text-xs font-semibold whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </a>
            </div>
          )}

          {status === 'error' && (
            <div className="p-3 rounded bg-[#EF4444]/10 border border-[#EF4444]/40 flex items-center gap-2 text-xs text-[#FCA5A5]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-[#14161A] border-t border-[#2B303A] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleSnapshotPng}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#232730] hover:bg-[#2C313D] text-xs font-medium text-[#E6E8EC]"
          >
            <Camera className="w-3.5 h-3.5 text-[#14B8A6]" />
            <span>PNG Snapshot</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 rounded bg-[#232730] hover:bg-[#2C313D] text-xs font-medium text-[#E6E8EC]"
            >
              Close
            </button>
            <button
              type="button"
              disabled={status === 'rendering'}
              onClick={handleStartRender}
              className="px-4 py-1.5 rounded bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 text-xs font-semibold text-white"
            >
              {status === 'rendering' ? 'Rendering...' : 'Start Render'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
