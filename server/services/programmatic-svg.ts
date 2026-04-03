/**
 * Programmatic SVG generator for common educational concepts.
 * Used as a high-quality fallback when LLM SVG generation fails or returns empty results.
 * All SVGs are 500×350 with viewBox="0 0 500 350".
 */

export interface ProgrammaticSVGResult {
  svgData: string;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Topic keyword → generator function map
// ─────────────────────────────────────────────────────────────────────────────
type SVGGenerator = () => string;

const TOPIC_GENERATORS: Array<{ keywords: string[]; fn: SVGGenerator }> = [
  {
    keywords: ['water cycle', 'evaporation', 'condensation', 'precipitation', 'hydrological'],
    fn: waterCycleSVG,
  },
  {
    keywords: ['photosynthesis', 'chlorophyll', 'sunlight plant', 'plant energy'],
    fn: photosynthesisSVG,
  },
  {
    keywords: ['solar system', 'planet', 'orbit', 'sun earth moon'],
    fn: solarSystemSVG,
  },
  {
    keywords: ['cell', 'nucleus', 'mitochondria', 'biology cell'],
    fn: cellSVG,
  },
  {
    keywords: ['fraction', 'divide', 'half', 'quarter', 'numerator', 'denominator'],
    fn: fractionSVG,
  },
  {
    keywords: ['food chain', 'food web', 'predator', 'prey', 'ecosystem'],
    fn: foodChainSVG,
  },
  {
    keywords: ['volcano', 'magma', 'lava', 'eruption', 'tectonic'],
    fn: volcanoSVG,
  },
  {
    keywords: ['human body', 'skeleton', 'anatomy', 'organ', 'heart', 'lung'],
    fn: humanBodySVG,
  },
  {
    keywords: ['map', 'compass', 'geography', 'continent', 'latitude', 'longitude'],
    fn: mapCompassSVG,
  },
  {
    keywords: ['atom', 'molecule', 'electron', 'proton', 'neutron', 'element'],
    fn: atomSVG,
  },
  {
    keywords: ['life cycle', 'butterfly', 'metamorphosis', 'caterpillar', 'larva'],
    fn: lifecycleSVG,
  },
  {
    keywords: ['addition', 'subtraction', 'multiplication', 'division', 'arithmetic', 'math'],
    fn: arithmeticSVG,
  },
  {
    keywords: ['geometry', 'shape', 'triangle', 'square', 'circle', 'polygon'],
    fn: geometrySVG,
  },
  {
    keywords: ['light', 'spectrum', 'rainbow', 'prism', 'wavelength', 'optics'],
    fn: lightSpectrumSVG,
  },
  {
    keywords: ['weather', 'cloud', 'rain', 'storm', 'temperature', 'climate'],
    fn: weatherSVG,
  },
];

/**
 * Returns a matching programmatic SVG for the given topic/description,
 * or a generic educational illustration if no specific match is found.
 */
export function getProgrammaticSVG(
  topic: string,
  description: string,
  subject?: string
): ProgrammaticSVGResult {
  const searchText = `${topic} ${description} ${subject ?? ''}`.toLowerCase();

  for (const entry of TOPIC_GENERATORS) {
    if (entry.keywords.some(kw => searchText.includes(kw))) {
      return { svgData: entry.fn(), description: `Illustration for ${topic}` };
    }
  }

  // Subject-level fallback
  if (subject) {
    const subjectLower = subject.toLowerCase();
    if (subjectLower.includes('math')) return { svgData: arithmeticSVG(), description: `Math illustration for ${topic}` };
    if (subjectLower.includes('science')) return { svgData: atomSVG(), description: `Science illustration for ${topic}` };
    if (subjectLower.includes('history')) return { svgData: timelineSVG(topic), description: `History illustration for ${topic}` };
    if (subjectLower.includes('geography')) return { svgData: mapCompassSVG(), description: `Geography illustration for ${topic}` };
    if (subjectLower.includes('english') || subjectLower.includes('language')) return { svgData: bookSVG(topic), description: `Literature illustration for ${topic}` };
  }

  return { svgData: genericEducationSVG(topic), description: `Educational illustration for ${topic}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual SVG generators
// ─────────────────────────────────────────────────────────────────────────────

function waterCycleSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350" width="500" height="350">
  <!-- Sky gradient background -->
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#87CEEB"/>
      <stop offset="70%" stop-color="#E0F7FA"/>
      <stop offset="100%" stop-color="#A5D6A7"/>
    </linearGradient>
  </defs>
  <rect width="500" height="350" fill="url(#sky)"/>

  <!-- Ground -->
  <ellipse cx="250" cy="340" rx="260" ry="30" fill="#66BB6A" opacity="0.7"/>

  <!-- Ocean/lake on left -->
  <ellipse cx="80" cy="295" rx="70" ry="28" fill="#1565C0" opacity="0.85"/>
  <text x="80" y="300" font-family="Arial" font-size="12" text-anchor="middle" fill="#fff" font-weight="bold">Ocean</text>

  <!-- Sun -->
  <circle cx="440" cy="55" r="36" fill="#FDD835"/>
  <circle cx="440" cy="55" r="28" fill="#FFEE58"/>
  <line x1="440" y1="5" x2="440" y2="18" stroke="#FDD835" stroke-width="4" stroke-linecap="round"/>
  <line x1="440" y1="92" x2="440" y2="105" stroke="#FDD835" stroke-width="4" stroke-linecap="round"/>
  <line x1="390" y1="55" x2="403" y2="55" stroke="#FDD835" stroke-width="4" stroke-linecap="round"/>
  <line x1="477" y1="55" x2="490" y2="55" stroke="#FDD835" stroke-width="4" stroke-linecap="round"/>
  <line x1="405" y1="20" x2="414" y2="29" stroke="#FDD835" stroke-width="4" stroke-linecap="round"/>
  <line x1="466" y1="81" x2="475" y2="90" stroke="#FDD835" stroke-width="4" stroke-linecap="round"/>
  <text x="440" y="116" font-family="Arial" font-size="11" text-anchor="middle" fill="#E65100" font-weight="bold">Sun</text>

  <!-- Evaporation arrows (blue wavy) -->
  <path d="M 65 265 Q 55 245 70 225 Q 80 205 70 185" stroke="#2196F3" stroke-width="2.5" fill="none" stroke-dasharray="5,3"/>
  <path d="M 85 263 Q 78 243 92 223 Q 100 203 92 183" stroke="#2196F3" stroke-width="2.5" fill="none" stroke-dasharray="5,3"/>
  <path d="M 105 265 Q 95 245 108 225 Q 116 205 108 185" stroke="#2196F3" stroke-width="2.5" fill="none" stroke-dasharray="5,3"/>
  <!-- Arrow tips -->
  <polygon points="70,185 65,198 75,198" fill="#2196F3"/>
  <polygon points="92,183 87,196 97,196" fill="#2196F3"/>
  <polygon points="108,185 103,198 113,198" fill="#2196F3"/>
  <text x="88" y="175" font-family="Arial" font-size="11" text-anchor="middle" fill="#1565C0" font-weight="bold">Evaporation</text>

  <!-- Cloud -->
  <ellipse cx="240" cy="80" rx="55" ry="28" fill="#ECEFF1"/>
  <ellipse cx="200" cy="92" rx="40" ry="22" fill="#ECEFF1"/>
  <ellipse cx="278" cy="92" rx="38" ry="20" fill="#ECEFF1"/>
  <ellipse cx="240" cy="100" rx="52" ry="24" fill="#CFD8DC"/>
  <text x="240" y="103" font-family="Arial" font-size="11" text-anchor="middle" fill="#37474F" font-weight="bold">Cloud</text>

  <!-- Condensation label -->
  <text x="155" y="55" font-family="Arial" font-size="11" text-anchor="middle" fill="#1565C0" font-weight="bold">Condensation</text>
  <path d="M 165 58 L 190 72" stroke="#1565C0" stroke-width="1.5" marker-end="url(#arr)"/>

  <!-- Rain / Precipitation -->
  <line x1="220" y1="122" x2="210" y2="148" stroke="#1E88E5" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="235" y1="122" x2="225" y2="148" stroke="#1E88E5" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="250" y1="124" x2="240" y2="150" stroke="#1E88E5" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="265" y1="122" x2="255" y2="148" stroke="#1E88E5" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="280" y1="120" x2="270" y2="146" stroke="#1E88E5" stroke-width="2.5" stroke-linecap="round"/>
  <text x="250" y="165" font-family="Arial" font-size="11" text-anchor="middle" fill="#1565C0" font-weight="bold">Precipitation</text>

  <!-- Runoff arrow -->
  <path d="M 250 210 Q 200 250 140 282" stroke="#1565C0" stroke-width="2.5" fill="none" marker-end="url(#arrowBlue)"/>
  <defs>
    <marker id="arrowBlue" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L0,8 L8,4 z" fill="#1565C0"/>
    </marker>
  </defs>
  <text x="190" y="248" font-family="Arial" font-size="11" text-anchor="middle" fill="#1565C0" font-weight="bold">Runoff</text>

  <!-- Ground absorption dots -->
  <circle cx="280" cy="290" r="5" fill="#1565C0" opacity="0.7"/>
  <circle cx="300" cy="305" r="4" fill="#1565C0" opacity="0.6"/>
  <circle cx="320" cy="295" r="5" fill="#1565C0" opacity="0.7"/>
  <text x="310" y="320" font-family="Arial" font-size="10" text-anchor="middle" fill="#1565C0">Groundwater</text>

  <!-- Title -->
  <text x="250" y="342" font-family="Arial" font-size="14" text-anchor="middle" fill="#1A237E" font-weight="bold">The Water Cycle</text>
</svg>`;
}

function photosynthesisSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#F1F8E9"/>
  <!-- Ground -->
  <rect x="0" y="280" width="500" height="70" fill="#8D6E63" rx="0"/>
  <rect x="0" y="275" width="500" height="12" fill="#A5D6A7"/>
  <!-- Stem -->
  <rect x="238" y="160" width="24" height="120" fill="#388E3C" rx="6"/>
  <!-- Leaves -->
  <ellipse cx="220" cy="200" rx="55" ry="25" fill="#66BB6A" transform="rotate(-30 220 200)"/>
  <ellipse cx="280" cy="230" rx="55" ry="25" fill="#43A047" transform="rotate(30 280 230)"/>
  <ellipse cx="215" cy="165" rx="45" ry="20" fill="#81C784" transform="rotate(-15 215 165)"/>
  <!-- Sun rays -->
  <circle cx="420" cy="55" r="38" fill="#FDD835"/>
  <circle cx="420" cy="55" r="28" fill="#FFEE58"/>
  <line x1="420" y1="3" x2="420" y2="17" stroke="#FDD835" stroke-width="4" stroke-linecap="round"/>
  <line x1="420" y1="93" x2="420" y2="107" stroke="#FDD835" stroke-width="4" stroke-linecap="round"/>
  <line x1="368" y1="55" x2="382" y2="55" stroke="#FDD835" stroke-width="4" stroke-linecap="round"/>
  <line x1="458" y1="55" x2="472" y2="55" stroke="#FDD835" stroke-width="4" stroke-linecap="round"/>
  <text x="420" y="118" font-family="Arial" font-size="12" text-anchor="middle" fill="#E65100" font-weight="bold">Sunlight</text>
  <!-- Arrows: CO2 in -->
  <path d="M 110 130 L 180 175" stroke="#EF5350" stroke-width="2.5" marker-end="url(#arrRed)"/>
  <text x="80" y="125" font-family="Arial" font-size="13" fill="#C62828" font-weight="bold">CO₂</text>
  <defs>
    <marker id="arrRed" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L0,8 L8,4 z" fill="#EF5350"/>
    </marker>
    <marker id="arrGreen" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L0,8 L8,4 z" fill="#43A047"/>
    </marker>
    <marker id="arrBlue2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L0,8 L8,4 z" fill="#1565C0"/>
    </marker>
  </defs>
  <!-- Water arrow up -->
  <path d="M 250 280 L 250 240" stroke="#1565C0" stroke-width="2.5" marker-end="url(#arrBlue2)"/>
  <text x="175" y="300" font-family="Arial" font-size="13" fill="#1565C0" font-weight="bold">Water (H₂O)</text>
  <!-- O2 out arrow -->
  <path d="M 290 175 L 370 130" stroke="#43A047" stroke-width="2.5" marker-end="url(#arrGreen)"/>
  <text x="375" y="125" font-family="Arial" font-size="13" fill="#2E7D32" font-weight="bold">O₂</text>
  <!-- Glucose label -->
  <text x="250" y="330" font-family="Arial" font-size="11" text-anchor="middle" fill="#33691E">→ Glucose (sugar) stored in plant</text>
  <!-- Title -->
  <text x="250" y="20" font-family="Arial" font-size="15" text-anchor="middle" fill="#1B5E20" font-weight="bold">Photosynthesis</text>
</svg>`;
}

function solarSystemSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#0D1B2A"/>
  <!-- Stars -->
  ${Array.from({ length: 40 }, (_, i) => {
    const x = (i * 97 + 13) % 490 + 5;
    const y = (i * 61 + 7) % 330 + 10;
    return `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 1.5 : 1}" fill="white" opacity="${0.4 + (i % 5) * 0.12}"/>`;
  }).join('')}
  <!-- Sun -->
  <circle cx="60" cy="175" r="45" fill="#FDD835" opacity="0.95"/>
  <circle cx="60" cy="175" r="35" fill="#FFEE58"/>
  <text x="60" y="232" font-family="Arial" font-size="11" text-anchor="middle" fill="#FDD835" font-weight="bold">Sun</text>
  <!-- Orbits -->
  <ellipse cx="60" cy="175" rx="85" ry="20" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.3"/>
  <ellipse cx="60" cy="175" rx="130" ry="35" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.3"/>
  <ellipse cx="60" cy="175" rx="178" ry="55" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.3"/>
  <ellipse cx="60" cy="175" rx="235" ry="80" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.3"/>
  <!-- Mercury -->
  <circle cx="145" cy="175" r="6" fill="#9E9E9E"/>
  <text x="145" y="163" font-family="Arial" font-size="9" text-anchor="middle" fill="#BDBDBD">Mercury</text>
  <!-- Venus -->
  <circle cx="190" cy="158" r="9" fill="#FFCC80"/>
  <text x="190" y="145" font-family="Arial" font-size="9" text-anchor="middle" fill="#FFB74D">Venus</text>
  <!-- Earth -->
  <circle cx="238" cy="142" r="11" fill="#1565C0"/>
  <ellipse cx="238" cy="142" rx="11" ry="7" fill="#43A047" opacity="0.7"/>
  <text x="238" y="126" font-family="Arial" font-size="9" text-anchor="middle" fill="#90CAF9">Earth</text>
  <!-- Mars -->
  <circle cx="295" cy="132" r="8" fill="#EF5350"/>
  <text x="295" y="120" font-family="Arial" font-size="9" text-anchor="middle" fill="#EF9A9A">Mars</text>
  <!-- Jupiter -->
  <circle cx="375" cy="115" r="22" fill="#FF8F00"/>
  <ellipse cx="375" cy="115" rx="22" ry="8" fill="#E65100" opacity="0.4"/>
  <ellipse cx="375" cy="120" rx="22" ry="5" fill="#FFCC02" opacity="0.3"/>
  <text x="375" y="95" font-family="Arial" font-size="9" text-anchor="middle" fill="#FFB74D">Jupiter</text>
  <!-- Saturn -->
  <circle cx="460" cy="100" r="16" fill="#FFD54F"/>
  <ellipse cx="460" cy="100" rx="32" ry="8" fill="none" stroke="#FFCC02" stroke-width="4" opacity="0.8"/>
  <text x="460" y="80" font-family="Arial" font-size="9" text-anchor="middle" fill="#FFD54F">Saturn</text>
  <!-- Title -->
  <text x="250" y="338" font-family="Arial" font-size="14" text-anchor="middle" fill="#90CAF9" font-weight="bold">The Solar System</text>
