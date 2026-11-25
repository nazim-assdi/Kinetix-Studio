import React, { useEffect, useRef, useState } from 'react';
import { X, Activity, Play, Pause, Sparkles, Move } from 'lucide-react';
import { AnimatableProperty, TimelineClip } from '../types/editor';
import { solveCubicBezier } from '../engine/keyframes';

interface BezierGraphEditorModalProps {
  isOpen: boolean;
  clip: TimelineClip | null;
  onClose: () => void;
  onApplyCurveToProperty: (
    clipId: string,
    prop: AnimatableProperty,
    keyframeIndex: number | 'all',
    bezier: [number, number, number, number]
  ) => void;
  onCreateDefaultCurveKeyframes: (
    clipId: string,
    prop: AnimatableProperty,
    bezier: [number, number, number, number]
  ) => void;
}

const PROPERTY_LABELS: Record<AnimatableProperty, string> = {
  x: 'Position X',
  y: 'Position Y',
  z: 'Position Z',
  anchorX: 'Anchor X',
  anchorY: 'Anchor Y',
  scale: 'Scale',
  rotation: 'Z Rotation',
  rotationX: 'X Rotation',
  rotationY: 'Y Rotation',
  opacity: 'Opacity',
  shapeWidth: 'Shape Width',
  shapeHeight: 'Shape Height',
};

const PRESET_CURVES: { label: string; bezier: [number, number, number, number] }[] = [
  { label: 'Linear', bezier: [0, 0, 1, 1] },
  { label: 'Ease', bezier: [0.25, 0.1, 0.25, 1] },
  { label: 'Ease In', bezier: [0.42, 0, 1, 1] },
  { label: 'Ease Out', bezier: [0, 0, 0.58, 1] },
  { label: 'Expo Snap', bezier: [0.16, 1, 0.3, 1] },
  { label: 'Overshoot', bezier: [0.34, 1.4, 0.64, 1] },
];

