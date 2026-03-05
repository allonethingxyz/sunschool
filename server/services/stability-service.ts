import axios from 'axios';

// Custom ID generator
function generateId(size: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Stability AI API for image generation
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
const STABILITY_API_HOST = 'https://api.stability.ai';

/**
 * Available engines for Stability AI
 * See: https://platform.stability.ai/docs/api-reference
 */
const engines = {
  stableDiffusion: 'stable-diffusion-xl-1024-v1-0',
  stableDiffusionV3: 'stable-diffusion-v3-large',
};

interface StabilityImageOptions {
  prompt: string;
  negativePrompt?: string;
  engine?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  stylePreset?: string;
}

interface StabilityImageResult {
  id: string;
  base64Data: string;
  promptUsed: string;
  description: string;
}

/**
 * Generates an educational image using Stability AI
 */
export async function generateEducationalImage(
  prompt: string,
  description: string = '',
  options: Partial<StabilityImageOptions> = {}
): Promise<StabilityImageResult | null> {
  if (!STABILITY_API_KEY) {
    console.error('Stability API key not found');
    return null;
  }

  try {
    // Enhance the prompt for educational content
    const enhancedPrompt = enhancePromptForEducation(prompt);
    
    // Default options for educational content
    const defaultOptions = {
      engine: engines.stableDiffusionV3,
      width: 1024,
      height: 1024,
      steps: 30,
      stylePreset: 'digital-art',
      negativePrompt: 'blurry, distorted, low quality, ugly, disfigured, text, watermark, signature, cartoon, childish, unprofessional',
    };

    const mergedOptions = { ...defaultOptions, ...options, prompt: enhancedPrompt };
    
    const url = `${STABILITY_API_HOST}/v1/generation/${mergedOptions.engine}/text-to-image`;
    
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${STABILITY_API_KEY}`,
    };
    
    const body = {
      text_prompts: [
        {
          text: mergedOptions.prompt,
          weight: 1
        },
        {
          text: mergedOptions.negativePrompt,
          weight: -1
        }
      ],
      cfg_scale: 7,
      height: mergedOptions.height,
      width: mergedOptions.width,
      samples: 1,
      steps: mergedOptions.steps,
      style_preset: mergedOptions.stylePreset,
    };

    const response = await axios.post(url, body, { headers });
    
    if (response.data && response.data.artifacts && response.data.artifacts.length > 0) {
      const image = response.data.artifacts[0];
      return {
        id: generateId(10),
        base64Data: image.base64,
        promptUsed: enhancedPrompt,
        description: description || 'Educational image generated with AI'
      };
    }
    
    console.error('No image data received from Stability AI');
    return null;
  } catch (error) {
    console.error('Error generating image with Stability AI:', error.message);
    return null;
  }
}

/**
 * Enhances a prompt to make it more suitable for educational content
 */
function enhancePromptForEducation(prompt: string): string {
  // Add educationally-focused modifiers to improve the quality for learning material
  const educationalModifiers = [
    'educational illustration',
    'clear and accurate',
    'suitable for learning materials',
    'detailed',
    'high quality',
    'professional',
    'clean background',
  ];
  
  // Select 2-3 random modifiers to add variety to the prompts
  const selectedModifiers = educationalModifiers.sort(() => 0.5 - Math.random()).slice(0, 3);
  
  // Combine the original prompt with educational modifiers
  return `${prompt}, ${selectedModifiers.join(', ')}, 4k, detailed, professional`;
}

/**
 * Generates an educational diagram using Stability AI
 */
export async function generateEducationalDiagram(
  topic: string,
  diagramType: string,
  description: string = ''
): Promise<StabilityImageResult | null> {
  // Create a specific prompt for diagrams based on type
  let diagramPrompt = '';
  
  switch (diagramType.toLowerCase()) {
    case 'flowchart':
      diagramPrompt = `educational flowchart diagram explaining ${topic}, clean design, labeled steps, arrows showing process flow, white background`;
      break;
    case 'concept map':
      diagramPrompt = `concept map of ${topic}, interconnected nodes, labeled relationships, hierarchical structure, educational diagram`;
      break;
    case 'cycle':
      diagramPrompt = `cycle diagram illustrating ${topic}, circular process, labeled stages, arrows showing direction, educational graphic`;
      break;
    case 'comparison':
      diagramPrompt = `comparison diagram of ${topic}, side by side comparison, labeled features, educational chart, clean layout`;
      break;
    case 'timeline':
      diagramPrompt = `timeline diagram showing ${topic}, chronological progression, dated events, educational graphic, clean design`;
      break;
    default:
      diagramPrompt = `educational diagram explaining ${topic}, clear labels, professional layout, educational graphic`;
  }
  
  // Use more steps for diagrams to get clearer details
  return generateEducationalImage(diagramPrompt, description, {
    steps: 40,
    stylePreset: 'line-art', // Use line-art for cleaner diagrams
  });
}