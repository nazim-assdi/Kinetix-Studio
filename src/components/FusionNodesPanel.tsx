import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GitMerge, Eye, EyeOff, Trash2, Camera, Sun, Link2, Box, X } from 'lucide-react';
import { EffectType, FusionGraph, FusionNode, TimelineClip } from '../types/editor';
import { EFFECT_LIBRARY } from '../engine/timelineOps';
import { addFusionConnection, mergeFusionGraphWithClip } from '../engine/fusionGraph';

interface FusionNodesPanelProps {
  selectedClip: TimelineClip | null;
  onUpdateGraph: (clipId: string, graph: FusionGraph) => void;
  onAddEffect: (clipId: string, type: EffectType) => void;
  onToggleEffect: (clipId: string, effectId: string) => void;
  onRemoveEffect: (clipId: string, effectId: string) => void;
  onToggleMask: (clipId: string) => void;
  onToggleColorGrade: (clipId: string) => void;
  onToggle3D: (clipId: string) => void;
  onAdd3DLayer: (kind: 'camera' | 'light') => void;
}

const NODE_WIDTH = 188;
const NODE_HEIGHT = 88;
const NODE_ACCENTS: Record<FusionNode['type'], string> = {
  'media-in': '#3B82F6', mask: '#F59E0B', 'color-corrector': '#14B8A6', effect: '#8B5CF6',
  'transform-3d': '#A78BFA', camera: '#F59E0B', light: '#FDE047', 'merge-3d': '#C084FC', 'media-out': '#14B8A6',
};
const NODE_LABELS: Record<FusionNode['type'], string> = {
  'media-in': 'Media In', mask: 'Mask', 'color-corrector': 'Color Corrector', effect: 'FX Processor',
  'transform-3d': '3D Transform', camera: '3D Camera Rig', light: '3D Light Rig', 'merge-3d': 'Merge 3D', 'media-out': 'Media Out',
};

