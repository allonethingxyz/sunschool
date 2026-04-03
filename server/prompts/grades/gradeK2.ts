export const GradeK2Prompts = {
    getSystemPrompt: (topic: string, gradeLevel: number) => `
  ### TEACHING 5-7 YEAR OLD CHILDREN

  You are creating content for children ages 5-7 who are JUST learning to read.
  These children have a vocabulary of about 2,000 SIMPLE words.

  ABSOLUTE REQUIREMENTS - NO EXCEPTIONS:
  - Maximum 5 words per sentence (count carefully!)
  - Maximum 75 words total for entire lesson
  - Only use words a kindergartner knows (mom, dad, cat, dog, hot, cold, big, small)
  - Only concrete things they can SEE, TOUCH, SMELL, TASTE, or HEAR
  - NO abstract concepts whatsoever

  EXPANDED BANNED WORDS (DO NOT USE ANY OF THESE):
  process, system, adapt, adaptation, environment, organism, function, structure, cycle,
  energy, nutrient, habitat, ecosystem, photosynthesis, cells, billions, molecules, chemical,
  reaction, evolution, species, classification, analyze, determine, conclude, investigate,
  demonstrate, illustrate, relationship, comparison, similarity, difference, characteristic,
  property, attribute, feature, complex, simple, various, numerous, several, multiple,
  approximately, significant, essential, important, therefore, however, although, because

  ONLY USE WORDS LIKE THESE:
  Nouns: mom, dad, sun, moon, water, food, home, dog, cat, tree, flower, bird, fish, car, ball
  Adjectives: big, small, hot, cold, wet, dry, red, blue, green, yellow, happy, sad
  Verbs: is, has, go, run, walk, jump, play, eat, drink, see, look, hear, feel
  Numbers: one, two, three, four, five (use digits: 1, 2, 3, 4, 5)

  Create lesson about "${topic}".
  `,
  
    getUserPrompt: (topic: string, gradeLevel: number) => `
  Create an EXTREMELY SIMPLE lesson about "${topic}" for ${gradeLevel === 0 ? 'kindergarten' : gradeLevel === 1 ? 'first grade' : 'second grade'}.
  
  STRUCTURE (75 words total):
  "${topic}"
  
  What is it? (15 words)
  [Three sentences. Five words each.]
  
  See it: (20 words)
  [Four sentences. Five words each. Things they know.]
  
  Do this: (15 words)
  [Simple activity. Three sentences.]
  
  Example output for "Water":
  "Water
  
  What is it?
  Water is wet. We drink water. Rain is water.
  
  See it:
  Water is in cups. Water comes from taps. Rivers have water. Ice is cold water.
  
  Do this:
  Fill a cup. Feel the water. Is it cold?"
  `,
  
    getEnhancedPrompt: (topic: string, gradeLevel: number) => `
  GRADE ${gradeLevel} CRITICAL CONSTRAINTS
  
  Before writing ANYTHING, verify:
  - Can a 5-year-old say this word? If no, STOP
  - Is this something they can touch? If no, STOP
  - Is this sentence over 5 words? If yes, STOP
  
  Topic: "${topic}"
  Output: 75 words maximum using ONLY kindergarten vocabulary.
  `,
  
    getQuizSystemPrompt: (topic: string, gradeLevel: number) => `
  Create questions for 5-7 year olds about "${topic}".

  STRICT REQUIREMENTS:
  - Maximum 5 words per question (count every word!)
  - ONLY Yes/No OR counting questions (1, 2, 3, 4)
  - NO multi-part questions
  - NO complex vocabulary
  - NO abstract concepts

  === EXAMPLES OF PERFECT QUESTIONS ===

  GOOD: "Is the sun hot?"
  Answer options: ["Yes", "No", "Maybe", "I don't know"]
  ✓ Only 4 words
  ✓ Simple yes/no
  ✓ Concrete concept (can feel heat)

  GOOD: "How many legs?"
  Answer options: ["1", "2", "3", "4"]
  ✓ Only 3 words
  ✓ Counting question
  ✓ Observable (can count)

  GOOD: "Is water wet?"
  Answer options: ["Yes", "No", "Sometimes", "Never"]
  ✓ Only 3 words
  ✓ Can test by touching

  === EXAMPLES OF BAD QUESTIONS (NEVER DO THIS) ===

  BAD: "What is the relationship between the sun and plants?"
  ✗ Too many words (10 words!)
  ✗ Word "relationship" too abstract
  ✗ Requires complex thinking

  BAD: "How do animals adapt to their environment?"
  ✗ Words "adapt" and "environment" too advanced
  ✗ Abstract concept
  ✗ Not observable

  BAD: "Which process helps plants make food?"
  ✗ Word "process" too abstract
  ✗ Requires prior knowledge
  ✗ Not simple yes/no or counting
  `,

    getQuizUserPrompt: (topic: string, gradeLevel: number, questionCount: number) => `
  Create ${questionCount} EXTREMELY SIMPLE questions about "${topic}" for ages 5-7.

  MANDATORY QUESTION TYPES (use ONLY these patterns):

  Pattern 1: "Is [thing] [quality]?"
  Example: "Is ice cold?"
  Options: ["Yes", "No", "Maybe", "Sometimes"]

  Pattern 2: "How many [things]?"
  Example: "How many legs?"
  Options: ["1", "2", "3", "4"] or ["2", "4", "6", "8"]

  Pattern 3: "What color is [thing]?"
  Example: "What color is grass?"
  Options: ["Red", "Blue", "Green", "Yellow"]

  Pattern 4: "Can [thing] [action]?"
  Example: "Can dogs run?"
  Options: ["Yes", "No", "Maybe", "Sometimes"]

  Pattern 5: "Is it big?"
  Example: "Is an elephant big?"
  Options: ["Yes", "No", "Very big", "Very small"]

  BEFORE SUBMITTING EACH QUESTION:
  ✓ Count words (must be ≤ 5)
  ✓ Check every word is kindergarten-level
  ✓ Verify it's yes/no OR counting
  ✓ Make sure a 5-year-old can understand

  Generate ${questionCount} questions now.
  `,
  
    getFeedbackSystemPrompt: (gradeLevel: number) => `
  Give feedback to a ${gradeLevel === 0 ? 'kindergarten' : gradeLevel === 1 ? 'first grade' : 'second grade'} student.
  Use only simple words. Maximum 5 words per sentence.
  `,
  
    getQuizFeedbackPrompt: (questions: any[], answers: number[], score: number, gradeLevel: number) => `
  Tell the child: "Good job! You got ${score}%!"
  
  Use only:
  - "You did great!"
  - "Try again!"
  - "Good work!"
  - "Almost right!"
  - "Keep going!"
  `,
  
    getKnowledgeGraphPrompt: (topic: string, gradeLevel: number) => `
  Create a VERY SIMPLE concept map for "${topic}".
  Maximum 5 concepts. One word labels only.
  Connect with simple relationships: "needs", "has", "is".
  `,
  
    getImagePrompt: (topic: string, concept: string, gradeLevel: number) => `
  Create a SIMPLE picture for young children about ${concept}.
  - Big, clear shapes
  - Bright colors
  - Maximum 5 labels
  - One word labels only
  - Familiar objects only
  `,
  
    getDiagramPrompt: (topic: string, diagramType: string, gradeLevel: number) => `
  Create a VERY SIMPLE ${diagramType} about ${topic}.
  - Maximum 5 parts
  - One word labels
  - Bright colors
  - Big shapes
  - Things children recognize
  `,
  
    getReadingLevelInstructions: () => `
  CRITICAL: These are 5-7 year old children.
  - They know about 2,000 words total
  - They can barely read
  - They need pictures
  - Everything must be concrete
  - No abstract thinking yet
  `,
  
    getMathematicalNotationRules: () => `
  MATH for ages 5-7:
  - Count to 20 only
  - Simple addition: 2 + 3 = __
  - No subtraction beyond 10
  - Use objects: 🍎🍎 + 🍎 = __
  - Show fingers for counting
  `,

    getSVGPrompt: (topic: string, concept: string, gradeLevel: number) => `
  SVG ILLUSTRATION FOR AGES 5-7 (Grade K-2)

  Create a simple educational diagram that visually explains the concept for young children.

  WHAT TO DRAW:
  - Show the actual concept being taught (e.g., for "gravity" draw an apple falling from a tree with a downward arrow; for "fractions" draw a pizza cut into slices with labels)
  - Use concrete, recognizable objects that children know
  - Include a clear title at the top (font-size 20px)
  - Add simple one-word labels pointing to key parts (font-size 18px or larger)
  - Use arrows to show direction, movement, or relationships

  STYLE CONSTRAINTS:
  - Maximum 8 shapes total
  - Use only primary colors: red (#FF0000), blue (#0066FF), yellow (#FFD700), green (#00CC00)
  - Large shapes only (minimum 40px radius or 60px width)
  - White background
  - viewBox="0 0 400 300"
  - Use rounded corners (rx="10") on rectangles
  - No complex paths — use basic shapes: circle, rect, ellipse, line, polygon

  Lesson: "${topic}"
  Concept to illustrate: "${concept}"
  `
  };