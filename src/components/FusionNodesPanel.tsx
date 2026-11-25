import React from 'react';
import { GitMerge, Plus, Eye, EyeOff, Trash2 } from 'lucide-react';
import { EffectType, TimelineClip } from '../types/editor';

interface FusionNodesPanelProps {
  selectedClip: TimelineClip | null;
  onAddEffect: (clipId: string, type: EffectType) => void;
  onToggleEffect: (clipId: string, effectId: string) => void;
  onRemoveEffect: (clipId: string, effectId: string) => void;
  onToggleMask: (clipId: string) => void;
  onToggleColorGrade: (clipId: string) => void;
  onToggle3D: (clipId: string) => void;
}

export const FusionNodesPanel: React.FC<FusionNodesPanelProps> = ({
  selectedClip,
  onAddEffect,
  onToggleEffect,
  onRemoveEffect,
  onToggleMask,
  onToggleColorGrade,
  onToggle3D,
}) => {
  if (!selectedClip || selectedClip.kind === 'audio') {
    return (
      <div className="p-4 text-center space-y-2">
        <GitMerge className="w-7 h-7 text-[#4B5261] mx-auto" />
        <p className="text-xs font-medium text-[#C8CDD6]">
          Select Any Visual Layer for Node Graph
        </p>
        <p className="text-[11px] text-[#7E8594]">
          Inspect and bypass MediaIn, Mask, Chroma Key, ColorCorrector, FX, and
          3D Merge nodes in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 p-1" data-testid="fusion-nodes-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GitMerge className="w-3.5 h-3.5 text-[#A78BFA]" />
          <span className="text-xs font-semibold text-[#E6E8EC]">
            Fusion Node Compositor
          </span>
        </div>
        <span className="text-[10px] font-mono-tabular text-[#8D95A5] truncate max-w-[110px]">
          {selectedClip.name}
        </span>
      </div>

      {/* Quick Add Node Bar */}
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            ['chromakey', '+ Chroma Key'],
            ['glow', '+ Glow Node'],
            ['halation', '+ Halation'],
            ['blur', '+ Blur Node'],
          ] as const
        ).map(([fxType, label]) => (
          <button
            key={fxType}
            type="button"
            onClick={() => onAddEffect(selectedClip.id, fxType)}
            className="flex items-center justify-center gap-1 py-1 px-2 rounded bg-[#232730] hover:bg-[#3B82F6] text-[10px] font-medium text-[#E6E8EC] transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>{label.replace('+ ', '')}</span>
          </button>
        ))}
      </div>

      {/* Visual Node Flow Chain */}
      <div className="bg-[#0D0E11] border border-[#262B34] rounded p-3 flex flex-col items-center gap-1.5">
        {/* Node 1: MediaIn */}
        <div className="w-full px-2.5 py-1.5 rounded bg-[#181B22] border border-[#3B82F6] flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#93C5FD]">MediaIn1</span>
          <span className="font-mono-tabular text-[10px] text-[#7E8594]">
            {selectedClip.kind}
          </span>
        </div>
        <div className="w-0.5 h-2.5 bg-[#3B82F6]/60" />

        {/* Node 2: Mask */}
        <button
          type="button"
          onClick={() => onToggleMask(selectedClip.id)}
          className={`w-full px-2.5 py-1.5 rounded border flex items-center justify-between text-[11px] transition-colors ${
            selectedClip.mask?.enabled
              ? 'bg-[#1F1C14] border-[#F59E0B] text-[#FCD34D]'
              : 'bg-[#14161A] border-[#2B303A] text-[#7E8594]'
          }`}
        >
          <span className="font-medium">Polygon / Shape Mask</span>
          <span className="text-[10px] font-mono-tabular">
            {selectedClip.mask?.enabled ? 'ACTIVE' : 'BYPASS'}
          </span>
        </button>
        <div className="w-0.5 h-2.5 bg-[#3B82F6]/60" />

        {/* Node 3: ColorCorrector */}
        <button
          type="button"
          onClick={() => onToggleColorGrade(selectedClip.id)}
          className={`w-full px-2.5 py-1.5 rounded border flex items-center justify-between text-[11px] transition-colors ${
            selectedClip.colorGrade?.enabled
              ? 'bg-[#141D26] border-[#38BDF8] text-[#7DD3FC]'
              : 'bg-[#14161A] border-[#2B303A] text-[#7E8594]'
          }`}
        >
          <span className="font-medium">ColorCorrector1</span>
          <span className="text-[10px] font-mono-tabular">
            {selectedClip.colorGrade?.enabled ? 'ACTIVE' : 'BYPASS'}
          </span>
        </button>

        {/* Dynamic FX Nodes */}
        {selectedClip.effects.map((fx) => (
          <React.Fragment key={fx.id}>
            <div className="w-0.5 h-2.5 bg-[#8B5CF6]/70" />
            <div
              className={`w-full px-2.5 py-1.5 rounded border flex items-center justify-between text-[11px] ${
                fx.enabled
                  ? 'bg-[#1B1726] border-[#8B5CF6] text-[#DDD6FE]'
                  : 'bg-[#14161A] border-[#2B303A] text-[#6E7685]'
              }`}
            >
              <span className="font-medium truncate">{fx.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onToggleEffect(selectedClip.id, fx.id)}
                  aria-label={`Node Toggle ${fx.name}`}
                  className="p-0.5 hover:text-white"
                >
                  {fx.enabled ? (
                    <Eye className="w-3 h-3" />
                  ) : (
                    <EyeOff className="w-3 h-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveEffect(selectedClip.id, fx.id)}
                  aria-label={`Node Delete ${fx.name}`}
                  className="p-0.5 hover:text-[#EF4444]"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </React.Fragment>
        ))}

        <div className="w-0.5 h-2.5 bg-[#3B82F6]/60" />

        {/* Node 4: 3D Merge */}
        <button
          type="button"
          onClick={() => onToggle3D(selectedClip.id)}
          className={`w-full px-2.5 py-1.5 rounded border flex items-center justify-between text-[11px] transition-colors ${
            selectedClip.is3D
              ? 'bg-[#1A1625] border-[#A78BFA] text-[#C4B5FD]'
              : 'bg-[#14161A] border-[#2B303A] text-[#9BA1AD]'
          }`}
        >
          <span className="font-medium">Merge3D / Transform</span>
          <span className="text-[10px] font-mono-tabular">
            {selectedClip.is3D ? '3D SPACE' : '2D FLAT'}
          </span>
        </button>

        <div className="w-0.5 h-2.5 bg-[#14B8A6]/70" />

        {/* Node 5: MediaOut */}
        <div className="w-full px-2.5 py-1.5 rounded bg-[#122220] border border-[#14B8A6] flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#5EEAD4]">MediaOut1</span>
          <span className="font-mono-tabular text-[10px] text-[#99F6E4]">
            MASTER
          </span>
        </div>
      </div>
    </div>
  );
};
