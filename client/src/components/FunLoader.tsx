import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';

const FUN_FACTS = [
  "Did you know? Octopuses have 3 hearts!",
  "A group of flamingos is called a flamboyance!",
  "Honey never spoils. Archaeologists found 3000-year-old honey in Egypt!",
  "Butterflies taste with their feet!",
  "The shortest war in history lasted 38 minutes.",
  "A cloud can weigh more than a million pounds!",
  "Bananas are berries, but strawberries aren't!",
  "Venus is the only planet that spins clockwise.",
  "The Eiffel Tower can be 15cm taller during summer!",
  "A day on Venus is longer than a year on Venus.",
  "Sharks have been around longer than trees!",
  "Cows have best friends and get stressed when apart.",
  "The moon has moonquakes!",
  "A group of owls is called a parliament.",
  "Dolphins sleep with one eye open!",
  "There are more stars in space than grains of sand on Earth.",
  "Sloths can hold their breath longer than dolphins!",
  "Your nose can remember 50,000 different smells.",
  "Lightning is 5 times hotter than the sun's surface!",
  "Astronauts grow up to 2 inches taller in space.",
  "Penguins propose with pebbles!",
  "The average person walks about 100,000 miles in a lifetime.",
  "A snail can sleep for 3 years!",
  "There's enough water in Lake Superior to cover North and South America in a foot of water.",
  "Koalas sleep up to 22 hours a day!",
  "The inventor of the Pringles can is buried in one.",
  "Wombat poop is cube-shaped!",
  "A jiffy is an actual unit of time — 1/100th of a second.",
  "Cats can't taste sweetness.",
  "Your brain uses 20% of your body's energy!",
  "Elephants are the only animals that can't jump.",
  "A bolt of lightning contains enough energy to toast 100,000 slices of bread.",
  "Sea otters hold hands while they sleep!",
  "The unicorn is Scotland's national animal.",
  "Apples float because they are 25% air!",
  "Your heart beats about 100,000 times a day.",
  "Frogs can freeze without dying!",
  "The longest hiccuping spree lasted 68 years.",
  "Bees can recognize human faces!",
  "An ostrich's eye is bigger than its brain.",
];

interface FunLoaderProps {
  message?: string;
  /** Show sequential progress messages instead of random facts */
  progressMessages?: string[];
  /** Label for the subject being loaded (e.g. "Math") */
  subjectLabel?: string;
  /** Called when user cancels the loading operation */
  onCancel?: () => void;
}

const PROGRESS_BAR_DURATION = 60000; // 60 seconds estimated fill time
const TIMEOUT_THRESHOLD = 20000; // 20 seconds before showing timeout message
const HARD_TIMEOUT = 90000; // 90 seconds before showing hard timeout with cancel prompt

