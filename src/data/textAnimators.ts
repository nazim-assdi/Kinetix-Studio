import { TextAnimatorPreset } from '../types/editor';

export type TextAnimatorFamily =
  | 'fade-rise'
  | 'fade-drop'
  | 'scale-pop'
  | 'rotate-reveal'
  | 'tracking-reveal'
  | 'soft-blur'
  | 'wave-in'
  | 'bounce-in'
  | 'typewriter'
  | 'glitch';

export interface TextAnimatorDefinition {
  id: TextAnimatorPreset;
  name: string;
  category: string;
  family: TextAnimatorFamily;
  variant: number;
  intensity: number;
  duration: number;
}

const FAMILIES: {
  family: TextAnimatorFamily;
  name: string;
  category: string;
}[] = [
  { family: 'fade-rise', name: 'Fade Rise', category: 'Clean & Cinematic' },
  { family: 'fade-drop', name: 'Fade Drop', category: 'Clean & Cinematic' },
  { family: 'scale-pop', name: 'Scale Pop', category: 'Impact & Titles' },
  { family: 'rotate-reveal', name: 'Rotate Reveal', category: 'Impact & Titles' },
  { family: 'tracking-reveal', name: 'Tracking Reveal', category: 'Typography' },
  { family: 'soft-blur', name: 'Soft Blur', category: 'Typography' },
  { family: 'wave-in', name: 'Wave In', category: 'Dynamic Motion' },
  { family: 'bounce-in', name: 'Bounce In', category: 'Dynamic Motion' },
  { family: 'typewriter', name: 'Typewriter', category: 'Character Reveals' },
  { family: 'glitch', name: 'Glitch Decode', category: 'Character Reveals' },
];

export const TEXT_ANIMATORS: TextAnimatorDefinition[] = FAMILIES.flatMap(
  (family, familyIndex) =>
    Array.from({ length: 10 }, (_, index) => {
      const variant = index + 1;
      const number = familyIndex * 10 + variant;
      return {
        id: `animator-${number}` as TextAnimatorPreset,
        name: `${family.name} ${String(variant).padStart(2, '0')}`,
        category: family.category,
        family: family.family,
        variant,
        intensity: 0.55 + variant * 0.075,
        duration: 0.3 + variant * 0.055,
      };
    })
);

const ANIMATOR_BY_ID = new Map(TEXT_ANIMATORS.map((item) => [item.id, item]));

export function getTextAnimatorDefinition(
  id: TextAnimatorPreset | undefined
): TextAnimatorDefinition | undefined {
  if (!id?.startsWith('animator-')) return undefined;
  return ANIMATOR_BY_ID.get(id);
}
