import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, typography } from '../styles/theme';

const PrivacyPage: React.FC = () => {
  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>SUNSCHOOL Privacy Policy</Text>
          <Text style={styles.effectiveDate}>Effective Date: March 9, 2026</Text>
          
          <Text style={styles.sectionTitle}>What We Do</Text>
          <Text style={styles.paragraph}>
            SUNSCHOOL is an AI-powered educational platform that helps students learn and gives parents insights into their child's progress. We collect only the data necessary to provide personalized learning experiences.
          </Text>

          <Text style={styles.sectionTitle}>Information We Collect</Text>
          <Text style={styles.boldText}>Learning Data</Text>
          <Text style={styles.paragraph}>Quiz scores, lesson progress, time spent learning</Text>
          <Text style={styles.boldText}>Account Info</Text>
          <Text style={styles.paragraph}>Parent email, student first name and grade level</Text>
          <Text style={styles.boldText}>Technical Data</Text>
          <Text style={styles.paragraph}>Basic device info to make the app work</Text>

          <Text style={styles.sectionTitle}>How We Use Your Information</Text>
          <Text style={styles.bulletPoint}>• Personalize lessons for each student</Text>
          <Text style={styles.bulletPoint}>• Show parents their child's learning progress</Text>
          <Text style={styles.bulletPoint}>• Improve our educational content</Text>
          <Text style={styles.bulletPoint}>• Provide technical support</Text>

          <Text style={styles.sectionTitle}>Data Sharing</Text>
          <Text style={styles.boldText}>We DON'T share your data with:</Text>
          <Text style={styles.bulletPoint}>• Advertisers</Text>
          <Text style={styles.bulletPoint}>• Marketing companies</Text>
          <Text style={styles.bulletPoint}>• Social media platforms</Text>
          <Text style={styles.bulletPoint}>• Anyone trying to sell you things</Text>

          <Text style={styles.boldText}>We MAY share anonymized data with:</Text>
          <Text style={styles.bulletPoint}>• Educational researchers (to improve learning for all students)</Text>
          <Text style={styles.bulletPoint}>• Technical service providers (like our web hosting company)</Text>

          <Text style={styles.boldText}>We WILL share data when:</Text>
          <Text style={styles.bulletPoint}>• Required by law</Text>
          <Text style={styles.bulletPoint}>• Needed to protect user safety</Text>

          <Text style={styles.sectionTitle}>Children's Privacy (COPPA Compliance)</Text>
          <Text style={styles.bulletPoint}>• Parent consent required for children under 13</Text>
          <Text style={styles.bulletPoint}>• We only collect educational data needed for learning</Text>
          <Text style={styles.bulletPoint}>• No advertising to children</Text>
          <Text style={styles.bulletPoint}>• Parents can access, modify, or delete their child's data anytime</Text>

          <Text style={styles.sectionTitle}>Data Security</Text>
          <Text style={styles.bulletPoint}>• All data encrypted in transit and storage</Text>
          <Text style={styles.bulletPoint}>• Secure user authentication</Text>
          <Text style={styles.bulletPoint}>• Regular security updates</Text>
          <Text style={styles.bulletPoint}>• Access limited to authorized personnel only</Text>

          <Text style={styles.sectionTitle}>Your Rights</Text>
          <Text style={styles.boldText}>Parents can:</Text>
          <Text style={styles.bulletPoint}>• View their child's data</Text>
          <Text style={styles.bulletPoint}>• Export learning progress reports</Text>
          <Text style={styles.bulletPoint}>• Correct any wrong information</Text>
          <Text style={styles.bulletPoint}>• Delete their child's account and data</Text>
          <Text style={styles.bulletPoint}>• Contact us with questions: info@sunschool.xyz</Text>

          <Text style={styles.sectionTitle}>Data Retention</Text>
          <Text style={styles.bulletPoint}>• Learning data kept while account is active</Text>
          <Text style={styles.bulletPoint}>• Data deleted within 30 days after account closure</Text>
          <Text style={styles.bulletPoint}>• Technical logs deleted after 90 days</Text>

          <Text style={styles.sectionTitle}>AI and Automated Features</Text>
          <Text style={styles.paragraph}>
            Our AI creates personalized lessons and identifies learning gaps. Parents have full access to every system prompt used to generate their child's lessons. All AI instructions are visible, auditable, and exportable. Parents can also opt out of AI features if desired.
          </Text>

          <Text style={styles.sectionTitle}>Updates to This Policy</Text>
          <Text style={styles.paragraph}>
            We'll email you about important changes. Continued use means you accept any updates.
          </Text>

          <Text style={styles.sectionTitle}>Contact Us</Text>
          <Text style={styles.paragraph}>
            Questions? Email us at: <Text style={styles.boldText}>info@sunschool.xyz</Text>
          </Text>

          <Text style={styles.sectionTitle}>Governing Law</Text>
          <Text style={styles.paragraph}>
            This privacy policy is governed by the laws of the State of Arizona. Any disputes will be resolved in the courts of Arizona.
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

export default PrivacyPage;