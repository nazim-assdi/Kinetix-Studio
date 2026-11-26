import React, { useMemo, useRef, useState } from 'react';
import {
  FolderOpen,
  Sparkles,
  Plus,
  Upload,
  Search,
  Film,
  Image as ImageIcon,
  Music,
  Type,
  Square,
  Layers,
  Video,
  Sun,
  Crosshair,
  Box,
  PenTool,
  Package,
  Wand2,
  Loader2,
  AlertCircle,
  Palette,
  Volume2,
  GripVertical,
  GitMerge,
  Captions,
  Sliders,
  Sparkle,
  BarChart2,
  ArrowLeftRight,
  Star,
} from 'lucide-react';
import {
  ColorWheelGrade,
  EffectType,
  LeftDockTab,
  MotionPresetItem,
  MotionTrackData,
  PresetCategory,
  PresetPackVendor,
  ProjectAsset,
  TimelineClip,
  TimelineTrack,
} from '../types/editor';
import { EFFECT_LIBRARY } from '../engine/timelineOps';
import { MEGA_CATALOG } from '../data/megaCatalog';
import { DaVinciColorPanel } from './DaVinciColorPanel';
import { MotionTrackerPanel } from './MotionTrackerPanel';
import { FairlightMixerPanel } from './FairlightMixerPanel';
import { FusionNodesPanel } from './FusionNodesPanel';
import { CaptionsPanel } from './CaptionsPanel';
import { SFX_LIBRARY } from '../data/sfxLibrary';

export type { LeftDockTab } from '../types/editor';

interface ProjectBinPanelProps {
  assets: ProjectAsset[];
  tracks: TimelineTrack[];
  allClips: TimelineClip[];
  selectedClip: TimelineClip | null;
  playheadTime: number;
  fps: number;
  activeTab: LeftDockTab;
  onChangeTab: (tab: LeftDockTab) => void;
  onImportFiles: (files: FileList) => void;
  onAddAssetToTimeline: (asset: ProjectAsset) => void;
  onApplyEffectToSelected: (effectType: EffectType) => void;
  onToggleEffect: (clipId: string, effectId: string) => void;
  onRemoveEffect: (clipId: string, effectId: string) => void;
  onToggleMask: (clipId: string) => void;
  onToggleColorGrade: (clipId: string) => void;
  onToggle3D: (clipId: string) => void;
  onApplyCatalogPreset: (item: MotionPresetItem) => void;
  onPreviewCatalogPreset: (item: MotionPresetItem | null) => void;
  onPreviewSfx: (preset: NonNullable<MotionPresetItem['sfxPreset']>) => void;
  onAddSfxToTimeline: (preset: NonNullable<MotionPresetItem['sfxPreset']>) => void;
  onUpdateColorGrade: (clipId: string, grade: ColorWheelGrade) => void;
  onUpdateTrackData: (clipId: string, data: MotionTrackData) => void;
  onApplyTrackToLayer: (sourceClipId: string, targetClipId: string) => void;
  onUpdateTrackAudio: (
    trackId: string,
    patch: Partial<
      Pick<
        TimelineTrack,
        'volumeDb' | 'pan' | 'eqLow' | 'eqMid' | 'eqHigh' | 'compressor'
      >
    >
  ) => void;
  onToggleTrackFlag: (
    trackId: string,
    flag: 'visible' | 'muted' | 'solo' | 'locked'
  ) => void;
  onCreateCaptionClip: () => void;
  onUpdateCaptions: (
    clipId: string,
    patch: Partial<NonNullable<TimelineClip['captionProps']>>
  ) => void;
  onRunAiPrompt: (prompt: string) => Promise<{ summary: string }>;
  onApplyMotionCreatorCurve: (bezier: [number, number, number, number]) => void;
  panelWidth?: number;
  onSwapDockPanels?: () => void;
}