</svg>`;
}

function cellSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#E8F5E9"/>
  <!-- Cell membrane -->
  <ellipse cx="250" cy="175" rx="200" ry="145" fill="#A5D6A7" stroke="#388E3C" stroke-width="4" opacity="0.7"/>
  <!-- Nucleus -->
  <ellipse cx="220" cy="160" rx="65" ry="50" fill="#E3F2FD" stroke="#1565C0" stroke-width="3"/>
  <ellipse cx="220" cy="160" rx="40" ry="28" fill="#BBDEFB" stroke="#1565C0" stroke-width="2"/>
  <text x="220" y="155" font-family="Arial" font-size="11" text-anchor="middle" fill="#0D47A1" font-weight="bold">Nucleus</text>
  <text x="220" y="170" font-family="Arial" font-size="9" text-anchor="middle" fill="#1565C0">(DNA inside)</text>
  <!-- Mitochondria -->
  <ellipse cx="355" cy="135" rx="38" ry="22" fill="#FFF9C4" stroke="#F57F17" stroke-width="2.5"/>
  <path d="M 322 135 Q 340 120 358 135 Q 340 150 322 135" fill="none" stroke="#F57F17" stroke-width="1.5"/>
  <text x="356" y="125" font-family="Arial" font-size="9" text-anchor="middle" fill="#E65100" font-weight="bold">Mitochondria</text>
  <text x="356" y="168" font-family="Arial" font-size="8" text-anchor="middle" fill="#E65100">(energy factory)</text>
  <!-- Vacuole -->
  <ellipse cx="310" cy="215" rx="48" ry="35" fill="#E1F5FE" stroke="#0288D1" stroke-width="2" opacity="0.9"/>
  <text x="310" y="213" font-family="Arial" font-size="10" text-anchor="middle" fill="#01579B" font-weight="bold">Vacuole</text>
  <text x="310" y="228" font-family="Arial" font-size="8" text-anchor="middle" fill="#0288D1">(storage)</text>
  <!-- Chloroplast (plant cell) -->
  <ellipse cx="148" cy="215" rx="40" ry="22" fill="#C8E6C9" stroke="#388E3C" stroke-width="2.5"/>
  <ellipse cx="148" cy="215" rx="28" ry="12" fill="#81C784" stroke="#2E7D32" stroke-width="1.5"/>
  <text x="148" y="212" font-family="Arial" font-size="9" text-anchor="middle" fill="#1B5E20" font-weight="bold">Chloroplast</text>
  <text x="148" y="248" font-family="Arial" font-size="8" text-anchor="middle" fill="#388E3C">(photosynthesis)</text>
  <!-- Cell Wall label -->
  <text x="50" y="180" font-family="Arial" font-size="10" text-anchor="middle" fill="#1B5E20">Cell</text>
  <text x="50" y="192" font-family="Arial" font-size="10" text-anchor="middle" fill="#1B5E20">Wall</text>
  <line x1="67" y1="186" x2="49" y2="175" stroke="#388E3C" stroke-width="1.5"/>
  <!-- Title -->
  <text x="250" y="338" font-family="Arial" font-size="14" text-anchor="middle" fill="#1B5E20" font-weight="bold">Plant Cell</text>
</svg>`;
}

function fractionSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#FFF8E1"/>
  <text x="250" y="30" font-family="Arial" font-size="16" text-anchor="middle" fill="#E65100" font-weight="bold">Understanding Fractions</text>
  <!-- Circle half -->
  <circle cx="90" cy="145" r="70" fill="#FFCC02" stroke="#E65100" stroke-width="2.5"/>
  <path d="M 90 75 L 90 215" stroke="#E65100" stroke-width="2.5"/>
  <path d="M 90 75 A 70 70 0 0 1 90 215" fill="#FFF8E1"/>
  <text x="68" y="148" font-family="Arial" font-size="22" text-anchor="middle" fill="#BF360C" font-weight="bold">½</text>
  <text x="112" y="148" font-family="Arial" font-size="22" text-anchor="middle" fill="#E65100" font-weight="bold">½</text>
  <text x="90" y="240" font-family="Arial" font-size="13" text-anchor="middle" fill="#E65100" font-weight="bold">One Half = 1/2</text>
  <!-- Rectangle thirds -->
  <rect x="180" y="90" width="50" height="110" fill="#EF9A9A" stroke="#C62828" stroke-width="2"/>
  <rect x="230" y="90" width="50" height="110" fill="#EF5350" stroke="#C62828" stroke-width="2"/>
  <rect x="280" y="90" width="50" height="110" fill="#EF9A9A" stroke="#C62828" stroke-width="2"/>
  <text x="205" y="155" font-family="Arial" font-size="15" text-anchor="middle" fill="#B71C1C" font-weight="bold">1</text>
  <text x="255" y="155" font-family="Arial" font-size="15" text-anchor="middle" fill="#ffffff" font-weight="bold">1</text>
  <text x="305" y="155" font-family="Arial" font-size="15" text-anchor="middle" fill="#B71C1C" font-weight="bold">1</text>
  <line x1="168" y1="145" x2="342" y2="145" stroke="#B71C1C" stroke-width="1.5"/>
  <text x="175" y="168" font-family="Arial" font-size="13" text-anchor="left" fill="#B71C1C" font-weight="bold">3</text>
  <text x="255" y="240" font-family="Arial" font-size="13" text-anchor="middle" fill="#C62828" font-weight="bold">One Third = 1/3</text>
  <!-- Pizza quarters -->
  <circle cx="430" cy="145" r="68" fill="#FFF9C4" stroke="#F57F17" stroke-width="2.5"/>
  <line x1="430" y1="77" x2="430" y2="213" stroke="#F57F17" stroke-width="2.5"/>
  <line x1="362" y1="145" x2="498" y2="145" stroke="#F57F17" stroke-width="2.5"/>
  <path d="M 430 77 A 68 68 0 0 1 498 145" fill="#FFD54F"/>
  <path d="M 430 145 A 68 68 0 0 1 362 213" fill="#FFD54F"/>
  <text x="455" y="120" font-family="Arial" font-size="18" text-anchor="middle" fill="#E65100" font-weight="bold">¼</text>
  <text x="404" y="185" font-family="Arial" font-size="18" text-anchor="middle" fill="#E65100" font-weight="bold">¼</text>
  <text x="430" y="240" font-family="Arial" font-size="13" text-anchor="middle" fill="#E65100" font-weight="bold">One Quarter = 1/4</text>
  <!-- Fraction bar -->
  <text x="250" y="310" font-family="Arial" font-size="13" text-anchor="middle" fill="#333">Numerator = parts you have   |   Denominator = total parts</text>
</svg>`;
}

function foodChainSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#E8F5E9"/>
  <text x="250" y="28" font-family="Arial" font-size="15" text-anchor="middle" fill="#1B5E20" font-weight="bold">Food Chain</text>
  <defs>
    <marker id="arrFC" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
      <path d="M0,0 L0,10 L10,5 z" fill="#FF6F00"/>
    </marker>
  </defs>
  <!-- Sun -->
  <circle cx="60" cy="175" r="38" fill="#FDD835"/>
  <circle cx="60" cy="175" r="28" fill="#FFEE58"/>
  <text x="60" y="225" font-family="Arial" font-size="11" text-anchor="middle" fill="#E65100" font-weight="bold">Sun</text>
  <!-- Plant -->
  <rect x="135" y="210" width="14" height="60" fill="#388E3C" rx="4"/>
  <ellipse cx="142" cy="195" rx="30" ry="22" fill="#43A047"/>
  <ellipse cx="120" cy="210" rx="22" ry="15" fill="#66BB6A" transform="rotate(-20 120 210)"/>
  <ellipse cx="165" cy="210" rx="22" ry="15" fill="#66BB6A" transform="rotate(20 165 210)"/>
  <text x="142" y="290" font-family="Arial" font-size="10" text-anchor="middle" fill="#1B5E20" font-weight="bold">Plant</text>
  <text x="142" y="303" font-family="Arial" font-size="9" text-anchor="middle" fill="#388E3C">(Producer)</text>
  <!-- Grasshopper-like insect -->
  <ellipse cx="242" cy="205" rx="25" ry="13" fill="#8BC34A"/>
  <ellipse cx="225" cy="200" rx="12" ry="10" fill="#9CCC65"/>
  <line x1="230" y1="195" x2="215" y2="180" stroke="#558B2F" stroke-width="1.5"/>
  <line x1="245" y1="195" x2="240" y2="178" stroke="#558B2F" stroke-width="1.5"/>
  <line x1="230" y1="215" x2="218" y2="228" stroke="#558B2F" stroke-width="2"/>
  <line x1="245" y1="215" x2="255" y2="228" stroke="#558B2F" stroke-width="2"/>
  <text x="242" y="245" font-family="Arial" font-size="10" text-anchor="middle" fill="#33691E" font-weight="bold">Insect</text>
  <text x="242" y="258" font-family="Arial" font-size="9" text-anchor="middle" fill="#558B2F">(Herbivore)</text>
  <!-- Frog -->
  <ellipse cx="345" cy="205" rx="28" ry="18" fill="#66BB6A"/>
  <circle cx="332" cy="193" r="10" fill="#81C784"/>
  <circle cx="358" cy="193" r="10" fill="#81C784"/>
  <circle cx="330" cy="190" r="5" fill="#1B5E20"/>
  <circle cx="356" cy="190" r="5" fill="#1B5E20"/>
  <path d="M 320 225 Q 345 240 370 225" stroke="#388E3C" stroke-width="2" fill="none"/>
  <text x="345" y="248" font-family="Arial" font-size="10" text-anchor="middle" fill="#2E7D32" font-weight="bold">Frog</text>
  <text x="345" y="261" font-family="Arial" font-size="9" text-anchor="middle" fill="#388E3C">(Carnivore)</text>
  <!-- Hawk/eagle -->
  <path d="M 430 165 Q 455 145 470 165 Q 455 155 460 175 Q 445 165 430 165" fill="#795548"/>
  <ellipse cx="448" cy="178" rx="20" ry="14" fill="#8D6E63"/>
  <path d="M 435 182 L 420 195" stroke="#795548" stroke-width="2.5"/>
  <path d="M 460 182 L 475 195" stroke="#795548" stroke-width="2.5"/>
  <circle cx="440" cy="172" r="5" fill="#5D4037"/>
  <text x="450" y="215" font-family="Arial" font-size="10" text-anchor="middle" fill="#4E342E" font-weight="bold">Hawk</text>
  <text x="450" y="228" font-family="Arial" font-size="9" text-anchor="middle" fill="#5D4037">(Top predator)</text>
  <!-- Arrows -->
  <path d="M 96 175 L 110 195" stroke="#FF6F00" stroke-width="2.5" marker-end="url(#arrFC)"/>
  <path d="M 172 200 L 210 205" stroke="#FF6F00" stroke-width="2.5" marker-end="url(#arrFC)"/>
  <path d="M 268 205 L 310 205" stroke="#FF6F00" stroke-width="2.5" marker-end="url(#arrFC)"/>
  <path d="M 373 200 L 410 185" stroke="#FF6F00" stroke-width="2.5" marker-end="url(#arrFC)"/>
  <!-- Energy label -->
  <text x="250" y="325" font-family="Arial" font-size="11" text-anchor="middle" fill="#E65100" font-style="italic">Energy flows from Sun → Plants → Animals</text>
</svg>`;
}

function volcanoSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <defs>
    <linearGradient id="volSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FF7043"/>
      <stop offset="60%" stop-color="#FF8A65"/>
      <stop offset="100%" stop-color="#FFCCBC"/>
    </linearGradient>
    <linearGradient id="lavGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FF1744"/>
      <stop offset="100%" stop-color="#FF6D00"/>
    </linearGradient>
  </defs>
  <rect width="500" height="350" fill="url(#volSky)"/>
  <!-- Ground -->
  <ellipse cx="250" cy="340" rx="260" ry="35" fill="#5D4037"/>
  <!-- Volcano body -->
  <polygon points="50,310 250,55 450,310" fill="#795548"/>
  <polygon points="100,310 250,80 400,310" fill="#8D6E63"/>
  <!-- Lava flow -->
  <path d="M 230 120 Q 200 160 185 210 Q 175 250 160 280 Q 145 305 130 315" stroke="url(#lavGrad)" stroke-width="16" fill="none" stroke-linecap="round"/>
  <path d="M 270 120 Q 300 165 310 215 Q 320 255 335 280 Q 348 305 360 315" stroke="url(#lavGrad)" stroke-width="14" fill="none" stroke-linecap="round"/>
  <!-- Crater -->
  <ellipse cx="250" cy="80" rx="45" ry="18" fill="#212121"/>
  <ellipse cx="250" cy="74" rx="35" ry="14" fill="#FF1744" opacity="0.9"/>
  <!-- Smoke/ash cloud -->
  <ellipse cx="240" cy="40" rx="38" ry="22" fill="#607D8B" opacity="0.8"/>
  <ellipse cx="270" cy="28" rx="30" ry="18" fill="#78909C" opacity="0.7"/>
  <ellipse cx="215" cy="30" rx="28" ry="16" fill="#546E7A" opacity="0.75"/>
  <ellipse cx="250" cy="18" rx="22" ry="14" fill="#455A64" opacity="0.7"/>
  <!-- Labels -->
  <text x="130" y="52" font-family="Arial" font-size="11" fill="#ECEFF1" font-weight="bold">Ash cloud</text>
  <line x1="175" y1="48" x2="215" y2="32" stroke="#ECEFF1" stroke-width="1.5"/>
  <text x="375" y="195" font-family="Arial" font-size="11" fill="#FF6D00" font-weight="bold">Lava</text>
  <line x1="373" y1="200" x2="340" y2="225" stroke="#FF6D00" stroke-width="1.5"/>
  <text x="50" y="250" font-family="Arial" font-size="10" fill="#BCAAA4">Magma</text>
  <text x="50" y="263" font-family="Arial" font-size="10" fill="#BCAAA4">chamber</text>
  <ellipse cx="250" cy="335" rx="100" ry="18" fill="#BF360C" opacity="0.5"/>
  <line x1="95" y1="258" x2="180" y2="310" stroke="#BCAAA4" stroke-width="1.5"/>
  <text x="250" y="342" font-family="Arial" font-size="13" text-anchor="middle" fill="#FFCCBC" font-weight="bold">Volcano Eruption</text>
</svg>`;
}

function humanBodySVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#FFF3E0"/>
  <text x="250" y="25" font-family="Arial" font-size="15" text-anchor="middle" fill="#BF360C" font-weight="bold">Human Body Systems</text>
  <!-- Simple body outline -->
  <circle cx="190" cy="65" r="30" fill="#FFCCBC" stroke="#E64A19" stroke-width="2"/>
  <rect x="160" y="95" width="60" height="90" rx="12" fill="#FFCCBC" stroke="#E64A19" stroke-width="2"/>
  <rect x="135" y="98" width="25" height="70" rx="10" fill="#FFCCBC" stroke="#E64A19" stroke-width="2"/>
  <rect x="220" y="98" width="25" height="70" rx="10" fill="#FFCCBC" stroke="#E64A19" stroke-width="2"/>
  <rect x="160" y="185" width="24" height="80" rx="10" fill="#FFCCBC" stroke="#E64A19" stroke-width="2"/>
  <rect x="196" y="185" width="24" height="80" rx="10" fill="#FFCCBC" stroke="#E64A19" stroke-width="2"/>
  <!-- Heart -->
  <path d="M 182 118 Q 178 110 185 110 Q 190 108 190 115 Q 190 108 195 110 Q 202 110 198 118 L 190 130 Z" fill="#EF5350"/>
  <text x="145" y="120" font-family="Arial" font-size="9" fill="#C62828" font-weight="bold">Heart</text>
  <line x1="163" y1="118" x2="176" y2="120" stroke="#C62828" stroke-width="1.2"/>
  <!-- Lungs -->
  <ellipse cx="172" cy="140" rx="12" ry="18" fill="#CE93D8" opacity="0.8"/>
  <ellipse cx="208" cy="140" rx="12" ry="18" fill="#CE93D8" opacity="0.8"/>
  <text x="240" y="135" font-family="Arial" font-size="9" fill="#6A1B9A" font-weight="bold">Lungs</text>
  <line x1="221" y1="133" x2="232" y2="133" stroke="#6A1B9A" stroke-width="1.2"/>
  <!-- Stomach -->
  <ellipse cx="190" cy="165" rx="15" ry="11" fill="#FFE082" stroke="#F57F17" stroke-width="1.5"/>
  <text x="125" y="170" font-family="Arial" font-size="9" fill="#E65100" font-weight="bold">Stomach</text>
  <line x1="163" y1="168" x2="174" y2="165" stroke="#E65100" stroke-width="1.2"/>
  <!-- Brain -->
  <ellipse cx="190" cy="58" rx="24" ry="18" fill="#F8BBD9" stroke="#E91E63" stroke-width="1.5" opacity="0.6"/>
  <path d="M 172 55 Q 180 48 190 55 Q 200 48 208 55" stroke="#E91E63" stroke-width="1" fill="none"/>
  <text x="225" y="58" font-family="Arial" font-size="9" fill="#AD1457" font-weight="bold">Brain</text>
  <line x1="214" y1="58" x2="222" y2="58" stroke="#AD1457" stroke-width="1.2"/>
  <!-- Right: systems list -->
  <rect x="310" y="45" width="175" height="260" rx="10" fill="#FFF8E1" stroke="#FFB300" stroke-width="1.5"/>
  <text x="397" y="65" font-family="Arial" font-size="12" text-anchor="middle" fill="#E65100" font-weight="bold">Body Systems</text>
  <circle cx="330" cy="88" r="5" fill="#EF5350"/>
  <text x="342" y="92" font-family="Arial" font-size="11" fill="#333">Circulatory (heart)</text>
  <circle cx="330" cy="112" r="5" fill="#CE93D8"/>
  <text x="342" y="116" font-family="Arial" font-size="11" fill="#333">Respiratory (lungs)</text>
  <circle cx="330" cy="136" r="5" fill="#81C784"/>
  <text x="342" y="140" font-family="Arial" font-size="11" fill="#333">Digestive (stomach)</text>
  <circle cx="330" cy="160" r="5" fill="#F8BBD9"/>
  <text x="342" y="164" font-family="Arial" font-size="11" fill="#333">Nervous (brain)</text>
  <circle cx="330" cy="184" r="5" fill="#FFCC80"/>
  <text x="342" y="188" font-family="Arial" font-size="11" fill="#333">Skeletal (bones)</text>
  <circle cx="330" cy="208" r="5" fill="#B0BEC5"/>
  <text x="342" y="212" font-family="Arial" font-size="11" fill="#333">Muscular</text>
  <circle cx="330" cy="232" r="5" fill="#80DEEA"/>
  <text x="342" y="236" font-family="Arial" font-size="11" fill="#333">Immune</text>
  <circle cx="330" cy="256" r="5" fill="#FFAB91"/>
  <text x="342" y="260" font-family="Arial" font-size="11" fill="#333">Endocrine</text>
  <!-- Title bottom -->
  <text x="190" y="340" font-family="Arial" font-size="11" text-anchor="middle" fill="#BF360C">All systems work together!</text>
</svg>`;
}

function mapCompassSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#E3F2FD"/>
  <text x="250" y="25" font-family="Arial" font-size="15" text-anchor="middle" fill="#0D47A1" font-weight="bold">Geography: Maps &amp; Compass</text>
  <!-- Compass rose -->
  <circle cx="100" cy="185" r="75" fill="#FAFAFA" stroke="#1565C0" stroke-width="2"/>
  <circle cx="100" cy="185" r="60" fill="#E3F2FD" stroke="#90CAF9" stroke-width="1"/>
  <!-- Compass directions -->
  <polygon points="100,115 93,170 107,170" fill="#EF5350"/>
  <polygon points="100,255 93,200 107,200" fill="#BDBDBD"/>
  <polygon points="30,185 85,178 85,192" fill="#BDBDBD"/>
  <polygon points="170,185 115,178 115,192" fill="#BDBDBD"/>
  <circle cx="100" cy="185" r="10" fill="#1565C0"/>
  <circle cx="100" cy="185" r="5" fill="white"/>
  <text x="100" y="108" font-family="Arial" font-size="16" text-anchor="middle" fill="#C62828" font-weight="bold">N</text>
  <text x="100" y="273" font-family="Arial" font-size="16" text-anchor="middle" fill="#616161" font-weight="bold">S</text>
  <text x="22" y="190" font-family="Arial" font-size="16" text-anchor="middle" fill="#616161" font-weight="bold">W</text>
  <text x="178" y="190" font-family="Arial" font-size="16" text-anchor="middle" fill="#616161" font-weight="bold">E</text>
  <!-- World map outlines (simplified) -->
  <rect x="220" y="55" width="260" height="240" rx="8" fill="#B3E5FC" stroke="#0288D1" stroke-width="2"/>
  <!-- North America -->
  <path d="M 270 85 L 310 75 L 330 90 L 340 125 L 320 145 L 300 155 L 275 145 L 265 120 Z" fill="#A5D6A7" stroke="#388E3C" stroke-width="1.5"/>
  <text x="303" y="118" font-family="Arial" font-size="9" text-anchor="middle" fill="#1B5E20">N. America</text>
  <!-- South America -->
  <path d="M 295 170 L 320 165 L 330 195 L 325 235 L 300 250 L 280 235 L 278 200 Z" fill="#C8E6C9" stroke="#388E3C" stroke-width="1.5"/>
  <text x="305" y="210" font-family="Arial" font-size="9" text-anchor="middle" fill="#1B5E20">S. America</text>
  <!-- Europe -->
  <path d="M 360 80 L 395 75 L 405 95 L 390 115 L 365 115 L 355 95 Z" fill="#FFE082" stroke="#F57F17" stroke-width="1.5"/>
  <text x="380" y="100" font-family="Arial" font-size="9" text-anchor="middle" fill="#E65100">Europe</text>
  <!-- Africa -->
  <path d="M 370 130 L 400 125 L 415 150 L 410 200 L 390 225 L 368 220 L 358 195 L 360 155 Z" fill="#FFCC80" stroke="#F57F17" stroke-width="1.5"/>
  <text x="387" y="178" font-family="Arial" font-size="9" text-anchor="middle" fill="#E65100">Africa</text>
  <!-- Asia -->
  <path d="M 415 78 L 465 72 L 475 105 L 460 135 L 430 140 L 415 120 L 408 95 Z" fill="#B39DDB" stroke="#512DA8" stroke-width="1.5"/>
  <text x="445" y="108" font-family="Arial" font-size="9" text-anchor="middle" fill="#311B92">Asia</text>
  <!-- Australia -->
  <path d="M 438 175 L 470 172 L 475 200 L 460 215 L 438 210 L 428 195 Z" fill="#FFAB91" stroke="#BF360C" stroke-width="1.5"/>
  <text x="452" y="196" font-family="Arial" font-size="9" text-anchor="middle" fill="#BF360C">Australia</text>
  <!-- Equator line -->
  <line x1="220" y1="165" x2="480" y2="165" stroke="#EF5350" stroke-width="1.5" stroke-dasharray="5,4"/>
  <text x="232" y="162" font-family="Arial" font-size="8" fill="#C62828">Equator</text>
  <!-- Legend -->
  <text x="250" y="338" font-family="Arial" font-size="11" text-anchor="middle" fill="#0D47A1">Maps show location, landforms, and features of Earth</text>
</svg>`;
}

function atomSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#0D1B2A"/>
  <!-- Title -->
  <text x="250" y="30" font-family="Arial" font-size="15" text-anchor="middle" fill="#90CAF9" font-weight="bold">The Atom</text>
  <!-- Nucleus -->
  <circle cx="250" cy="180" r="28" fill="#FF7043" opacity="0.9"/>
  <circle cx="242" cy="172" r="10" fill="#FF5252" opacity="0.8"/>
  <circle cx="258" cy="172" r="10" fill="#448AFF" opacity="0.8"/>
  <circle cx="250" cy="186" r="10" fill="#FF5252" opacity="0.8"/>
  <text x="250" y="184" font-family="Arial" font-size="9" text-anchor="middle" fill="white" font-weight="bold">Nucleus</text>
  <!-- Proton/Neutron labels -->
  <circle cx="80" cy="90" r="8" fill="#FF5252"/>
  <text x="94" y="94" font-family="Arial" font-size="11" fill="#FF5252" font-weight="bold">Proton (+)</text>
  <circle cx="80" cy="115" r="8" fill="#448AFF"/>
  <text x="94" y="119" font-family="Arial" font-size="11" fill="#90CAF9">Neutron (neutral)</text>
  <!-- Electron orbits -->
  <ellipse cx="250" cy="180" rx="90" ry="40" fill="none" stroke="#64B5F6" stroke-width="1.5" opacity="0.7"/>
  <ellipse cx="250" cy="180" rx="140" ry="60" fill="none" stroke="#64B5F6" stroke-width="1.5" opacity="0.5" transform="rotate(60 250 180)"/>
  <ellipse cx="250" cy="180" rx="155" ry="50" fill="none" stroke="#64B5F6" stroke-width="1.5" opacity="0.5" transform="rotate(-60 250 180)"/>
  <!-- Electrons -->
  <circle cx="340" cy="180" r="9" fill="#FFEE58"/>
  <circle cx="160" cy="180" r="9" fill="#FFEE58"/>
  <circle cx="289" cy="126" r="9" fill="#FFEE58"/>
  <circle cx="204" cy="240" r="9" fill="#FFEE58"/>
  <circle cx="198" cy="130" r="9" fill="#FFEE58"/>
  <circle cx="306" cy="232" r="9" fill="#FFEE58"/>
  <!-- Electron label -->
  <text x="352" y="177" font-family="Arial" font-size="10" fill="#FFEE58">e⁻</text>
  <text x="136" y="177" font-family="Arial" font-size="10" fill="#FFEE58">e⁻</text>
  <!-- Info box -->
  <rect x="330" y="240" width="155" height="90" rx="8" fill="#1A237E" opacity="0.8"/>
  <text x="407" y="260" font-family="Arial" font-size="11" text-anchor="middle" fill="#90CAF9" font-weight="bold">Key Facts</text>
  <text x="340" y="278" font-family="Arial" font-size="9" fill="#BBDEFB">• Protons: positive charge</text>
  <text x="340" y="295" font-family="Arial" font-size="9" fill="#BBDEFB">• Neutrons: no charge</text>
  <text x="340" y="312" font-family="Arial" font-size="9" fill="#BBDEFB">• Electrons: negative charge</text>
  <!-- Element example -->
  <text x="80" y="260" font-family="Arial" font-size="13" fill="#90CAF9" font-weight="bold">Carbon atom:</text>
  <text x="80" y="280" font-family="Arial" font-size="11" fill="#BBDEFB">6 protons, 6 neutrons,</text>
  <text x="80" y="296" font-family="Arial" font-size="11" fill="#BBDEFB">6 electrons</text>
  <text x="250" y="335" font-family="Arial" font-size="10" text-anchor="middle" fill="#78909C">All matter is made of atoms!</text>
</svg>`;
}

function lifecycleSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#F3E5F5"/>
  <text x="250" y="25" font-family="Arial" font-size="15" text-anchor="middle" fill="#6A1B9A" font-weight="bold">Life Cycle of a Butterfly</text>
  <defs>
    <marker id="arrPurp" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L0,8 L8,4 z" fill="#7B1FA2"/>
    </marker>
  </defs>
  <!-- Egg -->
  <ellipse cx="130" cy="100" rx="28" ry="36" fill="#E1F5FE" stroke="#0288D1" stroke-width="2.5"/>
  <ellipse cx="120" cy="90" rx="8" ry="10" fill="#B3E5FC" opacity="0.7"/>
  <text x="130" y="152" font-family="Arial" font-size="12" text-anchor="middle" fill="#01579B" font-weight="bold">Egg</text>
  <!-- Caterpillar -->
  <circle cx="345" cy="95" r="18" fill="#81C784"/>
  <circle cx="322" cy="95" r="15" fill="#A5D6A7"/>
  <circle cx="302" cy="97" r="13" fill="#81C784"/>
  <circle cx="284" cy="100" r="12" fill="#A5D6A7"/>
  <circle cx="268" cy="103" r="11" fill="#81C784"/>
  <!-- eyes -->
  <circle cx="351" cy="90" r="4" fill="white"/>
  <circle cx="352" cy="90" r="2" fill="#1B5E20"/>
  <!-- antennae -->
  <line x1="345" y1="77" x2="340" y2="65" stroke="#388E3C" stroke-width="2"/>
  <line x1="350" y1="77" x2="355" y2="65" stroke="#388E3C" stroke-width="2"/>
  <text x="310" y="125" font-family="Arial" font-size="12" text-anchor="middle" fill="#2E7D32" font-weight="bold">Caterpillar (Larva)</text>
  <!-- Chrysalis -->
  <path d="M 365 230 Q 340 200 355 175 Q 385 165 405 185 Q 415 215 390 240 Z" fill="#FFF9C4" stroke="#F9A825" stroke-width="2.5"/>
  <path d="M 370 225 Q 350 205 362 185 Q 380 178 395 192 Q 402 215 385 232 Z" fill="#FFF176" opacity="0.7"/>
  <line x1="378" y1="165" x2="375" y2="148" stroke="#F9A825" stroke-width="2"/>
  <text x="388" y="255" font-family="Arial" font-size="12" text-anchor="middle" fill="#F57F17" font-weight="bold">Chrysalis (Pupa)</text>
  <!-- Butterfly -->
  <ellipse cx="138" cy="248" rx="12" ry="28" fill="#FF8F00"/>
  <!-- Wings -->
  <path d="M 138 248 Q 90 210 75 250 Q 90 285 138 268" fill="#FFB300" stroke="#E65100" stroke-width="1.5"/>
  <path d="M 138 248 Q 185 210 200 250 Q 185 285 138 268" fill="#FFB300" stroke="#E65100" stroke-width="1.5"/>
  <path d="M 138 248 Q 95 280 80 265 Q 85 295 138 278" fill="#FF8F00" stroke="#E65100" stroke-width="1.5"/>
  <path d="M 138 248 Q 180 280 195 265 Q 190 295 138 278" fill="#FF8F00" stroke="#E65100" stroke-width="1.5"/>
  <!-- Wing markings -->
  <circle cx="105" cy="248" r="8" fill="#212121" opacity="0.4"/>
  <circle cx="170" cy="248" r="8" fill="#212121" opacity="0.4"/>
  <line x1="133" y1="223" x2="128" y2="205" stroke="#212121" stroke-width="1.5"/>
  <line x1="143" y1="223" x2="148" y2="205" stroke="#212121" stroke-width="1.5"/>
  <text x="138" y="300" font-family="Arial" font-size="12" text-anchor="middle" fill="#E65100" font-weight="bold">Butterfly (Adult)</text>
  <!-- Arrows -->
  <path d="M 165 95 L 262 100" stroke="#7B1FA2" stroke-width="2" marker-end="url(#arrPurp)"/>
  <path d="M 365 130 Q 390 165 392 172" stroke="#7B1FA2" stroke-width="2" marker-end="url(#arrPurp)"/>
  <path d="M 368 242 Q 310 290 180 272" stroke="#7B1FA2" stroke-width="2" marker-end="url(#arrPurp)"/>
  <path d="M 115 222 L 130 165" stroke="#7B1FA2" stroke-width="2" marker-end="url(#arrPurp)"/>
  <!-- Cycle label -->
  <text x="250" y="338" font-family="Arial" font-size="10" text-anchor="middle" fill="#6A1B9A" font-style="italic">Metamorphosis: complete transformation through 4 stages</text>
