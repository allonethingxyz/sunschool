import { askOpenRouter } from '../openrouter';
import { generateImage, generateDiagram, MAX_IMAGES_PER_LESSON } from './image-generation-router';
import { EnhancedLessonSpec, LessonSection, LessonImage, LessonDiagram } from '../../shared/schema';
import { saveBase64Image } from './image-storage';
import { generateEducationalSVG, validateAndSanitizeSVG } from './svg-llm-service';

// Create a simple ID generator since nanoid is causing ESM issues
function generateId(length: number = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Map a diagram type string to one of the allowed diagram types in our schema
 */
function mapDiagramType(type: string): LessonDiagram['type'] {
  // Convert to lowercase and normalize
  const normalizedType = type.toLowerCase().trim();
  
  // Map to one of the allowed types
  if (normalizedType.includes('flow') || normalizedType.includes('process')) {
    return 'flowchart';
  } else if (normalizedType.includes('comparison') || normalizedType.includes('compare')) {
    return 'comparison';
  } else if (normalizedType.includes('cycle') || normalizedType.includes('circular')) {
    return 'cycle';
  } else if (normalizedType.includes('hierarchy') || normalizedType.includes('tree')) {
    return 'hierarchy';
  }
  
  // Default to process if no match
  return 'process';
}

/**
 * Map the section type from any string to one of the allowed section types in our schema
 */
function mapSectionType(type: string): LessonSection['type'] {
  // Define a mapping from common section types to our schema types
  const typeMap: Record<string, LessonSection['type']> = {
    'introduction': 'introduction',
    'intro': 'introduction',
    'beginning': 'introduction',
    'key': 'key_concepts',
    'key_concepts': 'key_concepts',
    'concepts': 'key_concepts',
    'main': 'key_concepts',
    'core': 'key_concepts',
    'example': 'examples',
    'examples': 'examples',
    'practice': 'practice',
    'exercise': 'practice',
    'exercises': 'practice',
    'activities': 'practice',
    'activity': 'practice',
    'summary': 'summary',
    'conclusion': 'summary',
    'ending': 'summary',
    'recap': 'summary',
    'fun': 'fun_facts',
    'fun_facts': 'fun_facts',
    'interesting': 'fun_facts',
    'did_you_know': 'fun_facts',
    'facts': 'fun_facts'
  };
  
  // Convert input to lowercase and remove spaces
  const normalizedType = type.toLowerCase().replace(/\s+/g, '_');
  
  // Try to match directly or find partial matches
  if (typeMap[normalizedType]) {
    return typeMap[normalizedType];
  }
  
  // Look for partial matches in the keys
  for (const key of Object.keys(typeMap)) {
    if (normalizedType.includes(key)) {
      return typeMap[key];
    }
  }
  
  // Default to key_concepts if no match found
  return 'key_concepts';
}

/**
 * Base lesson prompt for OpenRouter
 */
const baseEnhancedLessonPrompt = `Create an educational lesson for a grade school student. 
The lesson should be rich in educational content, engaging, and appropriate for the grade level specified.

Follow these requirements:
1. The content should be factually accurate and educational
2. The writing should be clear, concise, and engaging for the target age group
3. Structure the content in sections with clear headings
4. Include opportunities for visual elements (you don't need to create the visuals)
5. Suggest 3-4 places where images would enhance understanding
6. Include a brief summary at the beginning
7. List key vocabulary terms or concepts
8. Suggest 2-3 related topics that build on this knowledge
9. The content should take approximately 10-15 minutes to read

Please format your response as a JSON object with the following structure:

{
  "title": "Main title of the lesson",
  "subtitle": "Optional subtitle or tagline",
  "summary": "A brief 2-3 sentence summary of what will be learned",
  "targetGradeLevel": 5,
  "difficultyLevel": "Beginner/Intermediate/Advanced",
  "estimatedDuration": 15,
  "sections": [
    {
      "title": "Section Title",
      "type": "introduction/core/advanced/activity/conclusion",
      "content": "Markdown formatted content for this section",
      "imageDescription": "Description of an image that would work well here"
    }
  ],
  "keywords": ["keyword1", "keyword2"],
  "relatedTopics": ["related topic 1", "related topic 2"]
}`;

/**
 * Generate a full enhanced lesson with content and images
 * @param gradeLevel The grade level for the lesson
 * @param topic The topic for the lesson
 * @param withImages Whether to generate images (requires Stability API key)
 * @param subject Optional subject category
 * @param difficulty Optional difficulty level
 * @returns The enhanced lesson specification
 */
export async function generateEnhancedLesson(
  gradeLevel: number,
  topic: string,
  withImages: boolean = true,
  subject?: string,
  difficulty: 'beginner' | 'intermediate' | 'advanced' = 'beginner'
): Promise<EnhancedLessonSpec | null> {
  try {
    // 1. Generate the lesson content structure with OpenRouter
    // We ask for JSON explicitly in the prompt and strip any fences from the response
    // rather than relying on response_format (which has inconsistent support across models).
    const structureResponse = await askOpenRouter({
      messages: [
        {
          role: 'system',
          content: baseEnhancedLessonPrompt +
            '\n\nIMPORTANT: Respond with ONLY valid JSON — no markdown, no code fences, no explanations.'
        },
        {
          role: 'user',
          content: `Create an educational lesson about "${topic}" for grade ${gradeLevel} students. Return only a JSON object.`
        }
      ],
      model: 'google/gemini-2.0-flash-001',
      temperature: 0.7,
    });
    
    console.log('Generated lesson structure from OpenRouter');
    
    // Validate we have a response
    if (!structureResponse.choices || !structureResponse.choices[0]?.message?.content) {
      throw new Error('Empty response from OpenRouter for lesson structure');
    }

    // Parse the response — strip any markdown code fences the model may add
    const rawContent = structureResponse.choices[0].message.content;
    const jsonText = rawContent
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    const content = JSON.parse(jsonText);
    
    // Initialize our enhanced lesson spec
    const enhancedLesson: EnhancedLessonSpec = {
      title: content.title,
      subtitle: content.subtitle,
      targetGradeLevel: content.targetGradeLevel || gradeLevel,
      summary: content.summary,
      difficultyLevel: content.difficultyLevel || 'Intermediate',
      estimatedDuration: content.estimatedDuration || 15,
      sections: [],
      images: [],
      diagrams: [],
      questions: [],
      keywords: content.keywords || [],
      relatedTopics: content.relatedTopics || []
    };
    
    // 2. Add sections and generate image placeholders
    const allImagePrompts: { id: string, description: string, prompt: string }[] = [];
    
    for (const section of content.sections) {
      const sectionImageIds: string[] = [];
      
      // If the section has an image description, create a placeholder
      if (section.imageDescription) {
        const imageId = generateId(10);
        allImagePrompts.push({
          id: imageId,
          description: section.imageDescription,
          prompt: `${section.imageDescription} related to ${topic} for grade ${gradeLevel} education`
        });
        sectionImageIds.push(imageId);
      }
      
      // Map the section type to one of the allowed types in our schema
      const validSectionType = mapSectionType(section.type || 'content');
      
      // Add the section to our enhanced lesson 
      enhancedLesson.sections.push({
        title: section.title,
        content: section.content,
        type: validSectionType,
        imageIds: sectionImageIds
      });
    }
    
    // 3. Generate a featured image for the lesson
    const featuredImageId = generateId(10);
    allImagePrompts.push({
      id: featuredImageId,
      description: `Main illustration for ${content.title}`,
      prompt: `Educational illustration for "${content.title}" lesson for grade ${gradeLevel} students, ${topic}, main concept visualization`
    });
    enhancedLesson.featuredImage = featuredImageId;
    
    // 4. If images are requested, generate them via the image generation router
    if (withImages) {
      // Cap the number of images per lesson
      const cappedPrompts = allImagePrompts.slice(0, MAX_IMAGES_PER_LESSON);
      console.log(`Generating ${cappedPrompts.length} images for the lesson (max ${MAX_IMAGES_PER_LESSON})...`);

      // Generate all images concurrently via the router
      const imagePromises = cappedPrompts.map(async (imagePrompt) => {
        const result = await generateImage(
          imagePrompt.prompt,
          imagePrompt.description,
          gradeLevel,
          { subject: subject || topic }
        );

        if (result) {
          // If SVG result, no need to save to filesystem
          if (result.svgData) {
            return {
              id: imagePrompt.id,
              description: imagePrompt.description,
              alt: imagePrompt.description,
              svgData: result.svgData,
              promptUsed: result.promptUsed,
            };
          }

          // Base64 result — try to save to filesystem
          if (result.base64Data) {
            try {
              const imagePath = await saveBase64Image(
                result.base64Data,
                `lesson_${topic.replace(/\s+/g, '_')}_${imagePrompt.id}`
              );

              return {
                id: imagePrompt.id,
                description: imagePrompt.description,
                alt: imagePrompt.description,
                base64Data: result.base64Data,
                promptUsed: result.promptUsed,
                path: imagePath,
              };
            } catch (saveError) {
              console.error('Error saving image to filesystem:', saveError);
              return {
                id: imagePrompt.id,
                description: imagePrompt.description,
                alt: imagePrompt.description,
                base64Data: result.base64Data,
                promptUsed: result.promptUsed,
              };
            }
          }
        }

        // If image generation fails, create a placeholder
        return {
          id: imagePrompt.id,
          description: imagePrompt.description,
          alt: imagePrompt.description,
          promptUsed: imagePrompt.prompt,
        };
      });

      const images = await Promise.all(imagePromises);
      enhancedLesson.images = images;

      // 5. Generate a diagram related to the topic via the router
      try {
        console.log('Generating a diagram for the lesson...');
        const diagramTypes = ['concept map', 'flowchart', 'comparison', 'cycle'];
        const randomDiagramType = diagramTypes[Math.floor(Math.random() * diagramTypes.length)];

        const diagramResult = await generateDiagram(
          topic,
          randomDiagramType,
          gradeLevel,
          `${randomDiagramType} diagram about ${topic}`
        );

        if (diagramResult) {
          const mappedDiagramType = mapDiagramType(randomDiagramType);

          enhancedLesson.diagrams.push({
            id: diagramResult.id,
            type: mappedDiagramType,
            title: diagramResult.title,
            svgData: diagramResult.svgData,
            description: diagramResult.description,
          });
        }
      } catch (error) {
        console.error('Error generating diagram:', error);
      }
    } else {
      // Add placeholders for images if we're not generating them
      enhancedLesson.images = allImagePrompts.map(prompt => ({
        id: prompt.id,
        description: prompt.description,
        alt: prompt.description,
        promptUsed: prompt.prompt
      }));
    }
    
    // 6. Generate quiz questions for the lesson
    try {
      console.log('Generating quiz questions for enhanced lesson...');
      const questions = await generateEnhancedQuestions(enhancedLesson, 3);
      if (questions.length > 0) {
        enhancedLesson.questions = questions;
        console.log(`Generated ${questions.length} quiz questions`);
      }
    } catch (quizError) {
      console.error('Error generating quiz questions for enhanced lesson:', quizError);
    }

    console.log('Enhanced lesson generation complete');
    return enhancedLesson;
  } catch (error) {
    console.error('Error generating enhanced lesson:', error);
    return null;
  }
}

/**
 * Generate quiz questions for an enhanced lesson.
 * - Text-based questions use lesson image references when available.
 * - One visual question per lesson gets SVG answer options generated in parallel.
 */
export async function generateEnhancedQuestions(
  enhancedLesson: EnhancedLessonSpec,
  questionCount: number = 5
): Promise<any[]> {
  try {
    // Combine all section content for context
    const lessonContent = enhancedLesson.sections.map(s => `${s.title}:\n${s.content}`).join('\n\n');

    // Build image context hint so the LLM knows which image IDs are available
    const imageHint = enhancedLesson.images && enhancedLesson.images.length > 0
      ? `\n\nAvailable lesson image IDs you can reference (use ONE imageId per question if the question can be illustrated): ${enhancedLesson.images.map(i => `"${i.id}" (${i.description})`).join(', ')}`
      : '';

    const response = await askOpenRouter({
      messages: [
        {
          role: 'system',
          content: `You are an educational assessment expert. Create ${questionCount} multiple-choice questions based on the lesson content. Each question must have exactly 4 answer options with one correct answer. When a question can be enriched by referring to one of the available lesson images, include the image ID in the "imageId" field. Mark one question as type "image_based" if an image reference is included. Respond with ONLY a valid JSON array — no markdown, no code fences.`
        },
        {
          role: 'user',
          content: `Create ${questionCount} multiple-choice questions for a grade ${enhancedLesson.targetGradeLevel} lesson titled "${enhancedLesson.title}".${imageHint}\n\nLesson content:\n${lessonContent}\n\nReturn ONLY a JSON array. Format each question as: {"text":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"...","type":"multiple_choice","imageId":"<optional>"}`
        }
      ],
      model: 'google/gemini-2.0-flash-001',
      temperature: 0.7,
    });

    const rawQText = response.choices[0].message.content
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    const rawQuestions: any[] = JSON.parse(rawQText);

    // For up to 1 question, generate SVG answer options to make the quiz visually engaging
    const visualQuestionIndex = rawQuestions.findIndex(
      (q, i) => i < rawQuestions.length && q.options && q.options.length === 4
    );

    const questions = await Promise.all(rawQuestions.map(async (q, idx) => {
      // Clean up imageId: only keep it if it actually references an existing image
      const validImageId = q.imageId && enhancedLesson.images?.some(img => img.id === q.imageId)
        ? q.imageId
        : undefined;

      // For the first eligible question, try to generate SVG answer options
      if (idx === visualQuestionIndex && q.options && q.options.length === 4) {
        try {
          const svgPromises = q.options.map((opt: string) =>
            generateVisualOptionSVG(opt, enhancedLesson.title, enhancedLesson.targetGradeLevel)
          );
          const svgResults = await Promise.all(svgPromises);
          // Only attach optionSvgs if ALL 4 generated successfully
          const allGenerated = svgResults.every(s => !!s);
          if (allGenerated) {
            return { ...q, imageId: validImageId, optionSvgs: svgResults };
          }
        } catch (svgErr) {
          console.warn('Visual option SVG generation failed, using text-only options:', svgErr);
        }
      }

      return { ...q, imageId: validImageId };
    }));

    return questions;
  } catch (error) {
    console.error('Error generating enhanced questions:', error);
    return [];
  }
}

/**
 * Generate a compact SVG illustration for a single answer option label.
 * Returns the sanitized SVG string, or null on failure.
 * Uses a configurable timeout to avoid blocking quiz generation.
 */
async function generateVisualOptionSVG(
  optionText: string,
  lessonTopic: string,
  gradeLevel: number
): Promise<string | null> {
  const VISUAL_OPTION_TIMEOUT_MS = 15000;
  try {
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Visual option SVG timeout')), VISUAL_OPTION_TIMEOUT_MS)
    );
    const svgPromise = askOpenRouter({
      messages: [
        {
          role: 'system',
          content: `You are an expert SVG illustrator for educational content. Output ONLY valid SVG markup — no markdown, no explanation, no code fences. The SVG must be a compact 200×200 illustration with viewBox="0 0 200 200", white background, and minimal text so it works as a visual answer option for a quiz.`
        },
        {
          role: 'user',
          content: `Create a simple 200×200 SVG illustration representing "${optionText}" in the context of a "${lessonTopic}" lesson for grade ${gradeLevel}. Output raw SVG only.`
        }
      ],
      // Use the configured SVG model for consistency
      model: process.env.OPENROUTER_SVG_MODEL || 'google/gemini-2.0-flash-001',
      temperature: 0.4,
      max_tokens: 1500,
    }).then(r => validateAndSanitizeSVG(r.choices[0]?.message?.content ?? ''));

    return await Promise.race([svgPromise, timeoutPromise]);
  } catch {
    return null;
  }
}