export const BezierGraphEditorModal: React.FC<BezierGraphEditorModalProps> = ({
  isOpen,
  clip,
  onClose,
  onApplyCurveToProperty,
  onCreateDefaultCurveKeyframes,
}) => {
  const [selectedProp, setSelectedProp] = useState<AnimatableProperty>('scale');
  const [segmentIdx, setSegmentIdx] = useState<number>(0);
  const [curve, setCurve] = useState<[number, number, number, number]>([
    0.16, 1, 0.3, 1,
  ]);
  const [draggingHandle, setDraggingHandle] = useState<'p1' | 'p2' | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [previewT, setPreviewT] = useState(0);
  const [winPos, setWinPos] = useState<{ x: number; y: number }>({ x: 340, y: 92 });
  const dragWinRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Sync selected property with first keyframed property on clip
  useEffect(() => {
    if (!clip) return;
    const keys = Object.keys(clip.keyframes) as AnimatableProperty[];
    const firstWithKfs = keys.find((k) => (clip.keyframes[k]?.length ?? 0) >= 2);
    if (firstWithKfs) {
      setSelectedProp(firstWithKfs);
      setSegmentIdx(0);
      const kf = clip.keyframes[firstWithKfs]?.[0];
      if (kf?.bezier) setCurve(kf.bezier);
    }
  }, [clip?.id]);

  // Sync curve from selected keyframe segment
  useEffect(() => {
    if (!clip) return;
    const kfs = clip.keyframes[selectedProp] ?? [];
    const kf = kfs[segmentIdx];
    if (kf?.bezier) {
      setCurve(kf.bezier);
    } else if (kf?.easing === 'linear') {
      setCurve([0, 0, 1, 1]);
    } else if (kf?.easing === 'ease-in') {
      setCurve([0.42, 0, 1, 1]);
    } else if (kf?.easing === 'ease-out') {
      setCurve([0, 0, 0.58, 1]);
    } else if (kf?.easing === 'ease-in-out') {
      setCurve([0.42, 0, 0.58, 1]);
    } else if (kf?.easing === 'overshoot') {
      setCurve([0.34, 1.4, 0.64, 1]);
    }
  }, [clip, selectedProp, segmentIdx]);

  // Animated curve dot loop
  useEffect(() => {
    if (!isOpen || !previewPlaying) return;
    let rafId = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const elapsed = ((now - start) / 1400) % 1;
      setPreviewT(elapsed);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen, previewPlaying]);

  if (!isOpen || !clip) return null;

  const kfs = clip.keyframes[selectedProp] ?? [];
  const hasSegments = kfs.length >= 2;
  const [x1, y1, x2, y2] = curve;

  // Graph coordinate mapping inside 360x260 viewBox
  // Active [0..1] unit square sits in x:[50..310] (w=260), y:[210..50] (h=160)
  const gx0 = 50;
  const gw = 260;
  const gy0 = 210; // y=0
  const gh = 160; // y=1 at gy0 - gh = 50

  const toSvgX = (nx: number) => gx0 + nx * gw;
  const toSvgY = (ny: number) => gy0 - ny * gh;

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingHandle || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * 360;
    const svgY = ((e.clientY - rect.top) / rect.height) * 260;

    const nx = Math.max(0, Math.min(1, Number(((svgX - gx0) / gw).toFixed(3))));
    const ny = Math.max(
      -0.35,
      Math.min(1.35, Number(((gy0 - svgY) / gh).toFixed(3)))
    );

    if (draggingHandle === 'p1') {
      setCurve([nx, ny, x2, y2]);
    } else {
      setCurve([x1, y1, nx, ny]);
    }
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingHandle) {
      try {
        svgRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setDraggingHandle(null);
      if (hasSegments) {
        onApplyCurveToProperty(clip.id, selectedProp, segmentIdx, curve);
      }
    }
  };

  const easedPreviewY = solveCubicBezier(previewT, x1, y1, x2, y2);

  // Build speed bell curve path (derivative approximation)
  const speedPoints: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t0 = Math.max(0, i / 40 - 0.01);
    const t1 = Math.min(1, i / 40 + 0.01);
    const v0 = solveCubicBezier(t0, x1, y1, x2, y2);
    const v1 = solveCubicBezier(t1, x1, y1, x2, y2);
    const deriv = Math.min(3.2, Math.max(0, (v1 - v0) / Math.max(0.001, t1 - t0)));
    const sx = toSvgX(i / 40);
    const sy = gy0 - (deriv / 3.2) * (gh * 0.72);
    speedPoints.push(`${i === 0 ? 'M' : 'L'} ${sx.toFixed(1)} ${sy.toFixed(1)}`);
  }

  return (
    <div
      role="dialog"
      aria-label="Bezier Graph Editor"
      data-testid="bezier-graph-editor"
      style={{ left: winPos.x, top: winPos.y }}
      className="fixed z-50 w-[440px] bg-[#181A1F] border border-[#323845] rounded-lg shadow-2xl overflow-hidden select-none"
    >
      {/* Draggable Title Bar */}
      <div
        onPointerDown={(e) => {
          dragWinRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: winPos.x,
            origY: winPos.y,
          };
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragWinRef.current) return;
          const dx = e.clientX - dragWinRef.current.startX;
          const dy = e.clientY - dragWinRef.current.startY;
          setWinPos({
            x: Math.max(16, Math.min(window.innerWidth - 450, dragWinRef.current.origX + dx)),
            y: Math.max(48, Math.min(window.innerHeight - 400, dragWinRef.current.origY + dy)),
          });
        }}
        onPointerUp={(e) => {
          if (dragWinRef.current) {
            try {
              (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
            } catch {
              // ignore
            }
            dragWinRef.current = null;
          }
        }}
        className="h-9 px-3 bg-[#14161A] border-b border-[#2B303A] flex items-center justify-between cursor-move"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Move className="w-3.5 h-3.5 text-[#8B5CF6] shrink-0" />
          <span className="text-xs font-semibold text-[#E6E8EC] truncate">
            Bezier Graph Editor · {clip.name}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Graph Editor"
          className="p-1 rounded text-[#9BA1AD] hover:text-white hover:bg-[#232730]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Property & Segment Selector */}
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-[#8D95A5] block mb-1">
              Target Property
            </label>
            <select
              aria-label="Graph Property"
              value={selectedProp}
              onChange={(e) => {
                setSelectedProp(e.target.value as AnimatableProperty);
                setSegmentIdx(0);
              }}
              className="w-full bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-white focus:outline-none"
            >
              {(Object.keys(PROPERTY_LABELS) as AnimatableProperty[]).map((p) => {
                const count = clip.keyframes[p]?.length ?? 0;
                return (
                  <option key={p} value={p}>
                    {PROPERTY_LABELS[p]} ({count} KF)
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-[#8D95A5] block mb-1">
              Keyframe Segment
            </label>
            {hasSegments ? (
              <select
                aria-label="Keyframe Segment"
                value={segmentIdx}
                onChange={(e) => setSegmentIdx(Number(e.target.value))}
                className="w-full bg-[#111215] border border-[#2B303A] rounded px-2 py-1 text-xs text-white focus:outline-none"
              >
                {kfs.slice(0, -1).map((kf, idx) => (
                  <option key={kf.id} value={idx}>
                    KF {idx + 1} ({kf.time.toFixed(2)}s → {kfs[idx + 1].time.toFixed(2)}s)
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={() =>
                  onCreateDefaultCurveKeyframes(clip.id, selectedProp, curve)
                }
                className="w-full py-1 px-2 rounded bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-medium text-white"
              >
                + Add 2-Point Curve
              </button>
            )}
          </div>
        </div>

        {/* Interactive Drag Graph SVG */}
        <div className="bg-[#111215] border border-[#2B303A] rounded p-2">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <div className="flex items-center gap-2 text-[10px] text-[#9BA1AD]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#3B82F6] inline-block" />
                Value Curve
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#14B8A6] inline-block" />
                Speed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                data-testid="bezier-values-readout"
                className="font-mono-tabular text-[11px] text-[#60A5FA]"
              >
                ({x1.toFixed(2)}, {y1.toFixed(2)}, {x2.toFixed(2)}, {y2.toFixed(2)})
              </span>
              <button
                type="button"
                onClick={() => setPreviewPlaying((p) => !p)}
                aria-label="Toggle Curve Preview"
                className="p-1 rounded bg-[#1E222A] text-[#C8CDD6] hover:text-white"
              >
                {previewPlaying ? (
                  <Pause className="w-3 h-3" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>

          <svg
            ref={svgRef}
            viewBox="0 0 360 260"
            data-testid="bezier-graph-svg"
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            className="w-full h-52 touch-none select-none cursor-crosshair"
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((g) => (
              <g key={g}>
                <line
                  x1={toSvgX(g)}
                  y1={20}
                  x2={toSvgX(g)}
                  y2={245}
                  stroke="#1F242D"
                  strokeWidth="1"
                />
                <line
                  x1={25}
                  y1={toSvgY(g)}
                  x2={335}
                  y2={toSvgY(g)}
                  stroke="#1F242D"
                  strokeWidth="1"
                />
              </g>
            ))}

            {/* Bounding Unit Frame */}
            <rect
              x={gx0}
              y={toSvgY(1)}
              width={gw}
              height={gh}
              fill="none"
              stroke="#2E3542"
              strokeWidth="1.2"
            />

            {/* Speed bell curve */}
            <path
              d={speedPoints.join(' ')}
              fill="none"
              stroke="#14B8A6"
              strokeOpacity="0.45"
              strokeWidth="1.5"
            />

            {/* Handle tangents */}
            <line
              x1={toSvgX(0)}
              y1={toSvgY(0)}
              x2={toSvgX(x1)}
              y2={toSvgY(y1)}
              stroke="#F59E0B"
              strokeDasharray="4 3"
              strokeWidth="1.5"
            />
            <line
              x1={toSvgX(1)}
              y1={toSvgY(1)}
              x2={toSvgX(x2)}
              y2={toSvgY(y2)}
              stroke="#8B5CF6"
              strokeDasharray="4 3"
              strokeWidth="1.5"
            />

            {/* Main Cubic Bezier Value Curve */}
            <path
              d={`M ${toSvgX(0)} ${toSvgY(0)} C ${toSvgX(x1)} ${toSvgY(y1)}, ${toSvgX(
                x2
              )} ${toSvgY(y2)}, ${toSvgX(1)} ${toSvgY(1)}`}
              fill="none"
              stroke="#3B82F6"
              strokeWidth="3"
            />

            {/* Animated Preview Bead */}
            <circle
              cx={toSvgX(previewT)}
              cy={toSvgY(easedPreviewY)}
              r="4.5"
              fill="#FFFFFF"
              stroke="#3B82F6"
              strokeWidth="2"
            />

            {/* Anchors */}
            <rect
              x={toSvgX(0) - 4}
              y={toSvgY(0) - 4}
              width="8"
              height="8"
              fill="#E6E8EC"
            />
            <rect
              x={toSvgX(1) - 4}
              y={toSvgY(1) - 4}
              width="8"
              height="8"
              fill="#E6E8EC"
            />

            {/* Draggable Handle P1 */}
            <circle
              cx={toSvgX(x1)}
              cy={toSvgY(y1)}
              r="8"
              fill="#F59E0B"
              stroke="#111215"
              strokeWidth="2"
              data-testid="bezier-handle-p1"
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                e.stopPropagation();
                setDraggingHandle('p1');
                svgRef.current?.setPointerCapture(e.pointerId);
              }}
            />

            {/* Draggable Handle P2 */}
            <circle
              cx={toSvgX(x2)}
              cy={toSvgY(y2)}
              r="8"
              fill="#8B5CF6"
              stroke="#111215"
              strokeWidth="2"
              data-testid="bezier-handle-p2"
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                e.stopPropagation();
                setDraggingHandle('p2');
                svgRef.current?.setPointerCapture(e.pointerId);
              }}
            />
          </svg>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-3 gap-1.5">
          {PRESET_CURVES.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setCurve(p.bezier);
                if (hasSegments) {
                  onApplyCurveToProperty(clip.id, selectedProp, segmentIdx, p.bezier);
                }
              }}
              className="py-1 px-2 rounded bg-[#232730] hover:bg-[#2C313D] text-[11px] text-[#E6E8EC] transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Apply Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() =>
              onApplyCurveToProperty(clip.id, selectedProp, hasSegments ? segmentIdx : 0, curve)
            }
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-45 text-xs font-semibold text-white transition-colors"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{hasSegments ? 'Apply to Segment' : 'Apply & Create Keys'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!hasSegments) {
                onCreateDefaultCurveKeyframes(clip.id, selectedProp, curve);
              } else {
                onApplyCurveToProperty(clip.id, selectedProp, 'all', curve);
              }
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#8B5CF6] hover:bg-[#7C3AED] text-xs font-semibold text-white transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Apply All Keys</span>
          </button>
        </div>
      </div>
    </div>
  );
};
