import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useMode } from '../context/ModeContext';
import { useLocation } from 'wouter';
import { colors } from '../styles/theme';

/**
 * Kid Footer — minimal, distraction-free bottom bar for learner mode.
 *
 * Shows only:
 *   - Home button (house icon)
 *   - Progress button (star icon)
 *   - A subtle lock icon that requires 3 rapid taps to exit to parent mode
 *
 * The triple-tap gate prevents accidental exits while making it
 * easy for parents to get back without remembering a password.
 */

const TRIPLE_TAP_WINDOW_MS = 1500; // Must tap 3 times within 1.5 seconds

const KidFooter: React.FC = () => {
  const { toggleMode } = useMode();
  const [, setLocation] = useLocation();
  const [tapCount, setTapCount] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const handleLockTap = useCallback(() => {
    const newCount = tapCount + 1;

    if (newCount >= 3) {
      // Triple tap achieved — exit to parent mode
      setTapCount(0);
      setShowHint(false);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      toggleMode();
      return;
    }

    setTapCount(newCount);
    setShowHint(true);

    // Gentle shake animation on tap
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 5, duration: 50, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: -5, duration: 50, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: false }),
    ]).start();

    // Reset tap count if window expires
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      setTapCount(0);
      setShowHint(false);
    }, TRIPLE_TAP_WINDOW_MS);
  }, [tapCount, toggleMode, shakeAnim]);

  return (
    <View style={styles.footer}>
      {/* Home button */}
      <TouchableOpacity
        style={styles.navButton}
        onPress={() => setLocation('/learner')}
        accessibilityLabel="Home"
      >
        <Text style={styles.navIcon}>🏠</Text>
        <Text style={styles.navLabel}>Home</Text>
      </TouchableOpacity>

      {/* Progress button */}
      <TouchableOpacity
        style={styles.navButton}
        onPress={() => setLocation('/progress')}
        accessibilityLabel="My Progress"
      >
        <Text style={styles.navIcon}>⭐</Text>
        <Text style={styles.navLabel}>Progress</Text>
      </TouchableOpacity>

      {/* Goals button */}
      <TouchableOpacity
        style={styles.navButton}
        onPress={() => setLocation('/goals')}
        accessibilityLabel="Goals"
      >
        <Text style={styles.navIcon}>🏆</Text>
        <Text style={styles.navLabel}>Goals</Text>
      </TouchableOpacity>

      {/* Triple-tap parental gate */}
      <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
        <TouchableOpacity
          style={styles.lockButton}
          onPress={handleLockTap}
          accessibilityLabel="Parent exit — tap three times quickly"
        >
          <Text style={styles.lockIcon}>🔒</Text>
          {showHint && (
            <Text style={styles.lockHint}>
              {3 - tapCount} more
            </Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: colors.primary,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    position: 'absolute' as any,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  navButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  navIcon: {
    fontSize: 24,
  },
  navLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
    fontWeight: '600',
  },
  lockButton: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 16,
    opacity: 0.4,
  },
  lockIcon: {
    fontSize: 18,
  },
  lockHint: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
});

export default KidFooter;
