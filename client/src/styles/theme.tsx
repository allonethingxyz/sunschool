import { StyleSheet } from 'react-native';

// ---------------------------------------------------------------------------
// MODE TYPE
// ---------------------------------------------------------------------------
export type ThemeMode = 'LEARNER' | 'GROWN_UP';

// ---------------------------------------------------------------------------
// PARENT / GROWN-UP COLORS  (the original Scandinavian monochrome palette)
// ---------------------------------------------------------------------------
export const parentColors = {
  primary: '#121212',
  primaryDark: '#000000',
  primaryLight: '#2C2C2C',
  secondary: '#E0E0E0',
  secondaryDark: '#CCCCCC',
  accent1: '#000000',  // Black accent
  accent2: '#FFFFFF',  // White accent
  accent3: '#707070',  // Grey accent
  background: '#FFFFFF',
  surfaceColor: '#FFFFFF',
  error: '#B00020',
  onPrimary: '#FFFFFF',
  onSecondary: '#000000',
  onBackground: '#000000',
  onSurface: '#000000',
  onError: '#FFFFFF',
  textPrimary: '#121212',
  textSecondary: '#707070',
  divider: '#E0E0E0',
  success: '#4D4D4D',
  warning: '#A0A0A0',
  info: '#2D2D2D',
  inputBackground: '#F9F9F9',
  text: '#000000',
  border: '#E0E0E0',
};

// Backward-compatible default export -- existing imports keep working.
export const colors = parentColors;

// ---------------------------------------------------------------------------
// LEARNER COLORS  (bright, warm, kid-friendly)
// ---------------------------------------------------------------------------
export const learnerColors = {
  primary: '#4A90D9',        // Friendly blue
  primaryDark: '#2E6BB5',
  primaryLight: '#7BB3E8',
  secondary: '#FF8C42',      // Warm orange
  secondaryDark: '#E5732A',
  accent1: '#6BCB77',        // Success green
  accent2: '#FFD93D',        // Gold / reward yellow
  accent3: '#C084FC',        // Fun purple
  background: '#F8FAFF',     // Warm off-white
  surfaceColor: '#FFFFFF',
  error: '#FF6B6B',          // Soft red (not scary)
  onPrimary: '#FFFFFF',
  onSecondary: '#000000',
  onBackground: '#2D3436',
  onSurface: '#2D3436',
  onError: '#FFFFFF',
  textPrimary: '#2D3436',    // Soft black
  textSecondary: '#636E72',
  divider: '#DFE6E9',
  success: '#6BCB77',        // Actually green
  warning: '#FFD93D',        // Yellow
  info: '#4A90D9',
  inputBackground: '#F0F4FF',
  text: '#2D3436',
  border: '#DFE6E9',
};

// ---------------------------------------------------------------------------
// PARENT / GROWN-UP TYPOGRAPHY  (the original type scale)
// ---------------------------------------------------------------------------
export const parentTypography = StyleSheet.create({
  h1: {
    fontSize: 28,
    fontWeight: '700',
    color: parentColors.textPrimary,
    marginBottom: 20,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700',
    color: parentColors.textPrimary,
    marginBottom: 16,
    lineHeight: 32,
    letterSpacing: -0.25,
  },
  h3: {
    fontSize: 20,
    fontWeight: '700',
    color: parentColors.textPrimary,
    marginBottom: 14,
    lineHeight: 28,
  },
  h4: {
    fontSize: 18,
    fontWeight: '600',
    color: parentColors.textPrimary,
    marginBottom: 12,
    lineHeight: 26,
  },
  h5: {
    fontSize: 16,
    fontWeight: '600',
    color: parentColors.textPrimary,
    marginBottom: 10,
    lineHeight: 24,
  },
  h6: {
    fontSize: 14,
    fontWeight: '600',
    color: parentColors.textPrimary,
    marginBottom: 8,
    lineHeight: 22,
  },
  subtitle1: {
    fontSize: 16,
    fontWeight: '600',
    color: parentColors.textPrimary,
    lineHeight: 24,
    letterSpacing: 0.15,
  },
  subtitle2: {
    fontSize: 14,
    fontWeight: '600',
    color: parentColors.textSecondary,
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  body1: {
    fontSize: 16,
    color: parentColors.textPrimary,
    lineHeight: 24,
    letterSpacing: 0.5,
  },
  body2: {
    fontSize: 14,
    color: parentColors.textSecondary,
    lineHeight: 22,
    letterSpacing: 0.25,
  },
  button: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    color: parentColors.textSecondary,
    lineHeight: 18,
    letterSpacing: 0.4,
  },
  overline: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: parentColors.textSecondary,
    lineHeight: 16,
  },
});

