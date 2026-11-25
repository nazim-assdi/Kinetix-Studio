import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '2mb' }));

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.post('/api/ai-edit', async (req, res) => {
  try {
    const { prompt, context } = req.body as {
      prompt?: string;
      context?: {
        playheadTime?: number;
        selectedClipName?: string | null;
        selectedClipKind?: string | null;
        clipCount?: number;
        duration?: number;
      };
    };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'Prompt is required.' });
      return;
    }

    const ai = getAiClient();

    const systemInstruction = `You are an expert After Effects + Premiere Pro + DaVinci Resolve AI Editing & Motion Graphics Director inside Kinetix Studio.
Convert the user's request into a precise JSON plan of editing actions that the studio executes immediately on the timeline.
Available layer kinds: text, shape, solid, null, adjustment, camera, light, particles, visualizer, caption.
Available effect types: blur, motionblur, glow, color, hue_sat, tint, vignette, chromatic, glitch, dropshadow, filmgrain, lensflare, wavewarp, posterize, chromakey, sharpen, pixelate, halation.
Available presetIds (Motion Bro / Mr Horse / AEJuice packs):
- elastic_pop_in
- smooth_slide_in
- flip_3d_in
- kinetic_scale_drop
- glitch_flicker_in
- parallax_float
- whip_pan_transition
- zoom_punch_transition
- film_burn_flash
- hud_callout_pack
- lower_third_pack
- cyber_neon_title
Keep summary concise (1-2 sentences). Return realistic positions (-400..400), scales (50..200), rotations (-180..180), and intensities (0..100).`;

    const userMessage = `User request: "${prompt.trim()}"
Timeline context: playhead=${context?.playheadTime ?? 0}s, selectedClip=${context?.selectedClipName ?? 'none'} (${context?.selectedClipKind ?? 'none'}), totalClips=${context?.clipCount ?? 0}, compDuration=${context?.duration ?? 14}s.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: userMessage,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Short explanation of the edits applied.',
            },
            actions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  actionType: {
                    type: Type.STRING,
                    description:
                      'One of: add_layer, add_effect, apply_preset, set_transform_3d, add_camera, add_light',
                  },
                  layerKind: {
                    type: Type.STRING,
                    description: 'text, shape, solid, null, adjustment, camera, light, particles, visualizer, caption',
                  },
                  name: { type: Type.STRING },
                  textContent: { type: Type.STRING },
                  color: { type: Type.STRING },
                  duration: { type: Type.NUMBER },
                  effectType: { type: Type.STRING },
                  presetId: { type: Type.STRING },
                  is3D: { type: Type.BOOLEAN },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  z: { type: Type.NUMBER },
                  scale: { type: Type.NUMBER },
                  rotationX: { type: Type.NUMBER },
                  rotationY: { type: Type.NUMBER },
                  rotation: { type: Type.NUMBER },
                  lightType: { type: Type.STRING },
                  intensity: { type: Type.NUMBER },
                  fov: { type: Type.NUMBER },
                  exposure: { type: Type.NUMBER },
                  contrast: { type: Type.NUMBER },
                  saturation: { type: Type.NUMBER },
                },
                required: ['actionType'],
              },
            },
          },
          required: ['summary', 'actions'],
        },
      },
    });

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText);
    res.json(parsed);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to process AI editing request.';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Kinetix Studio server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});
