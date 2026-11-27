import { FusionConnection, FusionGraph, FusionNode, TimelineClip } from '../types/editor';

function nodeId(clipId: string, type: string): string {
  return `${type}:${clipId}`;
}

export function createDefaultFusionGraph(clip: TimelineClip): FusionGraph {
  const nodes: FusionNode[] = [
    { id: nodeId(clip.id, 'media-in'), type: 'media-in', label: 'Media In', x: 24, y: 142, enabled: true },
    { id: nodeId(clip.id, 'mask'), type: 'mask', label: 'Layer Mask', x: 242, y: 44, enabled: Boolean(clip.mask?.enabled) },
    { id: nodeId(clip.id, 'color-corrector'), type: 'color-corrector', label: 'Color Corrector', x: 242, y: 238, enabled: Boolean(clip.colorGrade?.enabled) },
  ];
  clip.effects.forEach((effect, index) => nodes.push({
    id: `effect:${effect.id}`, type: 'effect', label: effect.name,
    x: 490 + Math.floor(index / 3) * 228, y: 28 + (index % 3) * 142,
    enabled: effect.enabled, effectId: effect.id,
  }));
  if (clip.is3D) {
    nodes.push({ id: nodeId(clip.id, 'transform-3d'), type: 'transform-3d', label: '3D Transform', x: 740, y: 238, enabled: true });
    nodes.push({ id: nodeId(clip.id, 'merge-3d'), type: 'merge-3d', label: 'Merge 3D', x: 966, y: 142, enabled: true });
  }
  nodes.push({ id: nodeId(clip.id, 'media-out'), type: 'media-out', label: 'Media Out', x: clip.is3D ? 1190 : 966, y: 142, enabled: true });
  const chain = [nodes[0], ...nodes.slice(1, -1).sort((a, b) => a.x - b.x || a.y - b.y), nodes[nodes.length - 1]];
  const connections: FusionConnection[] = [];
  for (let index = 0; index < chain.length - 1; index++) connections.push({
    id: `edge:${chain[index].id}->${chain[index + 1].id}`, from: chain[index].id, to: chain[index + 1].id,
  });
  return { nodes, connections };
}

export function mergeFusionGraphWithClip(graph: FusionGraph | undefined, clip: TimelineClip): FusionGraph {
  const fallback = createDefaultFusionGraph(clip);
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.connections)) return fallback;
  const kept = graph.nodes.filter((node) => node.type !== 'effect' || clip.effects.some((effect) => effect.id === node.effectId));
  const byId = new Map(kept.map((node) => [node.id, node]));
  for (const node of fallback.nodes) if (!byId.has(node.id)) kept.push(node);
  for (const node of kept) {
    if (node.type === 'effect' && node.effectId) {
      const effect = clip.effects.find((item) => item.id === node.effectId);
      if (effect) { node.label = effect.name; node.enabled = effect.enabled; }
    }
    if (node.type === 'mask') node.enabled = Boolean(clip.mask?.enabled);
    if (node.type === 'color-corrector') node.enabled = Boolean(clip.colorGrade?.enabled);
    if (node.type === 'transform-3d') node.enabled = clip.is3D;
  }
  const ids = new Set(kept.map((node) => node.id));
  const connections = graph.connections.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  const edgeKeys = new Set(connections.map((edge) => `${edge.from}->${edge.to}`));
  for (const edge of fallback.connections) {
    const key = `${edge.from}->${edge.to}`;
    if (!edgeKeys.has(key) && ids.has(edge.from) && ids.has(edge.to)) connections.push(edge);
  }
  return { nodes: kept, connections };
}

export function wouldCreateFusionCycle(graph: FusionGraph, from: string, to: string): boolean {
  if (from === to) return true;
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.connections) adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  const stack = [to], visited = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === from) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

export function orderFusionEffectIds(graph: FusionGraph): string[] {
  const edges = new Map<string, string[]>();
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const connection of graph.connections) {
    edges.set(connection.from, [...(edges.get(connection.from) ?? []), connection.to]);
    indegree.set(connection.to, (indegree.get(connection.to) ?? 0) + 1);
  }
  const queue = graph.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).sort((a, b) => a.y - b.y || a.x - b.x);
  const ordered: FusionNode[] = [];
  while (queue.length) {
    const node = queue.shift()!;
    ordered.push(node);
    for (const nextId of edges.get(node.id) ?? []) {
      const nextDepth = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, nextDepth);
      if (nextDepth === 0) {
        const next = graph.nodes.find((item) => item.id === nextId);
        if (next) { queue.push(next); queue.sort((a, b) => a.y - b.y || a.x - b.x); }
      }
    }
  }
  const visited = new Set(ordered.map((node) => node.id));
  ordered.push(...graph.nodes.filter((node) => !visited.has(node.id)).sort((a, b) => a.y - b.y || a.x - b.x));
  return ordered.filter((node) => node.type === 'effect' && node.effectId).map((node) => node.effectId!);
}

export function addFusionConnection(graph: FusionGraph, from: string, to: string): FusionGraph {
  if (!graph.nodes.some((node) => node.id === from) || !graph.nodes.some((node) => node.id === to)) {
    throw new Error('Both node ports must exist before connecting them.');
  }
  if (graph.connections.some((edge) => edge.from === from && edge.to === to)) return graph;
  if (wouldCreateFusionCycle(graph, from, to)) throw new Error('That connection would create a feedback loop.');
  return { ...graph, connections: [...graph.connections, { id: `edge:${from}->${to}`, from, to } ] };
}
