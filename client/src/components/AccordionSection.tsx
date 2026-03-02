import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { ChevronDown, ChevronUp } from 'react-feather';
import { colors, typography } from '../styles/theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface AccordionSectionProps {
  title: string;
  /** Icon/emoji to show in the header */
  icon?: string;
  children: React.ReactNode;
  /** Start expanded. Defaults to true for first section. */
  defaultExpanded?: boolean;
  /** Accent color for the header border */
  accentColor?: string;
}

/**
 * Expandable accordion section for lesson content.
 * Inspired by accordion patterns from component.gallery.
 */
const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  icon,
  children,
  defaultExpanded = false,
  accentColor,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => !prev);
  };

  const accent = accentColor ?? colors.primary;

  return (
    <View style={[styles.container, { borderLeftColor: accent }]}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title} section, ${expanded ? 'collapse' : 'expand'}`}
      >
        <View style={styles.headerLeft}>
          {icon ? (
            <Text style={styles.icon}>{icon}</Text>
          ) : null}
          <Text style={[styles.title, { color: accent }]}>{title}</Text>
        </View>
        {expanded ? (
          <ChevronUp size={20} color={accent} />
        ) : (
          <ChevronDown size={20} color={accent} />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.content}>
          {children}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    borderLeftWidth: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceColor,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 18,
    marginRight: 10,
  },
  title: {
    ...typography.subtitle1,
    fontWeight: '700',
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
});

export default AccordionSection;
