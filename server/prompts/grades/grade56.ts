export const Grade56Prompts = {
    getSystemPrompt: (topic: string, gradeLevel: number) => `
  ### TEACHING 10-12 YEAR OLD STUDENTS
  
  Create content for developing abstract thinking.
  
  REQUIREMENTS:
  - Maximum 12 words per sentence average
  - Maximum 400 words total
  - Introduce academic vocabulary with context
  - Build conceptual understanding
  - Include cause-effect relationships
  
  Create comprehensive lesson about "${topic}".
  `,
  
    getUserPrompt: (topic: string, gradeLevel: number) => `
  Create a lesson about "${topic}" for grade ${gradeLevel}.
  
  STRUCTURE (400 words maximum):
  
  Introduction (60 words)
  Connect to prior knowledge and introduce objective.
  
  Core Concepts (160 words)
  Explain 3-4 main ideas with definitions.
  
  Examples and Applications (100 words)
  Real-world connections and applications.
  
  Practice Activity (80 words)
  Hands-on investigation or analysis task.
  `,
  
    getEnhancedPrompt: (topic: string, gradeLevel: number) => `
  GRADE ${gradeLevel} ADVANCED LESSON
  
  Use Chain-of-Thought reasoning:
  1. Prerequisite concepts students should know
  2. New vocabulary to introduce (with definitions)
  3. Conceptual progression from simple to complex
  4. Real-world applications
  
  Topic: "${topic}"
  Output: 400 words maximum with grade-appropriate complexity.
  `,
  
    getQuizSystemPrompt: (topic: string, gradeLevel: number) => `
  Create grade ${gradeLevel} assessment questions about "${topic}" for ages 10-12.

  REQUIREMENTS:
  - Maximum 15 words per question
  - Include questions testing different cognitive levels
  - Use academic vocabulary but define technical terms
  - Avoid overly complex sentence structures

  DISTRIBUTION:
  - Factual knowledge (20%): "What is...", "Which one..."
  - Conceptual understanding (40%): "How does...", "Why is..."
  - Application skills (40%): "How would you...", "What happens if..."

  === EXAMPLES OF GOOD QUESTIONS FOR GRADES 5-6 ===

  GOOD: "How does water change from liquid to gas?"
  Options: ["It evaporates when heated", "It freezes solid", "It stays the same", "It turns to ice"]
  ✓ Clear question (8 words)
  ✓ Tests conceptual understanding
  ✓ Age-appropriate vocabulary

  GOOD: "What would happen if plants had no sunlight?"
  Options: ["They would die", "They would grow faster", "They would turn blue", "Nothing would change"]
  ✓ Application question (8 words)
  ✓ Tests cause-effect reasoning
  ✓ Realistic scenario

  === EXAMPLES OF BAD QUESTIONS (AVOID) ===

  BAD: "Considering photosynthetic processes, what is the primary mechanism whereby chloroplasts convert electromagnetic radiation into chemical energy?"
  ✗ Too many words (18 words!)
  ✗ Overly technical language
  ✗ College-level complexity

  BAD: "What are the similarities and differences between mitosis and meiosis in terms of chromosome number?"
  ✗ High school biology level
  ✗ Too complex for 10-12 year olds
  `,

    getQuizUserPrompt: (topic: string, gradeLevel: number, questionCount: number) => `
  Generate ${questionCount} questions about "${topic}" for grade ${gradeLevel} (ages 10-12).

  QUESTION TYPES TO USE:

  Comprehension (20%): "What is the relationship between..."
  Example: "What is the relationship between rain and clouds?"

  Application (40%): "How would you use..."
  Example: "How would you test if something is magnetic?"

  Analysis (20%): "Why does this happen when..."
  Example: "Why does ice melt faster in hot water?"

  Comparison (20%): "How are X and Y similar/different..."
  Example: "How are frogs and toads different?"

  BEFORE SUBMITTING:
  ✓ Maximum 15 words per question
  ✓ Vocabulary appropriate for ages 10-12
  ✓ Avoid high school or college terminology
  ✓ Test understanding, not just memory

  Generate ${questionCount} questions now.
  `,
  
    getFeedbackSystemPrompt: (gradeLevel: number) => `
  Provide constructive feedback for grade ${gradeLevel} student.
  Balance encouragement with specific guidance.
  Use academic language appropriately.
  `,
  
    getQuizFeedbackPrompt: (questions: any[], answers: number[], score: number, gradeLevel: number) => `
  Feedback for ${score}% performance:
  
  Overall Performance:
  [2-3 sentences analyzing patterns]
  
  Strengths Demonstrated:
  - [Specific skill 1]
  - [Specific skill 2]
  
  Areas for Growth:
  - [Concept 1]: Try [specific strategy]
  - [Concept 2]: Practice [specific skill]
  
  Next Steps:
  [3-4 practice problems with increasing difficulty]
  `,
  
    getKnowledgeGraphPrompt: (topic: string, gradeLevel: number) => `
  Design concept map for "${topic}" - grade ${gradeLevel}.
  - 10-15 interconnected concepts
  - Show hierarchical relationships
  - Include cross-connections
  - Label relationships clearly
  `,
  
    getImagePrompt: (topic: string, concept: string, gradeLevel: number) => `
  Create detailed educational diagram about ${concept} for grade ${gradeLevel}.
  - Include labels with brief descriptions
  - Show processes and relationships
  - Add scale or measurements
  - Include "Key Points" callout box
  `,
  
    getDiagramPrompt: (topic: string, diagramType: string, gradeLevel: number) => `
  Design ${diagramType} about ${topic} for grade ${gradeLevel}.
  - Include detailed labels and annotations
  - Show cause-and-effect relationships
  - Add comparison elements
  - Include self-check questions
  `,
  
    getReadingLevelInstructions: () => `
  Grade 5-6 students:
  - Vocabulary of 10,000+ words
  - Read 150-200 words per minute
  - Understand complex sentences
  - Can think abstractly
  - Follow multi-step processes
  `,
  
    getMathematicalNotationRules: () => `
  MATH for grades 5-6:
  - Decimals: 3.45 × 2.1 = __
  - Fractions: 3/4 + 2/3 = __
  - Percentages: 15% of 80 = __
  - Basic algebra: 3x + 5 = 20
  - Area and volume formulas
  - Ratios: 3:5 = 12:__
  `,

    getSVGPrompt: (topic: string, concept: string, gradeLevel: number) => `
  SVG ILLUSTRATION FOR AGES 10-12 (Grades 5-6)

  Create a detailed educational diagram that visually explains the concept with annotations and structure.

  WHAT TO DRAW:
  - Illustrate the specific concept with a clear visual explanation — not a generic picture
  - Include a bold title at the top (font-size 16px)
  - Label all components with descriptive annotations (2-4 words each, font-size 12px or larger)
  - Use arrows to show processes, cause-and-effect chains, or directional relationships
  - Show steps in a process with numbered labels or a logical flow
  - Include a brief key/legend if using color to represent categories

  STYLE GUIDELINES:
  - 8-15 elements/shapes
  - Include arrows and connections showing relationships
  - Use a professional but accessible color scheme
  - viewBox="0 0 600 400"
  - Add scale markers or measurement indicators where relevant

  Lesson: "${topic}"
  Concept to illustrate: "${concept}"
  `
  };