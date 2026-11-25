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
  Box,
  Save,
  FolderUp,
  Sparkles,
  BarChart2,
  Captions,
} from 'lucide-react';
import { MediaKind, ToolMode, WorkspacePreset } from '../types/editor';

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
  onQuickAddLayer: (kind: MediaKind) => void;
  onSaveProject: () => void;
  onLoadProjectFile: (file: File) => void;
  saveBadgeText?: string | null;
  onOpenExport: () => void;
  onOpenShortcuts: () => void;
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
  onLoadProjectFile,
  saveBadgeText,
  onOpenExport,
  onOpenShortcuts,
}) => {
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const loadInputRef = React.useRef<HTMLInputElement>(null);

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
      onClick: () => onQuickAddLayer('shape'),
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

      {/* Right: Save, Load, Shortcuts & Export */}
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          ref={loadInputRef}
          type="file"
          accept=".json,.kinetix,.kinetix.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              onLoadProjectFile(f);
              e.target.value = '';
            }
          }}
        />
        {saveBadgeText && (
          <span className="text-[10px] font-mono-tabular text-[#14B8A6] px-1.5 hidden xl:inline">
            {saveBadgeText}
          </span>
        )}
        <button
          type="button"
          onClick={onSaveProject}
          title="Save Project (.kinetix.json + Browser Save)"
          aria-label="Save Project"
          className="flex items-center gap-1 px-2 py-1 rounded bg-[#232730] hover:bg-[#2C313D] border border-[#323845] text-xs font-medium text-[#E6E8EC] transition-colors whitespace-nowrap"
        >
          <Save className="w-3.5 h-3.5 text-[#14B8A6]" />
          <span className="hidden md:inline">Save</span>
        </button>
        <button
          type="button"
          onClick={() => loadInputRef.current?.click()}
          title="Load Project (.kinetix.json)"
          aria-label="Load Project"
          className="flex items-center gap-1 px-2 py-1 rounded bg-[#232730] hover:bg-[#2C313D] border border-[#323845] text-xs font-medium text-[#E6E8EC] transition-colors whitespace-nowrap"
        >
          <FolderUp className="w-3.5 h-3.5 text-[#60A5FA]" />
          <span className="hidden md:inline">Load</span>
        </button>

        <button
          type="button"
          onClick={onOpenShortcuts}
          title="Keyboard Shortcuts"
          aria-label="Keyboard Shortcuts"
          className="p-1.5 rounded text-[#9BA1AD] hover:text-white hover:bg-[#252932] transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export 8K</span>
        </button>
      </div>
    </header>
  );
};
