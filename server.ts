import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { resolveGeminiApiKey } from './src/engine/aiConfig';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));

const AI_RATE_WINDOW_MS = 60_000;
const AI_RATE_MAX_REQUESTS = 12;
const aiRequestBuckets = new Map<string, { count: number; resetAt: number }>();

function requireAiAccessKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.KINETIX_AI_ACCESS_KEY;
  if (!expected) {
    next();
    return;
  }

  const supplied = req.header('x-kinetix-access-key') ?? '';
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  const valid =
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer);

  if (!valid) {
    res.status(401).json({
      error: 'This Kinetix Studio server requires an AI access key. Enter the key configured by the server owner.',
    });
    return;
  }
  next();
}

function rateLimitAiRequests(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  let bucket = aiRequestBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + AI_RATE_WINDOW_MS };
    aiRequestBuckets.set(key, bucket);
  }

  if (bucket.count >= AI_RATE_MAX_REQUESTS) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    res.status(429).json({ error: 'AI request limit reached. Please wait one minute and try again.' });
    return;
  }

  bucket.count += 1;
  if (aiRequestBuckets.size > 4000) {
    for (const [ip, entry] of aiRequestBuckets) {
      if (entry.resetAt <= now) aiRequestBuckets.delete(ip);
      if (aiRequestBuckets.size <= 3000) break;
    }
  }
  next();
}

function getAiClient(apiKey: string): GoogleGenAI {
  if (!apiKey) {
    throw new Error('A Gemini API key is required for AI editing.');
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

app.post('/api/ai-edit', requireAiAccessKey, rateLimitAiRequests, async (req, res) => {
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
    if (prompt.length > 4000) {
      res.status(413).json({ error: 'Prompt is too long. Keep AI editing prompts under 4,000 characters.' });
      return;
    }
    // A server-managed key is preferred. Otherwise use the key supplied by this
    // user for this request only; it is never saved by the server.
    const apiKey = resolveGeminiApiKey(
      process.env.GEMINI_API_KEY,
      req.header('x-kinetix-gemini-key')
    );
    if (!apiKey) {
      res.status(503).json({
        code: 'AI_NOT_CONFIGURED',
        error: 'Add your Gemini API key in the AI panel to enable AI editing.',
      });
      return;
    }

    const ai = getAiClient(apiKey);

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
    console.error('AI editing request failed:', err);
    res.status(500).json({ error: 'AI editing failed. Check the server configuration and try again.' });
  }
});

export interface StartServerOptions {
  port?: number;
  host?: string;
  staticDirectory?: string;
  useVite?: boolean;
}

/** Starts the local API + Vite/static web server and resolves when it is listening. */
export async function startServer(options: StartServerOptions = {}) {
  const useVite = options.useVite ?? process.env.NODE_ENV !== 'production';

  if (useVite) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = options.staticDirectory ?? path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = options.port ?? Number(process.env.PORT || 3000);
  const host = options.host ?? '0.0.0.0';

  return await new Promise<import('node:http').Server>((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      console.log(`Kinetix Studio server listening on http://${host}:${actualPort}`);
      resolve(server);
    });
    server.once('error', reject);
  });
}
