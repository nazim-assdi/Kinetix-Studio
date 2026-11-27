import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatableProperty,
  BlendMode,
  ColorWheelGrade,
  CompositionSettings,
  EasingType,
  EffectType,
  LayerMask,
  MediaKind,
  MotionPresetItem,
  MotionTrackData,
  PathPoint,
  ProjectAsset,
  SavedProjectPayload,
  TimelineClip,
  TimelineMarker,
  TimelineTrack,
  SpeedRampPoint,
  SynthPreset,
  ToolMode,
  ViewLayoutMode,
  TrackMatteMode,
  WorkAreaRange,
  WorkspacePreset,
} from './types/editor';
import {
  INITIAL_ASSETS,
  INITIAL_CLIPS,
  INITIAL_COMPOSITION,
  INITIAL_TRACKS,
  generateWaveformPeaks,
} from './data/demoProject';
import { applyMotionPresetToClip } from './data/motionPresets';
import { applyCatalogMotionVariant, buildCatalogColorGrade } from './engine/catalogVariants';
import { DAVINCI_LUTS } from './data/megaCatalog';
import {
  evaluateClipTransform,
  moveKeyframe,
  removeKeyframeAtTime,
  togglePropertyKeyframing,
  updateKeyframeEasing,
  upsertKeyframe,
} from './engine/keyframes';
import {
  createEffectInstance,
  duplicateClip,
  freezeFrameClip,
  rippleDeleteClip,
  splitClipAtTime,
  trimClipEdge,
} from './engine/timelineOps';
import {
  parseIllustratorLayersFromText,
  parsePsdLayersFromBuffer,
  parseSvgLayersFromText,
} from './engine/layerImporter';
import { applyTrackPointsToTargetClip } from './engine/motionTracker';
import { clamp, snapToFrame } from './engine/timecode';
import { parseSrtSubtitles } from './engine/srt';
import { createMediaCache } from './renderer/canvasRenderer';
import { loadNamedProject, loadProjectFromIndexedDb, saveNamedProject, saveProjectToIndexedDb } from './engine/projectStorage';
import { orderFusionEffectIds } from './engine/fusionGraph';
import { ProjectManagerModal } from './components/ProjectManagerModal';
import { audioEngine } from './audio/audioEngine';
import { TopToolbar } from './components/TopToolbar';
import { LeftDockTab, ProjectBinPanel } from './components/ProjectBinPanel';
import { ProgramMonitor } from './components/ProgramMonitor';
import { EffectControlsPanel } from './components/EffectControlsPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { ExportModal } from './components/ExportModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { BezierGraphEditorModal } from './components/BezierGraphEditorModal';

const AUTOSAVE_KEY = 'kinetix_studio_autosave_v1';

function readAutosaveProject(): SavedProjectPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedProjectPayload;
    if (
      parsed &&
      parsed.composition &&
      Array.isArray(parsed.tracks) &&
      Array.isArray(parsed.clips) &&
      parsed.tracks.length > 0
    ) {
      return parsed;
    }
  } catch {
    // ignore corrupt cache
  }
  return null;
}

async function makePortableMediaUrl(
  url: string | undefined,
  cache: Map<string, string>
): Promise<string | undefined> {
  if (!url || !url.startsWith('blob:')) return url;
  const cached = cache.get(url);
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('A media file could not be read while saving the project.');
  }
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not package an imported media file.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read imported media.'));
    reader.readAsDataURL(blob);
  });
  cache.set(url, dataUrl);
  return dataUrl;
}

async function createPortableProjectPayload(
  project: Omit<SavedProjectPayload, 'version' | 'savedAt' | 'assets'> & {
    assets: ProjectAsset[];
  },
  mediaCache: Map<string, string> = new Map()
): Promise<SavedProjectPayload> {
  const savedAssets = await Promise.all(
    project.assets.map(async (asset) => {
      const src = await makePortableMediaUrl(asset.src, mediaCache);
      const thumbnail =
        asset.thumbnail === asset.src
          ? undefined
          : await makePortableMediaUrl(asset.thumbnail, mediaCache);
      return { ...asset, src, thumbnail };
    })
  );

  // The media bytes are stored once in the asset bin. Clips reconnect through assetId.
  const savedClips = project.clips.map(({ src: _src, ...clip }) => clip);
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    composition: project.composition,
    tracks: project.tracks,
    clips: savedClips,
    assets: savedAssets,
    markers: project.markers,
    workArea: project.workArea,
  };
}

function restoreProjectMedia(payload: SavedProjectPayload): SavedProjectPayload {
  const assets = (payload.assets ?? []).map((asset) => ({
    ...asset,
    thumbnail: asset.thumbnail ?? asset.src,
  }));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    ...payload,
    assets,
    clips: payload.clips.map((clip) => ({
      ...clip,
      src: assetById.get(clip.assetId)?.src ?? clip.src,
    })),
  };
}

function createCompactAutosave(payload: SavedProjectPayload): SavedProjectPayload {
  return {
    ...payload,
    assets: payload.assets?.map(({ src: _src, thumbnail: _thumbnail, ...asset }) => asset),
    clips: payload.clips.map(({ src: _src, ...clip }) => clip),
  };
}

interface TimelineSnapshot {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
}

interface AiAction {
  actionType: string;
  layerKind?: MediaKind;
  name?: string;
  textContent?: string;
  color?: string;
  duration?: number;
  effectType?: EffectType;
  presetId?: string;
  is3D?: boolean;
  x?: number;
  y?: number;
  z?: number;
  scale?: number;
  rotationX?: number;
  rotationY?: number;
  rotation?: number;
  lightType?: 'point' | 'spot' | 'ambient' | 'parallel';
  intensity?: number;
  fov?: number;
  exposure?: number;
  contrast?: number;
  saturation?: number;
}

