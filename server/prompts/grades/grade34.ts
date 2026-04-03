export const Grade34Prompts = {
    getSystemPrompt: (topic: string, gradeLevel: number) => `
  ### TEACHING 8-10 YEAR OLD CHILDREN (GRADES 3-4)

  Create content for children ages 8-10 who are developing reading fluency.
  These children know about 4,000-6,000 words and can read simple paragraphs.

  STRICT REQUIREMENTS:
  - Maximum 8 words per sentence (count carefully!)
  - Maximum 200 words total for entire lesson
  - Use grade 3-4 vocabulary ONLY (no high school or college words)
  - Introduce ONE new concept at a time
  - Connect to experiences familiar to 8-10 year olds (school, home, playground)
  - Use concrete examples they can visualize

  BANNED WORDS FOR GRADES 3-4:
  molecular, cellular, genetic, heredity, chromosomes, proteins, enzymes, metabolism,
  symbiosis, mutualism, photosynthesis, respiration, mitosis, meiosis, polynomial,
  quadratic, exponential, logarithm, derivative, integral, theorem, hypothesis,
  subsequently, furthermore, nevertheless, consequently, whereas, complexity,
  comprehensive, synthesize, analyze (use "look at" or "study" instead)

  USE VOCABULARY LIKE THIS:
  - Science: animals, plants, water, air, heat, light, grow, change, measure
  - Math: add, subtract, multiply, divide, fraction, equal, pattern, shape
  - Descriptive: hot/cold, fast/slow, heavy/light, rough/smooth, living/non-living

  Create engaging lesson about "${topic}".
  `,
  
    getUserPrompt: (topic: string, gradeLevel: number) => `
  Create a lesson about "${topic}" for grade ${gradeLevel}.
  
  STRUCTURE (200 words maximum):
  
  Introduction (30 words)
  Connect to what they know.
  
  Main Ideas (80 words)
  - First main point
  - Second main point
  - Third main point
  
  Examples (50 words)
  Real things from their life.
  
  Activity (40 words)
  Something they can do at home or school.
  `,
  
    getEnhancedPrompt: (topic: string, gradeLevel: number) => `
  ENHANCED GRADE ${gradeLevel} LESSON
  
  Apply Chain-of-Thought:
  1. What do 9-year-olds know about "${topic}"?
  2. What single new idea can I add?
  3. How does this connect to their life?
  
  Maximum 200 words. Grade 3-4 reading level.
  `,
  
    getQuizSystemPrompt: (topic: string, gradeLevel: number) => `
  Create grade ${gradeLevel} questions about "${topic}" for ages 8-10.

  STRICT REQUIREMENTS:
  - Maximum 10 words per question (count every word!)
  - Multiple choice with 4 options
  - Test understanding, NOT memorization of facts
  - Use simple, clear wording
  - Avoid multi-part questions

  === EXAMPLES OF PERFECT QUESTIONS FOR GRADES 3-4 ===

  GOOD: "What makes plants grow?"
  Options: ["Sunlight and water", "Only rocks", "Just air", "Only dirt"]
  ✓ Simple vocabulary (4 words)
  ✓ Tests understanding of basic concept
  ✓ Clear options at grade level

  GOOD: "Which animal lays eggs?"
  Options: ["Chicken", "Dog", "Cat", "Horse"]
  ✓ Direct question (4 words)
  ✓ Tests classification knowledge
  ✓ All options are animals they know

  GOOD: "How do seeds travel?"
  Options: ["Wind or animals carry them", "They walk", "They fly alone", "They don't move"]
  ✓ Age-appropriate (4 words)
  ✓ Tests cause-and-effect understanding
  ✓ Options make sense to test knowledge

  === EXAMPLES OF BAD QUESTIONS (NEVER DO THIS) ===

  BAD: "What is the primary mechanism by which organisms adapt to environmental pressures?"
  ✗ Too many words (13 words!)
  ✗ Words "mechanism", "organisms", "environmental" too advanced
  ✗ Concept too abstract for 8-10 year olds

  BAD: "Considering the relationship between photosynthesis and cellular respiration, which process occurs first?"
  ✗ Way too complex (14 words!)
  ✗ Multi-part concept
  ✗ Requires understanding beyond grade 3-4

  BAD: "What happens to water during the evaporation stage of the hydrological cycle?"
  ✗ Too technical: "evaporation", "hydrological"
  ✗ Better to ask: "What happens when water gets hot?"
  `,

    getQuizUserPrompt: (topic: string, gradeLevel: number, questionCount: number) => `
  Create ${questionCount} questions about "${topic}" for grade ${gradeLevel} (ages 8-10).

  MANDATORY QUESTION PATTERNS (use these types):

  Type 1: "Which [thing] is [characteristic]?"
  Example: "Which animal is the biggest?"
  Options: ["Elephant", "Mouse", "Cat", "Dog"]

  Type 2: "What happens when [simple action]?"
  Example: "What happens when ice gets hot?"
  Options: ["It melts", "It freezes", "It grows", "It breaks"]

  Type 3: "How many [simple measurement]?"
  Example: "How many legs does a spider have?"
  Options: ["8", "6", "4", "2"]

  Type 4: "Why does [simple phenomenon]?"
  Example: "Why does a ball fall down?"
  Options: ["Gravity pulls it", "Wind pushes it", "It wants to", "Magic"]

  Type 5: "What do all [category] have?"
  Example: "What do all birds have?"
  Options: ["Feathers", "Fur", "Scales", "Shells"]

  BEFORE SUBMITTING:
  ✓ Count words (must be ≤ 10)
  ✓ Check vocabulary is grade 3-4 level
  ✓ Verify a 9-year-old can understand
  ✓ Make sure you're not using banned words

  Generate ${questionCount} questions now.
  `,
  
    getFeedbackSystemPrompt: (gradeLevel: number) => `
  Give encouraging feedback to a grade ${gradeLevel} student.
  Use grade-appropriate vocabulary.
  Be specific about what they did well.
  `,
  
    getQuizFeedbackPrompt: (questions: any[], answers: number[], score: number, gradeLevel: number) => `
  Provide feedback for ${score}% score.
  
  Structure:
  "Nice work! You got ${score}%!"
  
  What you did well:
  [Specific examples]
  
  Practice these:
  [2-3 specific skills]
  
  Try these problems:
  [2 practice problems]
  `,
  
    getKnowledgeGraphPrompt: (topic: string, gradeLevel: number) => `
  Create concept map for "${topic}" - grade ${gradeLevel}.
  - 7-10 concepts
  - Two-word labels maximum
  - Show "causes", "needs", "makes", "helps" relationships
  `,
  
    getImagePrompt: (topic: string, concept: string, gradeLevel: number) => `
  Create educational diagram about ${concept} for grade ${gradeLevel}.
  - Clear labels (1-2 words)
  - Show parts and wholes
  - Include size comparisons
  - Use familiar objects for scale
  `,
  
    getDiagramPrompt: (topic: string, diagramType: string, gradeLevel: number) => `
  Create ${diagramType} about ${topic} for grade ${gradeLevel}.
  - Label important parts
  - Show how things connect
  - Include a "What to Notice" box
  - Compare to familiar objects
  `,
  
    getReadingLevelInstructions: () => `
  Grade 3-4 students:
  - Know about 4,000-6,000 words
  - Read 100-150 words per minute
  - Understanding cause and effect
  - Can follow 2-3 step instructions
  `,
  
    getMathematicalNotationRules: () => `
  MATH for grades 3-4:
  - Multiplication: 7 × 8 = __
  - Division: 56 ÷ 7 = __
  - Fractions: 1/2, 1/4, 3/4
  - Word problems with 2 steps
  - Numbers up to 10,000
  `,

    getSVGPrompt: (topic: string, concept: string, gradeLevel: number) => `
  SVG ILLUSTRATION FOR AGES 8-10 (Grades 3-4)

  Create an educational diagram that visually explains the concept with clear labels and structure.

  WHAT TO DRAW:
  - Illustrate the specific concept being taught — not a generic image
  - Include a clear title at the top of the diagram (font-size 16px, bold)
  - Label all important parts with 1-3 word annotations (font-size 14px or larger)
  - Use arrows to show processes, cause-and-effect, or relationships between parts
  - Use visual metaphors that make abstract ideas concrete (e.g., a balance scale for equations)

  STYLE GUIDELINES:
  - 5-10 elements/shapes
  - Use a friendly color palette with good contrast
  - Show parts and wholes — label important components
  - Include simple arrows or lines to connect related items
  - viewBox="0 0 500 350"
  - Use familiar objects for scale reference
  - White or light background

  Lesson: "${topic}"
  Concept to illustrate: "${concept}"
  `
  };