</svg>`;
}

function arithmeticSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#E8F5E9"/>
  <text x="250" y="28" font-family="Arial" font-size="16" text-anchor="middle" fill="#1B5E20" font-weight="bold">Math Operations</text>
  <!-- Addition box -->
  <rect x="20" y="50" width="215" height="130" rx="12" fill="#C8E6C9" stroke="#388E3C" stroke-width="2"/>
  <text x="127" y="74" font-family="Arial" font-size="13" text-anchor="middle" fill="#1B5E20" font-weight="bold">Addition ➕</text>
  <text x="127" y="100" font-family="Arial" font-size="22" text-anchor="middle" fill="#2E7D32" font-weight="bold">8 + 5 = 13</text>
  <rect x="38" y="112" width="180" height="24" rx="6" fill="#A5D6A7"/>
  <text x="127" y="129" font-family="Arial" font-size="11" text-anchor="middle" fill="#1B5E20">Combining groups together</text>
  <!-- 8 dots + 5 dots -->
  ${Array.from({length:8},(_,i)=>`<circle cx="${48+i*18}" cy="155" r="7" fill="#43A047"/>`).join('')}
  <text x="197" y="160" font-family="Arial" font-size="20" fill="#1B5E20" font-weight="bold">+</text>
  ${Array.from({length:5},(_,i)=>`<circle cx="${213+i*18}" cy="155" r="7" fill="#66BB6A"/>`).join('')}
  <!-- Subtraction box -->
  <rect x="265" y="50" width="215" height="130" rx="12" fill="#FFECB3" stroke="#F57F17" stroke-width="2"/>
  <text x="372" y="74" font-family="Arial" font-size="13" text-anchor="middle" fill="#E65100" font-weight="bold">Subtraction ➖</text>
  <text x="372" y="100" font-family="Arial" font-size="22" text-anchor="middle" fill="#BF360C" font-weight="bold">13 – 5 = 8</text>
  <rect x="283" y="112" width="180" height="24" rx="6" fill="#FFE082"/>
  <text x="372" y="129" font-family="Arial" font-size="11" text-anchor="middle" fill="#E65100">Taking away from a group</text>
  ${Array.from({length:13},(_,i)=>`<circle cx="${275+i*16}" cy="155" r="7" fill="${i<8?'#FFA000':'#BDBDBD'}"/>`).join('')}
  <!-- Multiplication box -->
  <rect x="20" y="200" width="215" height="130" rx="12" fill="#E3F2FD" stroke="#1565C0" stroke-width="2"/>
  <text x="127" y="224" font-family="Arial" font-size="13" text-anchor="middle" fill="#0D47A1" font-weight="bold">Multiplication ✖️</text>
  <text x="127" y="250" font-family="Arial" font-size="22" text-anchor="middle" fill="#1565C0" font-weight="bold">4 × 3 = 12</text>
  <rect x="38" y="262" width="180" height="24" rx="6" fill="#BBDEFB"/>
  <text x="127" y="279" font-family="Arial" font-size="11" text-anchor="middle" fill="#1565C0">Repeated addition (4 groups of 3)</text>
  ${Array.from({length:4},(_,row)=>Array.from({length:3},(_,col)=>`<circle cx="${55+col*22}" cy="${296+row*0}" r="7" fill="#1976D2"/>`).join('')).join('')}
  ${Array.from({length:4},(_,row)=>Array.from({length:3},(_,col)=>`<circle cx="${55+col*22}" cy="${295}" r="0" fill="#1976D2"/>`).join('')).join('')}
  <!-- Division box -->
  <rect x="265" y="200" width="215" height="130" rx="12" fill="#FCE4EC" stroke="#AD1457" stroke-width="2"/>
  <text x="372" y="224" font-family="Arial" font-size="13" text-anchor="middle" fill="#880E4F" font-weight="bold">Division ➗</text>
  <text x="372" y="250" font-family="Arial" font-size="22" text-anchor="middle" fill="#AD1457" font-weight="bold">12 ÷ 4 = 3</text>
  <rect x="283" y="262" width="180" height="24" rx="6" fill="#F8BBD9"/>
  <text x="372" y="279" font-family="Arial" font-size="11" text-anchor="middle" fill="#880E4F">Splitting into equal groups</text>
  ${Array.from({length:4},(_,g)=>Array.from({length:3},(_,i)=>`<circle cx="${280+i*14+g*52}" cy="296" r="6" fill="${['#EF5350','#EC407A','#AB47BC','#7E57C2'][g]}"/>`).join('')).join('')}
  <!-- Title bottom -->
  <text x="250" y="342" font-family="Arial" font-size="11" text-anchor="middle" fill="#1B5E20">The four operations are the foundation of all math!</text>
</svg>`;
}

function geometrySVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#F3E5F5"/>
  <text x="250" y="28" font-family="Arial" font-size="16" text-anchor="middle" fill="#4A148C" font-weight="bold">Geometry: Shapes &amp; Properties</text>
  <!-- Circle -->
  <circle cx="85" cy="105" r="50" fill="#CE93D8" stroke="#7B1FA2" stroke-width="2.5"/>
  <line x1="85" y1="105" x2="135" y2="105" stroke="#4A148C" stroke-width="2"/>
  <text x="110" y="99" font-family="Arial" font-size="9" fill="#4A148C" font-weight="bold">r</text>
  <text x="85" y="172" font-family="Arial" font-size="12" text-anchor="middle" fill="#4A148C" font-weight="bold">Circle</text>
  <text x="85" y="187" font-family="Arial" font-size="9" text-anchor="middle" fill="#6A1B9A">Area = πr²</text>
  <!-- Triangle -->
  <polygon points="250,55 180,165 320,165" fill="#F48FB1" stroke="#C2185B" stroke-width="2.5"/>
  <text x="248" y="75" font-family="Arial" font-size="9" fill="#880E4F" font-weight="bold">60°</text>
  <text x="190" y="162" font-family="Arial" font-size="9" fill="#880E4F" font-weight="bold">60°</text>
  <text x="300" y="162" font-family="Arial" font-size="9" fill="#880E4F" font-weight="bold">60°</text>
  <text x="250" y="185" font-family="Arial" font-size="12" text-anchor="middle" fill="#C2185B" font-weight="bold">Triangle</text>
  <text x="250" y="200" font-family="Arial" font-size="9" text-anchor="middle" fill="#AD1457">3 sides, angles sum = 180°</text>
  <!-- Rectangle -->
  <rect x="365" y="60" width="110" height="70" fill="#80CBC4" stroke="#00695C" stroke-width="2.5" rx="3"/>
  <!-- Right angle marker -->
  <polyline points="365,120 375,120 375,130" fill="none" stroke="#00695C" stroke-width="1.5"/>
  <text x="420" y="145" font-family="Arial" font-size="12" text-anchor="middle" fill="#00695C" font-weight="bold">Rectangle</text>
  <text x="420" y="160" font-family="Arial" font-size="9" text-anchor="middle" fill="#00695C">4 sides, 4 right angles</text>
  <!-- Pentagon -->
  <polygon points="85,265 55,310 85,340 115,340 140,310" fill="#FFD54F" stroke="#F57F17" stroke-width="2.5"/>
  <text x="93" y="355" font-family="Arial" font-size="12" text-anchor="middle" fill="#E65100" font-weight="bold">Pentagon</text>
  <!-- Hexagon -->
  <polygon points="250,230 220,250 220,285 250,305 280,285 280,250" fill="#80DEEA" stroke="#0097A7" stroke-width="2.5"/>
  <text x="250" y="325" font-family="Arial" font-size="12" text-anchor="middle" fill="#00695C" font-weight="bold">Hexagon</text>
  <!-- Parallelogram -->
  <polygon points="365,230 440,230 475,290 400,290" fill="#FFAB91" stroke="#BF360C" stroke-width="2.5"/>
  <text x="420" y="308" font-family="Arial" font-size="12" text-anchor="middle" fill="#BF360C" font-weight="bold">Parallelogram</text>
  <!-- Side count labels -->
  <text x="250" y="342" font-family="Arial" font-size="9" text-anchor="middle" fill="#4A148C">5 sides | 6 sides | opposite sides parallel</text>
