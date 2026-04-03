import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '../hooks/use-auth';
import { useMode } from '../context/ModeContext';
import SunschoolHeader from './SunschoolHeader';
import AppFooter from './AppFooter';
import KidFooter from './KidFooter';
import { colors } from '../styles/theme';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const { isLearnerMode } = useMode();

  if (!user && !isLoading) {
    return <>{children}</>;
  }

  if (isLoading) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={{ zIndex: 100 }}>
        <SunschoolHeader />
      </View>
      <View
        nativeID="main-content"
        style={[
          styles.content,
          isLearnerMode && styles.learnerContent,
        ]}
      >
        {children}
      </View>
      {isLearnerMode ? (
        <KidFooter />
      ) : (
        <View>
          <AppFooter />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: '100vh' as any,
    flexDirection: 'column' as const,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 1200,
    marginHorizontal: 'auto',
    padding: 20,
  },
  learnerContent: {
    paddingBottom: 90,
  },
});

export default AppLayout;
