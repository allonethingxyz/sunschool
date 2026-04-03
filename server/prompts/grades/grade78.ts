export const Grade78Prompts = {
    getSystemPrompt: (topic: string, gradeLevel: number) => `
  ### TEACHING 12-14 YEAR OLD STUDENTS
  
  Create content for developing critical thinking and analysis.
  
  REQUIREMENTS:
  - Complex sentence structures acceptable
  - Maximum 700 words total
  - Use subject-specific terminology
  - Develop multi-step reasoning
  - Include interdisciplinary connections
  
  Create analytical lesson about "${topic}".
  `,
  
    getUserPrompt: (topic: string, gradeLevel: number) => `
  Develop comprehensive lesson about "${topic}" for grade ${gradeLevel}.
  
  STRUCTURE (700 words maximum):
  
  Introduction and Context (100 words)
  Historical or scientific background.
  
  Conceptual Framework (250 words)
  Detailed explanation with technical vocabulary.
  
  Analysis and Examples (200 words)
  Multiple perspectives and applications.
  
  Critical Thinking Exercise (150 words)
  Problem-solving or investigation task.
  `,
  
    getEnhancedPrompt: (topic: string, gradeLevel: number) => `
  GRADE ${gradeLevel} ANALYTICAL LESSON
  
  Apply metacognitive approach:
  1. Activate prior knowledge from multiple subjects
  2. Introduce 5-7 technical terms with etymology
  3. Build conceptual model with interconnections
  4. Challenge assumptions and explore edge cases
  5. Connect to current events or research
  
  Topic: "${topic}"
  Output: 700 words with appropriate academic rigor.
  `,
  
    getQuizSystemPrompt: (topic: string, gradeLevel: number) => `
  Design grade ${gradeLevel} assessment for "${topic}".
  
  Question distribution:
  - Knowledge/Recall: 15%
  - Comprehension: 25%
  - Application: 25%
  - Analysis: 20%
  - Evaluation: 15%
  
  Include data interpretation and critical thinking.
  `,
  
    getQuizUserPrompt: (topic: string, gradeLevel: number, questionCount: number) => `
  Create ${questionCount} rigorous questions about "${topic}" for grade ${gradeLevel}.
  
  Question types required:
  - Data analysis: "Based on the graph..."
  - Hypothesis testing: "Which explanation best..."
  - System thinking: "How would changing X affect..."
  - Evaluation: "Which solution is most effective..."
  - Synthesis: "Combine these concepts to explain..."
  
  Include passages, graphs, or scenarios as needed.
  `,
  
    getFeedbackSystemPrompt: (gradeLevel: number) => `
  Provide sophisticated feedback for grade ${gradeLevel} student.
  Reference specific academic skills and standards.
  Include metacognitive guidance.
  `,
  
    getQuizFeedbackPrompt: (questions: any[], answers: number[], score: number, gradeLevel: number) => `
  Performance Analysis for ${score}%:
  
  Cognitive Skills Assessment:
  [Detailed analysis of thinking patterns]
  
  Conceptual Understanding:
  - Mastered: [List concepts]
  - Developing: [List concepts]
  - Needs reinforcement: [List concepts]
  
  Strategic Recommendations:
  1. [Specific study technique]
  2. [Practice methodology]
  3. [Resource suggestion]
  
  Challenge Problems:
  [2-3 complex, multi-step problems]
  `,
  
    getKnowledgeGraphPrompt: (topic: string, gradeLevel: number) => `
  Create comprehensive knowledge network for "${topic}" - grade ${gradeLevel}.
  - 15-20 concepts with hierarchies
  - Show prerequisite relationships
  - Include cross-disciplinary connections
  - Mark critical path for understanding
  `,
  
    getImagePrompt: (topic: string, concept: string, gradeLevel: number) => `
  Design sophisticated diagram about ${concept} for grade ${gradeLevel}.
  - Include multiple representations
  - Show mathematical relationships
  - Add data visualizations
  - Include interpretation guide
  `,
  
    getDiagramPrompt: (topic: string, diagramType: string, gradeLevel: number) => `
  Create advanced ${diagramType} about ${topic} for grade ${gradeLevel}.
  - Include quantitative elements
  - Show system interactions
  - Add variable relationships
  - Include analysis prompts
  `,
  
    getReadingLevelInstructions: () => `
  Grade 7-8 students:
  - Vocabulary of 50,000+ words
  - Read 200-250 words per minute
  - Understand complex arguments
  - Analyze multiple viewpoints
  - Synthesize information
  `,
  
    getMathematicalNotationRules: () => `
  MATH for grades 7-8:
  - Linear equations: 2x + 3y = 12
  - Systems: Solve for x and y
  - Exponents: 3² × 3⁴ = 3ⁿ
  - Pythagorean theorem: a² + b² = c²
  - Functions: f(x) = 2x + 5
  - Inequalities: 3x - 7 < 14
  - Slope: m = (y₂-y₁)/(x₂-x₁)
  `,

    getSVGPrompt: (topic: string, concept: string, gradeLevel: number) => `
  SVG ILLUSTRATION FOR AGES 12-14 (Grades 7-8)

  Create a detailed, academically-styled diagram that visually explains the concept with full annotations.

  WHAT TO DRAW:
  - Create an informative scientific or academic diagram specific to the concept
  - Include a clear title at the top (font-size 14px+, bold)
  - Add detailed callout labels with brief descriptions for all key components
  - Use arrows with labels to show processes, forces, flows, or causal chains
  - Show quantitative relationships where applicable (scales, proportions, data)
  - Include a legend/key if using multiple colors or symbols

  STYLE GUIDELINES:
  - Detailed diagrams with 12-20 elements
  - Use scientific/academic styling with clear typography
  - Font-size 11px or larger for labels, 14px+ for titles
  - viewBox="0 0 700 500"
  - Use subtle gridlines or axes for data-oriented diagrams
  - Support multiple interconnected systems

  Lesson: "${topic}"
  Concept to illustrate: "${concept}"
  `
  };