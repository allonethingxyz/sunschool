export const Grade9PlusPrompts = {
    getSystemPrompt: (topic: string, gradeLevel: number) => `
  ### TEACHING HIGH SCHOOL AND ADVANCED STUDENTS
  
  Create sophisticated content with full academic rigor.
  
  REQUIREMENTS:
  - No sentence structure limitations
  - 1000-2000 words as appropriate
  - Full technical vocabulary expected
  - Complex theoretical frameworks
  - Research-level thinking
  
  Develop comprehensive analysis of "${topic}".
  `,
  
    getUserPrompt: (topic: string, gradeLevel: number) => `
  Create advanced lesson about "${topic}" for grade ${gradeLevel}.
  
  STRUCTURE (1000-2000 words):
  
  Abstract and Objectives (150 words)
  Theoretical framework and learning goals.
  
  Literature Review (400 words)
  Current understanding and research context.
  
  Core Content (600 words)
  Detailed technical explanation with proofs/evidence.
  
  Applications and Implications (300 words)
  Real-world applications and future directions.
  
  Problem Set (150 words)
  Challenging problems requiring synthesis.
  `,
  
    getEnhancedPrompt: (topic: string, gradeLevel: number) => `
  ADVANCED GRADE ${gradeLevel} LESSON
  
  Scholarly approach to "${topic}":
  1. Establish theoretical foundations
  2. Review current research and debates
  3. Present multiple competing models
  4. Analyze strengths and limitations
  5. Propose extensions or applications
  6. Connect to frontier questions
  
  Include mathematical proofs, data analysis, and critical evaluation.
  `,
  
    getQuizSystemPrompt: (topic: string, gradeLevel: number) => `
  Create college-preparatory assessment for "${topic}".
  
  Include:
  - Multi-part problems requiring synthesis
  - Open-ended analytical questions
  - Proof-based problems
  - Research design questions
  - Critical evaluation tasks
  `,
  
    getQuizUserPrompt: (topic: string, gradeLevel: number, questionCount: number) => `
  Generate ${questionCount} advanced questions about "${topic}" for grade ${gradeLevel}.
  
  Required elements:
  - Free response requiring 100+ word answers
  - Mathematical proofs or derivations
  - Experimental design problems
  - Data analysis with statistical inference
  - Comparative analysis across theories
  - Extension/application to novel scenarios
  
  Format with rubrics and point distributions.
  `,
  
    getFeedbackSystemPrompt: (gradeLevel: number) => `
  Provide university-level feedback for grade ${gradeLevel} student.
  Reference academic standards and research methods.
  Include suggestions for further reading.
  `,
  
    getQuizFeedbackPrompt: (questions: any[], answers: number[], score: number, gradeLevel: number) => `
  Comprehensive Performance Analysis (${score}%):
  
  Academic Competencies:
  [Detailed evaluation of research and analytical skills]
  
  Theoretical Understanding:
  [Assessment of conceptual mastery and ability to synthesize]
  
  Methodological Proficiency:
  [Evaluation of problem-solving approaches]
  
  Recommendations for Advanced Study:
  - Primary sources to review
  - Advanced problems to attempt
  - Research questions to explore
  
  Extension Opportunities:
  [Suggestions for independent investigation]
  `,
  
    getKnowledgeGraphPrompt: (topic: string, gradeLevel: number) => `
  Develop research-level concept map for "${topic}".
  - 20+ interconnected concepts
  - Multiple theoretical frameworks
  - Show competing models
  - Include methodological approaches
  - Mark areas of active research
  `,
  
    getImagePrompt: (topic: string, concept: string, gradeLevel: number) => `
  Create publication-quality diagram about ${concept}.
  - Include mathematical formalism
  - Show derivations or proofs
  - Add statistical visualizations
  - Include error bars and uncertainties
  - Provide comprehensive legend
  `,
  
    getDiagramPrompt: (topic: string, diagramType: string, gradeLevel: number) => `
  Design research-grade ${diagramType} about ${topic}.
  - Include quantitative models
  - Show mathematical relationships
  - Add simulation results
  - Include sensitivity analysis
  - Provide interpretation framework
  `,
  
    getReadingLevelInstructions: () => `
  Grade 9+ students:
  - College-level vocabulary
  - Read 250+ words per minute
  - Understand research papers
  - Evaluate methodology
  - Synthesize complex arguments
  - Generate original insights
  `,
  
    getMathematicalNotationRules: () => `
  MATH for grades 9+:
  - Calculus: d/dx[f(x)], ∫f(x)dx
  - Trigonometry: sin²θ + cos²θ = 1
  - Logarithms: log₂(8) = 3
  - Matrices: [A][B] = [C]
  - Complex numbers: z = a + bi
  - Limits: lim(x→∞) f(x)
  - Vectors: a⃗ · b⃗ = |a||b|cosθ
  - Statistics: σ² = Σ(x-μ)²/n
  `,

    getSVGPrompt: (topic: string, concept: string, gradeLevel: number) => `
  SVG ILLUSTRATION FOR HIGH SCHOOL / ADVANCED (Grade 9+)

  Create a publication-quality educational diagram with thorough annotations and academic styling.

  WHAT TO DRAW:
  - Create a comprehensive diagram specific to the concept being taught
  - Include a clear title (font-size 14px+, bold) and optional subtitle
  - Annotate all components with precise labels and brief descriptions
  - Use arrows, connector lines, and flow indicators to show relationships
  - Include mathematical notation, formulas, or equations where relevant
  - Add a detailed legend/key explaining symbols and color coding
  - Show data representations (charts, graphs, scales) where applicable

  STYLE GUIDELINES:
  - Complex, multi-layer diagrams with 15-30+ elements
  - Publication-quality styling with precise labeling
  - Use multi-panel layouts for comparing models or showing transformations
  - Font-size 10px or larger for annotations, 14px+ for titles
  - viewBox="0 0 800 600"
  - Include detailed legends, axes, and scales
  - Use professional academic color schemes (muted, high-contrast)

  Lesson: "${topic}"
  Concept to illustrate: "${concept}"
  `
  };