</svg>`;
}

function lightSpectrumSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#1A1A2E"/>
  <text x="250" y="28" font-family="Arial" font-size="15" text-anchor="middle" fill="#90CAF9" font-weight="bold">Light &amp; The Visible Spectrum</text>
  <!-- White light beam -->
  <polygon points="30,175 120,145 120,205" fill="white" opacity="0.85"/>
  <!-- Prism -->
  <polygon points="120,130 180,175 120,220" fill="#B0BEC5" stroke="#78909C" stroke-width="2" opacity="0.9"/>
  <text x="135" y="178" font-family="Arial" font-size="9" fill="#37474F" font-weight="bold">Prism</text>
  <!-- Rainbow spectrum bands -->
  <path d="M 180 175 Q 280 130 480 110" stroke="#EF5350" stroke-width="8" fill="none" opacity="0.9"/>
  <path d="M 180 175 Q 280 140 480 125" stroke="#FF8F00" stroke-width="8" fill="none" opacity="0.9"/>
  <path d="M 180 175 Q 280 150 480 142" stroke="#FDD835" stroke-width="8" fill="none" opacity="0.9"/>
  <path d="M 180 175 Q 280 163 480 160" stroke="#66BB6A" stroke-width="8" fill="none" opacity="0.9"/>
  <path d="M 180 175 Q 280 175 480 178" stroke="#42A5F5" stroke-width="8" fill="none" opacity="0.9"/>
  <path d="M 180 175 Q 280 188 480 196" stroke="#5C6BC0" stroke-width="8" fill="none" opacity="0.9"/>
  <path d="M 180 175 Q 280 200 480 214" stroke="#AB47BC" stroke-width="8" fill="none" opacity="0.9"/>
  <!-- Color labels -->
  <text x="442" y="108" font-family="Arial" font-size="10" fill="#EF5350" font-weight="bold">Red</text>
  <text x="442" y="123" font-family="Arial" font-size="10" fill="#FF8F00" font-weight="bold">Orange</text>
  <text x="442" y="140" font-family="Arial" font-size="10" fill="#FDD835" font-weight="bold">Yellow</text>
  <text x="442" y="158" font-family="Arial" font-size="10" fill="#66BB6A" font-weight="bold">Green</text>
  <text x="442" y="176" font-family="Arial" font-size="10" fill="#42A5F5" font-weight="bold">Blue</text>
  <text x="442" y="194" font-family="Arial" font-size="10" fill="#9FA8DA" font-weight="bold">Indigo</text>
  <text x="442" y="212" font-family="Arial" font-size="10" fill="#CE93D8" font-weight="bold">Violet</text>
  <!-- ROYGBIV label -->
  <rect x="20" y="250" width="200" height="80" rx="10" fill="#0D1B2A" stroke="#1565C0" stroke-width="1.5"/>
  <text x="120" y="270" font-family="Arial" font-size="12" text-anchor="middle" fill="#90CAF9" font-weight="bold">ROY G BIV</text>
  <text x="120" y="288" font-family="Arial" font-size="10" text-anchor="middle" fill="#78909C">Red Orange Yellow</text>
  <text x="120" y="304" font-family="Arial" font-size="10" text-anchor="middle" fill="#78909C">Green Blue Indigo Violet</text>
  <text x="120" y="322" font-family="Arial" font-size="9" text-anchor="middle" fill="#546E7A">(memory trick for spectrum order)</text>
  <!-- Sun -->
  <circle cx="28" cy="175" r="22" fill="#FDD835"/>
  <text x="28" y="208" font-family="Arial" font-size="9" text-anchor="middle" fill="#FDD835">White</text>
  <text x="28" y="220" font-family="Arial" font-size="9" text-anchor="middle" fill="#FDD835">light</text>
  <!-- Info box -->
  <rect x="240" y="250" width="240" height="80" rx="10" fill="#0D1B2A" stroke="#1565C0" stroke-width="1.5"/>
  <text x="360" y="270" font-family="Arial" font-size="11" text-anchor="middle" fill="#90CAF9" font-weight="bold">How it works</text>
  <text x="252" y="288" font-family="Arial" font-size="9" fill="#78909C">White light contains ALL colours mixed</text>
  <text x="252" y="304" font-family="Arial" font-size="9" fill="#78909C">A prism separates them by wavelength</text>
  <text x="252" y="320" font-family="Arial" font-size="9" fill="#78909C">Rainbows form the same way (water drops)</text>
</svg>`;
}

function weatherSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#E3F2FD"/>
  <text x="250" y="26" font-family="Arial" font-size="15" text-anchor="middle" fill="#0D47A1" font-weight="bold">Weather Types</text>
  <!-- Sunny -->
  <circle cx="75" cy="105" r="35" fill="#FDD835"/>
  <circle cx="75" cy="105" r="25" fill="#FFEE58"/>
  ${[0,45,90,135,180,225,270,315].map(deg=>{const r=deg*Math.PI/180;return `<line x1="${75+40*Math.cos(r)}" y1="${105+40*Math.sin(r)}" x2="${75+50*Math.cos(r)}" y2="${105+50*Math.sin(r)}" stroke="#FDD835" stroke-width="3" stroke-linecap="round"/>`;}).join('')}
  <text x="75" y="157" font-family="Arial" font-size="11" text-anchor="middle" fill="#E65100" font-weight="bold">Sunny</text>
  <!-- Cloudy -->
  <ellipse cx="200" cy="95" rx="42" ry="24" fill="#ECEFF1"/>
  <ellipse cx="170" cy="106" rx="30" ry="18" fill="#CFD8DC"/>
  <ellipse cx="228" cy="106" rx="28" ry="16" fill="#ECEFF1"/>
  <ellipse cx="200" cy="114" rx="40" ry="20" fill="#B0BEC5"/>
  <text x="200" y="147" font-family="Arial" font-size="11" text-anchor="middle" fill="#455A64" font-weight="bold">Cloudy</text>
  <!-- Rainy -->
  <ellipse cx="340" cy="88" rx="40" ry="22" fill="#78909C"/>
  <ellipse cx="312" cy="99" rx="28" ry="16" fill="#607D8B"/>
  <ellipse cx="366" cy="99" rx="26" ry="14" fill="#546E7A"/>
  <ellipse cx="340" cy="108" rx="38" ry="18" fill="#455A64"/>
  ${Array.from({length:6},(_,i)=>`<line x1="${310+i*12}" y1="122" x2="${305+i*12}" y2="142" stroke="#1565C0" stroke-width="2.5" stroke-linecap="round"/>`).join('')}
  <text x="340" y="158" font-family="Arial" font-size="11" text-anchor="middle" fill="#1565C0" font-weight="bold">Rainy</text>
  <!-- Snowy -->
  <ellipse cx="440" cy="90" rx="38" ry="20" fill="#ECEFF1"/>
  <ellipse cx="415" cy="100" rx="26" ry="16" fill="#CFD8DC"/>
  <ellipse cx="463" cy="100" rx="24" ry="14" fill="#ECEFF1"/>
  <ellipse cx="440" cy="108" rx="36" ry="18" fill="#B0BEC5"/>
  ${Array.from({length:5},(_,i)=>`<text x="${415+i*14}" y="${140+((i%2)*8)}" font-family="Arial" font-size="16" fill="#90CAF9">❄</text>`).join('')}
  <text x="440" y="168" font-family="Arial" font-size="11" text-anchor="middle" fill="#42A5F5" font-weight="bold">Snowy</text>
  <!-- Thunderstorm -->
  <ellipse cx="100" cy="240" rx="50" ry="28" fill="#424242"/>
  <ellipse cx="65" cy="255" rx="36" ry="20" fill="#616161"/>
  <ellipse cx="133" cy="255" rx="32" ry="18" fill="#424242"/>
  <ellipse cx="100" cy="265" rx="48" ry="22" fill="#37474F"/>
  <polygon points="108,272 92,272 102,295 90,295 112,320 100,300 112,300" fill="#FDD835"/>
  <text x="100" y="338" font-family="Arial" font-size="11" text-anchor="middle" fill="#FDD835" font-weight="bold">Thunderstorm</text>
  <!-- Windy -->
  <path d="M 240 235 Q 300 225 350 240 Q 390 252 430 238" stroke="#90A4AE" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M 250 255 Q 310 245 360 258 Q 395 268 430 255" stroke="#B0BEC5" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M 245 275 Q 300 265 355 276 Q 392 284 430 272" stroke="#CFD8DC" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <text x="340" y="308" font-family="Arial" font-size="11" text-anchor="middle" fill="#546E7A" font-weight="bold">Windy</text>
  <!-- Fog -->
  <path d="M 185 250 Q 220 245 255 250 Q 220 258 185 250" stroke="#B0BEC5" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.9"/>
  <path d="M 180 265 Q 220 258 260 265 Q 220 273 180 265" stroke="#B0BEC5" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.8"/>
  <path d="M 183 280 Q 220 273 257 280" stroke="#CFD8DC" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.8"/>
  <text x="220" y="308" font-family="Arial" font-size="11" text-anchor="middle" fill="#78909C" font-weight="bold">Foggy</text>