const FunLoader: React.FC<FunLoaderProps> = ({ message, progressMessages, subjectLabel, onCancel }) => {
  const [factIndex, setFactIndex] = useState(Math.floor(Math.random() * FUN_FACTS.length));
  const [progressIndex, setProgressIndex] = useState(0);
  const [showTimeout, setShowTimeout] = useState(false);
  const [showHardTimeout, setShowHardTimeout] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const progressBarAnim = useRef(new Animated.Value(0)).current;
  const timeoutFadeAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);
  const bounceLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Rotate the sun spinner
  useEffect(() => {
    spinLoop.current = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: false,
      })
    );
    spinLoop.current.start();
    return () => { spinLoop.current?.stop(); };
  }, []);

  // Gentle bounce
  useEffect(() => {
    bounceLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -8,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: false,
        }),
      ])
    );
    bounceLoop.current.start();
    return () => { bounceLoop.current?.stop(); };
  }, []);

  // Gentle progress bar that fills slowly over ~60s
  useEffect(() => {
    const anim = Animated.timing(progressBarAnim, {
      toValue: 1,
      duration: PROGRESS_BAR_DURATION,
      useNativeDriver: false,
    });
    anim.start();
    return () => { anim.stop(); };
  }, []);

  // Encouraging timeout message after 20 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTimeout(true);
      Animated.timing(timeoutFadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: false,
      }).start();
    }, TIMEOUT_THRESHOLD);
    return () => clearTimeout(timer);
  }, []);

  // Hard timeout after 90 seconds — prompt user to cancel and retry
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowHardTimeout(true);
    }, HARD_TIMEOUT);
    return () => clearTimeout(timer);
  }, []);

  // Rotate facts every 3 seconds
  useEffect(() => {
    if (progressMessages) {
      // Progress messages advance more slowly
      const timer = setInterval(() => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start(() => {
          setProgressIndex((prev) => Math.min(prev + 1, progressMessages.length - 1));
          Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start();
        });
      }, 4000);
      return () => clearInterval(timer);
    }

    const timer = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start(() => {
        setFactIndex(Math.floor(Math.random() * FUN_FACTS.length));
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start();
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [progressMessages]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const progressBarWidth = progressBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const displayText = progressMessages ? progressMessages[progressIndex] : FUN_FACTS[factIndex];

  return (
    <View style={styles.container}>
      {/* Spinning sun icon */}
      <Animated.View style={[styles.sunContainer, { transform: [{ translateY: bounceAnim }] }]}>
        <Animated.Text style={[styles.sunIcon, { transform: [{ rotate: spin }] }]}>
          {'☀️'}
        </Animated.Text>
      </Animated.View>

      {/* Optional main message */}
      {message && <Text style={styles.message}>{message}</Text>}

      {/* Subject context label */}
      {subjectLabel && (
        <Text style={styles.subjectLabel}>
          Making a {subjectLabel} lesson...
        </Text>
      )}

      {/* Gentle progress bar */}
      <View style={styles.progressBarTrack}>
        <Animated.View
          style={[styles.progressBarFill, { width: progressBarWidth }]}
        />
      </View>

      {/* Fun fact or progress message */}
      <Animated.View style={{ opacity: fadeAnim }}>
        <Text style={styles.factText}>{displayText}</Text>
      </Animated.View>

      {/* Dots animation */}
      <View style={styles.dotsContainer}>
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                opacity: spinAnim.interpolate({
                  inputRange: [i * 0.33, i * 0.33 + 0.17, (i + 1) * 0.33],
                  outputRange: [0.3, 1, 0.3],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          />
        ))}
      </View>

      {/* Cancel button */}
      {onCancel && (
        <TouchableOpacity
          onPress={onCancel}
          style={styles.cancelButton}
          activeOpacity={0.6}
        >
          <Text style={styles.cancelText}>Never mind</Text>
        </TouchableOpacity>
      )}

      {/* Encouraging timeout message */}
      {showTimeout && !showHardTimeout && (
        <Animated.View style={[styles.timeoutContainer, { opacity: timeoutFadeAnim }]}>
          <Text style={styles.timeoutText}>
            This is taking a bit longer than usual, but we're still working on it!
          </Text>
        </Animated.View>
      )}

      {/* Hard timeout — suggest canceling */}
      {showHardTimeout && (
        <View style={styles.hardTimeoutContainer}>
          <Text style={styles.hardTimeoutText}>
            This is taking much longer than expected. You can cancel and try again.
          </Text>
          {onCancel && (
            <TouchableOpacity
              onPress={onCancel}
              style={styles.hardTimeoutButton}
              activeOpacity={0.7}
            >
              <Text style={styles.hardTimeoutButtonText}>Cancel &amp; Try Again</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 300,
  },
  sunContainer: {
    marginBottom: 24,
  },
  sunIcon: {
    fontSize: 56,
  },
  message: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2D3436',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 30,
  },
  factText: {
    fontSize: 18,
    color: '#636E72',
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 320,
    fontStyle: 'italic',
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: 24,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4A90D9',
    marginHorizontal: 4,
  },
  subjectLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: '#4A90D9',
    textAlign: 'center',
    marginBottom: 12,
  },
  progressBarTrack: {
    width: 200,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E8EDF1',
    marginBottom: 20,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#4A90D9',
  },
  cancelButton: {
    marginTop: 28,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  cancelText: {
    fontSize: 15,
    color: '#949DA2',
    textAlign: 'center',
  },
  timeoutContainer: {
    marginTop: 20,
    maxWidth: 280,
  },
  timeoutText: {
    fontSize: 14,
    color: '#949DA2',
    textAlign: 'center',
    lineHeight: 20,
  },
  hardTimeoutContainer: {
    marginTop: 24,
    maxWidth: 300,
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
  },
  hardTimeoutText: {
    fontSize: 15,
    color: '#E65100',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
    fontWeight: '600',
  },
  hardTimeoutButton: {
    backgroundColor: '#E65100',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  hardTimeoutButtonText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

export default FunLoader;
