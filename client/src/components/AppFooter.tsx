import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LogOut } from 'react-feather';
import { colors, typography } from '../styles/theme';
import { useAuth } from '../hooks/use-auth';
import { useLocation } from 'wouter';
import SocialLinks from './SocialLinks';

const AppFooter: React.FC = () => {
  const { logoutMutation } = useAuth();
  const [, navigate] = useLocation();

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
            <Text style={styles.footerDivider} aria-hidden="true">|</Text>
            <TouchableOpacity onPress={() => navigate('/terms')} accessibilityRole="link" accessibilityLabel="Terms of Service">
              <Text style={styles.footerLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider} aria-hidden="true">|</Text>
            <TouchableOpacity onPress={() => { if (typeof window !== 'undefined') window.open('https://allonething.xyz', '_blank'); }} accessibilityRole="link" accessibilityLabel="All One Thing Labs (opens in new window)">
              <Text style={styles.footerLink}>All One Thing Labs</Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider} aria-hidden="true">|</Text>
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
          <LogOut size={16} color={colors.onPrimary} aria-hidden="true" />
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
