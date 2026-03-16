import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';

const windowWidth = Dimensions.get('window').width;
import { Home, BarChart2, User, ArrowLeft, BookOpen, MessageCircle } from 'react-feather';
import { colors, typography } from '../styles/theme';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';
import { useMode } from '../context/ModeContext';
import { LearnerSelector } from './LearnerSelector';
import SocialLinks from './SocialLinks';
import SupportModal from './SupportModal';

interface SunschoolHeaderProps {
  subtitle?: string;
}

const SunschoolHeader: React.FC<SunschoolHeaderProps> = ({ subtitle }) => {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { isLearnerMode, toggleMode } = useMode();
  const [showSupport, setShowSupport] = useState(false);

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
                  <linearGradient id="hSunG" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#F5A623"/>
                    <stop offset="100%" stopColor="#F97316"/>
                  </linearGradient>
                </defs>
                <circle cx="16" cy="16" r="8" fill="url(#hSunG)"/>
                <circle cx="16" cy="16" r="6" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.3"/>
                <circle cx="16" cy="16" r="2" fill="#fff" opacity="0.6"/>
                <g stroke="#F5A623" strokeWidth="2" strokeLinecap="round" opacity="0.7">
                  <line x1="16" y1="5" x2="16" y2="2"/>
                  <line x1="16" y1="27" x2="16" y2="30"/>
                  <line x1="5" y1="16" x2="2" y2="16"/>
                  <line x1="27" y1="16" x2="30" y2="16"/>
                  <line x1="8.2" y1="8.2" x2="6" y2="6"/>
                  <line x1="23.8" y1="8.2" x2="26" y2="6"/>
                  <line x1="8.2" y1="23.8" x2="6" y2="26"/>
                  <line x1="23.8" y1="23.8" x2="26" y2="26"/>
                </g>
              </svg>
            </View>
            {windowWidth >= 480 && <Text style={styles.logoText}>SUNSCHOOL</Text>}
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
                  {windowWidth >= 480 && (
                    <Text style={[styles.navText, isActive(item.path) && styles.activeNavText]}>
                      {item.label}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Docs, Support, Social */}
          <View style={styles.utilLinks}>
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => { if (typeof window !== 'undefined') window.open('https://docs.sunschool.xyz', '_blank'); }}
              accessibilityRole="link"
              accessibilityLabel="Documentation (opens in new window)"
              testID="nav-docs"
            >
              <BookOpen size={14} color={colors.onPrimary} />
              {windowWidth >= 768 && <Text style={styles.navText}>Docs</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.supportButton}
              onPress={() => setShowSupport(true)}
              accessibilityRole="button"
              accessibilityLabel="Support and feedback"
              testID="nav-support"
            >
              <MessageCircle size={14} color={colors.onPrimary} />
              {windowWidth >= 768 && <Text style={styles.navText}>Support</Text>}
            </TouchableOpacity>
            {windowWidth >= 640 && <SocialLinks iconSize={14} color="rgba(255,255,255,0.6)" gap={6} />}
          </View>
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
      <SupportModal isVisible={showSupport} onClose={() => setShowSupport(false)} />
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
  },
  headerContent: {
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden' as any,
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
    marginLeft: windowWidth >= 480 ? 24 : 8,
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
    gap: windowWidth >= 480 ? 8 : 4,
    zIndex: 1000,
    overflow: 'visible',
    flexShrink: 0,
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
  utilLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 5,
  },
});

export default SunschoolHeader;
