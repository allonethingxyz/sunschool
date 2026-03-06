import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Home, Book, User, BarChart2 } from 'react-feather';
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
  const { isLearnerMode } = useMode();
  
  const isActive = (path: string) => location === path;
  
  const getNavItems = () => {
    if (!user || !user.role) return [];
    
    // Ensure we have a valid string role
    const userRole = typeof user.role === 'string' ? (user.role as 'ADMIN' | 'PARENT' | 'LEARNER') : 'LEARNER';
    
    // Basic navigation items for all authenticated users
    const navItems = [
      { 
        label: 'Dashboard', 
        path: '/dashboard', 
        icon: Home,
        roles: ['ADMIN', 'PARENT', 'LEARNER']
      },
    ];
    
    // Additional items based on user role
    if (userRole === 'LEARNER') {
      navItems.push(
        { label: 'Lessons', path: '/learner', icon: Book, roles: ['LEARNER'] },
        { label: 'Progress', path: '/progress', icon: BarChart2, roles: ['LEARNER'] }
      );
    } else {
      navItems.push(
        { label: 'Learners', path: '/learners', icon: User, roles: ['ADMIN', 'PARENT'] },
        { label: 'Reports', path: '/reports', icon: BarChart2, roles: ['ADMIN', 'PARENT'] }
      );
    }
    
    // Admin-specific items
    if (userRole === 'ADMIN') {
      navItems.push(
        { label: 'Admin', path: '/admin', icon: User, roles: ['ADMIN'] }
      );
    }
    
    return navItems.filter(item => item.roles.includes(userRole));
  };

  return (
    <View style={styles.header}>
      <View style={styles.headerContent}>
        <TouchableOpacity
        style={styles.titleContainer}
        onPress={() => {
          // Navigate to the appropriate authenticated home page
          if (user?.role === 'LEARNER') {
            navigate('/learner');
          } else {
            navigate('/dashboard');
          }
        }}
      >
        <View style={styles.titleRow}>
          <Text style={styles.headerTitle}>SUNSCHOOL™</Text>
          {/* Clear visual mode indicator badge */}
          {user && (
            <View style={[
              styles.modeBadge,
              isLearnerMode ? styles.learnerModeBadge : styles.grownUpModeBadge
            ]}>
              <Text style={styles.modeBadgeText}>
                {isLearnerMode ? '👦 LEARNER MODE' : '👨 PARENT MODE'}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.headerSubtitle}>{subtitle || "AI Tutor"}</Text>
      </TouchableOpacity>

        {user && (
          <View style={styles.navigation}>
            {/* Show LearnerSelector for parents and admins in any mode */}
            {(user?.role === 'PARENT' || user?.role === 'ADMIN') && (
              <LearnerSelector subtle={!isLearnerMode} />
            )}

            {getNavItems().map((item, index) => (
              <TouchableOpacity 
                key={index}
                style={[styles.navItem, isActive(item.path) && styles.activeNavItem]}
                onPress={() => navigate(item.path)}
              >
                <item.icon 
                  size={18} 
                  color={isActive(item.path) ? colors.secondary : colors.onPrimary} 
                  style={styles.navIcon} 
                />
                <Text style={[styles.navText, isActive(item.path) && styles.activeNavText]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
    zIndex: 100,
    overflow: 'visible',
  },
  headerContent: {
    maxWidth: 1000,
    marginHorizontal: 'auto',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'visible',
  },
  titleContainer: {
    flexDirection: 'column',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.onPrimary,
    fontWeight: 'bold',
    marginBottom: 0,
  },
  headerSubtitle: {
    ...typography.subtitle1,
    color: colors.onPrimary + 'CC',
    marginTop: 4,
  },
  modeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
  },
  learnerModeBadge: {
    backgroundColor: '#4CAF50',
    borderColor: '#66BB6A',
  },
  grownUpModeBadge: {
    backgroundColor: '#2196F3',
    borderColor: '#42A5F5',
  },
  modeBadgeText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1000,
    overflow: 'visible',
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 24,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  activeNavItem: {
    backgroundColor: colors.onPrimary + '22',
  },
  navIcon: {
    marginRight: 8,
  },
  navText: {
    ...typography.body2,
    color: colors.onPrimary,
    fontWeight: '500',
  },
  activeNavText: {
    color: colors.secondary,
    fontWeight: '600',
  }
});

export default SunschoolHeader;
