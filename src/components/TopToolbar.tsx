import React, { useState } from 'react';
import {
  MousePointer2,
  Scissors,
  PenTool,
  Type,
  Square,
  Undo2,
  Redo2,
  Magnet,
  Download,
  HelpCircle,
  Film,
  Layers,
  Video,
  Sun,
  Crosshair,
  Scan,
  Box,
  Save,
  FolderUp,
  Sparkles,
  BarChart2,
  Captions,
  Eye,
  Grid,
  Columns2,
  Rows2,
  LayoutGrid,
  Upload,
  FileText,
} from 'lucide-react';
import { LeftDockTab, MediaKind, ShapeLayerProps, ToolMode, ViewLayoutMode, WorkspacePreset } from '../types/editor';

interface TopToolbarProps {
  workspace: WorkspacePreset;
  onChangeWorkspace: (w: WorkspacePreset) => void;
  tool: ToolMode;
  onChangeTool: (t: ToolMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  onQuickAddLayer: (kind: MediaKind, shapeType?: ShapeLayerProps['shapeType']) => void;
  onSaveProject: () => void;
  onOpenProjectManager: () => void;
  onExportProjectFile: () => void;
  onLoadProjectFile: (file: File) => void;
  saveBadgeText?: string | null;
  onOpenExport: () => void;
  onOpenShortcuts: () => void;
  onImportMedia: (files: FileList) => void;
  onImportSrt: (file: File) => void;
  autoSaveEnabled: boolean;
  onToggleAutoSave: () => void;
  onChangeLeftTab: (tab: LeftDockTab) => void;
  viewLayout: ViewLayoutMode;
  onChangeViewLayout: (layout: ViewLayoutMode) => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  workspace,
  onChangeWorkspace,
  tool,
  onChangeTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  snapEnabled,
  onToggleSnap,
  onQuickAddLayer,
  onSaveProject,
  onOpenProjectManager,
  onExportProjectFile,
  onLoadProjectFile,
  saveBadgeText,
  onOpenExport,
  onOpenShortcuts,
  onImportMedia,
  onImportSrt,
  autoSaveEnabled,
  onToggleAutoSave,
  onChangeLeftTab,
  viewLayout,
  onChangeViewLayout,
}) => {
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [selectedShapeType, setSelectedShapeType] = useState<ShapeLayerProps['shapeType']>('rect');
  const [openMenu, setOpenMenu] = useState<'file' | 'effect' | 'view' | null>(null);
  const loadInputRef = React.useRef<HTMLInputElement>(null);
  const mediaInputRef = React.useRef<HTMLInputElement>(null);
  const subtitleInputRef = React.useRef<HTMLInputElement>(null);

  const workspaces: { id: WorkspacePreset; label: string }[] = [
    { id: 'compositing', label: 'Compositing' },
    { id: 'editing', label: 'Editing' },
    { id: 'color', label: 'Color & FX' },
    { id: 'fusion', label: 'Fusion' },
    { id: 'fairlight', label: 'Fairlight' },
    { id: 'motion3d', label: '3D & Cam' },
  ];

  const tools: {
    id: ToolMode;
    label: string;
    shortcut: string;
    icon: React.ReactNode;
    onClick?: () => void;
  }[] = [
    {
      id: 'select',
      label: 'Selection Tool (V)',
      shortcut: 'V',
      icon: <MousePointer2 className="w-3.5 h-3.5" />,
    },
    {
      id: 'razor',
      label: 'Razor Split Tool (C)',
      shortcut: 'C',
      icon: <Scissors className="w-3.5 h-3.5" />,
    },
    {
      id: 'pen',
      label: 'Pen Bezier Path Tool (G)',
      shortcut: 'G',
      icon: <PenTool className="w-3.5 h-3.5" />,
    },
    {
      id: 'pin',
      label: 'Anchor / Pin Tool (Y)',
      shortcut: 'Y',
      icon: <Crosshair className="w-3.5 h-3.5" />,
    },
    {
      id: 'mask',
      label: 'Mask Tool (M)',
      shortcut: 'M',
      icon: <Scan className="w-3.5 h-3.5" />,
    },
    {
      id: 'text',
      label: 'Add Kinetic Text Layer (T)',
      shortcut: 'T',
      icon: <Type className="w-3.5 h-3.5" />,
      onClick: () => onQuickAddLayer('text'),
    },
    {
      id: 'shape',
      label: 'Add Vector Shape Layer (R)',
      shortcut: 'R',
      icon: <Square className="w-3.5 h-3.5" />,
      onClick: () => onQuickAddLayer('shape', selectedShapeType),
    },
  ];

  const layerOptions: { kind: MediaKind; label: string; icon: React.ReactNode }[] = [
    { kind: 'text', label: 'Text Layer', icon: <Type className="w-3.5 h-3.5 text-[#A78BFA]" /> },
    { kind: 'shape', label: 'Shape Layer', icon: <Square className="w-3.5 h-3.5 text-[#818CF8]" /> },
    { kind: 'solid', label: 'Solid Matte', icon: <Box className="w-3.5 h-3.5 text-[#38BDF8]" /> },
    { kind: 'null', label: 'Null Object', icon: <Crosshair className="w-3.5 h-3.5 text-[#F59E0B]" /> },
    { kind: 'adjustment', label: 'Adjustment Layer', icon: <Layers className="w-3.5 h-3.5 text-[#F472B6]" /> },
    { kind: 'camera', label: '3D Camera', icon: <Video className="w-3.5 h-3.5 text-[#F59E0B]" /> },
    { kind: 'light', label: '3D Light', icon: <Sun className="w-3.5 h-3.5 text-[#FDE047]" /> },
    { kind: 'particles', label: 'CC Particle World', icon: <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" /> },
    { kind: 'visualizer', label: 'Audio Visualizer', icon: <BarChart2 className="w-3.5 h-3.5 text-[#14B8A6]" /> },
    { kind: 'caption', label: 'Captions / SRT Track', icon: <Captions className="w-3.5 h-3.5 text-[#60A5FA]" /> },
  ];

  return (
    <header className="h-12 shrink-0 bg-[#181A1F] border-b border-[#2B303A] px-2.5 flex items-center justify-between gap-2 select-none relative z-40">
      <input ref={loadInputRef} type="file" accept=".json,.kinetix,.kinetix.json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) onLoadProjectFile(file); e.currentTarget.value = ''; }} />
      <input ref={mediaInputRef} type="file" multiple accept="video/*,image/*,audio/*,.psd,.ai,.svg,.srt" className="hidden" onChange={(e) => { if (e.currentTarget.files?.length) onImportMedia(e.currentTarget.files); e.currentTarget.value = ''; }} />
      <input ref={subtitleInputRef} type="file" accept=".srt,application/x-subrip,text/plain" className="hidden" onChange={(e) => { const file = e.currentTarget.files?.[0]; if (file) onImportSrt(file); e.currentTarget.value = ''; }} />

      {/* Left: Brand & Workspaces */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
          <div className="w-6 h-6 rounded bg-[#3B82F6] flex items-center justify-center text-white">
            <Film className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold tracking-tight text-[#E6E8EC]">
            Kinetix Studio
          </span>
        </div>

        <div className="h-4 w-px bg-[#2B303A] shrink-0" />

        <nav aria-label="Application Menus" className="flex items-center gap-0.5 shrink-0">
          <div className="relative">
            <button type="button" onClick={() => setOpenMenu((m) => m === 'file' ? null : 'file')} aria-expanded={openMenu === 'file'} className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${openMenu === 'file' ? 'bg-[#303642] text-white' : 'text-[#C8CDD6] hover:bg-[#252932] hover:text-white'}`}>File</button>
            {openMenu === 'file' && (
              <div role="menu" aria-label="File Menu" className="absolute left-0 top-full mt-1 w-64 max-h-[70vh] overflow-y-auto rounded-md border border-[#303744] bg-[#181A1F] p-1.5 shadow-2xl z-[200]">
                <button type="button" role="menuitem" onClick={() => { onSaveProject(); setOpenMenu(null); }} className="w-full flex items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-[#E6E8EC] hover:bg-[#252B35]"><Save className="h-3.5 w-3.5 text-[#14B8A6]" />Save Project</button>
                <button type="button" role="menuitem" onClick={() => { onOpenProjectManager(); setOpenMenu(null); }} className="w-full flex items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-[#E6E8EC] hover:bg-[#252B35]"><FolderUp className="h-3.5 w-3.5 text-[#60A5FA]" />Project Manager / Folders</button>
                <button type="button" role="menuitem" onClick={() => { loadInputRef.current?.click(); setOpenMenu(null); }} className="w-full flex items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-[#E6E8EC] hover:bg-[#252B35]"><FolderUp className="h-3.5 w-3.5 text-[#60A5FA]" />Import Project File (.kinetix.json)</button>
                <button type="button" role="menuitem" onClick={() => { mediaInputRef.current?.click(); setOpenMenu(null); }} className="w-full flex items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-[#E6E8EC] hover:bg-[#252B35]"><Upload className="h-3.5 w-3.5 text-[#60A5FA]" />Import Media / PSD / AI / SVG</button>
                <button type="button" role="menuitem" onClick={() => { subtitleInputRef.current?.click(); setOpenMenu(null); }} className="w-full flex items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-[#E6E8EC] hover:bg-[#252B35]"><Captions className="h-3.5 w-3.5 text-[#93C5FD]" />Import SRT Subtitles</button>
                <div className="my-1 border-t border-[#2B303A]" />
                <button type="button" role="menuitem" onClick={() => { onExportProjectFile(); setOpenMenu(null); }} className="w-full flex items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-[#E6E8EC] hover:bg-[#252B35]"><FileText className="h-3.5 w-3.5 text-[#A78BFA]" />Export Project File (.kinetix.json)</button>
                <button type="button" role="menuitem" onClick={() => { onOpenExport(); setOpenMenu(null); }} className="w-full flex items-center gap-2 rounded px-2.5 py-2 text-left text-xs text-[#E6E8EC] hover:bg-[#252B35]"><Film className="h-3.5 w-3.5 text-[#3B82F6]" />Render / Export Video</button>
                <div className="my-1 border-t border-[#2B303A]" />
                <button type="button" role="menuitemcheckbox" aria-checked={autoSaveEnabled} onClick={onToggleAutoSave} className="w-full flex items-center justify-between rounded px-2.5 py-2 text-left text-xs text-[#E6E8EC] hover:bg-[#252B35]"><span>Auto Save</span><span className={autoSaveEnabled ? 'text-[#34D399]' : 'text-[#9BA1AD]'}>{autoSaveEnabled ? 'On' : 'Off'}</span></button>
              </div>
            )}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setOpenMenu((m) => m === 'effect' ? null : 'effect')} aria-expanded={openMenu === 'effect'} className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${openMenu === 'effect' ? 'bg-[#303642] text-white' : 'text-[#C8CDD6] hover:bg-[#252932] hover:text-white'}`}>Effect</button>
            {openMenu === 'effect' && (
              <div role="menu" aria-label="Effect Menu" className="absolute left-0 top-full mt-1 w-48 rounded-md border border-[#303744] bg-[#181A1F] p-1 shadow-2xl z-[80]">
                {([
                  ['effects', 'Core Effects'], ['packs', 'FX Library'], ['sfx', 'SFX Library'], ['transitions', 'Transitions'],
                ] as [LeftDockTab, string][]).map(([tab, label]) => (
                  <button key={tab} type="button" role="menuitem" onClick={() => { onChangeLeftTab(tab); setOpenMenu(null); }} className="w-full rounded px-2.5 py-2 text-left text-xs text-[#E6E8EC] hover:bg-[#252B35]">{label}</button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setOpenMenu((m) => m === 'view' ? null : 'view')} aria-expanded={openMenu === 'view'} className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${openMenu === 'view' ? 'bg-[#303642] text-white' : 'text-[#C8CDD6] hover:bg-[#252932] hover:text-white'}`}>View</button>
            {openMenu === 'view' && (
              <div role="menu" aria-label="View Menu" className="absolute left-0 top-full mt-1 w-48 rounded-md border border-[#303744] bg-[#181A1F] p-1 shadow-2xl z-[80]">
                {([
                  ['1-view', 'Single View', <Eye className="h-3.5 w-3.5" />],
                  ['2-views-h', 'Two Views Horizontal', <Columns2 className="h-3.5 w-3.5" />],
                  ['2-views-v', 'Two Views Vertical', <Rows2 className="h-3.5 w-3.5" />],
                  ['4-views', 'Quad View', <LayoutGrid className="h-3.5 w-3.5" />],
                ] as [ViewLayoutMode, string, React.ReactNode][]).map(([layout, label, icon]) => (
                  <button key={layout} type="button" role="menuitemradio" aria-checked={viewLayout === layout} onClick={() => { onChangeViewLayout(layout); setOpenMenu(null); }} className={`w-full flex items-center gap-2 rounded px-2.5 py-2 text-left text-xs hover:bg-[#252B35] ${viewLayout === layout ? 'text-[#93C5FD]' : 'text-[#E6E8EC]'}`}>{icon}{label}</button>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="h-4 w-px bg-[#2B303A] shrink-0" />

        <nav
          aria-label="Workspace Presets"
          className="flex items-center gap-0.5 bg-[#111215] p-0.5 rounded-md border border-[#262B34]"
        >
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => onChangeWorkspace(ws.id)}
              className={`px-1.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                workspace === ws.id
                  ? 'bg-[#282D37] text-white'
                  : 'text-[#9BA1AD] hover:text-[#E6E8EC]'
              }`}
            >
              {ws.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Center: Primary Tools + New AE Layer Menu */}
      <div className="flex items-center gap-2">
        <div
          role="toolbar"
          aria-label="Editing Tools"
          className="flex items-center gap-1 bg-[#111215] p-0.5 rounded-md border border-[#262B34]"
        >
          {tools.map((t) => {
            const active = tool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                title={t.label}
                aria-label={t.label}
                aria-pressed={active}
                onClick={() => {
                  onChangeTool(t.id);
                  t.onClick?.();
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#3B82F6] text-white'
                    : 'text-[#9BA1AD] hover:text-white hover:bg-[#202329]'
                }`}
              >
                {t.icon}
                <span className="hidden lg:inline">{t.shortcut}</span>
              </button>
            );
          })}
          <select aria-label="New Shape Type" title="Choose the vector shape to add" value={selectedShapeType}
            onChange={(event) => setSelectedShapeType(event.target.value as ShapeLayerProps['shapeType'])}
            className="max-w-[118px] bg-[#111215] border border-[#2B303A] rounded px-1.5 py-1 text-[10px] text-[#C8CDD6] focus:outline-none">
            <option value="rect">Rectangle</option><option value="rounded-rect">Rounded rectangle</option><option value="circle">Circle</option><option value="ellipse">Ellipse</option>
            <option value="triangle">Triangle</option><option value="diamond">Diamond</option><option value="pentagon">Pentagon</option><option value="hexagon">Hexagon</option>
            <option value="heptagon">Heptagon</option><option value="octagon">Octagon</option><option value="star">Star</option><option value="star-6">Six-point star</option>
            <option value="burst">Burst</option><option value="heart">Heart</option><option value="arrow">Arrow</option><option value="chevron">Chevron</option>
            <option value="cross">Cross</option><option value="plus">Plus</option><option value="minus">Minus</option><option value="trapezoid">Trapezoid</option>
            <option value="parallelogram">Parallelogram</option><option value="speech-bubble">Speech bubble</option><option value="cloud">Cloud</option><option value="lightning">Lightning</option>
            <option value="line">Line</option><option value="lower-third">Lower third</option><option value="ring">Ring</option><option value="polygon">Polygon</option>
          </select>
        </div>

        {/* + New Layer Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setLayerMenuOpen((o) => !o)}
            aria-expanded={layerMenuOpen}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#232730] hover:bg-[#2C313D] border border-[#323845] text-xs font-medium text-[#E6E8EC] whitespace-nowrap shrink-0"
          >
            <Layers className="w-3.5 h-3.5 text-[#8B5CF6]" />
            <span>+ Layer</span>
          </button>

          {layerMenuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full mt-1 w-48 bg-[#181A1F] border border-[#2B303A] rounded-md shadow-2xl py-1 z-50"
            >
              {layerOptions.map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onQuickAddLayer(opt.kind);
                    setLayerMenuOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs text-[#E6E8EC] hover:bg-[#252932] flex items-center gap-2"
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-[#2B303A]" />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="p-1.5 rounded text-[#9BA1AD] hover:text-white hover:bg-[#252932] disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            className="p-1.5 rounded text-[#9BA1AD] hover:text-white hover:bg-[#252932] disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleSnap}
            title="Toggle Timeline Snapping (S)"
            aria-label="Toggle Timeline Snapping"
            aria-pressed={snapEnabled}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              snapEnabled
                ? 'bg-[#252932] text-[#3B82F6] border border-[#3B82F6]/40'
                : 'text-[#9BA1AD] hover:text-white hover:bg-[#252932] border border-transparent'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Snap</span>
          </button>
        </div>
      </div>

      {/* Right: Save status and shortcuts */}
      <div className="flex items-center gap-1.5 shrink-0">
        {saveBadgeText && <span className="text-[10px] font-mono-tabular text-[#14B8A6] px-1.5 hidden xl:inline">{saveBadgeText}</span>}
        <button type="button" onClick={onOpenShortcuts} title="Keyboard Shortcuts" aria-label="Keyboard Shortcuts" className="p-1.5 rounded text-[#9BA1AD] hover:text-white hover:bg-[#252932] transition-colors"><HelpCircle className="w-4 h-4" /></button>
            </div>
    </header>
  );
};
