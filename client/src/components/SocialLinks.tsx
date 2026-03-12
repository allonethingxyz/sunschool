import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { GitHub } from 'react-feather';

// Inline SVG icons for X, Instagram, Facebook (react-feather doesn't have these)
const XIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const InstagramIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const FacebookIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

interface SocialLinksProps {
  iconSize?: number;
  color?: string;
  gap?: number;
}

const open = (url: string) => {
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
};

const SocialLinks: React.FC<SocialLinksProps> = ({ iconSize = 16, color = 'rgba(255,255,255,0.6)', gap = 8 }) => (
  <View style={[styles.row, { gap }]} accessibilityRole="list" accessibilityLabel="Social media links">
    <TouchableOpacity onPress={() => open('https://github.com/allonethingxyz/sunschool')} accessibilityRole="link" accessibilityLabel="GitHub" testID="social-github">
      <GitHub size={iconSize} color={color} />
    </TouchableOpacity>
    <TouchableOpacity onPress={() => open('https://x.com/allonethingxyz')} accessibilityRole="link" accessibilityLabel="X (Twitter)" testID="social-x">
      <XIcon size={iconSize} color={color} />
    </TouchableOpacity>
    <TouchableOpacity onPress={() => open('https://instagram.com/allonethingxyz')} accessibilityRole="link" accessibilityLabel="Instagram" testID="social-instagram">
      <InstagramIcon size={iconSize} color={color} />
    </TouchableOpacity>
    <TouchableOpacity onPress={() => open('https://facebook.com/allonethingxyz')} accessibilityRole="link" accessibilityLabel="Facebook" testID="social-facebook">
      <FacebookIcon size={iconSize} color={color} />
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default SocialLinks;
