import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import DOMPurify from 'isomorphic-dompurify';
import { ChevronLeft, ChevronRight } from 'react-feather';
import { useTheme } from '../styles/theme';
import SimpleMarkdownRenderer from './SimpleMarkdownRenderer';

// ---------------------------------------------------------------------------
// Types (mirrored from EnhancedLessonContent)
// ---------------------------------------------------------------------------
interface LessonImage {
  id: string;
  description: string;
  alt: string;
  base64Data?: string;
  svgData?: string;
  path?: string;
  promptUsed: string;
}

interface LessonDiagram {
  id: string;
  type: string;
  title: string;
  svgData: string;
  description: string;
}

interface LessonSection {
  title: string;
  content: string;
  type: string;
  imageIds?: string[];
}

interface EnhancedLessonSpec {
  title: string;
  targetGradeLevel: number;
  subtitle?: string;
  summary: string;
  subject?: string;
  category?: string;
  sections: LessonSection[];
  featuredImage?: string;
  images: LessonImage[];
  diagrams: LessonDiagram[];
  questions: any[];
  graph?: any;
  keywords: string[];
  relatedTopics: string[];
  estimatedDuration: number;
  difficultyLevel: string;
}

interface LessonCardCarouselProps {
  enhancedSpec: EnhancedLessonSpec;
  onStartQuiz: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSectionIcon(type: string): string {
  switch (type) {
    case 'introduction': return '\uD83D\uDC4B';
    case 'key_concepts': return '\uD83D\uDD11';
    case 'examples': return '\uD83D\uDCA1';
    case 'practice': return '\u270F\uFE0F';
    case 'summary': return '\uD83D\uDCDD';
    case 'fun_facts': return '\uD83C\uDF1F';
    default: return '\uD83D\uDCD6';
  }
}

function getLevelEmoji(level: string): string {
  const lower = level.toLowerCase();
  if (lower === 'easy' || lower === 'beginner') return '\u2B50 Easy';
  if (lower === 'medium' || lower === 'intermediate') return '\u2B50\u2B50 Medium';
  if (lower === 'hard' || lower === 'advanced') return '\u2B50\u2B50\u2B50 Hard';
  return `\u2B50 ${level}`;
}

function pickIconForDescription(description: string): string {
  const d = description.toLowerCase();
  if (d.includes('sun') || d.includes('solar') || d.includes('star')) return '\u2600\uFE0F';
  if (d.includes('water') || d.includes('ocean') || d.includes('rain')) return '\uD83C\uDF0A';
  if (d.includes('plant') || d.includes('leaf') || d.includes('tree')) return '\uD83C\uDF3F';
  if (d.includes('animal') || d.includes('bird') || d.includes('fish')) return '\uD83E\uDD8B';
  if (d.includes('cell') || d.includes('molecule') || d.includes('atom')) return '\uD83D\uDD2C';
  if (d.includes('volcano') || d.includes('mountain') || d.includes('rock')) return '\uD83C\uDF0B';
  if (d.includes('planet') || d.includes('space') || d.includes('galaxy')) return '\uD83E\uDE90';
  if (d.includes('math') || d.includes('number') || d.includes('fraction')) return '\uD83D\uDD22';
  if (d.includes('map') || d.includes('country') || d.includes('geography')) return '\uD83D\uDDFA\uFE0F';
  if (d.includes('history') || d.includes('ancient') || d.includes('timeline')) return '\uD83C\uDFDB\uFE0F';
  if (d.includes('book') || d.includes('story') || d.includes('read')) return '\uD83D\uDCD6';
  if (d.includes('experiment') || d.includes('lab') || d.includes('chemical')) return '\u2697\uFE0F';
  if (d.includes('food') || d.includes('eat') || d.includes('nutrition')) return '\uD83E\uDD66';
  if (d.includes('body') || d.includes('human') || d.includes('heart')) return '\uD83E\uDEC1';
  if (d.includes('light') || d.includes('color') || d.includes('rainbow')) return '\uD83C\uDF08';
  return '\uD83D\uDDBC\uFE0F';
}

function generatePlaceholderSVG(description: string, primaryColor: string): string {
  const icon = pickIconForDescription(description);
  const shortDesc = description.length > 90 ? description.substring(0, 87) + '...' : description;
  const words = shortDesc.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > 45 && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current);
  const lineEls = lines.slice(0, 3).map((line, i) =>
    `<text x="250" y="${185 + i * 22}" font-family="Arial" font-size="13" text-anchor="middle" fill="#546E7A">${
      line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }</text>`
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 280" width="100%" height="280">
    <rect width="500" height="280" fill="#F8F9FA" rx="12"/>
    <rect width="500" height="280" fill="${primaryColor}" opacity="0.06" rx="12"/>
    <rect x="2" y="2" width="496" height="276" fill="none" stroke="${primaryColor}" stroke-width="2" rx="11" opacity="0.3" stroke-dasharray="6,4"/>
    <circle cx="250" cy="105" r="52" fill="${primaryColor}" opacity="0.12"/>
    <circle cx="250" cy="105" r="40" fill="${primaryColor}" opacity="0.18"/>
    <text x="250" y="120" font-family="Arial" font-size="36" text-anchor="middle">${icon}</text>
    ${lineEls}
    <rect x="185" y="248" width="130" height="20" rx="10" fill="${primaryColor}" opacity="0.15"/>
    <text x="250" y="262" font-family="Arial" font-size="10" text-anchor="middle" fill="${primaryColor}" font-weight="bold">ILLUSTRATION</text>
  </svg>`;
}

function getSubjectCoverSVG(subject: string, primaryColor: string): string {
  const s = subject.toLowerCase();

  // Math / Mathematics / Numbers / Algebra / Geometry / Fractions
  if (/math|algebra|geometry|fraction|number|arithmetic|calculus/.test(s)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="100%" height="200">
      <rect width="300" height="200" fill="#F0F4FF" rx="12"/>
      <circle cx="70" cy="70" r="30" fill="${primaryColor}" opacity="0.15"/>
      <text x="70" y="80" font-family="Arial" font-size="28" text-anchor="middle" fill="${primaryColor}" font-weight="bold">1</text>
      <text x="115" y="80" font-family="Arial" font-size="24" text-anchor="middle" fill="${primaryColor}" opacity="0.7">+</text>
      <circle cx="160" cy="70" r="30" fill="${primaryColor}" opacity="0.15"/>
      <text x="160" y="80" font-family="Arial" font-size="28" text-anchor="middle" fill="${primaryColor}" font-weight="bold">2</text>
      <text x="205" y="80" font-family="Arial" font-size="24" text-anchor="middle" fill="${primaryColor}" opacity="0.7">=</text>
      <circle cx="245" cy="70" r="30" fill="${primaryColor}" opacity="0.15"/>
      <text x="245" y="80" font-family="Arial" font-size="28" text-anchor="middle" fill="${primaryColor}" font-weight="bold">3</text>
      <polygon points="80,130 100,170 60,170" fill="${primaryColor}" opacity="0.2"/>
      <rect x="130" y="130" width="40" height="40" rx="4" fill="${primaryColor}" opacity="0.15"/>
      <circle cx="220" cy="150" r="20" fill="${primaryColor}" opacity="0.2"/>
    </svg>`;
  }

