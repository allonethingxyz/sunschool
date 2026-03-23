import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LogOut, Home, BarChart2, Gift } from 'react-feather';
import { colors, typography } from '../styles/theme';
import { useAuth } from '../hooks/use-auth';
import { useLocation } from 'wouter';
import { useMode } from '../context/ModeContext';
import SocialLinks from './SocialLinks';

const TRIPLE_TAP_WINDOW = 2000; // ms
const REQUIRED_TAPS = 3;

const LearnerFooter: React.FC = () => {
  const { toggleMode } = useMode();
  const [location, navigate] = useLocation();
  const [tapCount, setTapCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSecretTap = useCallback(() => {
    setTapCount((prev) => {
      const next = prev + 1;
      if (next >= REQUIRED_TAPS) {
        if (timerRef.current) clearTimeout(timerRef.current);
        toggleMode();
        return 0;
      }
      // Reset timer on each tap
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setTapCount(0);
      }, TRIPLE_TAP_WINDOW);
      return next;
    });
  }, [toggleMode]);

  const tabs = [
    { label: 'Home', path: '/learner', Icon: Home },
    { label: 'Progress', path: '/progress', Icon: BarChart2 },
    { label: 'Goals', path: '/goals', Icon: Gift },
  ] as const;

  return (
    <View style={learnerStyles.wrapper}>
      {/* Secret parental gate */}
      <TouchableOpacity
        onPress={handleSecretTap}
        activeOpacity={1}
        style={learnerStyles.secretTap}
        accessibilityLabel="Decorative element"
      >
        <Text style={learnerStyles.secretIcon}>☀️</Text>
      </TouchableOpacity>

      {/* Tab bar */}
      <View style={learnerStyles.tabBar}>
        {tabs.map(({ label, path, Icon }) => {
          const isActive = location === path;
          return (
            <TouchableOpacity
              key={path}
              onPress={() => navigate(path)}
              style={learnerStyles.tab}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Icon
                size={24}
                color={isActive ? colors.primary : '#AAAAAA'}
              />
              <Text
                style={[
                  learnerStyles.tabLabel,
                  isActive && learnerStyles.tabLabelActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const learnerStyles = StyleSheet.create({
  wrapper: {
    position: 'fixed' as any,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  secretTap: {
    alignSelf: 'center',
    paddingVertical: 2,
  },
  secretIcon: {
    fontSize: 12,
    opacity: 0.3,
  },
  tabBar: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 11,
    color: '#AAAAAA',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});

const AppFooter: React.FC = () => {
  const { isLearnerMode } = useMode();
  const { logoutMutation } = useAuth();
  const [, navigate] = useLocation();

  if (isLearnerMode) {
    return <LearnerFooter />;
  }

  return (
    <View style={styles.footer}>
      <View style={styles.footerContent}>
        <View style={styles.footerLeft}>
          <Text style={styles.copyright}>
            &copy; {new Date().getFullYear()} SUNSCHOOL, LLC. All rights reserved.
          </Text>
          <View style={styles.footerLinks} accessibilityRole="list">
            <TouchableOpacity onPress={() => navigate('/privacy')} accessibilityRole="link" accessibilityLabel="Privacy Policy">
              <Text style={styles.footerLink}>Privacy</Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider} aria-hidden={true}>|</Text>
            <TouchableOpacity onPress={() => navigate('/terms')} accessibilityRole="link" accessibilityLabel="Terms of Service">
              <Text style={styles.footerLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider} aria-hidden={true}>|</Text>
            <TouchableOpacity onPress={() => { if (typeof window !== 'undefined') window.open('https://allonething.xyz', '_blank'); }} accessibilityRole="link" accessibilityLabel="All One Thing Labs (opens in new window)">
              <Text style={styles.footerLink}>All One Thing Labs</Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider} aria-hidden={true}>|</Text>
            <TouchableOpacity onPress={() => { if (typeof window !== 'undefined') window.open('https://docs.sunschool.xyz', '_blank'); }} accessibilityRole="link" accessibilityLabel="Documentation (opens in new window)">
              <Text style={styles.footerLink}>Docs</Text>
            </TouchableOpacity>
          </View>
          <SocialLinks iconSize={14} color="rgba(255,255,255,0.5)" gap={10} />
        </View>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => logoutMutation.mutate()}
          accessibilityRole="button"
          accessibilityLabel="Logout"
        >
          <LogOut size={16} color={colors.onPrimary} aria-hidden={true} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  footer: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden' as any,
  },
  footerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
    flexWrap: 'wrap',
    gap: 8,
  },
  footerLeft: {
    flexDirection: 'column',
    gap: 4,
  },
  copyright: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerLink: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '500',
  },
  footerDivider: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  logoutButton: {
    backgroundColor: colors.error,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoutText: {
    fontSize: 13,
    color: colors.onPrimary,
    fontWeight: '600',
  },
});

export default AppFooter;