export default function App() {
  const initialSave = useMemo(() => readAutosaveProject(), []);
  const [composition, setComposition] = useState<CompositionSettings>(
    initialSave?.composition ?? INITIAL_COMPOSITION
  );
  const [assets, setAssets] = useState<ProjectAsset[]>(initialSave?.assets ?? INITIAL_ASSETS);
  const [tracks, setTracks] = useState<TimelineTrack[]>(
    initialSave?.tracks ?? INITIAL_TRACKS
  );
  const [clips, setClips] = useState<TimelineClip[]>(
    initialSave?.clips ?? INITIAL_CLIPS
  );
  const timelineEndTime = useMemo(
    () => clips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), composition.duration),
    [clips, composition.duration]
  );
  const [markers, setMarkers] = useState<TimelineMarker[]>(
    initialSave?.markers ?? []
  );
  const [workArea, setWorkArea] = useState<WorkAreaRange>(
    initialSave?.workArea ?? {
      enabled: false,
      inTime: 0,
      outTime: (initialSave?.composition ?? INITIAL_COMPOSITION).duration,
    }
  );

  const [past, setPast] = useState<TimelineSnapshot[]>([]);
  const [future, setFuture] = useState<TimelineSnapshot[]>([]);

  const [workspace, setWorkspace] = useState<WorkspacePreset>('compositing');
  const [leftTab, setLeftTab] = useState<LeftDockTab>('bin');
  const [viewLayout, setViewLayout] = useState<ViewLayoutMode>('1-view');
  const [previewPreset, setPreviewPreset] = useState<MotionPresetItem | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    try { return window.localStorage.getItem('kinetix_autosave_enabled_v1') !== 'false'; }
    catch { return true; }
  });
  const [projectStorageReady, setProjectStorageReady] = useState(false);
  const [tool, setTool] = useState<ToolMode>('select');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [loopEnabled, setLoopEnabled] = useState(true);

  const [playheadTime, setPlayheadTime] = useState(1.2);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(() => {
    const list = initialSave?.clips ?? INITIAL_CLIPS;
    return list.find((c) => c.id === 'clip_v3_title')?.id ?? list[0]?.id ?? null;
  });

  const [exportOpen, setExportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [graphEditorOpen, setGraphEditorOpen] = useState(false);
  const [saveBadgeText, setSaveBadgeText] = useState<string | null>(null);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => {
    try { return window.localStorage.getItem('kinetix_current_project_id_v1'); } catch { return null; }
  });
  const [currentProjectName, setCurrentProjectName] = useState(initialSave?.composition.name ?? INITIAL_COMPOSITION.name);
  const [currentProjectFolder, setCurrentProjectFolder] = useState('My Projects');

  // Draggable & Resizable Panel Layout State
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(320);
  const [timelineHeight, setTimelineHeight] = useState(300);
  const [panelsSwapped, setPanelsSwapped] = useState(false);

  const mediaCache = useMemo(() => createMediaCache(), []);
  const portableMediaCacheRef = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    void loadProjectFromIndexedDb()
      .then((stored) => {
        if (
          cancelled ||
          !stored ||
          !stored.composition ||
          !Array.isArray(stored.tracks) ||
          !Array.isArray(stored.clips)
        ) {
          return;
        }
        const storedTime = Date.parse(stored.savedAt || '');
        const localTime = Date.parse(initialSave?.savedAt || '');
        if (initialSave && Number.isFinite(localTime) && storedTime < localTime) return;

        const restored = restoreProjectMedia(stored);
        setComposition(restored.composition);
        setAssets(restored.assets ?? INITIAL_ASSETS);
        setTracks(restored.tracks);
        setClips(restored.clips);
        if (Array.isArray(restored.markers)) setMarkers(restored.markers);
        if (restored.workArea) setWorkArea(restored.workArea);
        setSelectedClipId(restored.clips[0]?.id ?? null);
      })
      .catch((error) => {
        console.warn('Kinetix Studio autosave could not be restored:', error);
      })
      .finally(() => {
        if (!cancelled) setProjectStorageReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const playheadRef = useRef(playheadTime);
  playheadRef.current = playheadTime;
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  useEffect(() => {
    if (!projectStorageReady) return;
    try {
      window.localStorage.setItem('kinetix_autosave_enabled_v1', String(autoSaveEnabled));
    } catch {
      // The setting is session-local when browser storage is disabled.
    }
  }, [autoSaveEnabled, projectStorageReady]);

  // Debounced project autosave. Imported media is embedded once and cached so
  // repeated edits do not repeatedly decode large blob URLs.
  useEffect(() => {
    if (!projectStorageReady || !autoSaveEnabled) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const payload = await createPortableProjectPayload({
            composition, tracks, clips, assets, markers, workArea,
          }, portableMediaCacheRef.current);
          await saveProjectToIndexedDb(payload);
          if (currentProjectId) {
            await saveNamedProject(payload, { id: currentProjectId, name: currentProjectName || composition.name, folder: currentProjectFolder });
          }
          try {
            window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(createCompactAutosave(payload)));
          } catch {
            // IndexedDB keeps the full project and media when localStorage is small.
          }
          setSaveBadgeText('Auto Saved');
        } catch (error) {
          console.warn('Automatic project save failed:', error);
          setSaveBadgeText('Auto Save Failed');
        }
      })();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    projectStorageReady, autoSaveEnabled, composition, tracks, clips, assets, markers, workArea,
    currentProjectId, currentProjectName, currentProjectFolder,
  ]);

  const commitHistory = useCallback(
    (nextTracks: TimelineTrack[], nextClips: TimelineClip[]) => {
      setPast((prev) => [...prev.slice(-29), { tracks, clips }]);
      setFuture([]);
      setTracks(nextTracks);
      setClips(nextClips);
    },
    [tracks, clips]
  );

  const handleUndo = useCallback(() => {
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setFuture((f) => [{ tracks, clips }, ...f]);
      setTracks(last.tracks);
      setClips(last.clips);
      return prev.slice(0, -1);
    });
  }, [tracks, clips]);

  const handleRedo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[0];
      setPast((p) => [...p, { tracks, clips }]);
      setTracks(next.tracks);
      setClips(next.clips);
      return prev.slice(1);
    });
  }, [tracks, clips]);

  const handleChangeWorkspace = (w: WorkspacePreset) => {
    setWorkspace(w);
    if (w === 'color') setLeftTab('color');
    else if (w === 'fusion') setLeftTab('fusion');
    else if (w === 'fairlight') setLeftTab('audio');
    else if (w === 'editing') setLeftTab('bin');
    else if (w === 'motion3d') setLeftTab('packs');
    else if (w === 'compositing') setLeftTab('bin');
  };

  useEffect(() => {
    if (!isPlaying) {
      audioEngine.stopPlayback();
      return;
    }

    audioEngine.startPlayback(
      () => playheadRef.current,
      () => clipsRef.current,
      () => tracksRef.current
    );

    let lastTs = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      const loopStart = workArea.enabled ? workArea.inTime : 0;
      const loopEnd = workArea.enabled
        ? Math.min(timelineEndTime, workArea.outTime)
        : timelineEndTime;
      setPlayheadTime((prev) => {
        const next = prev + dt;
        if (next >= loopEnd) {
          if (loopEnabled) return loopStart;
          setIsPlaying(false);
          return loopEnd;
        }
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      audioEngine.stopPlayback();
    };
  }, [isPlaying, timelineEndTime, loopEnabled, workArea]);

  const handleSeek = useCallback(
    (t: number) => {
      setPlayheadTime(clamp(t, 0, timelineEndTime));
    },
    [timelineEndTime]
  );

  const handleStepFrame = useCallback(
    (dir: -1 | 1) => {
      setIsPlaying(false);
      const step = 1 / composition.fps;
      setPlayheadTime((prev) =>
        clamp(
          snapToFrame(prev + dir * step, composition.fps),
          0,
          timelineEndTime
        )
      );
    },
    [composition.fps, timelineEndTime]
  );

  const buildClipFromAsset = useCallback(
    (asset: ProjectAsset, targetTrackId?: string, startTime?: number): TimelineClip | null => {
      const start = Number(
        (startTime !== undefined ? startTime : playheadRef.current).toFixed(3)
      );
      const isAudio = asset.kind === 'audio';
      let track = targetTrackId
        ? tracks.find((t) => t.id === targetTrackId)
        : undefined;

      if (!track) {
        if (isAudio) {
          track = tracks.find((t) => t.kind === 'audio');
        } else if (asset.kind === 'camera') {
          track =
            tracks.find((t) => t.id === 'track_cam') ||
            tracks.find((t) => t.kind === 'video');
        } else if (asset.kind === 'light') {
          track =
            tracks.find((t) => t.id === 'track_light') ||
            tracks.find((t) => t.id === 'track_cam') ||
            tracks.find((t) => t.kind === 'video');
        } else if (
          asset.kind === 'text' ||
          asset.kind === 'shape' ||
          asset.kind === 'path' ||
          asset.kind === 'null' ||
          asset.kind === 'particles' ||
          asset.kind === 'visualizer' ||
          asset.kind === 'caption'
        ) {
          track =
            tracks.find((t) => t.id === 'track_v3') ||
            tracks.find((t) => t.kind === 'video');
        } else if (asset.kind === 'adjustment') {
          track =
            tracks.find((t) => t.id === 'track_v2') ||
            tracks.find((t) => t.kind === 'video');
        } else {
          track =
            tracks.find((t) => t.id === 'track_v1') ||
            [...tracks].reverse().find((t) => t.kind === 'video');
        }
      }
      if (!track) return null;

      const colorMap: Record<MediaKind, string> = {
        video: '#3B82F6',
        image: '#0EA5E9',
        audio: '#14B8A6',
        text: '#8B5CF6',
        shape: '#6366F1',
        path: '#38BDF8',
        solid: '#0284C7',
        null: '#D97706',
        adjustment: '#EC4899',
        camera: '#F59E0B',
        light: '#FBBF24',
        particles: '#F59E0B',
        visualizer: '#14B8A6',
        caption: '#60A5FA',
      };

      return {
        id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        assetId: asset.id,
        trackId: track.id,
        name: asset.defaultText?.text || asset.name,
        kind: asset.kind,
        start,
        duration: asset.duration,
        sourceIn: 0,
        src: asset.src,
        is3D: asset.kind === 'camera' || asset.kind === 'light',
        blendMode: 'normal',
        transform: {
          x: 0,
          y: 0,
          z: 0,
          scale: 100,
          rotation: 0,
          rotationX: 0,
          rotationY: 0,
          opacity: 100,
        },
        keyframes: {},
        effects: [],
        volume: 100,
        fadeIn: 0,
        fadeOut: 0,
        textProps: asset.defaultText ? { ...asset.defaultText } : undefined,
        shapeProps: asset.defaultShape ? { ...asset.defaultShape } : undefined,
        pathProps: asset.defaultPath ? { ...asset.defaultPath } : undefined,
        solidProps: asset.defaultSolid ? { ...asset.defaultSolid } : undefined,
        cameraProps: asset.defaultCamera ? { ...asset.defaultCamera } : undefined,
        lightProps: asset.defaultLight ? { ...asset.defaultLight } : undefined,
        particleProps: asset.defaultParticles ? { ...asset.defaultParticles } : undefined,
        visualizerProps: asset.defaultVisualizer ? { ...asset.defaultVisualizer } : undefined,
        captionProps: asset.defaultCaption
          ? {
              ...asset.defaultCaption,
              cues: asset.defaultCaption.cues.map((c) => ({ ...c })),
            }
          : undefined,
        waveform: asset.waveform,
        synthPreset: asset.synthPreset,
        colorLabel: colorMap[asset.kind],
      };
    },
    [tracks]
  );

  const insertAssetToTimeline = useCallback(
    (asset: ProjectAsset, targetTrackId?: string, startTime?: number) => {
      const newClip = buildClipFromAsset(asset, targetTrackId, startTime);
      if (!newClip) return;

      let nextTracks = tracks;
      if (!targetTrackId) {
        const clipStart = newClip.start;
        const clipEnd = newClip.start + newClip.duration;
        const hasOverlap = (tid: string) =>
          clips.some(
            (c) =>
              c.trackId === tid &&
              c.start < clipEnd - 0.01 &&
              c.start + c.duration > clipStart + 0.01
          );

        if (hasOverlap(newClip.trackId)) {
          const isAudio = asset.kind === 'audio';
          const isDedicatedCamOrLight =
            asset.kind === 'camera' || asset.kind === 'light';
          const candidate = tracks.find((t) => {
            if (isAudio ? t.kind !== 'audio' : t.kind !== 'video') return false;
            if (t.locked) return false;
            if (
              !isDedicatedCamOrLight &&
              (t.id === 'track_cam' || t.id === 'track_light')
            ) {
              return false;
            }
            return !hasOverlap(t.id);
          });

          if (candidate) {
            newClip.trackId = candidate.id;
          } else {
            const count =
              tracks.filter((t) => t.kind === (isAudio ? 'audio' : 'video'))
                .length + 1;
            const createdTrack: TimelineTrack = {
              id: `track_${isAudio ? 'a' : 'v'}${count}_${Date.now()}`,
              name: isAudio
                ? `A${count} · Audio`
                : `V${count} · ${
                    asset.kind === 'path'
                      ? 'Vector Path'
                      : asset.kind === 'text'
                      ? 'Title'
                      : asset.kind === 'shape'
                      ? 'Shape'
                      : 'Layer'
                  }`,
              kind: isAudio ? 'audio' : 'video',
              muted: false,
              solo: false,
              locked: false,
              visible: true,
              height: 50,
            };
            if (isAudio) {
              nextTracks = [...tracks, createdTrack];
            } else {
              const v3Idx = tracks.findIndex(
                (t) => t.id !== 'track_cam' && t.id !== 'track_light'
              );
              if (v3Idx === -1) {
                nextTracks = [createdTrack, ...tracks];
              } else {
                nextTracks = [
                  ...tracks.slice(0, v3Idx),
                  createdTrack,
                  ...tracks.slice(v3Idx),
                ];
              }
            }
            newClip.trackId = createdTrack.id;
          }
        }
      }

      const clipEnd = newClip.start + newClip.duration;
      if (clipEnd > composition.duration) {
        setComposition((c) => ({ ...c, duration: Math.ceil(clipEnd) }));
      }

      commitHistory(nextTracks, [...clips, newClip]);
      setSelectedClipId(newClip.id);
      setTool('select');
    },
    [buildClipFromAsset, composition.duration, tracks, clips, commitHistory]
  );

  const handleAddVoiceoverFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = url;
      audio.onloadedmetadata = () => {
        const duration = Number.isFinite(audio.duration) && audio.duration > 0
          ? Number(audio.duration.toFixed(2))
          : 8;
        const asset: ProjectAsset = {
          id: `asset_voiceover_${Date.now()}`,
          name: file.name,
          kind: 'audio',
          src: url,
          duration,
          waveform: generateWaveformPeaks(Math.random() * 8, 120),
        };
        const audioTrack = tracks.find((track) => track.kind === 'audio' && !track.locked);
        const clip = buildClipFromAsset(asset, audioTrack?.id, playheadRef.current);
        if (!clip) {
          setSaveBadgeText('Add an audio track first');
          window.setTimeout(() => setSaveBadgeText(null), 2200);
          return;
        }
        clip.isVoiceover = true;
        clip.duckingEnabled = true;
        clip.duckingAmount = 12;
        clip.noiseReduction = 0;
        setAssets((previous) => [asset, ...previous]);
        commitHistory(tracks, [...clips, clip]);
        setSelectedClipId(clip.id);
        setSaveBadgeText('Voiceover added');
        window.setTimeout(() => setSaveBadgeText(null), 1800);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setSaveBadgeText('Voiceover audio could not be loaded');
        window.setTimeout(() => setSaveBadgeText(null), 2200);
      };
    },
    [buildClipFromAsset, tracks, clips, commitHistory]
  );

  const handleQuickAddLayer = useCallback(
    (kind: MediaKind, selectedShapeType: NonNullable<ProjectAsset['defaultShape']>['shapeType'] = 'polygon') => {
      const defaults: Record<MediaKind, ProjectAsset> = {
        text: {
          id: `asset_txt_${Date.now()}`,
          name: 'Kinetic Title',
          kind: 'text',
          duration: 4,
          defaultText: {
            text: 'NEW TITLE',
            fontSize: 58,
            color: '#FFFFFF',
            fontWeight: 700,
            letterSpacing: 8,
            align: 'center',
          },
        },
        shape: {
          id: `asset_shp_${Date.now()}`,
          name: `Vector ${selectedShapeType}`,
          kind: 'shape',
          duration: 4,
          defaultShape: {
            shapeType: selectedShapeType,
            width: 240,
            height: 240,
            fillColor: 'rgba(59, 130, 246, 0.22)',
            strokeColor: '#3B82F6',
            strokeWidth: 3,
            cornerRadius: 12,
            sides: 6,
          },
        },
        solid: {
          id: `asset_sld_${Date.now()}`,
          name: 'Solid Matte',
          kind: 'solid',
          duration: 5,
          defaultSolid: { color: '#141B2D', width: 1280, height: 720 },
        },
        null: {
          id: `asset_nul_${Date.now()}`,
          name: 'Null 3D Controller',
          kind: 'null',
          duration: 6,
        },
        adjustment: {
          id: `asset_adj_${Date.now()}`,
          name: 'Adjustment Layer',
          kind: 'adjustment',
          duration: 5,
        },
        camera: {
          id: `asset_cam_${Date.now()}`,
          name: '3D Cinema Camera',
          kind: 'camera',
          duration: 6,
          defaultCamera: {
            fov: 54,
            focalLength: 35,
            lookAtX: 0,
            lookAtY: 0,
            lookAtZ: 0,
            depthOfField: false,
            aperture: 2.8,
          },
        },
        light: {
          id: `asset_lgt_${Date.now()}`,
          name: '3D Spot Light',
          kind: 'light',
          duration: 6,
          defaultLight: {
            lightType: 'spot',
            color: '#93C5FD',
            intensity: 120,
            coneAngle: 70,
            falloff: 45,
            castShadows: true,
          },
        },
        path: {
          id: `asset_pth_${Date.now()}`,
          name: 'Vector Path',
          kind: 'path',
          duration: 4,
        },
        particles: {
          id: `asset_ptc_${Date.now()}`,
          name: 'CC Particle World',
          kind: 'particles',
          duration: 6,
          defaultParticles: {
            style: 'sparks',
            count: 90,
            speed: 1.4,
            size: 4,
            color: '#F59E0B',
          },
        },
        visualizer: {
          id: `asset_vis_${Date.now()}`,
          name: 'Audio Visualizer',
          kind: 'visualizer',
          duration: 6,
          defaultVisualizer: {
            style: 'bars',
            color: '#3B82F6',
            accentColor: '#14B8A6',
            sensitivity: 1.0,
          },
        },
        caption: {
          id: `asset_cap_${Date.now()}`,
          name: 'Captions & SRT Track',
          kind: 'caption',
          duration: 8,
          defaultCaption: {
            cues: [
              { id: `cue_${Date.now()}_1`, start: 0.4, end: 3.0, text: 'Kinetix Studio Subtitle Cue 1' },
              { id: `cue_${Date.now()}_2`, start: 3.2, end: 6.0, text: 'Burn-in Broadcast Captions & SRT' },
            ],
            fontSize: 28,
            color: '#FFFFFF',
            highlightColor: '#3B82F6',
            bgColor: 'rgba(11, 13, 18, 0.84)',
            position: 'bottom',
          },
        },
        image: { id: 'img', name: 'Image', kind: 'image', duration: 5 },
        video: { id: 'vid', name: 'Video', kind: 'video', duration: 5 },
        audio: { id: 'aud', name: 'Audio', kind: 'audio', duration: 5 },
      };

      insertAssetToTimeline(defaults[kind]);
    },
    [insertAssetToTimeline]
  );

  const handleCreatePathClip = useCallback(
    (points: PathPoint[], closed: boolean) => {
      if (points.length < 2) return;
      const asset: ProjectAsset = {
        id: `asset_path_${Date.now()}`,
        name: closed ? 'Pen Closed Shape' : 'Pen Bezier Path',
        kind: 'path',
        duration: 4.5,
        defaultPath: {
          points,
          closed,
          strokeColor: '#3B82F6',
          strokeWidth: 4,
          fillColor: closed ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
          trimStart: 0,
          trimEnd: 100,
          dashed: false,
        },
      };
      insertAssetToTimeline(asset);
    },
    [insertAssetToTimeline]
  );

  const handleImportSrt = (file: File) => {
    void file.text().then((source) => {
      try {
        const cues = parseSrtSubtitles(source);
        if (cues.length === 0) {
          throw new Error('No valid subtitle cues were found in this SRT file.');
        }

        const duration = Math.max(0.1, ...cues.map((cue) => cue.end));
        const baseName = file.name.replace(/\.srt$/i, '').trim() || 'Imported Subtitles';
        const asset: ProjectAsset = {
          id: `asset_srt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: `${baseName} · Subtitles`,
          kind: 'caption',
          duration: Number(duration.toFixed(3)),
          defaultCaption: {
            cues,
            fontSize: 28,
            color: '#FFFFFF',
            highlightColor: '#3B82F6',
            bgColor: 'rgba(11, 13, 18, 0.84)',
            position: 'bottom',
          },
        };

        const importStart = playheadRef.current;
        setAssets((prev) => [asset, ...prev]);
        insertAssetToTimeline(asset, undefined, importStart);
        setLeftTab('captions');
        setSaveBadgeText(`Imported ${cues.length} subtitle cues`);
        window.setTimeout(() => setSaveBadgeText(null), 2500);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Subtitle import failed.';
        window.alert(message);
      }
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Could not read the subtitle file.';
      window.alert(message);
    });
  };

  const handleImportFiles = (fileList: FileList) => {
    Array.from(fileList).forEach((file) => {
      const lower = file.name.toLowerCase();

      if (lower.endsWith('.srt')) {
        handleImportSrt(file);
        return;
      }

      // Layer-by-Layer Vector / PSD / AI Importers
      if (lower.endsWith('.svg')) {
        file.text().then((txt) => {
          const parsed = parseSvgLayersFromText(txt, file.name);
          if (parsed.length > 0) {
            setAssets((prev) => [...parsed, ...prev]);
            parsed.forEach((a, idx) =>
              insertAssetToTimeline(a, undefined, playheadRef.current + idx * 0.05)
            );
          }
        });
        return;
      }

      if (lower.endsWith('.psd')) {
        file.arrayBuffer().then((buf) => {
          const parsed = parsePsdLayersFromBuffer(buf, file.name);
          if (parsed.length > 0) {
            setAssets((prev) => [...parsed, ...prev]);
            parsed.forEach((a) => insertAssetToTimeline(a));
          }
        });
        return;
      }

      if (lower.endsWith('.ai')) {
        file.text().then((txt) => {
          const parsed = parseIllustratorLayersFromText(txt, file.name);
          if (parsed.length > 0) {
            setAssets((prev) => [...parsed, ...prev]);
            parsed.forEach((a) => insertAssetToTimeline(a));
          }
        });
        return;
      }

      const url = URL.createObjectURL(file);
      const mime = file.type;
      if (mime.startsWith('image/')) {
        setAssets((prev) => [
          {
            id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            name: file.name,
            kind: 'image',
            src: url,
            thumbnail: url,
            duration: 5,
          },
          ...prev,
        ]);
      } else if (mime.startsWith('video/')) {
        const vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.src = url;
        vid.onloadedmetadata = () => {
          const dur =
            Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 6;
          setAssets((prev) => [
            {
              id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              name: file.name,
              kind: 'video',
              src: url,
              duration: Number(dur.toFixed(2)),
              width: vid.videoWidth,
              height: vid.videoHeight,
            },
            ...prev,
          ]);
        };
      } else if (mime.startsWith('audio/')) {
        const aud = new Audio(url);
        aud.onloadedmetadata = () => {
          const dur =
            Number.isFinite(aud.duration) && aud.duration > 0 ? aud.duration : 8;
          setAssets((prev) => [
            {
              id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              name: file.name,
              kind: 'audio',
              src: url,
              duration: Number(dur.toFixed(2)),
              waveform: generateWaveformPeaks(Math.random() * 10, 100),
            },
            ...prev,
          ]);
        };
      }
    });
  };

  const updateClipById = useCallback(
    (
      clipId: string,
      updater: (c: TimelineClip) => TimelineClip,
      recordHistory = false
    ) => {
      const nextClips = clips.map((c) => (c.id === clipId ? updater(c) : c));
      if (recordHistory) {
        commitHistory(tracks, nextClips);
      } else {
        setClips(nextClips);
      }
    },
    [clips, tracks, commitHistory]
  );

  const handleMoveClip = useCallback(
    (clipId: string, newStart: number, newTrackId?: string) => {
      setClips((prev) =>
        prev.map((c) =>
          c.id === clipId
            ? { ...c, start: newStart, trackId: newTrackId ?? c.trackId }
            : c
        )
      );
    },
    []
  );

  const handleTrimClip = useCallback(
    (clipId: string, edge: 'left' | 'right', newEdgeTime: number) => {
      setClips((prev) =>
        prev.map((c) => (c.id === clipId ? trimClipEdge(c, edge, newEdgeTime) : c))
      );
    },
    []
  );

  const handleSplitClip = useCallback(
    (clipId: string, splitTime: number) => {
      const target = clips.find((c) => c.id === clipId);
      if (!target) return;
      const splitResult = splitClipAtTime(target, splitTime);
      if (!splitResult) return;
      const [left, right] = splitResult;
      const nextClips = clips.flatMap((c) =>
        c.id === clipId ? [left, right] : [c]
      );
      commitHistory(tracks, nextClips);
      setSelectedClipId(right.id);
    },
    [clips, tracks, commitHistory]
  );

  const handleDeleteClip = useCallback(
    (clipId: string) => {
      const nextClips = clips.filter((c) => c.id !== clipId);
      commitHistory(tracks, nextClips);
      if (selectedClipId === clipId) setSelectedClipId(null);
    },
    [clips, tracks, selectedClipId, commitHistory]
  );

  const handleRippleDeleteClip = useCallback(
    (clipId: string) => {
      const nextClips = rippleDeleteClip(clips, clipId);
      commitHistory(tracks, nextClips);
      if (selectedClipId === clipId) setSelectedClipId(null);
    },
    [clips, tracks, selectedClipId, commitHistory]
  );

  const handleDuplicateClip = useCallback(
    (clipId: string) => {
      const target = clips.find((c) => c.id === clipId);
      if (!target) return;
      const copy = duplicateClip(target);
      commitHistory(tracks, [...clips, copy]);
      setSelectedClipId(copy.id);
    },
    [clips, tracks, commitHistory]
  );

  const handleFreezeFrameClip = useCallback(
    (clipId: string) => {
      const target = clips.find((c) => c.id === clipId);
      if (!target) return;
      const evalT = evaluateClipTransform(target, playheadRef.current);
      const frozen = freezeFrameClip(target, playheadRef.current, evalT);
      commitHistory(tracks, [...clips, frozen]);
      setSelectedClipId(frozen.id);
    },
    [clips, tracks, commitHistory]
  );

  const handleUpdateProperty = useCallback(
    (clipId: string, prop: AnimatableProperty, value: number) => {
      updateClipById(clipId, (clip) => {
        const localTime = clamp(playheadRef.current - clip.start, 0, clip.duration);
        if ((clip.keyframes[prop]?.length ?? 0) > 0) {
          return upsertKeyframe(clip, prop, localTime, value);
        }
        if (prop === 'shapeWidth' || prop === 'shapeHeight') {
          if (!clip.shapeProps) return clip;
          return { ...clip, shapeProps: { ...clip.shapeProps, [prop === 'shapeWidth' ? 'width' : 'height']: value } };
        }
        if (prop === 'volume') return { ...clip, volume: value };
        return { ...clip, transform: { ...clip.transform, [prop]: value } };
      });
    },
    [updateClipById]
  );

  const handleSetAnchorCanvas = useCallback(
    (clipId: string, anchorX: number, anchorY: number) => {
      updateClipById(clipId, (clip) => {
        const localTime = clamp(playheadRef.current - clip.start, 0, clip.duration);
        const current = evaluateClipTransform(clip, localTime);
        const deltaAnchorX = anchorX - (current.anchorX ?? 0);
        const deltaAnchorY = anchorY - (current.anchorY ?? 0);
        const radians = (current.rotation * Math.PI) / 180;
        const scale = current.scale / 100;
        // Pan-behind behaviour: move the transform origin by the same amount
        // as the pivot so the visible artwork remains exactly where it was.
        const shiftX = (Math.cos(radians) * deltaAnchorX - Math.sin(radians) * deltaAnchorY) * scale;
        const shiftY = (Math.sin(radians) * deltaAnchorX + Math.cos(radians) * deltaAnchorY) * scale;
        let next = clip;
        if ((clip.keyframes.anchorX?.length ?? 0) > 0) next = upsertKeyframe(next, 'anchorX', localTime, anchorX);
        else next = { ...next, transform: { ...next.transform, anchorX } };
        if ((clip.keyframes.anchorY?.length ?? 0) > 0) next = upsertKeyframe(next, 'anchorY', localTime, anchorY);
        else next = { ...next, transform: { ...next.transform, anchorY } };
        const nextX = current.x + shiftX;
        const nextY = current.y + shiftY;
        if ((clip.keyframes.x?.length ?? 0) > 0) next = upsertKeyframe(next, 'x', localTime, nextX);
        else next = { ...next, transform: { ...next.transform, x: nextX } };
        if ((clip.keyframes.y?.length ?? 0) > 0) next = upsertKeyframe(next, 'y', localTime, nextY);
        else next = { ...next, transform: { ...next.transform, y: nextY } };
        return next;
      });
    },
    [updateClipById]
  );

  const handleUpdateClipTransform = useCallback(
    (clipId: string, patch: { scale?: number; rotation?: number }) => {
      updateClipById(clipId, (clip) => {
        const localTime = clamp(playheadRef.current - clip.start, 0, clip.duration);
        let next = clip;
        if (patch.scale !== undefined) {
          const value = Math.max(1, Math.min(1000, patch.scale));
          if ((clip.keyframes.scale?.length ?? 0) > 0) next = upsertKeyframe(next, 'scale', localTime, value);
          else next = { ...next, transform: { ...next.transform, scale: value } };
        }
        if (patch.rotation !== undefined) {
          if ((clip.keyframes.rotation?.length ?? 0) > 0) next = upsertKeyframe(next, 'rotation', localTime, patch.rotation);
          else next = { ...next, transform: { ...next.transform, rotation: patch.rotation } };
        }
        return next;
      });
    },
    [updateClipById]
  );

  const handleResizeShapeCanvas = useCallback(
    (clipId: string, width: number, height: number) => {
      updateClipById(clipId, (clip) => {
        if (!clip.shapeProps) return clip;
        const localTime = clamp(playheadRef.current - clip.start, 0, clip.duration);
        let next = clip;
        if ((clip.keyframes.shapeWidth?.length ?? 0) > 0) next = upsertKeyframe(next, 'shapeWidth', localTime, width);
        else next = { ...next, shapeProps: { ...next.shapeProps!, width } };
        if ((clip.keyframes.shapeHeight?.length ?? 0) > 0) next = upsertKeyframe(next, 'shapeHeight', localTime, height);
        else next = { ...next, shapeProps: { ...next.shapeProps!, height } };
        return next;
      });
    },
    [updateClipById]
  );

  const handleUpdateMaskCanvas = useCallback(
    (clipId: string, mask: LayerMask) => updateClipById(clipId, (clip) => ({ ...clip, mask })),
    [updateClipById]
  );

  const handleMoveClipCanvas = useCallback(
    (clipId: string, x: number, y: number, z?: number) => {
      setClips((prev) =>
        prev.map((clip) => {
          if (clip.id !== clipId) return clip;
          let updated = clip;
          const localTime = clamp(
            playheadRef.current - clip.start,
            0,
            clip.duration
          );
          if ((updated.keyframes.x?.length ?? 0) > 0) {
            updated = upsertKeyframe(updated, 'x', localTime, x);
          } else {
            updated = { ...updated, transform: { ...updated.transform, x } };
          }
          if ((updated.keyframes.y?.length ?? 0) > 0) {
            updated = upsertKeyframe(updated, 'y', localTime, y);
          } else {
            updated = { ...updated, transform: { ...updated.transform, y } };
          }
          if (z !== undefined) {
            if ((updated.keyframes.z?.length ?? 0) > 0) updated = upsertKeyframe(updated, 'z', localTime, z);
            else updated = { ...updated, transform: { ...updated.transform, z } };
          }
          return updated;
        })
      );
    },
    []
  );

  const handleDeleteKeyframe = useCallback(
    (clipId: string, prop: AnimatableProperty, keyframeId: string) => {
      updateClipById(clipId, (clip) => removeKeyframeAtTime(clip, prop, keyframeId), true);
    },
    [updateClipById]
  );

  const handleMoveKeyframe = useCallback(
    (
      clipId: string,
      prop: AnimatableProperty,
      keyframeId: string,
      time: number,
      value: number
    ) => {
      // Pointer drags can emit dozens of updates per second. A functional update
      // prevents stale render closures from restoring an older clip snapshot.
      setClips((previous) =>
        previous.map((clip) =>
          clip.id === clipId ? moveKeyframe(clip, prop, keyframeId, time, value) : clip
        )
      );
    },
    []
  );

  const handleToggleStopwatch = (clipId: string, prop: AnimatableProperty) => {
    updateClipById(
      clipId,
      (clip) => {
        const localTime = clamp(playheadTime - clip.start, 0, clip.duration);
        return togglePropertyKeyframing(clip, prop, localTime);
      },
      true
    );
  };

  const handleToggleKeyframeAtPlayhead = (
    clipId: string,
    prop: AnimatableProperty
  ) => {
    updateClipById(
      clipId,
      (clip) => {
        const localTime = clamp(playheadTime - clip.start, 0, clip.duration);
        const existing = clip.keyframes[prop] ?? [];
        const near = existing.find((k) => Math.abs(k.time - localTime) <= 0.0005);
        if (near) {
          return removeKeyframeAtTime(clip, prop, near.id);
        }
        const currentVal = evaluateClipTransform(clip, playheadTime)[prop] ?? 0;
        return upsertKeyframe(clip, prop, localTime, Number(currentVal.toFixed(1)));
      },
      true
    );
  };

  const handleResetTransform = (clipId: string) => {
    updateClipById(
      clipId,
      (clip) => ({
        ...clip,
        transform: {
          x: 0,
          y: 0,
          z: 0,
          scale: 100,
          rotation: 0,
          rotationX: 0,
          rotationY: 0,
          opacity: 100,
        },
        keyframes: {},
      }),
      true
    );
  };

  const handleAddEffect = (clipId: string, type: EffectType) => {
    const fx = createEffectInstance(type);
    updateClipById(
      clipId,
      (clip) => clip.effects.some((existing) => existing.type === type)
        ? clip
        : { ...clip, effects: [...clip.effects, fx] },
      true
    );
  };

  // Apply Motion Bro / Mr Horse / AEJuice Preset
  const handleApplyMotionPreset = (presetId: string) => {
    if (presetId === 'camera_3d_push') {
      const camAsset: ProjectAsset = {
        id: `asset_cam_${Date.now()}`,
        name: '3D Dolly Push Camera',
        kind: 'camera',
        duration: 5,
        defaultCamera: {
          fov: 50,
          focalLength: 35,
          lookAtX: 0,
          lookAtY: 0,
          lookAtZ: 0,
          depthOfField: false,
          aperture: 2.8,
        },
      };
      const camClip = buildClipFromAsset(camAsset);
      if (camClip) {
        camClip.keyframes = {
          z: [
            { id: `kf_cz1_${Date.now()}`, time: 0, value: -120, easing: 'ease-out' },
            { id: `kf_cz2_${Date.now()}`, time: 4.5, value: 90, easing: 'linear' },
          ],
        };
        commitHistory(tracks, [...clips, camClip]);
        setSelectedClipId(camClip.id);
      }
      return;
    }

    if (presetId === 'three_point_light') {
      handleQuickAddLayer('light');
      return;
    }

    if (presetId === 'lower_third_pack') {
      const ltAsset: ProjectAsset = {
        id: `asset_lt_${Date.now()}`,
        name: 'Broadcast Lower-Third',
        kind: 'text',
        duration: 4,
        defaultText: {
          text: 'CREATIVE DIRECTOR · REEL',
          fontSize: 28,
          color: '#F8FAFC',
          fontWeight: 600,
          letterSpacing: 6,
          align: 'left',
          backgroundColor: 'rgba(30, 58, 138, 0.85)',
        },
      };
      const ltClip = buildClipFromAsset(ltAsset);
      if (ltClip) {
        ltClip.transform.x = -260;
        ltClip.transform.y = 210;
        const animated = applyMotionPresetToClip(ltClip, 'smooth_slide_in');
        commitHistory(tracks, [...clips, animated]);
        setSelectedClipId(animated.id);
      }
      return;
    }

    if (presetId === 'hud_callout_pack') {
      const hudAsset = assets.find((a) => a.id === 'asset_shape_ring');
      if (hudAsset) {
        const hudClip = buildClipFromAsset(hudAsset);
        if (hudClip) {
          hudClip.is3D = true;
          hudClip.effects = [createEffectInstance('glow')];
          const animated = applyMotionPresetToClip(hudClip, 'elastic_pop_in');
          commitHistory(tracks, [...clips, animated]);
          setSelectedClipId(animated.id);
        }
      }
      return;
    }

    if (!selectedClipId) return;
    updateClipById(
      selectedClipId,
      (clip) => applyMotionPresetToClip(clip, presetId),
      true
    );
  };

  // Apply Custom Motion Creator Bezier Curve to all keyframes on selected clip
  const handleApplyMotionCreatorCurve = (
    bezier: [number, number, number, number]
  ) => {
    if (!selectedClipId) return;
    updateClipById(
      selectedClipId,
      (clip) => {
        const nextKf = { ...clip.keyframes };
        (Object.keys(nextKf) as AnimatableProperty[]).forEach((prop) => {
          const list = nextKf[prop];
          if (list) {
            nextKf[prop] = list.map((k) => ({
              ...k,
              easing: 'bezier',
              bezier,
            }));
          }
        });
        return { ...clip, keyframes: nextKf };
      },
      true
    );
  };

  // Visual Bezier Graph Editor Handlers
  const handleApplyCurveToProperty = (
    clipId: string,
    prop: AnimatableProperty,
    keyframeIndex: number | 'all',
    bezier: [number, number, number, number]
  ) => {
    updateClipById(
      clipId,
      (clip) => {
        let list = [...(clip.keyframes[prop] ?? [])].sort((a, b) => a.time - b.time);
        const currentValue = evaluateClipTransform(clip, playheadRef.current)[prop] ?? 0;
        if (list.length < 2) {
          const idBase = `kf_graph_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          if (list.length === 0) {
            const startValue = prop === 'scale' ? 25 : prop === 'opacity' || prop === 'volume' ? 0 : prop === 'shapeWidth' || prop === 'shapeHeight' ? currentValue * 0.25 : prop === 'rotation' || prop === 'rotationX' || prop === 'rotationY' ? currentValue - 45 : currentValue - 160;
            const endTime = Math.max(0.001, Math.min(1, clip.duration));
            list = [
              { id: `${idBase}_a`, time: 0, value: startValue, easing: 'bezier', bezier },
              { id: `${idBase}_b`, time: endTime, value: currentValue, easing: 'linear' },
            ];
          } else {
            const anchor = list[0];
            const otherTime = anchor.time <= clip.duration / 2 ? clip.duration : 0;
            if (Math.abs(otherTime - anchor.time) < 0.001) return clip;
            list.push({ id: `${idBase}_b`, time: otherTime, value: currentValue, easing: 'linear' });
            list.sort((a, b) => a.time - b.time);
          }
        }
        const nextList = list.map((keyframe, index) =>
          keyframeIndex === 'all' || index === keyframeIndex
            ? { ...keyframe, easing: 'bezier' as const, bezier }
            : keyframe
        );
        return { ...clip, keyframes: { ...clip.keyframes, [prop]: nextList } };
      },
      true
    );
  };

  const handleCreateDefaultCurveKeyframes = (
    clipId: string,
    prop: AnimatableProperty,
    bezier: [number, number, number, number]
  ) => handleApplyCurveToProperty(clipId, prop, 'all', bezier);

  const handleAddSfxToTimeline = (preset: SynthPreset) => {
    const start = Number(playheadRef.current.toFixed(3));
    const duplicate = clips.find((clip) =>
      clip.kind === 'audio' &&
      clip.synthPreset === preset &&
      Math.abs(clip.start - start) < 0.25
    );
    if (duplicate) {
      setSelectedClipId(duplicate.id);
      setSaveBadgeText('SFX already on timeline');
      window.setTimeout(() => setSaveBadgeText(null), 1800);
      return;
    }

    const asset: ProjectAsset = {
      id: `asset_sfx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: preset.replace('sfx-', '').replace(/-/g, ' ').toUpperCase(),
      kind: 'audio',
      duration: 0.75,
      synthPreset: preset,
      waveform: generateWaveformPeaks(Math.random() * 9, 48),
    };
    const audioTrack = tracks.find((track) => track.kind === 'audio');
    const clip = buildClipFromAsset(asset, audioTrack?.id, start);
    if (!clip) return;
    setAssets((previous) => [asset, ...previous]);
    commitHistory(tracks, [...clips, clip]);
    setSelectedClipId(clip.id);
  };

  // Apply any item from 1000+ Mega Catalog (Presets, Transitions w/ SFX, Live Shaders, DaVinci LUTs)
  const handleApplyCatalogPreset = (
    item: MotionPresetItem,
    targetClipId: string | null = selectedClipId
  ) => {
    const targetClip = clips.find((clip) => clip.id === targetClipId) ?? null;

    // Library assets are complete editable layers. Multi-layer kits insert every part
    // as its own timeline clip so text, accents, panels and charts can be edited independently.
    const templates = item.assetTemplates?.length
      ? item.assetTemplates
      : item.assetTemplate ? [item.assetTemplate] : [];
    if (templates.length > 0) {
      const startTime = targetClip?.start ?? playheadRef.current;
      const newAssets: ProjectAsset[] = [];
      const newClips: TimelineClip[] = [];
      templates.forEach((template, index) => {
        const asset: ProjectAsset = {
          id: `asset_library_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
          name: templates.length > 1 ? `${item.name} · Layer ${index + 1}` : item.name,
          kind: template.kind,
          duration: template.duration ?? 6,
          defaultText: template.defaultText,
          defaultShape: template.defaultShape,
          defaultSolid: template.defaultSolid,
          defaultParticles: template.defaultParticles,
          defaultVisualizer: template.defaultVisualizer,
          defaultPath: template.defaultPath,
          defaultCaption: template.defaultCaption,
        };
        const newClip = buildClipFromAsset(asset, undefined, startTime);
        if (!newClip) return;
        const offset = template.offset ?? {};
        newClip.transform = {
          ...newClip.transform,
          x: offset.x ?? 0,
          y: offset.y ?? 0,
          scale: offset.scale ?? 100,
          rotation: offset.rotation ?? 0,
          opacity: offset.opacity ?? 100,
        };
        newAssets.push(asset);
        newClips.push(newClip);
      });
      if (newClips.length === 0) return;
      setAssets((previous) => [...newAssets, ...previous]);
      commitHistory(tracks, [...clips, ...newClips]);
      setSelectedClipId(newClips[newClips.length - 1].id);
      setSaveBadgeText(newClips.length > 1 ? `Added ${newClips.length} editable layers` : 'Added from Library');
      window.setTimeout(() => setSaveBadgeText(null), 1800);
      return;
    }

    // Color LUTs are grades only; they must never trigger FX or transitions.
    if (item.category === 'Color LUT' && item.lutName && targetClipId) {
      const lut = DAVINCI_LUTS.find((candidate) => candidate.name === item.lutName);
      if (lut) {
        const grade = buildCatalogColorGrade(item, lut.grade);
        updateClipById(targetClipId, (clip) => ({ ...clip, colorGrade: grade }), true);
      }
      return;
    }

    // Effect cards apply the effect alone. Transition animation/SFX is handled
    // only by the Transition category below.
    if (item.category === 'Effects' || (item.effectType && item.category !== 'Transition')) {
      if (!targetClipId || !item.effectType) return;
      const fx = createEffectInstance(item.effectType);
      if (item.effectParams) fx.params = { ...fx.params, ...item.effectParams };
      fx.name = item.name;
      updateClipById(
        targetClipId,
        (clip) => clip.effects.some((existing) =>
          existing.type === fx.type && existing.name === item.name
        )
          ? clip
          : { ...clip, effects: [...clip.effects, fx] },
        true
      );
      return;
    }

    if (item.category === 'Transition') {
      if (!targetClip) return;
      if (targetClip.appliedPresetIds?.includes(item.id)) {
        setSelectedClipId(targetClip.id);
        setSaveBadgeText('Transition already applied');
        window.setTimeout(() => setSaveBadgeText(null), 1800);
        return;
      }

      const baseId = item.basePresetId || item.id;
      let nextClips = clips.map((clip) => {
        if (clip.id !== targetClip.id) return clip;
        const animated = applyCatalogMotionVariant(applyMotionPresetToClip(clip, baseId), item.motionVariant);
        return {
          ...animated,
          appliedPresetIds: [...(clip.appliedPresetIds ?? []), item.id],
        };
      });

      if (item.sfxPreset) {
        const sfxAlreadyExists = clips.some((clip) =>
          clip.kind === 'audio' &&
          clip.synthPreset === item.sfxPreset &&
          Math.abs(clip.start - targetClip.start) < 0.25
        );
        if (!sfxAlreadyExists) {
          const sfxAsset: ProjectAsset = {
            id: `asset_sfx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: `${item.name} · SFX`,
            kind: 'audio',
            duration: 0.75,
            synthPreset: item.sfxPreset,
            waveform: generateWaveformPeaks(Math.random() * 9, 48),
          };
          const audioTrack = tracks.find((track) => track.kind === 'audio');
          const sfxClip = buildClipFromAsset(sfxAsset, audioTrack?.id, targetClip.start);
          if (sfxClip) {
            setAssets((previous) => [sfxAsset, ...previous]);
            nextClips = [...nextClips, sfxClip];
          }
        }
      }

      commitHistory(tracks, nextClips);
      setSelectedClipId(targetClip.id);
      return;
    }

    if (item.sfxPreset) {
      handleAddSfxToTimeline(item.sfxPreset);
      return;
    }

    if (item.effectType && targetClipId) {
      handleAddEffect(targetClipId, item.effectType);
      return;
    }

    if (item.category === 'Animation' && targetClipId) {
      const baseId = item.basePresetId || item.id;
      updateClipById(
        targetClipId,
        (clip) => applyCatalogMotionVariant(applyMotionPresetToClip(clip, baseId), item.motionVariant),
        true
      );
      return;
    }

    handleApplyMotionPreset(item.basePresetId || item.id);
  };

  // Project Save & Load: portable project files plus durable IndexedDB autosave.
  const handleSaveProject = async () => {
    try {
      const payload = await createPortableProjectPayload({ composition, tracks, clips, assets, markers, workArea }, portableMediaCacheRef.current);
      const projectId = currentProjectId ?? `project_${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString(36)}`;
      const projectName = currentProjectName || composition.name;
      await saveProjectToIndexedDb(payload);
      await saveNamedProject(payload, { id: projectId, name: projectName, folder: currentProjectFolder });
      setCurrentProjectId(projectId);
      setCurrentProjectName(projectName);
      try { window.localStorage.setItem('kinetix_current_project_id_v1', projectId); } catch { /* project index remains saved in IndexedDB */ }
      try {
        window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(createCompactAutosave(payload)));
      } catch {
        // IndexedDB stores the full media-backed project.
      }
      setSaveBadgeText('Saved');
    } catch (error) {
      console.error('Project save failed:', error);
      setSaveBadgeText('Save Failed');
    }
    window.setTimeout(() => setSaveBadgeText(null), 2500);
  };

  const handleSaveProjectAs = async (name: string, folder: string) => {
    const payload = await createPortableProjectPayload({ composition, tracks, clips, assets, markers, workArea }, portableMediaCacheRef.current);
    const projectId = `project_${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString(36)}`;
    await saveNamedProject(payload, { id: projectId, name, folder });
    await saveProjectToIndexedDb(payload);
    setCurrentProjectId(projectId);
    setCurrentProjectName(name);
    setCurrentProjectFolder(folder);
    try { window.localStorage.setItem('kinetix_current_project_id_v1', projectId); } catch { /* optional */ }
    setSaveBadgeText('Project Saved');
  };

  const handleOpenLibraryProject = async (id: string, libraryName: string, libraryFolder: string) => {
    const saved = await loadNamedProject(id);
    if (!saved) throw new Error('This saved project is missing from the local project library.');
    const restored = restoreProjectMedia(saved);
    setComposition(restored.composition);
    setAssets(restored.assets ?? INITIAL_ASSETS);
    setTracks(restored.tracks);
    setClips(restored.clips);
    setPast([]);
    setFuture([]);
    if (Array.isArray(restored.markers)) setMarkers(restored.markers);
    setWorkArea(restored.workArea ?? { enabled: false, inTime: 0, outTime: restored.composition.duration });
    setSelectedClipId(restored.clips[0]?.id ?? null);
    setPlayheadTime(0);
    setCurrentProjectId(id);
    try { window.localStorage.setItem('kinetix_current_project_id_v1', id); } catch { /* optional */ }
    setCurrentProjectName(libraryName || restored.composition.name);
    setCurrentProjectFolder(libraryFolder || 'My Projects');
    await saveProjectToIndexedDb(restored);
    setSaveBadgeText('Project Opened');
  };

  const handleNewEmptyProject = () => {
    const name = 'Untitled Project';
    setIsPlaying(false);
    setComposition({ ...INITIAL_COMPOSITION, name });
    setAssets([]);
    setTracks(INITIAL_TRACKS);
    setClips([]);
    setPast([]);
    setFuture([]);
    setMarkers([]);
    setWorkArea({ enabled: false, inTime: 0, outTime: INITIAL_COMPOSITION.duration });
    setSelectedClipId(null);
    setPlayheadTime(0);
    setCurrentProjectId(null);
    setCurrentProjectName(name);
    setCurrentProjectFolder('My Projects');
    try { window.localStorage.removeItem('kinetix_current_project_id_v1'); } catch { /* optional */ }
  };

  const handleExportProjectFile = async () => {
    try {
      const payload = await createPortableProjectPayload({ composition, tracks, clips, assets, markers, workArea }, portableMediaCacheRef.current);
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${composition.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.kinetix.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSaveBadgeText('Project Exported');
    } catch (error) {
      console.error('Project export failed:', error);
      setSaveBadgeText('Export Failed');
    }
    window.setTimeout(() => setSaveBadgeText(null), 2500);
  };

  const handleLoadProjectFile = (file: File) => {
    void file.text().then(async (raw) => {
      try {
        const parsed = JSON.parse(raw) as SavedProjectPayload;
        if (!parsed.composition || !Array.isArray(parsed.tracks) || !Array.isArray(parsed.clips)) {
          throw new Error('This is not a valid Kinetix Studio project file.');
        }
        const restored = restoreProjectMedia(parsed);
        setCurrentProjectId(null);
        setCurrentProjectName(restored.composition.name);
        setCurrentProjectFolder('My Projects');
        try { window.localStorage.removeItem('kinetix_current_project_id_v1'); } catch { /* optional */ }
        setComposition(restored.composition);
        setAssets(restored.assets ?? INITIAL_ASSETS);
        commitHistory(restored.tracks, restored.clips);
        if (Array.isArray(restored.markers)) setMarkers(restored.markers);
        if (restored.workArea) setWorkArea(restored.workArea);
        setSelectedClipId(restored.clips[0]?.id ?? null);
        try {
          await saveProjectToIndexedDb(restored);
          window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(createCompactAutosave(restored)));
        } catch (error) {
          console.warn('Loaded project could not be stored for the next session:', error);
        }
        setSaveBadgeText('Loaded');
      } catch (error) {
        console.error('Project load failed:', error);
        setSaveBadgeText('Load Failed');
      }
      setTimeout(() => setSaveBadgeText(null), 2500);
    });
  };

  const startResizeDrag = (
    axis: 'left' | 'right' | 'timeline',
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origL = leftWidth;
    const origR = rightWidth;
    const origT = timelineHeight;

    const onMove = (ev: PointerEvent) => {
      if (axis === 'left') {
        const dx = ev.clientX - startX;
        setLeftWidth(clamp(origL + dx, 230, 480));
      } else if (axis === 'right') {
        const dx = startX - ev.clientX;
        setRightWidth(clamp(origR + dx, 230, 480));
      } else {
        const dy = startY - ev.clientY;
        setTimelineHeight(clamp(origT + dy, 180, 460));
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Real Server-Side AI Director Integration
  const handleRunAiPrompt = async (prompt: string) => {
    const selected = clips.find((c) => c.id === selectedClipId) ?? null;
    const requestBody = JSON.stringify({
      prompt,
      context: {
        playheadTime,
        selectedClipName: selected?.name ?? null,
        selectedClipKind: selected?.kind ?? null,
        clipCount: clips.length,
        duration: composition.duration,
      },
    });
    const sendRequest = (accessKey = '') =>
      fetch('/api/ai-edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessKey ? { 'X-Kinetix-Access-Key': accessKey } : {}),
        },
        body: requestBody,
      });

    let accessKey = '';
    try {
      accessKey = window.sessionStorage.getItem('kinetix_ai_access_key') ?? '';
    } catch {
      // Session storage may be disabled in private browser contexts.
    }
    let response = await sendRequest(accessKey);
    if (response.status === 401) {
      const enteredKey = window.prompt('This Kinetix Studio server requires an AI access key. Enter the key provided by the server owner:');
      if (!enteredKey?.trim()) {
        throw new Error('AI access key is required by this server.');
      }
      accessKey = enteredKey.trim();
      try {
        window.sessionStorage.setItem('kinetix_ai_access_key', accessKey);
      } catch {
        // The key is still used for this request if session storage is unavailable.
      }
      response = await sendRequest(accessKey);
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'AI editing service returned an error.');
    }

    const actions: AiAction[] = Array.isArray(data.actions) ? data.actions : [];
    let nextClips = [...clips];
    let latestSelected = selectedClipId;

    for (const act of actions) {
      if (act.actionType === 'add_layer' || act.actionType === 'add_camera' || act.actionType === 'add_light') {
        const kind: MediaKind =
          act.actionType === 'add_camera'
            ? 'camera'
            : act.actionType === 'add_light'
            ? 'light'
            : act.layerKind || 'text';
        const tempAsset: ProjectAsset = {
          id: `asset_ai_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          name: act.name || `AI ${kind}`,
          kind,
          duration: act.duration || 4.5,
          defaultText:
            kind === 'text'
              ? {
                  text: act.textContent || act.name || 'AI MOTION TITLE',
                  fontSize: 60,
                  color: act.color || '#F4F6FB',
                  fontWeight: 700,
                  letterSpacing: 10,
                  align: 'center',
                }
              : undefined,
          defaultShape:
            kind === 'shape'
              ? {
                  shapeType: 'ring',
                  width: 260,
                  height: 260,
                  fillColor: 'transparent',
                  strokeColor: act.color || '#3B82F6',
                  strokeWidth: 4,
                  cornerRadius: 8,
                }
              : undefined,
          defaultSolid:
            kind === 'solid'
              ? { color: act.color || '#141B2D', width: 1280, height: 720 }
              : undefined,
          defaultCamera:
            kind === 'camera'
              ? {
                  fov: act.fov ?? 54,
                  focalLength: 35,
                  lookAtX: 0,
                  lookAtY: 0,
                  lookAtZ: 0,
                  depthOfField: false,
                  aperture: 2.8,
                }
              : undefined,
          defaultLight:
            kind === 'light'
              ? {
                  lightType: act.lightType || 'spot',
                  color: act.color || '#93C5FD',
                  intensity: act.intensity ?? 120,
                  coneAngle: 70,
                  falloff: 45,
                  castShadows: true,
                }
              : undefined,
          defaultParticles:
            kind === 'particles'
              ? {
                  style: 'sparks',
                  count: 85,
                  speed: 2.2,
                  size: 6,
                  color: act.color || '#F59E0B',
                }
              : undefined,
          defaultVisualizer:
            kind === 'visualizer'
              ? {
                  style: 'bars',
                  color: act.color || '#3B82F6',
                  accentColor: '#14B8A6',
                  sensitivity: 1.25,
                }
              : undefined,
          defaultCaption:
            kind === 'caption'
              ? {
                  cues: [
                    {
                      id: `cue_${Date.now()}`,
                      start: playheadTime,
                      end: playheadTime + (act.duration || 4),
                      text: act.textContent || act.name || 'CINEMATIC MOTION GRAPHICS',
                    },
                  ],
                  fontSize: 34,
                  color: act.color || '#FFFFFF',
                  highlightColor: '#3B82F6',
                  bgColor: 'rgba(15, 23, 42, 0.85)',
                  position: 'bottom',
                }
              : undefined,
        };
        let newClip = buildClipFromAsset(tempAsset);
        if (newClip) {
          newClip.is3D = act.is3D ?? newClip.is3D;
          newClip.transform = {
            ...newClip.transform,
            x: act.x ?? newClip.transform.x,
            y: act.y ?? newClip.transform.y,
            z: act.z ?? newClip.transform.z,
            scale: act.scale ?? newClip.transform.scale,
            rotation: act.rotation ?? newClip.transform.rotation,
            rotationX: act.rotationX ?? newClip.transform.rotationX,
            rotationY: act.rotationY ?? newClip.transform.rotationY,
          };
          if (act.presetId) {
            newClip = applyMotionPresetToClip(newClip, act.presetId);
          }
          if (act.effectType) {
            try {
              newClip.effects.push(createEffectInstance(act.effectType));
            } catch {
              // ignore unknown
            }
          }
          nextClips.push(newClip);
          latestSelected = newClip.id;
        }
      } else if (act.actionType === 'add_effect' && act.effectType && latestSelected) {
        nextClips = nextClips.map((c) => {
          if (c.id !== latestSelected) return c;
          try {
            const fx = createEffectInstance(act.effectType!);
            if (fx.type === 'color') {
              if (act.exposure !== undefined) fx.params.exposure = act.exposure;
              if (act.contrast !== undefined) fx.params.contrast = act.contrast;
              if (act.saturation !== undefined) fx.params.saturation = act.saturation;
            }
            return { ...c, effects: [...c.effects, fx] };
          } catch {
            return c;
          }
        });
      } else if (act.actionType === 'apply_preset' && act.presetId && latestSelected) {
        nextClips = nextClips.map((c) =>
          c.id === latestSelected ? applyMotionPresetToClip(c, act.presetId!) : c
        );
      } else if (act.actionType === 'set_transform_3d' && latestSelected) {
        nextClips = nextClips.map((c) =>
          c.id === latestSelected
            ? {
                ...c,
                is3D: act.is3D ?? true,
                transform: {
                  ...c.transform,
                  x: act.x ?? c.transform.x,
                  y: act.y ?? c.transform.y,
                  z: act.z ?? c.transform.z,
                  scale: act.scale ?? c.transform.scale,
                  rotation: act.rotation ?? c.transform.rotation,
                  rotationX: act.rotationX ?? c.transform.rotationX,
                  rotationY: act.rotationY ?? c.transform.rotationY,
                },
              }
            : c
        );
      }
    }

    commitHistory(tracks, nextClips);
    setSelectedClipId(latestSelected);
    return { summary: data.summary || 'Applied AI Director edits.' };
  };

  const handleToggleTrackFlag = (
    trackId: string,
    flag: 'visible' | 'muted' | 'solo' | 'locked'
  ) => {
    const nextTracks = tracks.map((t) =>
      t.id === trackId ? { ...t, [flag]: !t[flag] } : t
    );
    commitHistory(nextTracks, clips);
  };

  const handleAddTrack = (kind: 'video' | 'audio') => {
    const count = tracks.filter((t) => t.kind === kind).length + 1;
    const newTrack: TimelineTrack = {
      id: `track_${kind[0]}${count}_${Date.now()}`,
      name: `${kind === 'video' ? 'V' : 'A'}${count} · ${
        kind === 'video' ? 'Layer' : 'Audio'
      }`,
      kind,
      muted: false,
      solo: false,
      locked: false,
      visible: true,
      height: 50,
      volumeDb: kind === 'audio' ? 0 : undefined,
      pan: kind === 'audio' ? 0 : undefined,
    };
    const nextTracks =
      kind === 'video' ? [newTrack, ...tracks] : [...tracks, newTrack];
    commitHistory(nextTracks, clips);
  };

  const handleUpdateTrackAudio = (
    trackId: string,
    patch: Partial<
      Pick<
        TimelineTrack,
        'volumeDb' | 'pan' | 'eqLow' | 'eqMid' | 'eqHigh' | 'compressor'
      >
    >
  ) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, ...patch } : t))
    );
  };

  const handleAddMarker = useCallback(
    (time: number) => {
      setMarkers((prev) => [
        ...prev,
        {
          id: `mk_${Date.now()}`,
          time: Number(time.toFixed(2)),
          label: `M${prev.length + 1}`,
          color: '#F59E0B',
        },
      ]);
    },
    []
  );

  const handleSetWorkArea = useCallback(
    (edge: 'in' | 'out', time: number) => {
      setWorkArea((prev) => {
        if (edge === 'in') {
          const nextIn = clamp(Number(time.toFixed(2)), 0, Math.max(0, prev.outTime - 0.2));
          return { ...prev, inTime: nextIn, enabled: true };
        }
        const nextOut = clamp(
          Number(time.toFixed(2)),
          Math.min(timelineEndTime, prev.inTime + 0.2),
          timelineEndTime
        );
        return { ...prev, outTime: nextOut, enabled: true };
      });
    },
    [timelineEndTime]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'v' || e.key === 'V') {
        setTool('select');
      } else if (e.key === 'c' || e.key === 'C') {
        setTool('razor');
      } else if (e.key === 'g' || e.key === 'G') {
        setTool('pen');
      } else if (e.key === 't' || e.key === 'T') {
        handleQuickAddLayer('text');
      } else if (e.key === 'r' || e.key === 'R') {
        handleQuickAddLayer('shape');
      } else if (e.key === 's' || e.key === 'S') {
        setSnapEnabled((s) => !s);
      } else if (e.key === 'y' || e.key === 'Y') {
        setTool('pin');
      } else if (e.key === 'm' || e.key === 'M') {
        if (e.altKey) handleAddMarker(playheadRef.current);
        else setTool('mask');
      } else if (e.key === 'i' || e.key === 'I') {
        handleSetWorkArea('in', playheadRef.current);
      } else if (e.key === 'o' || e.key === 'O') {
        handleSetWorkArea('out', playheadRef.current);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleStepFrame(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleStepFrame(1);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && e.shiftKey) {
        if (selectedClipId) handleRippleDeleteClip(selectedClipId);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) handleDeleteClip(selectedClipId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (selectedClipId) handleDuplicateClip(selectedClipId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedClipId,
    handleDeleteClip,
    handleRippleDeleteClip,
    handleDuplicateClip,
    handleUndo,
    handleRedo,
    handleStepFrame,
    handleQuickAddLayer,
    handleAddMarker,
    handleSetWorkArea,
  ]);

  const handleUpdateFusionGraph = useCallback(
    (clipId: string, graph: import('./types/editor').FusionGraph) => {
      const effectOrder = orderFusionEffectIds(graph);
      const rank = new Map(effectOrder.map((id, index) => [id, index]));
      updateClipById(clipId, (clip) => ({
        ...clip,
        fusionGraph: graph,
        effects: [...clip.effects].sort((a, b) =>
          (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        ),
      }), true);
    },
    [updateClipById]
  );

  const selectedClip = clips.find((c) => c.id === selectedClipId) ?? null;

  return (
    <div
      data-testid="studio-root"
      data-playing={isPlaying ? 'true' : 'false'}
      className="h-screen w-screen flex flex-col bg-[#111215] text-[#E6E8EC] overflow-hidden"
    >
      <TopToolbar
        workspace={workspace}
        onChangeWorkspace={handleChangeWorkspace}
        tool={tool}
        onChangeTool={setTool}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled((s) => !s)}
        onQuickAddLayer={handleQuickAddLayer}
        onSaveProject={handleSaveProject}
        onOpenProjectManager={() => setProjectManagerOpen(true)}
        onLoadProjectFile={handleLoadProjectFile}
        saveBadgeText={saveBadgeText}
        onOpenExport={() => {
          setIsPlaying(false);
          setExportOpen(true);
        }}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onImportMedia={handleImportFiles}
        onImportSrt={handleImportSrt}
        autoSaveEnabled={autoSaveEnabled}
        onToggleAutoSave={() => setAutoSaveEnabled((enabled) => !enabled)}
        onChangeLeftTab={setLeftTab}
        viewLayout={viewLayout}
        onChangeViewLayout={setViewLayout}
        onExportProjectFile={handleExportProjectFile}
        />

      <main className="flex-1 flex min-h-0 overflow-hidden">
        {(() => {
          const dockNode = (
            <ProjectBinPanel
              key="dock-panel"
              assets={assets}
              tracks={tracks}
              allClips={clips}
              selectedClip={selectedClip}
              playheadTime={playheadTime}
              fps={composition.fps}
              activeTab={leftTab}
              onChangeTab={setLeftTab}
              onImportFiles={handleImportFiles}
              onAddAssetToTimeline={(asset) => insertAssetToTimeline(asset)}
              onApplyEffectToSelected={(fxType) => {
                if (selectedClip) handleAddEffect(selectedClip.id, fxType);
              }}
              onUpdateFusionGraph={handleUpdateFusionGraph}
              onAdd3DLayer={(kind) => handleQuickAddLayer(kind)}
              onToggleEffect={(clipId, effectId) =>
                updateClipById(
                  clipId,
                  (c) => ({
                    ...c,
                    effects: c.effects.map((fx) =>
                      fx.id === effectId ? { ...fx, enabled: !fx.enabled } : fx
                    ),
                  }),
                  true
                )
              }
              onRemoveEffect={(clipId, effectId) =>
                updateClipById(
                  clipId,
                  (c) => ({
                    ...c,
                    effects: c.effects.filter((fx) => fx.id !== effectId),
                  }),
                  true
                )
              }
              onToggleMask={(clipId) =>
                updateClipById(
                  clipId,
                  (c) => {
                    const current = c.mask ?? {
                      enabled: false,
                      shape: 'ellipse' as const,
                      x: 0,
                      y: 0,
                      width: 60,
                      height: 60,
                      feather: 12,
                      inverted: false,
                      opacity: 100,
                    };
                    return { ...c, mask: { ...current, enabled: !current.enabled } };
                  },
                  true
                )
              }
              onToggleColorGrade={(clipId) =>
                updateClipById(
                  clipId,
                  (c) => {
                    const current: ColorWheelGrade = c.colorGrade ?? {
                      enabled: false,
                      lift: { r: 0, g: 0, b: 0, luma: 0 },
                      gamma: { r: 0, g: 0, b: 0, luma: 0 },
                      gain: { r: 0, g: 0, b: 0, luma: 0 },
                      temp: 0,
                      tint: 0,
                      contrast: 100,
                      saturation: 100,
                      shadows: 0,
                      highlights: 0,
                      lut: 'None',
                    };
                    return {
                      ...c,
                      colorGrade: { ...current, enabled: !current.enabled },
                    };
                  },
                  true
                )
              }
              onToggle3D={(clipId) =>
                updateClipById(clipId, (c) => ({ ...c, is3D: !c.is3D }), true)
              }
              onApplyCatalogPreset={(item) => { setPreviewPreset(null); handleApplyCatalogPreset(item); }}
              onPreviewCatalogPreset={setPreviewPreset}
              onPreviewSfx={(preset) => audioEngine.previewSfx(preset)}
              onAddSfxToTimeline={handleAddSfxToTimeline}
              onUpdateColorGrade={(clipId, colorGrade: ColorWheelGrade) =>
                updateClipById(clipId, (c) => ({ ...c, colorGrade }))
              }
              onUpdateTrackData={(clipId, trackData: MotionTrackData) =>
                updateClipById(clipId, (c) => ({ ...c, trackData }))
              }
              onApplyTrackToLayer={(sourceClipId, targetClipId) => {
                const src = clips.find((c) => c.id === sourceClipId);
                if (!src?.trackData) return;
                updateClipById(
                  targetClipId,
                  (target) =>
                    applyTrackPointsToTargetClip(target, src.trackData!.points),
                  true
                );
              }}
              onUpdateTrackAudio={handleUpdateTrackAudio}
              onToggleTrackFlag={handleToggleTrackFlag}
              onCreateCaptionClip={() => handleQuickAddLayer('caption')}
              onUpdateCaptions={(clipId, patch) =>
                updateClipById(clipId, (c) => ({
                  ...c,
                  captionProps: c.captionProps ? { ...c.captionProps, ...patch } : undefined,
                }))
              }
              onRunAiPrompt={handleRunAiPrompt}
              onApplyMotionCreatorCurve={handleApplyMotionCreatorCurve}
              panelWidth={panelsSwapped ? rightWidth : leftWidth}
              onSwapDockPanels={() => setPanelsSwapped((s) => !s)}
            />
          );

          const inspectorNode = (
            <EffectControlsPanel
              key="inspector-panel"
              selectedClip={selectedClip}
              allClips={clips}
              playheadTime={playheadTime}
              onUpdateProperty={handleUpdateProperty}
              onUpdateExpression={(clipId, prop, expr) =>
                updateClipById(clipId, (c) => {
                  const next = { ...(c.expressions ?? {}) };
                  if (expr === null) {
                    delete next[prop];
                  } else {
                    next[prop] = expr;
                  }
                  return { ...c, expressions: next };
                }, true)
              }
              onToggleStopwatch={handleToggleStopwatch}
              onToggleKeyframeAtPlayhead={handleToggleKeyframeAtPlayhead}
              onToggle3D={(clipId) =>
                updateClipById(clipId, (c) => ({ ...c, is3D: !c.is3D }), true)
              }
              onSetParent={(clipId, parentId) =>
                updateClipById(clipId, (c) => ({ ...c, parentId }), true)
              }
              onResetTransform={handleResetTransform}
              onUpdateBlendMode={(clipId, blendMode: BlendMode) =>
                updateClipById(clipId, (c) => ({ ...c, blendMode }), true)
              }
              onUpdateTrackMatte={(clipId, trackMatte: TrackMatteMode) =>
                updateClipById(clipId, (c) => ({ ...c, trackMatte }), true)
              }
              onUpdateSpeed={(clipId, patch) =>
                updateClipById(clipId, (c) => ({ ...c, ...patch }), true)
              }
              onUpdateSpeedRamp={(clipId, points) =>
                updateClipById(
                  clipId,
                  (clip) => ({ ...clip, speedRamp: [...points].sort((a, b) => a.time - b.time) }),
                  true
                )
              }
              onFreezeFrame={handleFreezeFrameClip}
              onDuplicateClip={handleDuplicateClip}
              onRippleDeleteClip={handleRippleDeleteClip}
              onUpdateTextProps={(clipId, patch) =>
                updateClipById(clipId, (c) => ({
                  ...c,
                  name: patch.text !== undefined ? patch.text || 'Text' : c.name,
                  textProps: c.textProps ? { ...c.textProps, ...patch } : undefined,
                }))
              }
              onUpdateShapeProps={(clipId, patch) =>
                updateClipById(clipId, (c) => ({
                  ...c,
                  shapeProps: c.shapeProps ? { ...c.shapeProps, ...patch } : undefined,
                }))
              }
              onUpdatePathProps={(clipId, patch) =>
                updateClipById(clipId, (c) => ({
                  ...c,
                  pathProps: c.pathProps ? { ...c.pathProps, ...patch } : undefined,
                }))
              }
              onUpdateSolidProps={(clipId, patch) =>
                updateClipById(clipId, (c) => ({
                  ...c,
                  solidProps: c.solidProps ? { ...c.solidProps, ...patch } : undefined,
                }))
              }
              onUpdateCameraProps={(clipId, patch) =>
                updateClipById(clipId, (c) => ({
                  ...c,
                  cameraProps: c.cameraProps ? { ...c.cameraProps, ...patch } : undefined,
                }))
              }
              onUpdateLightProps={(clipId, patch) =>
                updateClipById(clipId, (c) => ({
                  ...c,
                  lightProps: c.lightProps ? { ...c.lightProps, ...patch } : undefined,
                }))
              }
              onUpdateParticleProps={(clipId, patch) =>
                updateClipById(clipId, (c) => ({
                  ...c,
                  particleProps: c.particleProps ? { ...c.particleProps, ...patch } : undefined,
                }))
              }
              onUpdateVisualizerProps={(clipId, patch) =>
                updateClipById(clipId, (c) => ({
                  ...c,
                  visualizerProps: c.visualizerProps
                    ? { ...c.visualizerProps, ...patch }
                    : undefined,
                }))
              }
              onUpdateAudioProps={(clipId, patch) =>
                updateClipById(clipId, (c) => ({ ...c, ...patch }))
              }
              onAddEffect={handleAddEffect}
              onToggleEffect={(clipId, effectId) =>
                updateClipById(
                  clipId,
                  (c) => ({
                    ...c,
                    effects: c.effects.map((fx) =>
                      fx.id === effectId ? { ...fx, enabled: !fx.enabled } : fx
                    ),
                  }),
                  true
                )
              }
              onUpdateEffectParam={(clipId, effectId, key, value) =>
                updateClipById(clipId, (c) => ({
                  ...c,
                  effects: c.effects.map((fx) =>
                    fx.id === effectId
                      ? { ...fx, params: { ...fx.params, [key]: value } }
                      : fx
                  ),
                }))
              }
              onRemoveEffect={(clipId, effectId) =>
                updateClipById(
                  clipId,
                  (c) => ({
                    ...c,
                    effects: c.effects.filter((fx) => fx.id !== effectId),
                  }),
                  true
                )
              }
              onUpdateMask={(clipId, mask: LayerMask) =>
                updateClipById(clipId, (c) => ({ ...c, mask }))
              }
              onOpenGraphEditor={() => setGraphEditorOpen(true)}
              onDeleteClip={handleDeleteClip}
              panelWidth={panelsSwapped ? leftWidth : rightWidth}
              onSwapDockPanels={() => setPanelsSwapped((s) => !s)}
            />
          );

          return (
            <>
              {panelsSwapped ? inspectorNode : dockNode}

              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize Left Panel"
                onPointerDown={(e) => startResizeDrag('left', e)}
                className="w-1 shrink-0 bg-[#14161A] hover:bg-[#3B82F6] cursor-col-resize transition-colors"
              />

              <ProgramMonitor
                composition={composition}
                tracks={tracks}
                clips={clips}
                playheadTime={playheadTime}
                isPlaying={isPlaying}
                loopEnabled={loopEnabled}
                selectedClipId={selectedClipId}
                tool={tool}
                mediaCache={mediaCache}
                previewPreset={previewPreset}
                viewLayout={viewLayout}
                onChangeViewLayout={setViewLayout}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                onSeek={handleSeek}
                onStepFrame={handleStepFrame}
                onToggleLoop={() => setLoopEnabled((l) => !l)}
                onSelectClip={setSelectedClipId}
                onMoveClipCanvas={handleMoveClipCanvas}
                onSetAnchorCanvas={handleSetAnchorCanvas}
                onTransformClipCanvas={handleUpdateClipTransform}
                onResizeShapeCanvas={handleResizeShapeCanvas}
                onUpdateMaskCanvas={handleUpdateMaskCanvas}
                onCreatePathClip={handleCreatePathClip}
                onUpdateComposition={(patch) =>
                  setComposition((prev) => ({ ...prev, ...patch }))
                }
              />

              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize Right Panel"
                onPointerDown={(e) => startResizeDrag('right', e)}
                className="w-1 shrink-0 bg-[#14161A] hover:bg-[#3B82F6] cursor-col-resize transition-colors"
              />

              {panelsSwapped ? dockNode : inspectorNode}
            </>
          );
        })()}
      </main>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize Timeline Height"
        onPointerDown={(e) => startResizeDrag('timeline', e)}
        className="h-1 shrink-0 bg-[#14161A] hover:bg-[#3B82F6] cursor-row-resize transition-colors"
      />

      <TimelinePanel
        composition={composition}
        tracks={tracks}
        clips={clips}
        playheadTime={playheadTime}
        selectedClipId={selectedClipId}
        tool={tool}
        snapEnabled={snapEnabled}
        markers={markers}
        workArea={workArea}
        onAddMarker={handleAddMarker}
        onRemoveMarker={(id) =>
          setMarkers((prev) => prev.filter((m) => m.id !== id))
        }
        onSetWorkArea={handleSetWorkArea}
        onToggleWorkArea={() =>
          setWorkArea((w) => ({ ...w, enabled: !w.enabled }))
        }
        onSeek={handleSeek}
        onSelectClip={setSelectedClipId}
        onMoveClip={handleMoveClip}
        onTrimClip={handleTrimClip}
        onSplitClip={handleSplitClip}
        onRippleDeleteClip={handleRippleDeleteClip}
        onToggleTrackFlag={handleToggleTrackFlag}
        onAddTrack={handleAddTrack}
        onDropAssetOnTrack={(assetId, trackId, time) => {
          const asset = assets.find((a) => a.id === assetId);
          if (asset) insertAssetToTimeline(asset, trackId, time);
        }}
        onDropEffect={(clipId, effectType) => handleAddEffect(clipId, effectType)}
        onDropPreset={(clipId, item) => handleApplyCatalogPreset(item, clipId)}
        onMoveKeyframe={handleMoveKeyframe}
        onDeleteKeyframe={handleDeleteKeyframe}
        onAddVoiceover={handleAddVoiceoverFile}
        onUpdateKeyframeEasing={(clipId, prop, kfId, easing: EasingType) =>
          updateClipById(
            clipId,
            (c) => updateKeyframeEasing(c, prop, kfId, easing),
            true
          )
        }
        panelHeight={timelineHeight}
      />

      <BezierGraphEditorModal
        isOpen={graphEditorOpen}
        clip={selectedClip}
        onClose={() => setGraphEditorOpen(false)}
        onApplyCurveToProperty={handleApplyCurveToProperty}
        onCreateDefaultCurveKeyframes={handleCreateDefaultCurveKeyframes}
      />

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        composition={composition}
        tracks={tracks}
        clips={clips}
        mediaCache={mediaCache}
        playheadTime={playheadTime}
        workArea={workArea}
      />

      <ProjectManagerModal
        isOpen={projectManagerOpen}
        currentProjectId={currentProjectId}
        currentProjectName={currentProjectName}
        onClose={() => setProjectManagerOpen(false)}
        onNewProject={handleNewEmptyProject}
        onSaveAs={handleSaveProjectAs}
        onOpenProject={handleOpenLibraryProject}
      />

      <ShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