  // Science / Animals / Plants / Earth Science / Human Body
  if (/science|animal|plant|earth|biology|chemistry|physics|human body|nature/.test(s)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="100%" height="200">
      <rect width="300" height="200" fill="#F0FFF4" rx="12"/>
      <rect x="130" y="40" width="40" height="80" rx="4" fill="${primaryColor}" opacity="0.2"/>
      <ellipse cx="150" cy="40" rx="30" ry="20" fill="${primaryColor}" opacity="0.15"/>
      <circle cx="140" cy="90" r="6" fill="${primaryColor}" opacity="0.4"/>
      <circle cx="155" cy="75" r="5" fill="${primaryColor}" opacity="0.35"/>
      <circle cx="145" cy="60" r="4" fill="${primaryColor}" opacity="0.3"/>
      <circle cx="160" cy="50" r="3" fill="${primaryColor}" opacity="0.25"/>
      <path d="M60 160 Q70 120 80 140 Q90 110 100 160" fill="${primaryColor}" opacity="0.2" stroke="${primaryColor}" stroke-width="2" opacity="0.3"/>
      <ellipse cx="80" cy="160" rx="25" ry="6" fill="${primaryColor}" opacity="0.1"/>
      <circle cx="240" cy="100" r="30" fill="none" stroke="${primaryColor}" stroke-width="3" opacity="0.3"/>
      <line x1="262" y1="122" x2="280" y2="140" stroke="${primaryColor}" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
      <circle cx="240" cy="100" r="10" fill="${primaryColor}" opacity="0.15"/>
    </svg>`;
  }

  // Language Arts / Reading / Writing / Literature
  if (/language|reading|writing|literature|english|grammar|vocabulary|spelling/.test(s)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="100%" height="200">
      <rect width="300" height="200" fill="#FFF8F0" rx="12"/>
      <path d="M90 140 L90 50 Q150 30 150 70 L150 150" fill="${primaryColor}" opacity="0.12" stroke="${primaryColor}" stroke-width="2" opacity="0.3"/>
      <path d="M210 140 L210 50 Q150 30 150 70 L150 150" fill="${primaryColor}" opacity="0.12" stroke="${primaryColor}" stroke-width="2" opacity="0.3"/>
      <line x1="105" y1="75" x2="140" y2="75" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
      <line x1="105" y1="90" x2="135" y2="90" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
      <line x1="105" y1="105" x2="140" y2="105" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
      <line x1="105" y1="120" x2="130" y2="120" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
      <line x1="160" y1="75" x2="195" y2="75" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
      <line x1="160" y1="90" x2="190" y2="90" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
      <line x1="160" y1="105" x2="195" y2="105" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
      <line x1="160" y1="120" x2="185" y2="120" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
    </svg>`;
  }