</svg>`;
}

function timelineSVG(topic: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#FFF8E1"/>
  <text x="250" y="28" font-family="Arial" font-size="14" text-anchor="middle" fill="#5D4037" font-weight="bold">${topic.length > 35 ? topic.substring(0, 35) + '...' : topic} — Timeline</text>
  <line x1="50" y1="175" x2="460" y2="175" stroke="#5D4037" stroke-width="3"/>
  <polygon points="460,168 475,175 460,182" fill="#5D4037"/>
  ${[1,2,3,4,5].map((n,i)=>{
    const x = 80 + i * 85;
    const above = i % 2 === 0;
    return `
    <circle cx="${x}" cy="175" r="10" fill="#FF8F00"/>
    <line x1="${x}" y1="${above?165:185}" x2="${x}" y2="${above?115:235}" stroke="#795548" stroke-width="1.5"/>
    <rect x="${x-40}" y="${above?88:238}" width="80" height="28" rx="5" fill="#FFECB3" stroke="#F57F17" stroke-width="1.5"/>
    <text x="${x}" y="${above?107:255}" font-family="Arial" font-size="10" text-anchor="middle" fill="#E65100" font-weight="bold">Event ${n}</text>
    `;
  }).join('')}
  <text x="250" y="330" font-family="Arial" font-size="11" text-anchor="middle" fill="#795548">Timeline shows events in chronological order (oldest → newest)</text>
</svg>`;
}

function bookSVG(topic: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <rect width="500" height="350" fill="#EFEBE9"/>
  <text x="250" y="28" font-family="Arial" font-size="15" text-anchor="middle" fill="#4E342E" font-weight="bold">${topic.length > 32 ? topic.substring(0, 32) + '...' : topic}</text>
  <!-- Open book -->
  <!-- Left page -->
  <path d="M 100 70 Q 100 60 110 60 L 235 65 L 240 285 L 100 285 Z" fill="#FAFAFA" stroke="#795548" stroke-width="2"/>
  <!-- Left page lines -->
  ${Array.from({length:8},(_,i)=>`<line x1="115" y1="${88+i*22}" x2="228" y2="${88+i*22}" stroke="#BDBDBD" stroke-width="1.2"/>`).join('')}
  <text x="172" y="82" font-family="Arial" font-size="10" text-anchor="middle" fill="#8D6E63">• Setting</text>
  <text x="172" y="104" font-family="Arial" font-size="10" text-anchor="middle" fill="#8D6E63">• Characters</text>
  <text x="172" y="126" font-family="Arial" font-size="10" text-anchor="middle" fill="#8D6E63">• Plot</text>
  <text x="172" y="148" font-family="Arial" font-size="10" text-anchor="middle" fill="#8D6E63">• Theme</text>
  <text x="172" y="170" font-family="Arial" font-size="10" text-anchor="middle" fill="#8D6E63">• Conflict</text>
  <text x="172" y="192" font-family="Arial" font-size="10" text-anchor="middle" fill="#8D6E63">• Resolution</text>
  <!-- Spine -->
  <rect x="235" y="60" width="30" height="225" fill="#795548" rx="2"/>
  <!-- Right page -->
  <path d="M 400 70 Q 400 60 390 60 L 265 65 L 260 285 L 400 285 Z" fill="#FFF9C4" stroke="#795548" stroke-width="2"/>
  ${Array.from({length:8},(_,i)=>`<line x1="272" y1="${88+i*22}" x2="388" y2="${88+i*22}" stroke="#BDBDBD" stroke-width="1.2"/>`).join('')}
  <text x="328" y="90" font-family="Arial" font-size="11" text-anchor="middle" fill="#5D4037" font-weight="bold">Story Structure</text>
  <!-- Story arc -->
  <path d="M 272 240 Q 328 170 388 240" stroke="#F57F17" stroke-width="3" fill="none"/>
  <text x="273" y="258" font-family="Arial" font-size="9" fill="#E65100">Beginning</text>
  <text x="322" y="175" font-family="Arial" font-size="9" fill="#E65100">Climax</text>
  <text x="368" y="258" font-family="Arial" font-size="9" fill="#E65100">End</text>
  <!-- Title bar -->
  <rect x="120" y="295" width="260" height="30" rx="8" fill="#795548"/>
  <text x="250" y="316" font-family="Arial" font-size="13" text-anchor="middle" fill="white" font-weight="bold">📖 Literature</text>
  <text x="250" y="342" font-family="Arial" font-size="10" text-anchor="middle" fill="#8D6E63">Good books take us on adventures of the mind</text>
</svg>`;
}

/** Pick a subject-relevant emoji based on topic keywords */
function getTopicEmoji(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes('math') || t.includes('number') || t.includes('algebra') || t.includes('geometry') || t.includes('fraction')) return '📐';
  if (t.includes('science') || t.includes('experiment') || t.includes('chemistry')) return '🔬';
  if (t.includes('biology') || t.includes('cell') || t.includes('animal') || t.includes('plant') || t.includes('life')) return '🌿';
  if (t.includes('physics') || t.includes('gravity') || t.includes('force') || t.includes('energy') || t.includes('motion')) return '⚡';
  if (t.includes('earth') || t.includes('geology') || t.includes('rock') || t.includes('volcano')) return '🌍';
  if (t.includes('space') || t.includes('planet') || t.includes('star') || t.includes('solar') || t.includes('moon')) return '🚀';
  if (t.includes('water') || t.includes('ocean') || t.includes('river') || t.includes('rain')) return '💧';
  if (t.includes('weather') || t.includes('climate') || t.includes('cloud') || t.includes('storm')) return '🌤';
  if (t.includes('history') || t.includes('ancient') || t.includes('war') || t.includes('civilization')) return '📜';
  if (t.includes('geograph') || t.includes('map') || t.includes('continent')) return '🗺';
  if (t.includes('read') || t.includes('writ') || t.includes('english') || t.includes('language') || t.includes('book') || t.includes('story')) return '📖';
  if (t.includes('music') || t.includes('instrument') || t.includes('rhythm')) return '🎵';
  if (t.includes('art') || t.includes('paint') || t.includes('draw') || t.includes('color')) return '🎨';
  if (t.includes('computer') || t.includes('coding') || t.includes('program') || t.includes('technology')) return '💻';
  if (t.includes('health') || t.includes('body') || t.includes('food') || t.includes('nutrition')) return '🏥';
  return '📚';
}

/** Wrap topic text across multiple lines if too long */
function wrapTopicText(topic: string, maxChars: number): string[] {
  if (topic.length <= maxChars) return [topic];
  const words = topic.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3); // max 3 lines
}

function genericEducationSVG(topic: string): string {
  const emoji = getTopicEmoji(topic);
  const titleLines = wrapTopicText(topic, 35);
  const titleElements = titleLines.map((line, i) => {
    const escapedLine = line.length > 38 ? line.substring(0, 38) + '...' : line;
    return `<text x="250" y="${130 + i * 28}" font-family="Arial, sans-serif" font-size="22" text-anchor="middle" fill="#1A237E" font-weight="bold">${escapedLine}</text>`;
  }).join('\n  ');
  const emojiY = 130 + titleLines.length * 28 + 30;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350">
  <!-- Clean educational background -->
  <rect width="500" height="350" fill="#FAFBFC"/>
  <rect x="20" y="20" width="460" height="310" rx="16" fill="white" stroke="#E0E4E8" stroke-width="1.5"/>
  <!-- Decorative header bar -->
  <rect x="20" y="20" width="460" height="8" rx="4" fill="#1565C0"/>
  <!-- Subject emoji -->
  <text x="250" y="${emojiY}" font-family="Arial" font-size="48" text-anchor="middle">${emoji}</text>
  <!-- Topic title -->
  ${titleElements}
  <!-- Illustration unavailable notice -->
  <text x="250" y="290" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="#90A4AE">Illustration could not be generated</text>
  <text x="250" y="310" font-family="Arial, sans-serif" font-size="11" text-anchor="middle" fill="#B0BEC5">The lesson content above covers this topic in detail</text>
</svg>`;
}
