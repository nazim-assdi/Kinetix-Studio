import { MotionPresetItem } from '../types/editor';

const SFX_FAMILIES = [
  'Cinematic', 'Digital', 'Impact', 'Atmospheric', 'Mechanical',
  'Sci-Fi', 'Fantasy', 'Retro', 'Organic', 'Trailer',
];
const SFX_TEXTURES = [
  'Whoosh', 'Riser', 'Downlifter', 'Boom', 'Hit',
  'Glitch', 'Pulse', 'Shimmer', 'Sweep', 'Stinger',
];

/** 100 unique, procedural sound variations. Audio is synthesized locally by the Web Audio engine. */
export const SFX_LIBRARY: MotionPresetItem[] = SFX_FAMILIES.flatMap((family, familyIndex) =>
  SFX_TEXTURES.map((texture, textureIndex) => {
    const index = familyIndex * SFX_TEXTURES.length + textureIndex + 1;
    return {
      id: `sfx-pack-${String(index).padStart(3, '0')}`,
      name: `${family} ${texture}`,
      vendor: 'FX',
      category: 'Effects',
      description: `Procedural ${family.toLowerCase()} ${texture.toLowerCase()} sound variation ${String(index).padStart(3, '0')}.`,
      accentColor: '#14B8A6',
      sfxPreset: `sfx-pack-${index}` as `sfx-pack-${number}`,
    };
  })
);