export const ProjectBinPanel: React.FC<ProjectBinPanelProps> = ({
  assets,
  tracks,
  allClips,
  selectedClip,
  playheadTime,
  fps,
  activeTab,
  onChangeTab,
  onImportFiles,
  onAddAssetToTimeline,
  onApplyEffectToSelected,
  onToggleEffect,
  onRemoveEffect,
  onToggleMask,
  onToggleColorGrade,
  onToggle3D,
  onApplyCatalogPreset,
  onPreviewCatalogPreset,
  onPreviewSfx,
  onAddSfxToTimeline,
  onUpdateColorGrade,
  onUpdateTrackData,
  onApplyTrackToLayer,
  onUpdateTrackAudio,
  onToggleTrackFlag,
  onCreateCaptionClip,
  onUpdateCaptions,
  onRunAiPrompt,
  onApplyMotionCreatorCurve,
  panelWidth = 320,
  onSwapDockPanels,
}) => {
  const [query, setQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<'All' | PresetPackVendor>('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | PresetCategory>('All');
  const [packLimit, setPackLimit] = useState(60);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('kinetix_library_favorites_v1') || '[]');
      return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  });
  const [sortMode, setSortMode] = useState<'catalog' | 'name' | 'favorites'>('catalog');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [curve, setCurve] = useState<[number, number, number, number]>([
    0.16, 1, 0.3, 1,
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const filteredAssets = assets.filter((a) => a.name.toLowerCase().includes(q));
  const filteredEffects = EFFECT_LIBRARY.filter(
    (e) =>
      e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
  );

  const toggleFavorite = (id: string) => {
    setFavoriteIds((previous) => {
      const next = previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id];
      try {
        window.localStorage.setItem('kinetix_library_favorites_v1', JSON.stringify(next));
      } catch {
        // Favorites remain available for this session when storage is unavailable.
      }
      return next;
    });
  };

  const filteredPacks = useMemo(() => {
    const source = activeTab === 'sfx' ? SFX_LIBRARY : MEGA_CATALOG;
    const filtered = source.filter(
      (p) =>
        (activeTab !== 'sfx' || Boolean(p.sfxPreset)) &&
        (activeTab !== 'transitions' || p.category === 'Transition') &&
        (activeTab !== 'packs' || p.category !== 'Transition') &&
        (vendorFilter === 'All' || p.vendor === vendorFilter) &&
        (activeTab !== 'packs' || categoryFilter === 'All' || p.category === categoryFilter) &&
        (!favoritesOnly || activeTab === 'sfx' || favoriteIds.includes(p.id)) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.vendor.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q))
    );
    if (sortMode === 'name') return filtered.sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === 'favorites') return filtered.sort((a, b) =>
      Number(favoriteIds.includes(b.id)) - Number(favoriteIds.includes(a.id)) || a.name.localeCompare(b.name)
    );
    return filtered;
  }, [vendorFilter, categoryFilter, q, activeTab, favoritesOnly, favoriteIds, sortMode]);

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiStatus(null);
    try {
      const res = await onRunAiPrompt(aiPrompt.trim());
      setAiStatus(res.summary);
      setAiPrompt('');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI request failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const renderAssetIcon = (asset: ProjectAsset) => {
    switch (asset.kind) {
      case 'video':
        return <Film className="w-3.5 h-3.5 text-[#60A5FA]" />;
      case 'image':
        return <ImageIcon className="w-3.5 h-3.5 text-[#38BDF8]" />;
      case 'audio':
        return <Music className="w-3.5 h-3.5 text-[#14B8A6]" />;
      case 'text':
        return <Type className="w-3.5 h-3.5 text-[#A78BFA]" />;
      case 'shape':
        return <Square className="w-3.5 h-3.5 text-[#818CF8]" />;
      case 'path':
        return <PenTool className="w-3.5 h-3.5 text-[#60A5FA]" />;
      case 'solid':
        return <Box className="w-3.5 h-3.5 text-[#38BDF8]" />;
      case 'null':
        return <Crosshair className="w-3.5 h-3.5 text-[#F59E0B]" />;
      case 'camera':
        return <Video className="w-3.5 h-3.5 text-[#F59E0B]" />;
      case 'light':
        return <Sun className="w-3.5 h-3.5 text-[#FDE047]" />;
      case 'adjustment':
        return <Layers className="w-3.5 h-3.5 text-[#F472B6]" />;
      case 'particles':
        return <Sparkle className="w-3.5 h-3.5 text-[#F59E0B]" />;
      case 'visualizer':
        return <BarChart2 className="w-3.5 h-3.5 text-[#14B8A6]" />;
      case 'caption':
        return <Captions className="w-3.5 h-3.5 text-[#3B82F6]" />;
    }
  };

  const tabs: { id: LeftDockTab; label: string; icon: React.ReactNode }[] = [
    { id: 'bin', label: 'Project', icon: <FolderOpen className="w-3 h-3" /> },
    { id: 'effects', label: 'Effects', icon: <Sparkles className="w-3 h-3" /> },
    { id: 'packs', label: 'Library', icon: <Package className="w-3 h-3" /> },
    { id: 'sfx', label: 'SFX', icon: <Volume2 className="w-3 h-3" /> },
    { id: 'transitions', label: 'Trans.', icon: <ArrowLeftRight className="w-3 h-3" /> },
    { id: 'color', label: 'Color', icon: <Palette className="w-3 h-3" /> },
    { id: 'audio', label: 'Audio', icon: <Sliders className="w-3 h-3" /> },
    { id: 'fusion', label: 'Fusion', icon: <GitMerge className="w-3 h-3" /> },
    { id: 'tracker', label: 'Tracker', icon: <Crosshair className="w-3 h-3" /> },
    { id: 'captions', label: 'Captions', icon: <Captions className="w-3 h-3" /> },
    { id: 'ai', label: 'AI', icon: <Wand2 className="w-3 h-3" /> },
  ];

  const [x1, y1, x2, y2] = curve;

  return (
    <aside
      aria-label="Project Bin, Effects, Packs, DaVinci Color, Fairlight Audio, Fusion, Tracker, Captions, and AI Studio"
      style={{ width: panelWidth }}
      className="shrink-0 bg-[#181A1F] border-x border-[#2B303A] flex flex-col min-h-0"
    >
      {/* Draggable Panel Swap Bar + Studio Tab Matrix */}
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData('application/x-kinetix-panel', 'dock')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (e.dataTransfer.getData('application/x-kinetix-panel') === 'inspector') {
            onSwapDockPanels?.();
          }
        }}
        title="Drag tab bar to swap panel side"
        className="grid grid-cols-4 border-b border-[#2B303A] px-1 pt-1 pb-0.5 gap-0.5 bg-[#14161A] cursor-grab"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChangeTab(tab.id)}
            className={`flex flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-medium rounded border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-[#3B82F6] text-white bg-[#181A1F]'
                : 'border-transparent text-[#9BA1AD] hover:text-white'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Search Bar for Bin / Effects / Packs */}
      {(['bin', 'effects', 'packs', 'sfx', 'transitions'] as LeftDockTab[]).includes(activeTab) && (
        <div className="p-2.5 border-b border-[#242831] flex flex-col gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#6E7685] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPackLimit(60);
              }}
              placeholder={
                activeTab === 'bin'
                  ? 'Search media, PSD, AI, SVG layers...'
                  : activeTab === 'effects'
                  ? `Search ${EFFECT_LIBRARY.length} core AE effects...`
                  : activeTab === 'sfx' ? 'Search procedural SFX...' : activeTab === 'transitions' ? 'Search transitions...' : `Search ${MEGA_CATALOG.length.toLocaleString()} library assets & presets...`
              }
              aria-label="Search dock items"
              className="w-full bg-[#111215] border border-[#2B303A] rounded pl-8 pr-2.5 py-1.5 text-xs text-[#E6E8EC] placeholder:text-[#6E7685] focus:outline-none focus:border-[#3B82F6]"
            />
          </div>

          {activeTab === 'bin' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*,image/*,audio/*,.psd,.ai,.svg"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onImportFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-[#232730] hover:bg-[#2C313D] border border-[#323845] text-xs font-medium text-[#E6E8EC] transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-[#3B82F6]" />
                <span>Import Media / PSD / AI / SVG</span>
              </button>
            </>
          )}

          {activeTab === 'packs' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-[#8D95A5]">
                <span>
                  Showing {Math.min(packLimit, filteredPacks.length).toLocaleString()} of{' '}
                  {filteredPacks.length.toLocaleString()} · {MEGA_CATALOG.length.toLocaleString()} total
                </span>
                <GripVertical className="w-3 h-3 text-[#4B5261]" />
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setFavoritesOnly((value) => !value); setPackLimit(60); }}
                  aria-pressed={favoritesOnly}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border text-[10px] ${favoritesOnly ? 'bg-[#3A2C18] border-[#F59E0B]/50 text-[#FBBF24]' : 'bg-[#111215] border-[#262B34] text-[#9BA1AD] hover:text-white'}`}
                ><Star className="w-3 h-3" /> Favorites ({favoriteIds.length})</button>
                <select
                  aria-label="Sort Library Items"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as 'catalog' | 'name' | 'favorites')}
                  className="flex-1 min-w-0 bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-[10px] text-[#C8CDD6]"
                >
                  <option value="catalog">Catalog Order</option>
                  <option value="name">Name A–Z</option>
                  <option value="favorites">Favorites First</option>
                </select>
              </div>

              <div className="flex items-center gap-1 bg-[#111215] p-0.5 rounded border border-[#262B34] overflow-x-auto">
                {(['All', 'FX'] as const).map(
                  (v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVendorFilter(v)}
                      className={`px-1.5 py-1 text-[10px] font-medium rounded transition-colors whitespace-nowrap ${
                        vendorFilter === v
                          ? 'bg-[#282D37] text-white'
                          : 'text-[#8D95A5] hover:text-white'
                      }`}
                    >
                      {v}
                    </button>
                  )
                )}
              </div>

              {activeTab === 'packs' && <select
                aria-label="Filter Pack Category"
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as 'All' | PresetCategory)
                }
                className="w-full bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-[11px] text-[#C8CDD6] focus:outline-none"
              >
                <option value="All">All Categories ({MEGA_CATALOG.length.toLocaleString()})</option>
                <option value="Titles">Titles &amp; Typography</option>
                <option value="Icons">Vector Icon Kits</option>
                <option value="Frames">Frames &amp; Borders</option>
                <option value="Callouts">Callouts &amp; Labels</option>
                <option value="Dividers">Dividers &amp; Line Accents</option>
                <option value="Captions">Subtitle &amp; Caption Styles</option>
                <option value="Infographics">Infographics &amp; Data Cards</option>
                <option value="Social Kits">Social Media Kits</option>
                <option value="UI Elements">UI Elements &amp; Widgets</option>
                <option value="Decorative">Decorative Overlays</option>
                <option value="Textures">Texture &amp; Finishing Effects</option>
                <option value="Shapes">Vector Shapes</option>
                <option value="Backgrounds">Backgrounds &amp; Solids</option>
                <option value="Particles">Particles &amp; Atmosphere</option>
                <option value="Visualizers">Audio Visualizers</option>
                <option value="Transition">Transitions</option>
                <option value="Animation">Motion Animations</option>
                <option value="Effects">Live Shader Effects</option>
                <option value="Color LUT">Color Looks &amp; LUTs</option>
                <option value="Graphics">Graphics &amp; Motion Packs</option>
                <option value="3D Rig">3D Camera &amp; Light Rigs</option>
              </select>}
            </div>
          )}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
        {activeTab === 'bin' &&
          (filteredAssets.length === 0 ? (
            <p className="text-xs text-[#6E7685] text-center py-6">
              No matching assets.
            </p>
          ) : (
            filteredAssets.map((asset) => (
              <div
                key={asset.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-kinetix-asset', asset.id);
                }}
                className="group flex items-center gap-2.5 p-1.5 rounded bg-[#14161A] hover:bg-[#20242C] border border-[#242831] hover:border-[#343A47] transition-colors"
              >
                <div className="w-11 h-8 rounded bg-[#0E1013] border border-[#262B34] overflow-hidden shrink-0 flex items-center justify-center">
                  {asset.thumbnail ? (
                    <img
                      src={asset.thumbnail}
                      alt={asset.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    renderAssetIcon(asset)
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[#E6E8EC] truncate">
                    {asset.name}
                  </div>
                  <div className="text-[11px] text-[#7E8594] font-mono-tabular">
                    {asset.kind} · {asset.duration.toFixed(1)}s
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onAddAssetToTimeline(asset)}
                  title={`Insert ${asset.name} at playhead`}
                  aria-label={`Insert ${asset.name} to timeline`}
                  className="p-1.5 rounded bg-[#232730] hover:bg-[#3B82F6] text-[#C8CDD6] hover:text-white transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          ))}

        {activeTab === 'effects' && (
          <div className="space-y-1.5">
            {!selectedClip && (
              <div className="p-2.5 rounded bg-[#14161A] border border-[#262B34] text-[11px] text-[#9BA1AD]">
                Select any visual clip on the timeline to apply an effect.
              </div>
            )}
            {filteredEffects.map((fx) => {
              const disabled =
                !selectedClip ||
                selectedClip.kind === 'audio' ||
                selectedClip.kind === 'camera' ||
                selectedClip.kind === 'light';
              const previewItem: MotionPresetItem = {
                id: `core_${fx.type}`, name: fx.name, vendor: 'FX', category: 'Effects',
                description: fx.description, accentColor: '#8B5CF6', effectType: fx.type,
              };
              return (
                <button
                  key={fx.type}
                  type="button"
                  disabled={disabled}
                  draggable={!disabled}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-kinetix-effect', fx.type);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onMouseEnter={() => onPreviewCatalogPreset(previewItem)}
                  onMouseLeave={() => onPreviewCatalogPreset(null)}
                  onClick={() => { onPreviewCatalogPreset(null); onApplyEffectToSelected(fx.type); }}
                  className="w-full text-left p-2 rounded bg-[#14161A] hover:bg-[#21252E] border border-[#262B34] hover:border-[#8B5CF6]/50 disabled:opacity-45 disabled:pointer-events-none transition-colors flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#E6E8EC]">{fx.name}</div>
                    <div className="text-[11px] text-[#7E8594] truncate">{fx.category} · {fx.description}</div>
                    <div className="text-[10px] text-[#60A5FA] mt-1">Live canvas preview · Click to apply</div>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-[#A78BFA] shrink-0 mt-0.5" />
                </button>
              );
            })}
          </div>
        )}

        {(['packs', 'sfx', 'transitions'] as LeftDockTab[]).includes(activeTab) && (
          <div className="space-y-1.5">
            {filteredPacks.slice(0, packLimit).map((preset) => {
              const isFavorite = favoriteIds.includes(preset.id);
              const isAsset = Boolean(preset.assetTemplate || preset.assetTemplates?.length);
              const needsSelectedClip =
                activeTab !== 'sfx' && !isAsset &&
                preset.category !== '3D Rig' &&
                !['Graphics'].includes(preset.category) &&
                !selectedClip;
              return (
                <div
                  key={preset.id}
                  draggable={activeTab !== 'sfx'}
                  onDragStart={(event) => {
                    if (activeTab === 'sfx') return;
                    event.dataTransfer.setData('application/x-kinetix-preset', JSON.stringify(preset));
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onMouseEnter={() => {
                    if (activeTab !== 'sfx' && !isAsset) onPreviewCatalogPreset(preset);
                  }}
                  onMouseLeave={() => onPreviewCatalogPreset(null)}
                  title={activeTab === 'sfx' ? undefined : isAsset ? 'Drag to the timeline or add as a new editable layer' : 'Drag onto a timeline clip to apply'}
                  className="rounded bg-[#14161A] border border-[#262B34] hover:border-[#3B82F6]/60 transition-colors p-2"
                >
                  <div className="flex items-start gap-2">
                    <div className="w-1 self-stretch min-h-8 rounded-full shrink-0" style={{ backgroundColor: preset.accentColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-[#E6E8EC] truncate">{preset.name}</span>
                        {preset.sfxPreset && <Volume2 className="w-3 h-3 text-[#14B8A6] shrink-0" aria-label="Includes SFX" />}
                      </div>
                      <div className="text-[10px] text-[#8D95A5]">{preset.vendor} · {preset.category}</div>
                      <div className="text-[10px] text-[#6E7685] mt-0.5 leading-snug">{preset.description}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(preset.id)}
                        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        aria-pressed={isFavorite}
                        title={isFavorite ? 'Remove favorite' : 'Save favorite'}
                        className={`p-1 rounded hover:bg-[#292D36] ${isFavorite ? 'text-[#FBBF24]' : 'text-[#687182] hover:text-white'}`}
                      ><Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-current' : ''}`} /></button>
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${isAsset ? 'bg-[#17332F] text-[#5EEAD4]' : 'bg-[#232730] text-[#93C5FD]'}`}>{isAsset ? 'ASSET' : 'LIVE'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 pl-3">
                    {activeTab === 'sfx' ? (
                      <>
                        <button type="button" onClick={() => onPreviewSfx(preset.sfxPreset!)} className="px-2 py-1 rounded bg-[#1E3332] hover:bg-[#24504D] text-[10px] text-[#5EEAD4]">Play</button>
                        <button type="button" onClick={() => onAddSfxToTimeline(preset.sfxPreset!)} className="ml-auto px-2.5 py-1 rounded bg-[#26364D] hover:bg-[#31517A] text-[10px] font-semibold text-[#BFDBFE]">Add to Timeline</button>
                      </>
                    ) : (
                      <>
                        {preset.sfxPreset && <button type="button" onClick={() => onPreviewSfx(preset.sfxPreset!)} className="px-2 py-1 rounded bg-[#1E3332] hover:bg-[#24504D] text-[10px] text-[#5EEAD4]">Play SFX</button>}
                        <button
                          type="button"
                          disabled={needsSelectedClip}
                          onClick={() => { onPreviewCatalogPreset(null); onApplyCatalogPreset(preset); }}
                          className="ml-auto px-2.5 py-1 rounded bg-[#26364D] hover:bg-[#31517A] text-[10px] font-semibold text-[#BFDBFE] disabled:opacity-35 disabled:cursor-not-allowed"
                        >{isAsset ? 'Add to Timeline' : 'Apply'}</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredPacks.length > packLimit && (
              <button
                type="button"
                onClick={() => setPackLimit((n) => n + 80)}
                className="w-full py-1.5 rounded bg-[#232730] hover:bg-[#2C313D] text-xs font-medium text-[#93C5FD]"
              >
                Load More Presets ({filteredPacks.length - packLimit} remaining)
              </button>
            )}
          </div>
        )}

        {activeTab === 'color' && (
          <DaVinciColorPanel
            selectedClip={selectedClip}
            playheadTime={playheadTime}
            scopeRefreshKey={`${tracks.map((t) => `${t.id}:${t.visible}:${t.solo}`).join(',')}|${allClips
              .map(
                (c) =>
                  `${c.id}:${c.start}:${c.duration}:${c.transform.x}:${c.transform.y}:${c.transform.opacity}:${c.trackMatte ?? ''}:${c.effects
                    .map((f) => `${f.id}:${f.enabled}:${Object.values(f.params).join(',')}`)
                    .join(';')}`
              )
              .join('|')}`}
            onUpdateColorGrade={onUpdateColorGrade}
          />
        )}

        {activeTab === 'audio' && (
          <FairlightMixerPanel
            tracks={tracks}
            clips={allClips}
            playheadTime={playheadTime}
            onUpdateTrackAudio={onUpdateTrackAudio}
            onToggleTrackFlag={onToggleTrackFlag}
          />
        )}

        {activeTab === 'fusion' && (
          <FusionNodesPanel
            selectedClip={selectedClip}
            onAddEffect={(clipId, fxType) => {
              onApplyEffectToSelected(fxType);
            }}
            onToggleEffect={onToggleEffect}
            onRemoveEffect={onRemoveEffect}
            onToggleMask={onToggleMask}
            onToggleColorGrade={onToggleColorGrade}
            onToggle3D={onToggle3D}
          />
        )}

        {activeTab === 'tracker' && (
          <MotionTrackerPanel
            selectedClip={selectedClip}
            allClips={allClips}
            fps={fps}
            onUpdateTrackData={onUpdateTrackData}
            onApplyTrackToLayer={onApplyTrackToLayer}
          />
        )}

        {activeTab === 'captions' && (
          <CaptionsPanel
            allClips={allClips}
            selectedClip={selectedClip}
            playheadTime={playheadTime}
            onCreateCaptionClip={onCreateCaptionClip}
            onUpdateCaptions={onUpdateCaptions}
          />
        )}

        {activeTab === 'ai' && (
          <div className="space-y-3 p-1">
            {/* AI Director Editing */}
            <form onSubmit={handleAiSubmit} className="space-y-2">
              <div className="text-xs font-semibold text-[#E6E8EC] flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-[#3B82F6]" />
                <span>AI Director &amp; Motion Generator</span>
              </div>
              <textarea
                rows={3}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe an edit, 3D camera move, lighting rig, transition, or kinetic title..."
                aria-label="AI Editing Prompt"
                className="w-full bg-[#111215] border border-[#2B303A] rounded p-2 text-xs text-white placeholder:text-[#6E7685] focus:outline-none focus:border-[#3B82F6] resize-none"
              />
              <button
                type="submit"
                disabled={aiLoading || !aiPrompt.trim()}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 text-xs font-semibold text-white transition-colors"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating Edit...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Run AI Edit</span>
                  </>
                )}
              </button>
            </form>

            {aiStatus && (
              <div className="p-2 rounded bg-[#14B8A6]/10 border border-[#14B8A6]/40 text-[11px] text-[#99F6E4]">
                {aiStatus}
              </div>
            )}
            {aiError && (
              <div className="p-2 rounded bg-[#EF4444]/10 border border-[#EF4444]/40 text-[11px] text-[#FCA5A5] flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{aiError}</span>
              </div>
            )}

            <div className="space-y-1">
              <div className="text-[11px] text-[#8D95A5] font-medium">
                Quick AI Recipes
              </div>
              {[
                'Add a 3D cyber title "FUTURE CUT" with glow and camera push-in',
                'Apply whip pan blur transition and warm rim spot light',
                'Grade selected clip high-contrast cinema with vignette',
              ].map((recipe) => (
                <button
                  key={recipe}
                  type="button"
                  onClick={() => setAiPrompt(recipe)}
                  className="w-full text-left px-2 py-1.5 rounded bg-[#14161A] hover:bg-[#20242C] border border-[#242831] text-[11px] text-[#C8CDD6] leading-snug"
                >
                  {recipe}
                </button>
              ))}
            </div>

            {/* Quick Motion Creator Curve */}
            <div className="pt-2 border-t border-[#262B34] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#E6E8EC]">
                  Quick Bezier Curve
                </span>
                <span className="font-mono-tabular text-[10px] text-[#60A5FA]">
                  ({x1.toFixed(2)}, {y1.toFixed(2)}, {x2.toFixed(2)}, {y2.toFixed(2)})
                </span>
              </div>

              <div className="bg-[#111215] border border-[#2B303A] rounded p-2 flex flex-col items-center gap-2">
                <div className="w-full flex gap-1">
                  {[
                    { label: 'Expo', val: [0.16, 1, 0.3, 1] as [number, number, number, number] },
                    { label: 'Snap', val: [0.2, 0, 0, 1] as [number, number, number, number] },
                    { label: 'Back', val: [0.34, 1.4, 0.64, 1] as [number, number, number, number] },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setCurve(p.val)}
                      className="flex-1 py-1 rounded bg-[#232730] hover:bg-[#2C313D] text-[10px] text-[#C8CDD6]"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={!selectedClip}
                  onClick={() => onApplyMotionCreatorCurve(curve)}
                  className="w-full py-1.5 rounded bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-45 text-[11px] font-semibold text-white transition-colors"
                >
                  Apply Curve to Selected Keyframes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
