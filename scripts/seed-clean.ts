import * as schema from '../shared/schema';
import { hashPassword } from '../server/middleware/auth';
import crypto from 'crypto';
const { randomBytes } = crypto;

// Use crypto.randomBytes instead of nanoid
function generateId(size: number = 6): string {
  return randomBytes(size).toString('hex').slice(0, size);
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const isNeonDb = DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('neonhost');

  // Auto-select driver: pg for local/CI, Neon serverless for Neon cloud
  let pool: any;
  if (isNeonDb) {
    const { Pool: NeonPool, neonConfig } = await import('@neondatabase/serverless');
    const ws = await import('ws');
    neonConfig.webSocketConstructor = ws.default;
    pool = new NeonPool({ connectionString: DATABASE_URL });
  } else {
    const { Pool: PgPool } = await import('pg');
    pool = new PgPool({ connectionString: DATABASE_URL });
  }

  console.log('Seeding database with demo data...');
  
  try {
    // Check if admin user already exists
    const adminCheck = await pool.query(
      "SELECT * FROM users WHERE email = 'admin@example.com'"
    );
    
    if (adminCheck.rows.length > 0) {
      console.log('Admin user already exists, skipping seed process...');
      console.log('Set FORCE_SEED=1 if you want to clear the database and re-seed.');
      await pool.end();
      return;
    }
  } catch (error) {
    console.error('Error checking for existing admin user:', error);
  }
  
  // Skip the drizzle ORM since we're having type issues, use raw SQL instead
  // Create admin user
  console.log('Creating admin user...');
  const adminPassword = await hashPassword('admin1234');
  
  // Print users schema to debug
  console.log('Users schema fields:', Object.keys(schema.users));
  
  const adminUser = {
    // Don't specify id - let the database generate it as SERIAL
    username: 'admin',
    email: 'admin@example.com',
    name: 'System Administrator',
    role: 'ADMIN',
    password: adminPassword,
  };
  
  console.log('Inserting admin user:', adminUser);
  // Use raw SQL to ensure field names and types match the database schema
  const result = await pool.query(
    `INSERT INTO users (username, email, name, role, password)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      adminUser.username,
      adminUser.email,
      adminUser.name,
      adminUser.role,
      adminUser.password
    ]
  );
  const admin = result.rows[0];
  console.log(`Admin created with ID: ${admin.id}`);

  // Create parent user
  console.log('Creating parent user...');
  const parentPassword = await hashPassword('parent1234');
  const parentResult = await pool.query(
    `INSERT INTO users (username, email, name, role, password)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      'parent',
      'parent@example.com',
      'Demo Parent',
      'PARENT',
      parentPassword
    ]
  );
  const parent = parentResult.rows[0];
  console.log(`Parent created with ID: ${parent.id}`);

  // Create learner user
  console.log('Creating learner user...');
  const learnerPassword = await hashPassword('learner1234');
  const learnerResult = await pool.query(
    `INSERT INTO users (username, email, name, role, parent_id, password)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      'learner',
      'learner@example.com',
      'Demo Student',
      'LEARNER',
      parent.id,
      learnerPassword
    ]
  );
  const learner = learnerResult.rows[0];
  console.log(`Learner created with ID: ${learner.id}`);

  // Create learner profile
  console.log('Creating learner profile...');
  console.log(`Creating profile for user ID: ${learner.id} (type: ${typeof learner.id})`);
  
  // Use raw SQL to avoid field name mapping issues
  const profileResult = await pool.query(
    `INSERT INTO learner_profiles (id, user_id, grade_level, graph) 
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      crypto.randomUUID(),
      learner.id,
      6,
      JSON.stringify({ nodes: [], edges: [] })
    ]
  );
  const profile = profileResult.rows[0];
  console.log(`Learner profile created with ID: ${profile.id}`);

  // Create static lessons
  console.log('Creating sample lessons...');
  const topics = ['Solar System', 'Fractions', 'Ancient Egypt', 'Photosynthesis'];
  
  for (const topic of topics) {
    const moduleId = `module-${generateId(6)}`;
    const lessonSpec = generateStaticLesson(6, topic);
    
    console.log(`Creating lesson with learner ID: ${learner.id} (type: ${typeof learner.id})`);
    
    // Using raw SQL to avoid field name issues
    const lessonResult = await pool.query(
      `INSERT INTO lessons (id, learner_id, module_id, status, spec) 
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        crypto.randomUUID(),
        learner.id,
        moduleId,
        'QUEUED',
        JSON.stringify(lessonSpec)
      ]
    );
    
    const lesson = lessonResult.rows[0];
    console.log(`Lesson created: ${topic} (ID: ${lesson.id})`);
  }

  // Mark the first lesson as active
  const lessonsResult = await pool.query(
    `SELECT * FROM lessons 
     WHERE learner_id = $1 
     ORDER BY created_at ASC 
     LIMIT 1`, 
    [learner.id]
  );
  
  if (lessonsResult.rows.length > 0) {
    const lessonId = lessonsResult.rows[0].id;
    await pool.query(`UPDATE lessons SET status = 'ACTIVE' WHERE id = $1`, [lessonId]);
    console.log(`Marked lesson ${lessonId} as active`);
  }

  console.log('Database seeded successfully!');
  await pool.end();
}

function generateStaticLesson(gradeLevel: number, topic: string) {
  const lessons: Record<string, any> = {
    'Solar System': {
      title: 'Exploring Our Solar System',
      content: `# Exploring Our Solar System

## Introduction
Our solar system consists of the Sun and everything that orbits around it, including planets, dwarf planets, moons, asteroids, comets, and meteoroids. Let's explore these fascinating celestial bodies!

## The Sun
The Sun is the center of our solar system. It's a star - a giant ball of hot, glowing gases. The Sun's gravity holds the solar system together.

## The Planets
There are eight planets in our solar system:

1. **Mercury** - The smallest and closest to the Sun
2. **Venus** - Similar in size to Earth with a thick, toxic atmosphere
3. **Earth** - Our home planet, the only known place with life
4. **Mars** - Known as the Red Planet due to iron oxide (rust) on its surface
5. **Jupiter** - The largest planet, a gas giant with a Great Red Spot
6. **Saturn** - Famous for its beautiful rings made of ice and rock
7. **Uranus** - Rotates on its side like a rolling ball
8. **Neptune** - The windiest planet with speeds reaching 1,200 mph

## Dwarf Planets
Pluto, once considered the ninth planet, is now classified as a dwarf planet. Other dwarf planets include Ceres, Eris, Haumea, and Makemake.

## Interesting Facts
- One day on Venus is longer than one year on Venus.
- Jupiter has at least 79 moons.
- Saturn's rings are made up of billions of ice particles, ranging from tiny dust grains to large boulders.
- Space is completely silent because there is no air to carry sound waves.`,
      questions: [
        {
          text: 'Which planet is closest to the Sun?',
          options: ['Venus', 'Mercury', 'Earth', 'Mars'],
          correctIndex: 1,
          explanation: 'Mercury is the closest planet to the Sun in our solar system.'
        },
        {
          text: 'How many planets are in our solar system?',
          options: ['7', '8', '9', '10'],
          correctIndex: 1,
          explanation: 'There are eight recognized planets in our solar system. Pluto was reclassified as a dwarf planet in 2006.'
        },
        {
          text: 'Which planet has the Great Red Spot?',
          options: ['Mars', 'Venus', 'Jupiter', 'Saturn'],
          correctIndex: 2,
          explanation: 'Jupiter has the Great Red Spot, which is a giant storm that has been raging for at least 400 years.'
        },
        {
          text: 'What are Saturn\'s rings mostly made of?',
          options: ['Rock', 'Gas', 'Ice', 'Dust'],
          correctIndex: 2,
          explanation: 'Saturn\'s rings are mostly made of ice particles, with some rock and dust.'
        },
        {
          text: 'Which planet is known as the Red Planet?',
          options: ['Venus', 'Mars', 'Mercury', 'Jupiter'],
          correctIndex: 1,
          explanation: 'Mars is known as the Red Planet because of the iron oxide (rust) on its surface, giving it a reddish appearance.'
        }
      ],
      graph: {
        nodes: [
          { id: 'sun', label: 'The Sun' },
          { id: 'mercury', label: 'Mercury' },
          { id: 'venus', label: 'Venus' },
          { id: 'earth', label: 'Earth' },
          { id: 'mars', label: 'Mars' },
          { id: 'jupiter', label: 'Jupiter' },
          { id: 'saturn', label: 'Saturn' },
          { id: 'uranus', label: 'Uranus' },
          { id: 'neptune', label: 'Neptune' },
          { id: 'dwarfPlanets', label: 'Dwarf Planets' },
          { id: 'asteroids', label: 'Asteroids' },
          { id: 'comets', label: 'Comets' }
        ],
        edges: [
          { source: 'sun', target: 'mercury' },
          { source: 'sun', target: 'venus' },
          { source: 'sun', target: 'earth' },
          { source: 'sun', target: 'mars' },
          { source: 'sun', target: 'jupiter' },
          { source: 'sun', target: 'saturn' },
          { source: 'sun', target: 'uranus' },
          { source: 'sun', target: 'neptune' },
          { source: 'sun', target: 'dwarfPlanets' },
          { source: 'sun', target: 'asteroids' },
          { source: 'sun', target: 'comets' }
        ]
      }
    },
    'Fractions': {
      title: 'Understanding Fractions',
      content: `# Understanding Fractions

## What Are Fractions?
Fractions represent parts of a whole. They consist of a numerator (top number) and a denominator (bottom number). The numerator tells how many parts we have, and the denominator tells how many parts make a whole.

## Types of Fractions

### Proper Fractions
When the numerator is less than the denominator (e.g., 3/4), it's called a proper fraction. Its value is less than 1.

### Improper Fractions
When the numerator is greater than or equal to the denominator (e.g., 5/4), it's called an improper fraction. Its value is greater than or equal to 1.

### Mixed Numbers
A mixed number has a whole number part and a fraction part (e.g., 1 1/2). It's another way to write an improper fraction.

## Equivalent Fractions
Fractions that represent the same value are called equivalent fractions. For example, 1/2 = 2/4 = 3/6.

To find an equivalent fraction, multiply or divide both the numerator and denominator by the same number.

## Adding and Subtracting Fractions
To add or subtract fractions with the same denominator, simply add or subtract the numerators and keep the denominator the same.

For fractions with different denominators, you need to find a common denominator first, usually the least common multiple (LCM) of the denominators.

## Multiplying Fractions
To multiply fractions, multiply the numerators together and multiply the denominators together.

## Dividing Fractions
To divide by a fraction, multiply by its reciprocal (flip the numerator and denominator).

## Real-World Applications
Fractions are everywhere in daily life: cooking (1/2 cup of sugar), time (3/4 of an hour), sales (25% or 1/4 off), and much more!`,
      questions: [
        {
          text: 'What is a proper fraction?',
          options: [
            'When the numerator is greater than the denominator',
            'When the numerator is equal to the denominator',
            'When the numerator is less than the denominator',
            'When the denominator is 0'
          ],
          correctIndex: 2,
          explanation: 'A proper fraction has a numerator that is less than the denominator, making its value less than 1.'
        },
        {
          text: 'How do you find equivalent fractions?',
          options: [
            'Add the same number to the numerator and denominator',
            'Multiply or divide both the numerator and denominator by the same number',
            'Subtract the same number from the numerator and denominator',
            'Multiply the numerator by 2 and divide the denominator by 2'
          ],
          correctIndex: 1,
          explanation: 'To find equivalent fractions, multiply or divide both the numerator and denominator by the same non-zero number.'
        },
        {
          text: 'To add fractions with different denominators, you first need to:',
          options: [
            'Add the denominators together',
            'Find a common denominator',
            'Multiply the fractions together',
            'Convert them to decimals'
          ],
          correctIndex: 1,
          explanation: 'To add fractions with different denominators, you need to find a common denominator, usually the least common multiple (LCM) of the denominators.'
        },
        {
          text: 'How do you multiply fractions?',
          options: [
            'Multiply numerators together and denominators together',
            'Find a common denominator first',
            'Multiply the first fraction by the reciprocal of the second',
            'Add the numerators and multiply the denominators'
          ],
          correctIndex: 0,
          explanation: 'To multiply fractions, multiply the numerators together and multiply the denominators together.'
        },
        {
          text: 'Which of these is an improper fraction?',
          options: ['3/4', '5/5', '7/3', '1/8'],
          correctIndex: 2,
          explanation: '7/3 is an improper fraction because the numerator (7) is greater than the denominator (3), making its value greater than 1.'
        }
      ],
      graph: {
        nodes: [
          { id: 'fractions', label: 'Fractions' },
          { id: 'proper', label: 'Proper Fractions' },
          { id: 'improper', label: 'Improper Fractions' },
          { id: 'mixed', label: 'Mixed Numbers' },
          { id: 'equivalent', label: 'Equivalent Fractions' },
          { id: 'add', label: 'Adding Fractions' },
          { id: 'subtract', label: 'Subtracting Fractions' },
          { id: 'multiply', label: 'Multiplying Fractions' },
          { id: 'divide', label: 'Dividing Fractions' },
          { id: 'applications', label: 'Real-World Applications' }
        ],
        edges: [
          { source: 'fractions', target: 'proper' },
          { source: 'fractions', target: 'improper' },
          { source: 'fractions', target: 'mixed' },
          { source: 'fractions', target: 'equivalent' },
          { source: 'fractions', target: 'add' },
          { source: 'fractions', target: 'subtract' },
          { source: 'fractions', target: 'multiply' },
          { source: 'fractions', target: 'divide' },
          { source: 'fractions', target: 'applications' },
          { source: 'improper', target: 'mixed' }
        ]
      }
    },
    'Ancient Egypt': {
      title: 'Ancient Egyptian Civilization',
      content: `# Ancient Egyptian Civilization

## Introduction
Ancient Egypt was one of the world's greatest civilizations, lasting for over 3,000 years from around 3100 BCE to 30 BCE. It developed along the Nile River in northeastern Africa.

## The Nile River
The Nile was essential to Egyptian life. Annual flooding deposited rich, fertile soil along the riverbanks, allowing for abundant crops. The river also provided transportation, building materials, and papyrus plants for paper.

## Pharaohs and Government
Egypt was ruled by pharaohs, who were considered living gods. Famous pharaohs include Tutankhamun, Ramses II, and Cleopatra VII (the last pharaoh of Egypt). The pharaoh owned all the land and was responsible for law, order, and defense.

## Pyramids and Temples
Egyptians built massive stone structures like pyramids as tombs for pharaohs. The Great Pyramid of Giza, built for Pharaoh Khufu, is the only one of the Seven Wonders of the Ancient World still standing. Temples were built to honor gods and goddesses.

## Mummification and Afterlife
Egyptians believed in an afterlife and preserved bodies through mummification. They buried the dead with items they would need in the afterlife. The Book of the Dead contained spells to help the deceased navigate the afterlife.

## Hieroglyphics
Hieroglyphics was the Egyptian writing system using pictorial symbols. It was primarily used by priests and officials. The Rosetta Stone, discovered in 1799, was key to deciphering hieroglyphics.

## Daily Life
Most Egyptians were farmers. Other occupations included scribes, craftsmen, and soldiers. Women had more rights than in many other ancient civilizations, including the right to own property.

## Religion
Egyptians were polytheistic, worshipping many gods and goddesses. Important deities included Amun-Ra (sun god), Osiris (god of the afterlife), Isis (goddess of motherhood), and Anubis (god of mummification).

## Legacy
Ancient Egypt's contributions include advances in mathematics, astronomy, medicine, architecture, art, and literature. Their cultural influence continues to fascinate us today.`,
      questions: [
        {
          text: 'Why was the Nile River important to ancient Egypt?',
          options: [
            'It provided a barrier against invaders',
            'It flooded annually, providing fertile soil for farming',
            'It was used for religious ceremonies only',
            'It was the only source of drinking water'
          ],
          correctIndex: 1,
          explanation: 'The annual flooding of the Nile River deposited rich, fertile soil along its banks, which was crucial for agriculture in the otherwise desert region.'
        },
        {
          text: 'What were pyramids primarily built for?',
          options: [
            'Astronomical observations',
            'Religious ceremonies',
            'Government offices',
            'Tombs for pharaohs'
          ],
          correctIndex: 3,
          explanation: 'Pyramids were massive stone structures primarily built as tombs for pharaohs to preserve their bodies and possessions for the afterlife.'
        },
        {
          text: 'Who was the last pharaoh of ancient Egypt?',
          options: [
            'Tutankhamun',
            'Ramses II',
            'Cleopatra VII',
            'Khufu'
          ],
          correctIndex: 2,
          explanation: 'Cleopatra VII was the last pharaoh of ancient Egypt. After her death in 30 BCE, Egypt became a province of the Roman Empire.'
        },
        {
          text: 'What was the purpose of mummification in ancient Egypt?',
          options: [
            'To preserve bodies for the afterlife',
            'To prevent disease spread',
            'To honor the gods',
            'To display in temples'
          ],
          correctIndex: 0,
          explanation: 'Mummification was performed to preserve the body for the afterlife. Egyptians believed the soul (ka) needed to return to the body in the afterlife.'
        },
        {
          text: 'What was the significance of the Rosetta Stone?',
          options: [
            'It contained magical spells',
            'It listed all Egyptian pharaohs',
            'It helped scholars decipher hieroglyphics',
            'It was a calendar of religious festivals'
          ],
          correctIndex: 2,
          explanation: 'The Rosetta Stone, discovered in 1799, contained the same text in three scripts: hieroglyphics, demotic, and ancient Greek. This allowed scholars to finally decipher hieroglyphics.'
        }
      ],
      graph: {
        nodes: [
          { id: 'egypt', label: 'Ancient Egypt' },
          { id: 'nile', label: 'Nile River' },
          { id: 'pharaohs', label: 'Pharaohs' },
          { id: 'pyramids', label: 'Pyramids' },
          { id: 'mummification', label: 'Mummification' },
          { id: 'afterlife', label: 'Afterlife' },
          { id: 'hieroglyphics', label: 'Hieroglyphics' },
          { id: 'religion', label: 'Religion' },
          { id: 'dailyLife', label: 'Daily Life' },
          { id: 'legacy', label: 'Legacy' }
        ],
        edges: [
          { source: 'egypt', target: 'nile' },
          { source: 'egypt', target: 'pharaohs' },
          { source: 'egypt', target: 'pyramids' },
          { source: 'egypt', target: 'mummification' },
          { source: 'egypt', target: 'hieroglyphics' },
          { source: 'egypt', target: 'religion' },
          { source: 'egypt', target: 'dailyLife' },
          { source: 'egypt', target: 'legacy' },
          { source: 'mummification', target: 'afterlife' },
          { source: 'religion', target: 'afterlife' },
          { source: 'pharaohs', target: 'pyramids' }
        ]
      }
    },
    'Photosynthesis': {
      title: 'Photosynthesis: How Plants Make Food',
      content: `# Photosynthesis: How Plants Make Food

## What is Photosynthesis?
Photosynthesis is the process by which green plants, algae, and some bacteria convert light energy (usually from the sun) into chemical energy stored in glucose (sugar). This process is essential for life on Earth as it produces oxygen and food for many organisms.

## The Process of Photosynthesis
The simple equation for photosynthesis is:

**Carbon dioxide + Water + Light energy → Glucose + Oxygen**

Or written chemically:

**6CO₂ + 6H₂O + Light energy → C₆H₁₂O₆ + 6O₂**

## Where Does Photosynthesis Happen?
Photosynthesis takes place primarily in the leaves of plants, specifically in cell structures called chloroplasts. Chloroplasts contain a green pigment called chlorophyll, which captures light energy and gives plants their green color.

## Steps of Photosynthesis
Photosynthesis occurs in two main stages:

### 1. Light-Dependent Reactions
- Take place in the thylakoid membranes of chloroplasts
- Capture light energy and convert it to chemical energy (ATP and NADPH)
- Split water molecules, releasing oxygen as a byproduct

### 2. Calvin Cycle (Light-Independent Reactions)
- Takes place in the stroma of chloroplasts
- Uses ATP and NADPH from the light-dependent reactions
- Carbon dioxide is incorporated into organic molecules
- Produces glucose and other carbohydrates

## Factors Affecting Photosynthesis
Several factors can influence the rate of photosynthesis:

- **Light intensity**: More light generally means more photosynthesis, up to a point
- **Carbon dioxide concentration**: Higher CO₂ levels can increase photosynthesis
- **Temperature**: Plants have optimal temperature ranges for photosynthesis
- **Water availability**: Water is necessary for photosynthesis
- **Chlorophyll content**: More chlorophyll can capture more light

## Importance of Photosynthesis
- Produces oxygen for animals to breathe
- Creates food (glucose) that forms the base of most food chains
- Removes carbon dioxide from the atmosphere
- Provides the energy that powers ecosystems
- Produces materials humans use (wood, cotton, paper, etc.)

## Adaptations for Photosynthesis
Plants have various adaptations to maximize photosynthesis:

- Leaves with large surface areas to capture more light
- Stomata (tiny pores) to allow gas exchange
- Vascular systems to transport water and nutrients
- Different photosynthetic pathways (C3, C4, CAM) for different environments`,
      questions: [
        {
          text: 'What is the primary pigment that captures light energy in photosynthesis?',
          options: ['Carotene', 'Chlorophyll', 'Xanthophyll', 'Phycoerythrin'],
          correctIndex: 1,
          explanation: 'Chlorophyll is the primary pigment in plants that captures light energy for photosynthesis. It also gives plants their green color.'
        },
        {
          text: 'Which gas is produced as a byproduct of photosynthesis?',
          options: ['Carbon dioxide', 'Nitrogen', 'Oxygen', 'Hydrogen'],
          correctIndex: 2,
          explanation: 'Oxygen (O₂) is released as a byproduct of photosynthesis when water molecules are split during the light-dependent reactions.'
        },
        {
          text: 'Where does photosynthesis primarily take place in plants?',
          options: ['Roots', 'Stems', 'Flowers', 'Leaves'],
          correctIndex: 3,
          explanation: 'Photosynthesis primarily takes place in the leaves of plants, which are typically thin and flat to maximize light absorption.'
        },
        {
          text: 'What are the two main stages of photosynthesis?',
          options: [
            'Germination and pollination',
            'Respiration and transpiration',
            'Light-dependent reactions and the Calvin cycle',
            'Mitosis and meiosis'
          ],
          correctIndex: 2,
          explanation: 'The two main stages of photosynthesis are the light-dependent reactions (which capture light energy) and the Calvin cycle (which uses carbon dioxide to make glucose).'
        },
        {
          text: 'Which of these is NOT a factor that affects the rate of photosynthesis?',
          options: [
            'Light intensity',
            'Carbon dioxide concentration',
            'Soil acidity',
            'Temperature'
          ],
          correctIndex: 2,
          explanation: 'While soil acidity (pH) affects plant growth and health, it does not directly affect the rate of photosynthesis in the way that light intensity, carbon dioxide concentration, and temperature do.'
        }
      ],
      graph: {
        nodes: [
          { id: 'photosynthesis', label: 'Photosynthesis' },
          { id: 'lightEnergy', label: 'Light Energy' },
          { id: 'co2', label: 'Carbon Dioxide' },
          { id: 'water', label: 'Water' },
          { id: 'chloroplasts', label: 'Chloroplasts' },
          { id: 'chlorophyll', label: 'Chlorophyll' },
          { id: 'lightReactions', label: 'Light-Dependent Reactions' },
          { id: 'calvinCycle', label: 'Calvin Cycle' },
          { id: 'glucose', label: 'Glucose' },
          { id: 'oxygen', label: 'Oxygen' }
        ],
        edges: [
          { source: 'photosynthesis', target: 'lightReactions' },
          { source: 'photosynthesis', target: 'calvinCycle' },
          { source: 'lightEnergy', target: 'lightReactions' },
          { source: 'co2', target: 'calvinCycle' },
          { source: 'water', target: 'lightReactions' },
          { source: 'chloroplasts', target: 'chlorophyll' },
          { source: 'chlorophyll', target: 'lightReactions' },
          { source: 'lightReactions', target: 'calvinCycle' },
          { source: 'calvinCycle', target: 'glucose' },
          { source: 'lightReactions', target: 'oxygen' }
        ]
      }
    }
  };
  
  return topic in lessons ? lessons[topic] : {
    title: `Learning about ${topic}`,
    content: `# ${topic}\n\nThis is a placeholder lesson about ${topic} for grade ${gradeLevel} students.`,
    questions: [
      {
        text: `What is ${topic}?`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctIndex: 0,
        explanation: 'This is a sample explanation.'
      }
    ],
    graph: {
      nodes: [{ id: 'main', label: topic }],
      edges: []
    }
  };
}

main().catch((err) => {
  console.error('Error seeding database:', err);
  process.exit(1);
});