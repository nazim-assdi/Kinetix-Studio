import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_ITEMS: { key: string; desc: string }[] = [
  { key: 'Space', desc: 'Play / Pause playback' },
  { key: 'V', desc: 'Selection Tool (Move & Trim clips)' },
  { key: 'C', desc: 'Razor Tool (Split clip at click)' },
  { key: 'G', desc: 'Pen Bezier Path Tool (Draw vector paths)' },
  { key: 'T', desc: 'Insert Kinetic Text Layer at playhead' },
  { key: 'R', desc: 'Insert Vector Shape Layer at playhead' },
  { key: 'S', desc: 'Toggle Timeline Snapping' },
  { key: 'M', desc: 'Drop Marker at current playhead' },
  { key: 'I / O', desc: 'Set Work Area In / Out boundaries' },
  { key: '← / →', desc: 'Step backward / forward 1 frame' },
  { key: 'Ctrl + D', desc: 'Duplicate selected clip on timeline' },
  { key: 'Shift + Del', desc: 'Ripple Delete clip & close gap' },
  { key: 'Delete', desc: 'Delete selected timeline clip' },
  { key: 'Ctrl + Z / Y', desc: 'Undo / Redo edit history' },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md bg-[#181A1F] border border-[#2B303A] rounded-lg shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-[#14161A] border-b border-[#2B303A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-[#3B82F6]" />
            <h2
              id="shortcuts-modal-title"
              className="text-sm font-semibold text-white"
            >
              Studio Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Shortcuts"
            className="p-1 rounded text-[#9BA1AD] hover:text-white hover:bg-[#232730]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 divide-y divide-[#242831]">
          {SHORTCUT_ITEMS.map((item) => (
            <div
              key={item.key}
              className="py-2 flex items-center justify-between gap-4 text-xs"
            >
              <span className="text-[#C8CDD6]">{item.desc}</span>
              <kbd className="font-mono-tabular px-2 py-0.5 rounded bg-[#111215] border border-[#2B303A] text-[#60A5FA] shrink-0">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
