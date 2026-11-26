import React from 'react';
import { COLOR_PALETTES, ColorPalette } from '../data/colorPalettes';

interface ColorPalettePickerProps {
  onApply: (palette: ColorPalette) => void;
}

export const ColorPalettePicker: React.FC<ColorPalettePickerProps> = ({ onApply }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9BA1AD]">Color Palettes</span>
      <span className="text-[9px] text-[#687181]">{COLOR_PALETTES.length} sets</span>
    </div>
    <div className="grid grid-cols-2 gap-1.5">
      {COLOR_PALETTES.map((palette) => (
        <button
          key={palette.id}
          type="button"
          onClick={() => onApply(palette)}
          title={`Apply ${palette.name} palette`}
          aria-label={`Apply ${palette.name} color palette`}
          className="min-w-0 rounded border border-[#2B303A] bg-[#111215] px-2 py-1.5 text-left hover:border-[#6D7EF5] hover:bg-[#1A1D25] transition-colors"
        >
          <span className="block text-[10px] text-[#D5D9E2] truncate mb-1">{palette.name}</span>
          <span className="flex gap-0.5">
            {palette.colors.map((color, index) => (
              <span
                key={index}
                className="h-3 flex-1 rounded-[2px] border border-white/10"
                style={{ backgroundColor: color }}
              />
            ))}
          </span>
        </button>
      ))}
    </div>
  </div>
);