// Backward-compatible default export.
export const typography = parentTypography;

// ---------------------------------------------------------------------------
// LEARNER TYPOGRAPHY  (larger sizes for kids, with quiz-specific styles)
// ---------------------------------------------------------------------------
export const learnerTypography = StyleSheet.create({
  h1: {
    fontSize: 36,
    fontWeight: '700',
    color: learnerColors.textPrimary,
    marginBottom: 20,
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 30,
    fontWeight: '700',
    color: learnerColors.textPrimary,
    marginBottom: 16,
    lineHeight: 38,
    letterSpacing: -0.25,
  },
  h3: {
    fontSize: 24,
    fontWeight: '700',
    color: learnerColors.textPrimary,
    marginBottom: 14,
    lineHeight: 32,
  },
  h4: {
    fontSize: 22,
    fontWeight: '600',
    color: learnerColors.textPrimary,
    marginBottom: 12,
    lineHeight: 30,
  },
  h5: {
    fontSize: 20,
    fontWeight: '600',
    color: learnerColors.textPrimary,
    marginBottom: 10,
    lineHeight: 28,
  },
  h6: {
    fontSize: 18,
    fontWeight: '600',
    color: learnerColors.textPrimary,
    marginBottom: 8,
    lineHeight: 26,
  },
  subtitle1: {
    fontSize: 20,
    fontWeight: '600',
    color: learnerColors.textPrimary,
    lineHeight: 28,
    letterSpacing: 0.15,
  },
  subtitle2: {
    fontSize: 18,
    fontWeight: '600',
    color: learnerColors.textSecondary,
    lineHeight: 26,
    letterSpacing: 0.1,
  },
  body1: {
    fontSize: 20,
    color: learnerColors.textPrimary,
    lineHeight: 30,
    letterSpacing: 0.3,
  },
  body2: {
    fontSize: 18,
    color: learnerColors.textSecondary,
    lineHeight: 28,
    letterSpacing: 0.2,
  },
  button: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.8,
    lineHeight: 24,
  },
  caption: {
    fontSize: 16,
    color: learnerColors.textSecondary,
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  overline: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: learnerColors.textSecondary,
    lineHeight: 20,
  },
  // Quiz / lesson-specific styles for maximum readability
  questionText: {
    fontSize: 22,
    fontWeight: '600',
    color: learnerColors.textPrimary,
    lineHeight: 32,
  },
  answerText: {
    fontSize: 20,
    color: learnerColors.textPrimary,
    lineHeight: 30,
  },
});

// ---------------------------------------------------------------------------
// ANIMATION DURATIONS
// ---------------------------------------------------------------------------
export const animations = {
  short: 150,   // milliseconds - micro-interactions
  medium: 300,  // milliseconds
  long: 500,    // milliseconds
};

// ---------------------------------------------------------------------------
// COMMON STYLES BUILDERS  (parameterised by color palette)
// ---------------------------------------------------------------------------

/**
 * Build the common StyleSheet for a given color palette.
 * The parent version is the default export (`commonStyles`).
 */
