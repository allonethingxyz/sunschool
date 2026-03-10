import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Home, BarChart2, User, ArrowLeft } from 'react-feather';
import { colors, typography } from '../styles/theme';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';
import { useMode } from '../context/ModeContext';
import { LearnerSelector } from './LearnerSelector';

interface SunschoolHeaderProps {
  subtitle?: string;
}

const SunschoolHeader: React.FC<SunschoolHeaderProps> = ({ subtitle }) => {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { isLearnerMode, toggleMode } = useMode();

  const isActive = (path: string) => location === path;
  const isParentOrAdmin = user?.role === 'PARENT' || user?.role === 'ADMIN';

  const getNavItems = () => {
    if (!user || !user.role) return [];
    if (isLearnerMode) {
      return [
        { label: 'Home', path: '/learner', icon: Home },
        { label: 'Progress', path: '/progress', icon: BarChart2 },
      ];
    }
    const navItems = [
      { label: 'Dashboard', path: '/dashboard', icon: Home },
    ];
    if (user.role === 'ADMIN') {
      navItems.push({ label: 'Admin', path: '/admin', icon: User });
    }
    return navItems;
  };

  return (
    <View style={styles.header} accessibilityRole="navigation" accessibilityLabel="Main navigation">
      <View style={styles.headerContent}>
        {/* Left: Logo + nav links */}
        <View style={styles.leftSection}>
          <TouchableOpacity
            style={styles.logoContainer}
            onPress={() => navigate(user?.role === 'LEARNER' ? '/learner' : '/dashboard')}
            accessibilityRole="link"
            accessibilityLabel="SUNSCHOOL home"
          >
            <View style={styles.logoIcon} aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                <defs>
                  <linearGradient id="hbg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4A90D9"/>
                    <stop offset="100%" stopColor="#2E6BB5"/>
                  </linearGradient>
                </defs>
                <rect width="32" height="32" rx="6" fill="url(#hbg)"/>
                <circle cx="16" cy="13" r="6" fill="#FFD93D"/>
                <g stroke="#FFD93D" strokeWidth="1.5" strokeLinecap="round" opacity="0.7">
                  <line x1="16" y1="4" x2="16" y2="2"/>
                  <line x1="22" y1="7" x2="24" y2="5"/>
                  <line x1="25" y1="13" x2="27" y2="13"/>
                  <line x1="22" y1="19" x2="24" y2="21"/>
                  <line x1="10" y1="7" x2="8" y2="5"/>
                  <line x1="7" y1="13" x2="5" y2="13"/>
                  <line x1="10" y1="19" x2="8" y2="21"/>
                </g>
                <g fill="#FFFFFF" opacity="0.95">
                  <path d="M16 23 Q16 21.5 10 21 L7 20.7 Q6 20.6 6 21.5 L6 27 Q6 27.8 7 27.9 L10 28.2 Q16 29 16 27.5 Z"/>
                  <path d="M16 23 Q16 21.5 22 21 L25 20.7 Q26 20.6 26 21.5 L26 27 Q26 27.8 25 27.9 L22 28.2 Q16 29 16 27.5 Z"/>
                </g>
              </svg>
            </View>
            <Text style={styles.logoText}>SUNSCHOOL</Text>
          </TouchableOpacity>

          {user && (
            <View style={styles.navItems} accessibilityRole="list">
              {getNavItems().map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.navItem, isActive(item.path) && styles.activeNavItem]}
                  onPress={() => navigate(item.path)}
                  accessibilityRole="link"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: isActive(item.path) }}
                >
                  <item.icon
                    size={16}
                    color={isActive(item.path) ? colors.secondary : colors.onPrimary}
                    aria-hidden="true"
                  />
                  <Text style={[styles.navText, isActive(item.path) && styles.activeNavText]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Right: Mode badge, learner selector, back button */}
        {user && (
          <View style={styles.rightSection}>
            {isLearnerMode && isParentOrAdmin && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={toggleMode}
                accessibilityRole="button"
                accessibilityLabel="Switch to parent view"
              >
                <ArrowLeft size={14} color={colors.onPrimary} aria-hidden="true" />
                <Text style={styles.backButtonText}>Parent View</Text>
              </TouchableOpacity>
            )}

            {isLearnerMode && isParentOrAdmin && (
              <LearnerSelector subtle={false} />
            )}

            <View
              style={[styles.modeBadge, isLearnerMode ? styles.learnerBadge : styles.parentBadge]}
              accessibilityRole="text"
              accessibilityLabel={`Current mode: ${isLearnerMode ? 'Learner' : 'Parent'}`}
            >
              <Text style={styles.modeBadgeText}>
                {isLearnerMode ? 'LEARNER' : 'PARENT'}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    zIndex: 100,
    overflow: 'visible',
  },
  headerContent: {
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'visible',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    width: 28,
    height: 28,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onPrimary,
    letterSpacing: 0.5,
  },
  navItems: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 24,
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  activeNavItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  navText: {
    fontSize: 14,
    color: colors.onPrimary,
    fontWeight: '500',
  },
  activeNavText: {
    color: colors.secondary,
    fontWeight: '600',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1000,
    overflow: 'visible',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 4,
  },
  backButtonText: {
    fontSize: 12,
    color: colors.onPrimary,
    fontWeight: '600',
  },
  modeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  learnerBadge: {
    backgroundColor: '#4CAF50',
  },
  parentBadge: {
    backgroundColor: '#2196F3',
  },
  modeBadgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 1,
  },
});

export default SunschoolHeader;