  // Social Studies / History / Geography
  if (/social|history|geography|civics|culture|government|map/.test(s)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="100%" height="200">
      <rect width="300" height="200" fill="#F0F8FF" rx="12"/>
      <circle cx="150" cy="100" r="60" fill="${primaryColor}" opacity="0.1" stroke="${primaryColor}" stroke-width="2" opacity="0.3"/>
      <ellipse cx="150" cy="100" rx="60" ry="25" fill="none" stroke="${primaryColor}" stroke-width="1.5" opacity="0.2"/>
      <ellipse cx="150" cy="100" rx="25" ry="60" fill="none" stroke="${primaryColor}" stroke-width="1.5" opacity="0.2"/>
      <line x1="90" y1="100" x2="210" y2="100" stroke="${primaryColor}" stroke-width="1" opacity="0.15"/>
      <line x1="150" y1="40" x2="150" y2="160" stroke="${primaryColor}" stroke-width="1" opacity="0.15"/>
      <circle cx="130" cy="85" r="8" fill="${primaryColor}" opacity="0.2"/>
      <circle cx="170" cy="105" r="10" fill="${primaryColor}" opacity="0.2"/>
      <circle cx="145" cy="115" r="6" fill="${primaryColor}" opacity="0.15"/>
    </svg>`;
  }

  // Arts / Music / Creative
  if (/art|music|creative|paint|draw|craft|design/.test(s)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="100%" height="200">
      <rect width="300" height="200" fill="#FFF5F5" rx="12"/>
      <ellipse cx="150" cy="110" rx="70" ry="55" fill="${primaryColor}" opacity="0.08"/>
      <ellipse cx="150" cy="110" rx="60" ry="45" fill="${primaryColor}" opacity="0.06" stroke="${primaryColor}" stroke-width="2" opacity="0.2"/>
      <circle cx="115" cy="90" r="10" fill="#FF6B6B" opacity="0.7"/>
      <circle cx="140" cy="80" r="10" fill="#4ECDC4" opacity="0.7"/>
      <circle cx="170" cy="82" r="10" fill="#FFE66D" opacity="0.7"/>
      <circle cx="190" cy="95" r="10" fill="#A78BFA" opacity="0.7"/>
      <circle cx="130" cy="120" r="10" fill="#F472B6" opacity="0.7"/>
      <circle cx="160" cy="125" r="10" fill="#34D399" opacity="0.7"/>
      <ellipse cx="150" cy="145" rx="12" ry="8" fill="${primaryColor}" opacity="0.15"/>
      <line x1="195" y1="90" x2="230" y2="50" stroke="${primaryColor}" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
    </svg>`;
  }