function buildCommonStyles(c: typeof parentColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    card: {
      backgroundColor: c.surfaceColor,
      borderRadius: 12,
      padding: 20,
      marginVertical: 12,
      marginHorizontal: 16,
      elevation: 3,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    spaceBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    center: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollViewContent: {
      flexGrow: 1,
      padding: 20,
    },
    input: {
      height: 52,
      borderWidth: 1,
      borderColor: c.divider,
      borderRadius: 8,
      paddingHorizontal: 16,
      marginBottom: 20,
      fontSize: 16,
      backgroundColor: c.surfaceColor,
    },
    inputLabel: {
      fontSize: 16,
      marginBottom: 8,
      color: c.textPrimary,
      fontWeight: '500',
    },
    button: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingVertical: 18,
      paddingHorizontal: 28,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      position: 'relative',
    },
    buttonText: {
      color: c.onPrimary,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    outlineButton: {
      borderWidth: 2,
      borderColor: c.primary,
      borderRadius: 8,
      paddingVertical: 18,
      paddingHorizontal: 28,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    outlineButtonText: {
      color: c.primary,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    secondaryButton: {
      backgroundColor: c.accent2,
      borderRadius: 8,
      paddingVertical: 18,
      paddingHorizontal: 28,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
    },
    secondaryButtonText: {
      color: c.onPrimary,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    accentButton: {
      backgroundColor: c.accent1,
      borderRadius: 8,
      paddingVertical: 18,
      paddingHorizontal: 28,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
    },
    accentButtonText: {
      color: c.onPrimary,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    divider: {
      height: 1,
      backgroundColor: c.divider,
      marginVertical: 24,
    },
    chip: {
      backgroundColor: c.primaryLight,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      marginRight: 10,
      marginBottom: 10,
      elevation: 1,
    },
    chipText: {
      color: c.onPrimary,
      fontSize: 14,
      fontWeight: '500',
    },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.secondary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      color: c.onSecondary,
      fontSize: 12,
      fontWeight: 'bold',
    },
    error: {
      color: c.error,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 10,
    },
    section: {
      marginBottom: 32,
    },
    mt4: { marginTop: 4 },
    mt8: { marginTop: 8 },
    mt16: { marginTop: 16 },
    mt24: { marginTop: 24 },
    mb4: { marginBottom: 4 },
    mb8: { marginBottom: 8 },
    mb16: { marginBottom: 16 },
    mb24: { marginBottom: 24 },
    mv8: { marginVertical: 8 },
    mv16: { marginVertical: 16 },
    mh8: { marginHorizontal: 8 },
    mh16: { marginHorizontal: 16 },
  });
}

// Parent common styles (default export -- backward-compatible).
export const commonStyles = buildCommonStyles(parentColors);

// Learner common styles (kid-friendly colours baked in).
export const learnerCommonStyles = buildCommonStyles(learnerColors);

// ---------------------------------------------------------------------------
// THEME OBJECT TYPE
// ---------------------------------------------------------------------------
export interface Theme {
  colors: typeof parentColors;
  typography: typeof parentTypography | typeof learnerTypography;
  commonStyles: ReturnType<typeof buildCommonStyles>;
}

// ---------------------------------------------------------------------------
// getTheme()  --  returns the full theme bundle for a given mode
// ---------------------------------------------------------------------------
export function getTheme(mode: ThemeMode): Theme {
  if (mode === 'LEARNER') {
    return {
      colors: learnerColors,
      typography: learnerTypography,
      commonStyles: learnerCommonStyles,
    };
  }
  return {
    colors: parentColors,
    typography: parentTypography,
    commonStyles,
  };
}

// ---------------------------------------------------------------------------
// useTheme() hook  --  reads from ModeContext and returns the right theme
// ---------------------------------------------------------------------------
import { useMode } from '../context/ModeContext';

/**
 * Returns `{ colors, typography, commonStyles }` for the current mode.
 *
 * Must be called inside a `<ModeProvider>`.
 */
export function useTheme(): Theme {
  const { mode } = useMode();
  return getTheme(mode);
}
