export interface ColorPalette {
  id: string;
  name: string;
  colors: [string, string, string, string, string];
}

export const COLOR_PALETTES: ColorPalette[] = [
  { id: 'cinema-noir', name: 'Cinema Noir', colors: ['#F4F1EA', '#17191F', '#A7B0BC', '#596477', '#D5A65A'] },
  { id: 'neon-night', name: 'Neon Night', colors: ['#15D9F5', '#11102A', '#F72585', '#7B2FF7', '#F9C80E'] },
  { id: 'ocean-depth', name: 'Ocean Depth', colors: ['#C7F9F2', '#063B4C', '#0B7892', '#35B7A7', '#F2D492'] },
  { id: 'desert-dusk', name: 'Desert Dusk', colors: ['#FFF0D4', '#38251F', '#CA7655', '#D8A45B', '#8F657B'] },
  { id: 'forest-film', name: 'Forest Film', colors: ['#EDF2D0', '#192B24', '#587A55', '#A8B66A', '#C98B55'] },
  { id: 'pastel-pop', name: 'Pastel Pop', colors: ['#574C77', '#FFF3F0', '#FF9AA2', '#B5EAD7', '#C7CEEA'] },
  { id: 'cyber-blue', name: 'Cyber Blue', colors: ['#F8FAFC', '#071A36', '#00A6FB', '#0066CC', '#00F5D4'] },
  { id: 'warm-editorial', name: 'Warm Editorial', colors: ['#2A211C', '#F3EBDD', '#C66B45', '#D8B887', '#7D5A50'] },
  { id: 'mono-studio', name: 'Mono Studio', colors: ['#FFFFFF', '#101114', '#C7CBD1', '#747B86', '#343A44'] },
  { id: 'copper-night', name: 'Copper Night', colors: ['#F5E8D3', '#171A20', '#C77B4A', '#95613F', '#5B7892'] },
  { id: 'royal-violet', name: 'Royal Violet', colors: ['#F6F0FF', '#211338', '#8A55D7', '#C5A3F5', '#E3B85C'] },
  { id: 'sports-energy', name: 'Sports Energy', colors: ['#F7F9FC', '#101820', '#FEE715', '#00A878', '#F45B69'] },
  { id: 'retro-sunset', name: 'Retro Sunset', colors: ['#FFF4DC', '#28203E', '#F15A4A', '#F5B544', '#8D6AB8'] },
  { id: 'clean-product', name: 'Clean Product', colors: ['#152238', '#F5F8FC', '#4776E6', '#7BC6B5', '#E5B95C'] },
  { id: 'earth-tone', name: 'Earth Tone', colors: ['#F4EDE2', '#332B23', '#A27B5C', '#6D7A55', '#C7A27C'] },
  { id: 'ice-studio', name: 'Ice Studio', colors: ['#0F263A', '#ECF8FF', '#78C7E8', '#A2D5C6', '#F3C9A8'] },
  { id: 'magenta-drive', name: 'Magenta Drive', colors: ['#FFF1F7', '#25142B', '#E6378B', '#8A3FFC', '#FFB703'] },
  { id: 'minimal-sage', name: 'Minimal Sage', colors: ['#F5F5EF', '#252D29', '#839A83', '#C1CBB5', '#B68B67'] },
  { id: 'gold-premium', name: 'Gold Premium', colors: ['#FFF6DF', '#171411', '#C6A15B', '#887044', '#E9D8B7'] },
  { id: 'electric-lime', name: 'Electric Lime', colors: ['#F2FFB8', '#171D22', '#B7E52C', '#39A0ED', '#F45D48'] },
];
