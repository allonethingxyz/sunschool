import axios from 'axios';
import { OPENROUTER_API_KEY, OPENROUTER_IMAGE_MODEL, IMAGE_GENERATION_TIMEOUT, IMAGE_MODEL_FALLBACKS, DEFAULT_IMAGE_MODEL_FALLBACKS } from '../config/env';

/** Ordered list of models to try: primary + fallbacks */
function getImageModelChain(): string[] {
  const fallbacks = IMAGE_MODEL_FALLBACKS.length > 0
    ? IMAGE_MODEL_FALLBACKS
    : DEFAULT_IMAGE_MODEL_FALLBACKS;
  return [OPENROUTER_IMAGE_MODEL, ...fallbacks];
}

function generateId(length: number = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// OpenRouter now uses the chat completions endpoint with modalities for image generation
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterImageResult {
  id: string;
  base64Data: string;
  promptUsed: string;
  description: string;
}

interface OpenRouterImageOptions {
  size?: string;
  quality?: string;
  n?: number;
}

/**
 * Generates an educational image using OpenRouter's chat completions API
 * with modalities: ["image"] for image output.
 * Tries the primary model first, then falls back through the model chain.
 */
export async function generateEducationalImage(
  prompt: string,
  description: string = '',
  options: OpenRouterImageOptions = {},
  gradeLevel?: number
): Promise<OpenRouterImageResult | null> {
  if (!OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY not set — cannot generate images');
    return null;
  }

  const models = getImageModelChain();
  const enhancedPrompt = enhancePromptForEducation(prompt, gradeLevel);

  for (const model of models) {
    try {
      const body: Record<string, any> = {
        model,
        messages: [
          {
            role: 'user',
            content: enhancedPrompt,
          },
        ],
        modalities: ['image'],
      };

      const response = await axios.post(OPENROUTER_CHAT_URL, body, {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://sunschool.xyz',
          'X-Title': 'SUNSCHOOL - The Open Source AI Tutor',
        },
        timeout: IMAGE_GENERATION_TIMEOUT,
      });

      // Response format: choices[0].message.images[0].image_url.url
      const message = response.data?.choices?.[0]?.message;
      if (message?.images && message.images.length > 0) {
        const imageUrl: string = message.images[0]?.image_url?.url || '';
        const base64Match = imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
        const base64Data = base64Match ? base64Match[1] : imageUrl;

        if (base64Data) {
          console.log(`[OpenRouter Image] Generated with model: ${model}`);
          return {
            id: generateId(10),
            base64Data,
            promptUsed: enhancedPrompt,
            description: description || 'Educational image generated with AI',
          };
        }
      }

      console.warn(`[OpenRouter Image] Model ${model} returned no image data, trying next`);
    } catch (error: any) {
      const is404 = axios.isAxiosError(error) && error.response?.status === 404;
      const isUnavailable = is404 || (error.message || '').includes('No endpoints found');

      if (isUnavailable && model !== models[models.length - 1]) {
        console.warn(`[OpenRouter Image] Model ${model} unavailable, trying next fallback`);
        continue;
      }

      console.error(`[OpenRouter Image] Error with ${model}:`, error.message);
      if (axios.isAxiosError(error) && error.response) {
        const respData = JSON.stringify(error.response.data);
        console.error('[OpenRouter Image] Response:', error.response.status, respData.substring(0, 200));
      }
      return null;
    }
  }

  console.error('[OpenRouter Image] All models exhausted');
  return null;
}

/**
 * Enhances a prompt for educational, child-safe image generation
 */
function enhancePromptForEducation(prompt: string, gradeLevel?: number): string {
  const safetyModifiers = 'safe for children, educational, no violence, no scary elements, appropriate for school';
  const qualityModifiers = 'high quality, clear, detailed, professional educational illustration';

  let gradeModifier = '';
  if (gradeLevel !== undefined) {
    if (gradeLevel <= 2) {
      gradeModifier = 'simple, bright colors, large shapes, friendly, cartoon-style for young children';
    } else if (gradeLevel <= 4) {
      gradeModifier = 'clear labels, colorful, engaging for elementary students';
    } else if (gradeLevel <= 6) {
      gradeModifier = 'detailed with labels, educational diagram style for middle-grade students';
    } else if (gradeLevel <= 8) {
      gradeModifier = 'detailed, annotated, scientific illustration style for middle school';
    } else {
      gradeModifier = 'detailed, publication-quality, academic illustration';
    }
  }

  return [prompt, safetyModifiers, qualityModifiers, gradeModifier].filter(Boolean).join(', ');
}
