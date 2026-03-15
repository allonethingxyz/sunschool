import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '../hooks/use-auth';
import SunschoolHeader from './SunschoolHeader';
import AppFooter from './AppFooter';
import { colors } from '../styles/theme';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (!user && !isLoading) {
    return <>{children}</>;
  }

  if (isLoading) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container} accessibilityRole="none">
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 'auto',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          zIndex: 9999,
        }}
        onFocus={(e) => {
          const el = e.currentTarget;
          el.style.position = 'fixed';
          el.style.left = '8px';
          el.style.top = '8px';
          el.style.width = 'auto';
          el.style.height = 'auto';
          el.style.overflow = 'visible';
          el.style.background = '#4A90D9';
          el.style.color = '#fff';
          el.style.padding = '8px 16px';
          el.style.borderRadius = '4px';
          el.style.fontSize = '14px';
          el.style.fontWeight = '600';
          el.style.textDecoration = 'none';
        }}
        onBlur={(e) => {
          const el = e.currentTarget;
          el.style.position = 'absolute';
          el.style.left = '-9999px';
          el.style.width = '1px';
          el.style.height = '1px';
          el.style.overflow = 'hidden';
        }}
      >
        Skip to main content
      </a>
      <View accessibilityRole="banner" style={{ zIndex: 100 }}>
        <SunschoolHeader />
      </View>
      <View
        nativeID="main-content"
        accessibilityRole="main"
        style={styles.content}
      >
        {children}
      </View>
      <View accessibilityRole="contentinfo">
        <AppFooter />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: colors.background,
    maxWidth: '100vw' as any,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 1200,
    marginHorizontal: 'auto',
    padding: 20,
    overflow: 'auto' as any,
  },
});

export default AppLayout;