  // Technology / Coding
  if (/tech|coding|computer|programming|digital|robot/.test(s)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="100%" height="200">
      <rect width="300" height="200" fill="#F0F4FF" rx="12"/>
      <rect x="75" y="50" width="150" height="100" rx="8" fill="${primaryColor}" opacity="0.08" stroke="${primaryColor}" stroke-width="2" opacity="0.25"/>
      <text x="150" y="112" font-family="monospace" font-size="32" text-anchor="middle" fill="${primaryColor}" opacity="0.6" font-weight="bold">&lt; /&gt;</text>
      <rect x="90" y="70" width="50" height="4" rx="2" fill="${primaryColor}" opacity="0.15"/>
      <rect x="90" y="82" width="70" height="4" rx="2" fill="${primaryColor}" opacity="0.12"/>
      <circle cx="210" cy="65" r="4" fill="${primaryColor}" opacity="0.3"/>
      <circle cx="200" cy="65" r="4" fill="${primaryColor}" opacity="0.2"/>
      <circle cx="190" cy="65" r="4" fill="${primaryColor}" opacity="0.15"/>
    </svg>`;
  }

  // Default — lightbulb
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="100%" height="200">
    <rect width="300" height="200" fill="#FFFBF0" rx="12"/>
    <circle cx="150" cy="85" r="40" fill="${primaryColor}" opacity="0.12"/>
    <circle cx="150" cy="85" r="30" fill="${primaryColor}" opacity="0.08"/>
    <path d="M130 85 Q130 55 150 50 Q170 55 170 85 Q170 100 165 105 L135 105 Q130 100 130 85" fill="${primaryColor}" opacity="0.2" stroke="${primaryColor}" stroke-width="2" opacity="0.35"/>
    <rect x="138" y="110" width="24" height="6" rx="3" fill="${primaryColor}" opacity="0.25"/>
    <rect x="140" y="120" width="20" height="6" rx="3" fill="${primaryColor}" opacity="0.2"/>
    <rect x="142" y="130" width="16" height="6" rx="3" fill="${primaryColor}" opacity="0.15"/>
    <line x1="150" y1="30" x2="150" y2="20" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
    <line x1="185" y1="50" x2="193" y2="42" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
    <line x1="115" y1="50" x2="107" y2="42" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
    <line x1="195" y1="85" x2="205" y2="85" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
    <line x1="105" y1="85" x2="95" y2="85" stroke="${primaryColor}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Card type definitions
// ---------------------------------------------------------------------------
type CardData =
  | { type: 'cover' }
  | { type: 'section'; sectionIndex: number }
  | { type: 'diagrams' }
  | { type: 'recap' }
  | { type: 'quiz' };

// Swipe threshold in pixels — must drag at least this far to trigger navigation
const SWIPE_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const LessonCardCarousel: React.FC<LessonCardCarouselProps> = ({
  enhancedSpec,
  onStartQuiz,
}) => {
  const theme = useTheme();
  // Restore card position from localStorage (survives refresh)
  const storageKey = `carousel_pos_${enhancedSpec.title}`;
  const [currentIndex, setCurrentIndex] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const idx = saved ? parseInt(saved, 10) : 0;
      return isNaN(idx) ? 0 : idx;
    } catch { return 0; }
  });
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const hasMountedRef = useRef(false);

  // Persist card position — skip first render to avoid overwriting restored value
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    try { localStorage.setItem(storageKey, String(currentIndex)); } catch {}
  }, [currentIndex, storageKey]);

  // Touch/swipe state
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  // Safe access to arrays that might be undefined from API
  const sections = enhancedSpec.sections ?? [];
  const diagrams = enhancedSpec.diagrams ?? [];
  const keywords = enhancedSpec.keywords ?? [];
  const relatedTopics = enhancedSpec.relatedTopics ?? [];
  const images = enhancedSpec.images ?? [];

  // Build card list
  const cards: CardData[] = [
    { type: 'cover' },
    ...sections.map((_, i) => ({ type: 'section' as const, sectionIndex: i })),
    ...(diagrams.length > 0 ? [{ type: 'diagrams' as const }] : []),
    ...(keywords.length > 0 || relatedTopics.length > 0 ? [{ type: 'recap' as const }] : []),
    { type: 'quiz' },
  ];

  const totalCards = cards.length;

  // Clamp restored index to valid range (only when totalCards shrinks)
  useEffect(() => {
    if (totalCards > 0 && currentIndex >= totalCards) {
      setCurrentIndex(totalCards - 1);
    }
  }, [totalCards]);

  const goNext = useCallback(() => {
    setCurrentIndex(prev => {
      if (prev < totalCards - 1) {
        setSlideDirection('left');
        return prev + 1;
      }
      return prev;
    });
  }, [totalCards]);

  const goBack = useCallback(() => {
    setCurrentIndex(prev => {
      if (prev > 0) {
        setSlideDirection('right');
        return prev - 1;
      }
      return prev;
    });
  }, []);

  // Reset scroll when changing cards
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    const timer = setTimeout(() => setSlideDirection(null), 300);
    return () => clearTimeout(timer);
  }, [currentIndex]);

  // Keyboard navigation — only when no interactive element is focused
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goBack]);

  // Touch/swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // Only count as swipe if horizontal movement > vertical (prevents hijacking scroll)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      isSwiping.current = true;
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isSwiping.current) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -SWIPE_THRESHOLD) {
      goNext();
    } else if (dx > SWIPE_THRESHOLD) {
      goBack();
    }
    isSwiping.current = false;
  }, [goNext, goBack]);

  // Image helpers
  const findImageById = (id: string) => images.find(img => img.id === id);

  const renderImage = (image: LessonImage) => {
    const containerStyle = [s.imageContainer, { borderColor: theme.colors.primary + '30' }];

    if (image.base64Data) {
      return (
        <View style={containerStyle}>
          <Image
            source={{ uri: `data:image/png;base64,${image.base64Data}` }}
            style={s.image}
            resizeMode="contain"
          />
          <Text style={[s.imageCaption, { color: theme.colors.textSecondary }]}>
            {image.description}
          </Text>
        </View>
      );
    }

    if (image.svgData) {
      const cleanSvg = DOMPurify.sanitize(image.svgData, { USE_PROFILES: { svg: true, svgFilters: true } });
      return (
        <View style={containerStyle}>
          <div
            style={{ width: '100%', maxWidth: 500, overflow: 'hidden' }}
            dangerouslySetInnerHTML={{ __html: cleanSvg }}
          />
          <Text style={[s.imageCaption, { color: theme.colors.textSecondary }]}>
            {image.description}
          </Text>
        </View>
      );
    }

    if (image.path) {
      return (
        <View style={containerStyle}>
          <Image source={{ uri: image.path }} style={s.image} resizeMode="contain" />
          <Text style={[s.imageCaption, { color: theme.colors.textSecondary }]}>
            {image.description}
          </Text>
        </View>
      );
    }

    if (image.description) {
      const placeholderSvg = generatePlaceholderSVG(image.description, theme.colors.primary);
      return (
        <View style={[containerStyle, { marginVertical: 10 }]}>
          <div
            style={{ width: '100%', maxWidth: 500, overflow: 'hidden' }}
            dangerouslySetInnerHTML={{ __html: placeholderSvg }}
          />
        </View>
      );
    }

    return null;
  };

  // ---------------------------------------------------------------------------
  // Card renderers
  // ---------------------------------------------------------------------------
  const renderCoverCard = () => {
    // Try featured image first, then fall back to the first image with actual data
    let coverImage = enhancedSpec.featuredImage
      ? findImageById(enhancedSpec.featuredImage)
      : null;

    // If no featured image (or featured image has no data yet), try first image with real content
    if (!coverImage || (!coverImage.svgData && !coverImage.base64Data && !coverImage.path)) {
      const firstWithData = images.find(img => img.svgData || img.base64Data || img.path);
      if (firstWithData) {
        coverImage = firstWithData;
      }
    }

    return (
      <View style={s.cardInner}>
        <Text style={[s.cardLabel, { color: theme.colors.primary }]}>LESSON</Text>

        <Text style={[s.coverTitle, { color: theme.colors.textPrimary }]}>
          {enhancedSpec.title}
        </Text>

        {enhancedSpec.subtitle && (
          <Text style={[s.coverSubtitle, { color: theme.colors.textSecondary }]}>
            {enhancedSpec.subtitle}
          </Text>
        )}

        {coverImage ? (
          <View style={s.coverImageWrap}>
            {renderImage(coverImage)}
          </View>
        ) : (
          <View style={s.coverImageWrap}>
            <div
              style={{ width: '100%', maxWidth: 500, overflow: 'hidden', borderRadius: 12 }}
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  getSubjectCoverSVG(
                    enhancedSpec.subject || enhancedSpec.category || '',
                    theme.colors.primary,
                  ),
                  { USE_PROFILES: { svg: true, svgFilters: true } },
                ),
              }}
            />
          </View>
        )}

        <View
          style={[
            s.summaryBox,
            {
              backgroundColor: theme.colors.primary + '12',
              borderLeftColor: theme.colors.primary,
            },
          ]}
        >
          <Text style={[s.summaryText, { color: theme.colors.textPrimary }]}>
            {enhancedSpec.summary}
          </Text>
        </View>

        <View style={s.metaRow}>
          <View style={[s.metaChip, { backgroundColor: theme.colors.primary + '15' }]}>
            <Text style={[s.metaChipText, { color: theme.colors.primary }]}>
              {'\u23F1\uFE0F'} {enhancedSpec.estimatedDuration} min
            </Text>
          </View>
          <View style={[s.metaChip, { backgroundColor: theme.colors.secondary + '20' }]}>
            <Text style={[s.metaChipText, { color: theme.colors.textPrimary }]}>
              {getLevelEmoji(enhancedSpec.difficultyLevel)}
            </Text>
          </View>
          <View style={[s.metaChip, { backgroundColor: theme.colors.accent3 + '20' }]}>
            <Text style={[s.metaChipText, { color: theme.colors.textPrimary }]}>
              {'\uD83D\uDCDA'} Grade {enhancedSpec.targetGradeLevel}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderSectionCard = (sectionIndex: number) => {
    const section = sections[sectionIndex];
    if (!section) return null;
    const icon = getSectionIcon(section.type);

    return (
      <View style={s.cardInner}>
        <Text style={[s.cardLabel, { color: theme.colors.primary }]}>
          {section.type.replace(/_/g, ' ').toUpperCase()}
        </Text>

        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionIcon}>{icon}</Text>
          <Text style={[s.sectionTitle, { color: theme.colors.textPrimary }]}>
            {section.title}
          </Text>
        </View>

        {section.imageIds && section.imageIds.map(imageId => {
          const image = findImageById(imageId);
          if (image) {
            return <React.Fragment key={imageId}>{renderImage(image)}</React.Fragment>;
          }
          return null;
        })}

        <SimpleMarkdownRenderer content={section.content} />
      </View>
    );
  };

  const renderDiagramSvg = (diagram: LessonDiagram) => {
    const svg = diagram.svgData || '';
    const hasDrawingElements = /<(path|circle|ellipse|polygon|polyline|line|rect)\b/i.test(svg);
    if (svg.includes('<svg') && hasDrawingElements) {
      return (
        <div dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
        }} />
      );
    }
    // Fallback: generate a placeholder SVG for diagrams without real drawing elements
    const placeholderSvg = generatePlaceholderSVG(
      diagram.description || diagram.title,
      theme.colors.primary,
    );
    return (
      <div
        style={{ width: '100%', maxWidth: 500, overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: placeholderSvg }}
      />
    );
  };

  const renderDiagramsCard = () => (
    <View style={s.cardInner}>
      <Text style={[s.cardLabel, { color: theme.colors.primary }]}>DIAGRAMS</Text>
      <Text style={[s.sectionTitle, { color: theme.colors.textPrimary, marginBottom: 16 }]}>
        {"\uD83D\uDD0D Let's Look at This!"}
      </Text>
      {diagrams.map((diagram, index) => (
        <View
          key={index}
          style={[s.diagramCard, { backgroundColor: theme.colors.background }]}
        >
          <Text style={[s.diagramTitle, { color: theme.colors.textPrimary }]}>
            {diagram.title}
          </Text>
          <View style={s.diagramContainer}>
            {renderDiagramSvg(diagram)}
          </View>
          <Text style={[s.imageCaption, { color: theme.colors.textSecondary }]}>
            {diagram.description}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderRecapCard = () => (
    <View style={s.cardInner}>
      <Text style={[s.cardLabel, { color: theme.colors.primary }]}>REVIEW</Text>

      {keywords.length > 0 && (
        <>
          <Text style={[s.sectionTitle, { color: theme.colors.textPrimary, marginBottom: 16 }]}>
            {'\uD83D\uDCD6'} Words to Know
          </Text>
          <View style={s.tagsList}>
            {keywords.map((keyword, index) => (
              <View
                key={index}
                style={[s.keywordTag, { backgroundColor: theme.colors.primary }]}
              >
                <Text style={s.keywordTagText}>{keyword}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {relatedTopics.length > 0 && (
        <>
          <Text style={[s.sectionTitle, { color: theme.colors.textPrimary, marginTop: 24, marginBottom: 16 }]}>
            {'\uD83C\uDF1F'} Want to Learn More?
          </Text>
          <View style={s.tagsList}>
            {relatedTopics.map((topic, index) => (
              <View
                key={index}
                style={[s.relatedTag, { backgroundColor: theme.colors.accent3 }]}
              >
                <Text style={s.keywordTagText}>{topic}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );

  const renderQuizCard = () => (
    <View style={[s.cardInner, s.quizCardInner]}>
      <View style={s.quizCenter}>
        <Text style={s.quizEmoji}>{'\uD83C\uDFC6'}</Text>
        <Text style={[s.quizTitle, { color: theme.colors.textPrimary }]}>
          Ready to Test Your Knowledge?
        </Text>
        <Text style={[s.quizSubtext, { color: theme.colors.textSecondary }]}>
          You've finished all the sections! Let's see what you remember with a quick quiz.
        </Text>
        <TouchableOpacity
          style={[s.quizButton, { backgroundColor: theme.colors.primary }]}
          onPress={onStartQuiz}
        >
          <Text style={[s.quizButtonText, { color: theme.colors.onPrimary }]}>
            Start Quiz
          </Text>
          <ChevronRight size={22} color={theme.colors.onPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCurrentCard = () => {
    const card = cards[currentIndex];
    if (!card) return null;
    switch (card.type) {
      case 'cover': return renderCoverCard();
      case 'section': return renderSectionCard(card.sectionIndex);
      case 'diagrams': return renderDiagramsCard();
      case 'recap': return renderRecapCard();
      case 'quiz': return renderQuizCard();
    }
  };

  const getAnimationStyle = (): React.CSSProperties => {
    if (!slideDirection) return {};
    return {
      animation: `slideIn${slideDirection === 'left' ? 'Left' : 'Right'} 0.28s ease-out`,
    };
  };

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalCards - 1;

  return (
    <View style={[s.container, { backgroundColor: theme.colors.background }]}>
      {/* CSS keyframe animations */}
      <style>{`
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(60px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(-60px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Progress bar — segmented, Instagram-stories style */}
      <View style={s.progressRow}>
        {cards.map((_, i) => (
          <View
            key={i}
            style={[
              s.progressDot,
              {
                backgroundColor:
                  i === currentIndex
                    ? theme.colors.primary
                    : i < currentIndex
                    ? theme.colors.primary + '50'
                    : theme.colors.divider,
              },
              i === currentIndex && s.progressDotActive,
            ]}
          />
        ))}
      </View>

      {/* Card counter */}
      <Text style={[s.cardCounter, { color: theme.colors.textSecondary }]}>
        {currentIndex + 1} / {totalCards}
      </Text>

      {/* Card content — swipeable area */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          ...getAnimationStyle(),
        }}
        onTouchStart={handleTouchStart as any}
        onTouchMove={handleTouchMove as any}
        onTouchEnd={handleTouchEnd as any}
      >
        <ScrollView
          ref={scrollRef}
          style={s.cardScroll}
          contentContainerStyle={s.cardScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[s.card, { backgroundColor: theme.colors.surfaceColor }]}>
            {renderCurrentCard()}
          </View>
        </ScrollView>
      </div>

      {/* Navigation footer */}
      <View style={[s.navFooter, { borderTopColor: theme.colors.divider }]}>
        <TouchableOpacity
          style={[s.navButton, isFirst && s.navButtonDisabled]}
          onPress={goBack}
          disabled={isFirst}
        >
          <ChevronLeft size={20} color={isFirst ? theme.colors.divider : theme.colors.textPrimary} />
          <Text
            style={[
              s.navButtonText,
              { color: isFirst ? theme.colors.divider : theme.colors.textPrimary },
            ]}
          >
            Back
          </Text>
        </TouchableOpacity>

        {!isLast ? (
          <TouchableOpacity
            style={[s.navButtonPrimary, { backgroundColor: theme.colors.primary }]}
            onPress={goNext}
          >
            <Text style={[s.navButtonPrimaryText, { color: theme.colors.onPrimary }]}>
              Next
            </Text>
            <ChevronRight size={20} color={theme.colors.onPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 100 }} />
        )}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Progress
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 24,
    gap: 4,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    maxWidth: 40,
  },
  progressDotActive: {
    height: 6,
    borderRadius: 3,
  },
  cardCounter: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.5,
  },

  // Card
  cardScroll: {
    flex: 1,
  },
  cardScrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 16,
    padding: 0,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    overflow: 'hidden',
  },
  cardInner: {
    padding: 24,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
    textTransform: 'uppercase',
  },

  // Cover card
  coverTitle: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  coverSubtitle: {
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 16,
  },
  coverImageWrap: {
    marginBottom: 16,
  },
  summaryBox: {
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    marginBottom: 20,
  },
  summaryText: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  metaChipText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Section cards
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    flex: 1,
  },

  // Diagrams
  diagramCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  diagramTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  diagramContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  // Images
  imageContainer: {
    marginVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    padding: 8,
    borderWidth: 2,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  imageCaption: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Tags / recap
  tagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keywordTag: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  keywordTagText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  relatedTag: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  // Quiz card
  quizCardInner: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 300,
  },
  quizCenter: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  quizEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  quizTitle: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 34,
  },
  quizSubtext: {
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  quizButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  quizButtonText: {
    fontSize: 20,
    fontWeight: '700',
    marginRight: 8,
  },

  // Navigation footer
  navFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  navButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  navButtonPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    marginRight: 4,
  },
});

export default LessonCardCarousel;
