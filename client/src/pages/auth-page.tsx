import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Switch,
} from 'react-native';
import { useAuth } from '../hooks/use-auth';
import { useToast } from '../hooks/use-toast';
import { colors, typography, commonStyles } from '../styles/theme';
import { Book, User, Shield, Check } from 'react-feather';

const AuthPage = () => {
  const { user, loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);

  // Kid-friendly session expiry screen state
  const [showLoginForm, setShowLoginForm] = useState(false);

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginDisclaimerAccepted, setLoginDisclaimerAccepted] = useState(false);

  // Registration form state
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regRole, setRegRole] = useState('PARENT'); // Default role
  const [regDisclaimerAccepted, setRegDisclaimerAccepted] = useState(false);

  // Forgot / reset password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  // Check for reset token in URL
  const urlSearchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const resetTokenFromUrl = urlSearchParams?.get('reset') || '';

  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState('');

  // Redirect if already logged in
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (user) {
      try {
        if (user.role === 'LEARNER') {
          setLocation('/learner');
        } else {
          setLocation('/dashboard');
        }
      } catch (error) {
        console.error('Navigation error:', error);
        // Fallback to direct location change if navigation fails
        if (typeof window !== 'undefined') {
          const path = user.role === 'LEARNER' ? '/learner' : '/dashboard';
          window.location.href = path;
        }
      }
    }
  }, [user, setLocation]);
  
  const handleLogin = () => {
    if (!loginUsername || !loginPassword) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }
    
    if (!loginDisclaimerAccepted) {
      toast({
        title: 'Error',
        description: 'You must confirm that you are at least 18 years old and accept the terms to proceed',
        variant: 'destructive',
      });
      return;
    }
    
    loginMutation.mutate({
      username: loginUsername,
      password: loginPassword,
    });
  };
  
  const handleRegister = () => {
    // Validate inputs
    if (!regUsername || !regEmail || !regName || !regPassword || !regConfirmPassword) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }
    
    if (!regDisclaimerAccepted) {
      toast({
        title: 'Error',
        description: 'You must confirm that you are at least 18 years old and accept the terms to proceed',
        variant: 'destructive',
      });
      return;
    }
    
    if (regPassword !== regConfirmPassword) {
      toast({
        title: 'Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regEmail)) {
      toast({
        title: 'Error',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }
    
    registerMutation.mutate({
      username: regUsername,
      email: regEmail,
      name: regName,
      password: regPassword,
      role: regRole as any,
    });
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail) {
      toast({ title: 'Error', description: 'Please enter your email address', variant: 'destructive' });
      return;
    }
    setForgotSubmitting(true);
    try {
      await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotSuccess(true);
    } catch {
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetNewPassword || !resetConfirmPassword) {
      toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setResetSubmitting(true);
    setResetError('');
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetTokenFromUrl, newPassword: resetNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.error || 'Failed to reset password.');
      } else {
        setResetSuccess(true);
      }
    } catch {
      setResetError('Something went wrong. Please try again.');
    } finally {
      setResetSubmitting(false);
    }
  };

  // Check if this is a learner session expiry
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isExpiredLearner = !showLoginForm && (
    localStorage.getItem('preferredMode') === 'LEARNER' ||
    urlParams?.get('expired') === '1'
  );

  if (isExpiredLearner) {
    return (
      <View style={styles.container}>
        <View style={expiryStyles.wrapper}>
          <Text style={expiryStyles.emoji}>🔑</Text>
          <Text style={expiryStyles.heading}>Time to get a grown-up!</Text>
          <Text style={expiryStyles.message}>
            Your session ended. Ask a parent to log back in.
          </Text>
          <TouchableOpacity
            style={expiryStyles.button}
            onPress={() => {
              localStorage.removeItem('preferredMode');
              setShowLoginForm(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="I'm the grown-up"
          >
            <Text style={expiryStyles.buttonText}>I'm the grown-up</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerContainer}>
          <View style={styles.logoContainer} aria-hidden="true">
            <svg width="56" height="56" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="authSunG" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#F5A623" />
                  <stop offset="100%" stopColor="#F97316" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="8" fill="url(#authSunG)" />
              <circle cx="16" cy="16" r="6" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.3" />
              <circle cx="16" cy="16" r="2" fill="#fff" opacity="0.6" />
              <g stroke="#F5A623" strokeWidth="2" strokeLinecap="round" opacity="0.7">
                <line x1="16" y1="5" x2="16" y2="2" />
                <line x1="16" y1="27" x2="16" y2="30" />
                <line x1="5" y1="16" x2="2" y2="16" />
                <line x1="27" y1="16" x2="30" y2="16" />
                <line x1="8.2" y1="8.2" x2="6" y2="6" />
                <line x1="23.8" y1="8.2" x2="26" y2="6" />
                <line x1="8.2" y1="23.8" x2="6" y2="26" />
                <line x1="23.8" y1="23.8" x2="26" y2="26" />
              </g>
            </svg>
          </View>
          <Text style={styles.title} accessibilityRole="header">SUNSCHOOL</Text>
          <Text style={styles.subtitle}>School — anywhere under the sun.</Text>
        </View>
        
        <View style={styles.tabContainer} accessibilityRole="tablist">
          <TouchableOpacity
            style={[styles.tab, isLogin ? styles.activeTab : null]}
            onPress={() => setIsLogin(true)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isLogin }}
            accessibilityLabel="Login"
          >
            <Text style={[styles.tabText, isLogin ? styles.activeTabText : null]}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, !isLogin ? styles.activeTab : null]}
            onPress={() => setIsLogin(false)}
            accessibilityRole="tab"
            accessibilityState={{ selected: !isLogin }}
            accessibilityLabel="Register"
          >
            <Text style={[styles.tabText, !isLogin ? styles.activeTabText : null]}>Register</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.formContainer}>
          {isLogin ? (
            // Login Form
            <View accessibilityRole="form" accessibilityLabel="Login form">
              <View style={styles.inputGroup}>
                <Text style={styles.label} nativeID="login-username-label">Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your username"
                  value={loginUsername}
                  onChangeText={setLoginUsername}
                  autoCapitalize="none"
                  accessibilityLabel="Username"
                  accessibilityLabelledBy="login-username-label"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label} nativeID="login-password-label">Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  secureTextEntry
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                  accessibilityLabel="Password"
                  accessibilityLabelledBy="login-password-label"
                />
              </View>

              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={styles.checkboxWrapper}
                  onPress={() => setLoginDisclaimerAccepted(!loginDisclaimerAccepted)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: loginDisclaimerAccepted }}
                  accessibilityLabel="I confirm I am at least 18 years old and accept the terms"
                >
                  <View style={[styles.checkbox, loginDisclaimerAccepted ? styles.checkboxChecked : {}]}>
                    {loginDisclaimerAccepted && <Check size={16} color={colors.onPrimary} aria-hidden="true" />}
                  </View>
                  <Text style={styles.checkboxText}>
                    I confirm I am at least 18 years old and understand I'm using alpha stage open source software meant for demonstration purposes only, provided under the MIT License. No support, services, or guarantee of this software existing in the future is made by setting up a test account for free.
                  </Text>
                </TouchableOpacity>
              </View>

              {loginMutation.isError && (
                <View style={styles.errorBanner} accessibilityRole="alert">
                  <Text style={styles.errorBannerText}>
                    {loginMutation.error?.message || 'Login failed. Please try again.'}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.button, loginMutation.isPending ? styles.buttonDisabled : null]}
                onPress={handleLogin}
                disabled={loginMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel={loginMutation.isPending ? 'Logging in' : 'Login'}
                accessibilityState={{ disabled: loginMutation.isPending }}
              >
                <Text style={styles.buttonText}>
                  {loginMutation.isPending ? 'Logging in...' : 'Login'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            // Registration Form
            <View accessibilityRole="form" accessibilityLabel="Registration form">
              <View style={styles.inputGroup}>
                <Text style={styles.label} nativeID="reg-username-label">Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Choose a username"
                  value={regUsername}
                  onChangeText={setRegUsername}
                  autoCapitalize="none"
                  accessibilityLabel="Username"
                  accessibilityLabelledBy="reg-username-label"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label} nativeID="reg-email-label">Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  keyboardType="email-address"
                  value={regEmail}
                  onChangeText={setRegEmail}
                  autoCapitalize="none"
                  accessibilityLabel="Email"
                  accessibilityLabelledBy="reg-email-label"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label} nativeID="reg-name-label">Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your full name"
                  value={regName}
                  onChangeText={setRegName}
                  accessibilityLabel="Full Name"
                  accessibilityLabelledBy="reg-name-label"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label} nativeID="reg-password-label">Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Create a password"
                  secureTextEntry
                  value={regPassword}
                  onChangeText={setRegPassword}
                  accessibilityLabel="Password"
                  accessibilityLabelledBy="reg-password-label"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label} nativeID="reg-confirm-password-label">Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm your password"
                  secureTextEntry
                  value={regConfirmPassword}
                  onChangeText={setRegConfirmPassword}
                  accessibilityLabel="Confirm Password"
                  accessibilityLabelledBy="reg-confirm-password-label"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>You are registering as:</Text>
                <View style={styles.roleSelector} accessibilityRole="radiogroup" accessibilityLabel="Account type">
                  <TouchableOpacity
                    style={[
                      styles.roleOption,
                      styles.selectedRole
                    ]}
                    onPress={() => setRegRole('PARENT')}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: regRole === 'PARENT' }}
                    accessibilityLabel="Parent"
                  >
                    <User size={20} color={colors.onPrimary} aria-hidden="true" />
                    <Text style={[
                      styles.roleText,
                      styles.selectedRoleText
                    ]}>Parent</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.noteText}>
                  As a parent, you can create and manage children's learning accounts.
                </Text>
              </View>

              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={styles.checkboxWrapper}
                  onPress={() => setRegDisclaimerAccepted(!regDisclaimerAccepted)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: regDisclaimerAccepted }}
                  accessibilityLabel="I confirm I am at least 18 years old and accept the terms"
                >
                  <View style={[styles.checkbox, regDisclaimerAccepted ? styles.checkboxChecked : {}]}>
                    {regDisclaimerAccepted && <Check size={16} color={colors.onPrimary} aria-hidden="true" />}
                  </View>
                  <Text style={styles.checkboxText}>
                    I confirm I am at least 18 years old and understand I'm using alpha stage open source software meant for demonstration purposes only, provided under the MIT License. No support, services, or guarantee of this software existing in the future is made by setting up a test account for free.
                  </Text>
                </TouchableOpacity>
              </View>

              {registerMutation.isError && (
                <View style={styles.errorBanner} accessibilityRole="alert">
                  <Text style={styles.errorBannerText}>
                    {registerMutation.error?.message || 'Registration failed. Please try again.'}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.button, registerMutation.isPending ? styles.buttonDisabled : null]}
                onPress={handleRegister}
                disabled={registerMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel={registerMutation.isPending ? 'Registering' : 'Register'}
                accessibilityState={{ disabled: registerMutation.isPending }}
              >
                <Text style={styles.buttonText}>
                  {registerMutation.isPending ? 'Registering...' : 'Register'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        
        <View style={styles.featuresContainer}>
          <Text style={styles.featuresTitle} accessibilityRole="header">Why Choose Sunschool?</Text>

          <View style={styles.featureItem}>
            <View style={styles.featureIcon} aria-hidden="true">
              <Book size={24} color={colors.primary} aria-hidden="true" />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Personalized Learning</Text>
              <Text style={styles.featureDescription}>
                Lessons adapt to each child's learning style and pace
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={styles.featureIcon} aria-hidden="true">
              <User size={24} color={colors.primary} aria-hidden="true" />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Parent Involvement</Text>
              <Text style={styles.featureDescription}>
                Monitor progress and support your child's learning journey
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={styles.featureIcon} aria-hidden="true">
              <Shield size={24} color={colors.primary} aria-hidden="true" />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Safe Environment</Text>
              <Text style={styles.featureDescription}>
                Age-appropriate content in a secure digital space
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  checkboxContainer: {
    marginBottom: 16,
  },
  checkboxWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.primary,
    marginRight: 10,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  checkboxText: {
    ...typography.body2,
    flex: 1,
    color: colors.textSecondary,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  headerContainer: {
    alignItems: 'center',
    marginVertical: 24,
  },
  logoContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body1,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    borderRadius: 8,
    backgroundColor: colors.divider,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  activeTabText: {
    color: colors.onPrimary,
  },
  formContainer: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    ...typography.subtitle2,
    marginBottom: 8,
  },
  input: {
    ...commonStyles.input,
    marginBottom: 0,
  },
  roleSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
  },
  selectedRole: {
    backgroundColor: colors.primary,
  },
  roleText: {
    ...typography.button,
    color: colors.primary,
    marginLeft: 8,
  },
  selectedRoleText: {
    color: colors.onPrimary,
  },
  noteText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  button: {
    ...commonStyles.button,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...commonStyles.buttonText,
  },
  errorBanner: {
    backgroundColor: '#FDECEA',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
  },
  errorBannerText: {
    ...typography.body2,
    color: '#D32F2F',
  },
  featuresContainer: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  featuresTitle: {
    ...typography.h3,
    marginBottom: 16,
    textAlign: 'center',
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'center',
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    ...typography.subtitle1,
    marginBottom: 4,
  },
  featureDescription: {
    ...typography.body2,
  },
});

const expiryStyles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 24,
    textAlign: 'center',
  },
  heading: {
    fontSize: 32,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  message: {
    fontSize: 20,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 28,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 16,
    minWidth: 260,
    alignItems: 'center' as const,
  },
  buttonText: {
    color: colors.onPrimary,
    fontSize: 20,
    fontWeight: '700' as const,
  },
});

export default AuthPage;