export const FusionNodesPanel: React.FC<FusionNodesPanelProps> = ({
  selectedClip, onUpdateGraph, onAddEffect, onToggleEffect, onRemoveEffect,
  onToggleMask, onToggleColorGrade, onToggle3D, onAdd3DLayer,
}) => {
  const [graph, setGraph] = useState<FusionGraph>(() => selectedClip ? mergeFusionGraphWithClip(selectedClip.fusionGraph, selectedClip) : { nodes: [], connections: [] });
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [selectedEffect, setSelectedEffect] = useState<EffectType | ''>('');
  const [error, setError] = useState<string | null>(null);
  const graphRef = useRef(graph);
  const dragRef = useRef<{ nodeId: string; pointerId: number; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);

  useEffect(() => {
    const next = selectedClip ? mergeFusionGraphWithClip(selectedClip.fusionGraph, selectedClip) : { nodes: [], connections: [] };
    setGraph(next);
    graphRef.current = next;
    setPendingSource(null);
  }, [selectedClip?.id, selectedClip?.effects, selectedClip?.mask, selectedClip?.colorGrade, selectedClip?.is3D, selectedClip?.fusionGraph]);

  if (!selectedClip || selectedClip.kind === 'audio') {
    return <div className="p-4 text-center space-y-2"><GitMerge className="w-7 h-7 text-[#4B5261] mx-auto" /><p className="text-xs font-medium text-[#C8CDD6]">Select a Visual Layer for Fusion</p><p className="text-[11px] text-[#7E8594]">Create and connect processing nodes, then add camera and light rigs to the 3D timeline.</p></div>;
  }

  const commitGraph = (next: FusionGraph) => {
    graphRef.current = next;
    setGraph(next);
    onUpdateGraph(selectedClip.id, next);
  };
  const addNode = (type: FusionNode['type'], label = NODE_LABELS[type]) => {
    const id = `${type}:${selectedClip.id}:${Date.now().toString(36)}`;
    const last = graph.nodes.reduce((max, node) => Math.max(max, node.x), 0);
    commitGraph({ ...graph, nodes: [...graph.nodes, { id, type, label, x: Math.max(32, last + 220), y: 90 + (graph.nodes.length % 3) * 122, enabled: true }] });
  };
  const connectPort = (nodeId: string, port: 'input' | 'output') => {
    if (port === 'output') { setPendingSource(nodeId); setError(null); return; }
    if (!pendingSource) return;
    try {
      commitGraph(addFusionConnection(graphRef.current, pendingSource, nodeId));
      setPendingSource(null);
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not connect these nodes.'); }
  };
  const dragStart = (event: React.PointerEvent<HTMLDivElement>, node: FusionNode) => {
    if ((event.target as HTMLElement).closest('button,select,input')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { nodeId: node.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, nodeX: node.x, nodeY: node.y };
  };
  const dragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = { ...graphRef.current, nodes: graphRef.current.nodes.map((node) => node.id === drag.nodeId
      ? { ...node, x: Math.max(8, drag.nodeX + event.clientX - drag.startX), y: Math.max(8, drag.nodeY + event.clientY - drag.startY) }
      : node) };
    graphRef.current = next;
    setGraph(next);
  };
  const dragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    onUpdateGraph(selectedClip.id, graphRef.current);
  };
  const removeConnection = (connectionId: string) => {
    commitGraph({ ...graphRef.current, connections: graphRef.current.connections.filter((edge) => edge.id !== connectionId) });
  };
  const removeNode = (node: FusionNode) => {
    commitGraph({ ...graph, nodes: graph.nodes.filter((item) => item.id !== node.id), connections: graph.connections.filter((edge) => edge.from !== node.id && edge.to !== node.id) });
  };
  const renderNodeAction = (node: FusionNode) => {
    if (node.type === 'mask') return <button type="button" onClick={() => onToggleMask(selectedClip.id)} className="text-[9px] text-[#C8CDD6] hover:text-white">{selectedClip.mask?.enabled ? 'Bypass' : 'Enable'}</button>;
    if (node.type === 'color-corrector') return <button type="button" onClick={() => onToggleColorGrade(selectedClip.id)} className="text-[9px] text-[#C8CDD6] hover:text-white">{selectedClip.colorGrade?.enabled ? 'Bypass' : 'Enable'}</button>;
    if (node.type === 'transform-3d' || node.type === 'merge-3d') return <button type="button" onClick={() => onToggle3D(selectedClip.id)} className="text-[9px] text-[#C8CDD6] hover:text-white">{selectedClip.is3D ? '2D Mode' : 'Enable 3D'}</button>;
    if (node.type === 'effect' && node.effectId) {
      const effect = selectedClip.effects.find((item) => item.id === node.effectId);
      if (!effect) return null;
      return <div className="flex items-center gap-1"><button type="button" onClick={() => onToggleEffect(selectedClip.id, effect.id)} title="Bypass FX" className="text-[#C8CDD6] hover:text-white">{effect.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}</button><button type="button" onClick={() => onRemoveEffect(selectedClip.id, effect.id)} aria-label={`Remove ${effect.name}`} className="text-[#9BA1AD] hover:text-red-400"><Trash2 className="w-3 h-3" /></button></div>;
    }
    if (node.type === 'media-in' || node.type === 'media-out') return <span className="text-[9px] font-mono text-[#6E7685]">{node.type === 'media-in' ? selectedClip.kind.toUpperCase() : 'OUTPUT'}</span>;
    return <button type="button" onClick={() => removeNode(node)} title="Remove graph node" className="text-[#8D95A5] hover:text-red-400"><X className="w-3 h-3" /></button>;
  };

  const graphWidth = Math.max(1120, ...graph.nodes.map((node) => node.x + NODE_WIDTH + 36));
  const graphHeight = Math.max(440, ...graph.nodes.map((node) => node.y + NODE_HEIGHT + 36));
  const positions = new Map(graph.nodes.map((node) => [node.id, node]));

  return (
    <div className="space-y-2.5 p-1" data-testid="fusion-nodes-panel">
      <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5"><GitMerge className="w-3.5 h-3.5 text-[#A78BFA]" /><span className="text-xs font-semibold text-[#E6E8EC]">Fusion Node Graph</span></div><span className="text-[9px] text-[#8D95A5] truncate max-w-[100px]">{selectedClip.name}</span></div>
      <div className="flex flex-wrap gap-1.5">
        <select aria-label="Add FX Node" value={selectedEffect} onChange={(event) => { const type = event.target.value as EffectType | ''; setSelectedEffect(''); if (type) onAddEffect(selectedClip.id, type); }} className="min-w-0 flex-1 bg-[#232730] border border-[#323845] rounded px-2 py-1.5 text-[10px] text-white"><option value="">+ FX Node</option>{EFFECT_LIBRARY.map((effect) => <option key={effect.type} value={effect.type}>{effect.category} · {effect.name}</option>)}</select>
        <button type="button" onClick={() => addNode('transform-3d')} className="px-2 py-1.5 rounded bg-[#272137] text-[10px] text-[#D8CCFF] hover:bg-[#3C2E5E]"><Box className="w-3 h-3 inline mr-1" />3D Transform</button>
        <button type="button" onClick={() => addNode('merge-3d')} className="px-2 py-1.5 rounded bg-[#272137] text-[10px] text-[#D8CCFF] hover:bg-[#3C2E5E]">Merge 3D</button>
        <button type="button" onClick={() => { onAdd3DLayer('camera'); addNode('camera', 'Camera Rig · timeline'); }} className="px-2 py-1.5 rounded bg-[#302719] text-[10px] text-[#FDE68A] hover:bg-[#55401F]"><Camera className="w-3 h-3 inline mr-1" />Camera</button>
        <button type="button" onClick={() => { onAdd3DLayer('light'); addNode('light', 'Light Rig · timeline'); }} className="px-2 py-1.5 rounded bg-[#302719] text-[10px] text-[#FDE68A] hover:bg-[#55401F]"><Sun className="w-3 h-3 inline mr-1" />Light</button>
      </div>
      {pendingSource && <div className="flex items-center justify-between rounded bg-[#17283C] border border-[#2F5E91] p-2 text-[10px] text-[#BFDBFE]"><span>Choose an input port to connect from {graph.nodes.find((node) => node.id === pendingSource)?.label}</span><button type="button" onClick={() => setPendingSource(null)} className="text-[#93C5FD] hover:text-white">Cancel</button></div>}
      {error && <div role="alert" className="rounded bg-[#321B20] border border-[#71313B] p-2 text-[10px] text-[#FCA5A5]">{error}</div>}
      <div className="overflow-auto rounded-lg border border-[#2B303A] bg-[#0B0E13]">
        <div className="relative" style={{ width: graphWidth, height: graphHeight, backgroundImage: 'radial-gradient(rgba(148,163,184,0.2) 1px, transparent 1px)', backgroundSize: '20px 20px' }} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
          <svg className="absolute inset-0" width={graphWidth} height={graphHeight}>
            {graph.connections.map((edge) => { const from = positions.get(edge.from), to = positions.get(edge.to); if (!from || !to) return null; const x1 = from.x + NODE_WIDTH, y1 = from.y + NODE_HEIGHT / 2, x2 = to.x, y2 = to.y + NODE_HEIGHT / 2, bend = Math.max(48, Math.abs(x2 - x1) * 0.45); return <g key={edge.id}><path d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} fill="none" stroke="transparent" strokeWidth="14" style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onClick={() => removeConnection(edge.id)}><title>Click to disconnect this cable</title></path><path d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} fill="none" stroke="#64748B" strokeWidth="2" opacity="0.85" pointerEvents="none" /></g>; })}
          </svg>
          {graph.nodes.map((node) => (
            <div key={node.id} onPointerDown={(event) => dragStart(event, node)} style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT, borderColor: NODE_ACCENTS[node.type] }} className="absolute rounded-lg border bg-[#171B23] shadow-xl select-none touch-none">
              <div className="flex items-center justify-between px-2 py-1 rounded-t-md bg-[#242A35] border-b border-[#303744] cursor-grab active:cursor-grabbing"><span className="text-[10px] font-semibold text-white truncate">{node.label}</span><span className="text-[8px] font-mono text-[#91A0B5]">{NODE_LABELS[node.type]}</span></div>
              <div className="px-2 py-1.5 flex items-center justify-between gap-2">
                <button type="button" onClick={() => connectPort(node.id, 'input')} title="Connect incoming cable" className={`w-4 h-4 rounded-full border ${pendingSource ? 'bg-[#60A5FA] border-white' : 'bg-[#313A49] border-[#64748B]'} hover:bg-[#60A5FA]`}><span className="sr-only">Input port</span></button>
                <div className="flex-1 flex items-center justify-center">{renderNodeAction(node)}</div>
                <button type="button" onClick={() => connectPort(node.id, 'output')} title="Start outgoing cable" className={`w-4 h-4 rounded-full border ${pendingSource === node.id ? 'bg-[#F59E0B] border-white' : 'bg-[#313A49] border-[#64748B]'} hover:bg-[#F59E0B]`}><span className="sr-only">Output port</span></button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-[9px] text-[#748096]"><span>{graph.nodes.length} nodes · {graph.connections.length} connections</span><span><Link2 className="w-3 h-3 inline mr-1" />Connected FX nodes define processing order</span></div>
    </div>
  );
};
