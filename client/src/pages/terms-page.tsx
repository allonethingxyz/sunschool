import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, typography } from '../styles/theme';

const TermsPage: React.FC = () => {
  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>SUNSCHOOL Terms of Service</Text>
          <Text style={styles.effectiveDate}>Effective Date: March 9, 2026</Text>
          
          <Text style={styles.sectionTitle}>Agreement to Terms</Text>
          <Text style={styles.paragraph}>
            By using SUNSCHOOL, you agree to these terms. If you don't agree, please don't use our service.
          </Text>

          <Text style={styles.sectionTitle}>Description of Service</Text>
          <Text style={styles.paragraph}>
            SUNSCHOOL is an AI-powered educational platform that provides personalized learning experiences for children. Our service includes interactive lessons, progress tracking, and parent dashboards.
          </Text>

          <Text style={styles.sectionTitle}>User Accounts</Text>
          <Text style={styles.bulletPoint}>• Parents must create accounts for children under 13</Text>
          <Text style={styles.bulletPoint}>• You're responsible for keeping your account secure</Text>
          <Text style={styles.bulletPoint}>• One person per account - no sharing login credentials</Text>
          <Text style={styles.bulletPoint}>• You must provide accurate information</Text>

          <Text style={styles.sectionTitle}>Acceptable Use</Text>
          <Text style={styles.boldText}>You may:</Text>
          <Text style={styles.bulletPoint}>• Use SUNSCHOOL for educational purposes</Text>
          <Text style={styles.bulletPoint}>• Create learner profiles for your children</Text>
          <Text style={styles.bulletPoint}>• Export your data</Text>

          <Text style={styles.boldText}>You may not:</Text>
          <Text style={styles.bulletPoint}>• Share inappropriate content</Text>
          <Text style={styles.bulletPoint}>• Attempt to hack or disrupt our service</Text>
          <Text style={styles.bulletPoint}>• Use the service for commercial purposes without permission</Text>
          <Text style={styles.bulletPoint}>• Violate any laws or regulations</Text>

          <Text style={styles.sectionTitle}>Privacy and Data</Text>
          <Text style={styles.paragraph}>
            Your privacy is important to us. Please read our Privacy Policy to understand how we collect, use, and protect your data. By using SUNSCHOOL, you agree to our data practices as described in the Privacy Policy.
          </Text>

          <Text style={styles.sectionTitle}>Open Source and Data Ownership</Text>
          <Text style={styles.paragraph}>
            SUNSCHOOL is open source software. Parents maintain control over their educational data and prompts. You own your learning data and can export or delete it at any time.
          </Text>

          <Text style={styles.sectionTitle}>Service Availability</Text>
          <Text style={styles.paragraph}>
            We strive to keep SUNSCHOOL available 24/7, but we can't guarantee uninterrupted service. We may need to perform maintenance or updates that temporarily affect availability.
          </Text>

          <Text style={styles.sectionTitle}>Intellectual Property</Text>
          <Text style={styles.paragraph}>
            SUNSCHOOL's educational content and software are protected by copyright and other laws. You may use our content for personal educational purposes but cannot redistribute or sell it.
          </Text>

          <Text style={styles.sectionTitle}>Termination</Text>
          <Text style={styles.paragraph}>
            You can delete your account at any time. We may suspend or terminate accounts that violate these terms. Upon termination, your data will be deleted according to our Privacy Policy.
          </Text>

          <Text style={styles.sectionTitle}>Disclaimers</Text>
          <Text style={styles.paragraph}>
            SUNSCHOOL is provided "as is" without warranties. We're not responsible for educational outcomes, though we work hard to provide quality learning experiences.
          </Text>

          <Text style={styles.sectionTitle}>Limitation of Liability</Text>
          <Text style={styles.paragraph}>
            Our liability is limited to the amount you've paid for the service. We're not liable for indirect, special, or consequential damages.
          </Text>

          <Text style={styles.sectionTitle}>Governing Law</Text>
          <Text style={styles.paragraph}>
            These terms are governed by the laws of the State of Arizona. Any disputes arising from or relating to these terms will be resolved exclusively in the state or federal courts located in Arizona.
          </Text>

          <Text style={styles.sectionTitle}>Changes to Terms</Text>
          <Text style={styles.paragraph}>
            We may update these terms occasionally. We'll notify you of significant changes by email. Continued use means you accept the updated terms.
          </Text>

          <Text style={styles.sectionTitle}>Contact Information</Text>
          <Text style={styles.paragraph}>
            Questions about these terms? Email us at: <Text style={styles.boldText}>info@sunschool.xyz</Text>
          </Text>

          <View style={styles.divider} />
          <Text style={styles.footer}>
            &copy; {new Date().getFullYear()} SUNSCHOOL, LLC. All rights reserved. A product of All One Thing Labs (allonething.xyz).
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  content: {
    maxWidth: 800,
    marginHorizontal: 'auto',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  effectiveDate: {
    fontSize: 16,
    fontStyle: 'italic',
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginTop: 32,
    marginBottom: 16,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    marginBottom: 16,
  },
  boldText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 8,
    marginBottom: 4,
  },
  bulletPoint: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    marginBottom: 4,
    marginLeft: 8,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 24,
  },
  footer: {
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default TermsPage;