import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography } from '../styles/theme';
import { HelpCircle } from 'react-feather';

interface TooltipProps {
  text: string;
  children?: React.ReactNode;
  /** Icon to render instead of children */
  showIcon?: boolean;
}

/**
 * Inline tooltip for keyword/concept explanations in lesson content.
 * Tap the trigger to show/hide the tooltip bubble.
 * Inspired by tooltip patterns from component.gallery.
 */
const Tooltip: React.FC<TooltipProps> = ({ text, children, showIcon = true }) => {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        onPress={() => setVisible(v => !v)}
        accessibilityRole="button"
        accessibilityLabel={`Tip: ${text}`}
        style={styles.trigger}
      >
        {children ?? (showIcon ? <HelpCircle size={16} color={colors.primary} /> : null)}
      </TouchableOpacity>
      {visible && (
        <View style={styles.bubble}>
          <View style={styles.arrow} />
          <Text style={styles.bubbleText}>{text}</Text>
          <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  } as any,
  trigger: {
    padding: 2,
  },
  bubble: {
    position: 'absolute',
    bottom: 28,
    left: -60,
    width: 220,
    backgroundColor: '#2D3436',
    borderRadius: 8,
    padding: 12,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  arrow: {
    position: 'absolute',
    bottom: -6,
    left: 70,
    width: 12,
    height: 12,
    backgroundColor: '#2D3436',
    transform: [{ rotate: '45deg' }],
  },
  bubbleText: {
    ...typography.body2,
    color: '#fff',
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  closeBtn: {
    marginLeft: 6,
    padding: 2,
  },
  closeBtnText: {
    color: '#aaa',
    fontSize: 13,
  },
});

export default Tooltip;
