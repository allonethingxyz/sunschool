import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, TextInput } from 'react-native';

interface SupportModalProps {
  isVisible: boolean;
  onClose: () => void;
}

const SupportModal: React.FC<SupportModalProps> = ({ isVisible, onClose }) => {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');

  const canSubmit = message.trim().length >= 2 && agreedToTerms && status !== 'sending';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setStatus('sending');
    setErrorText('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('AUTH_TOKEN') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: message.trim(),
          email: email.trim() || undefined,
          page: typeof window !== 'undefined' ? window.location.pathname : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send');
      }
      setStatus('sent');
      setMessage('');
      setEmail('');
      setAgreedToTerms(false);
    } catch (err: any) {
      setStatus('error');
      setErrorText(err.message || 'Something went wrong');
    }
  };

  const handleClose = () => {
    if (status === 'sent') setStatus('idle');
    onClose();
  };

  return (
    <Modal animationType="fade" transparent visible={isVisible} onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.modal} accessibilityRole="none" accessibilityLabel="Support and Feedback">
          {status === 'sent' ? (
            <>
              <Text style={styles.title}>Thanks for your feedback!</Text>
              <Text style={styles.body}>We appreciate you taking the time to share your thoughts.</Text>
              <TouchableOpacity style={styles.submitButton} onPress={handleClose}>
                <Text style={styles.submitText}>Close</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>Support & Feedback</Text>
              <Text style={styles.body}>
                We'd love to hear from you! Share a bug report, feature idea, or just tell us how it's going.
              </Text>

              <TextInput
                style={styles.textArea}
                placeholder="What's on your mind?"
                placeholderTextColor="#9CA3AF"
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={4}
                maxLength={5000}
                accessibilityLabel="Your message"
                testID="feedback-message"
              />

              <TextInput
                style={styles.emailInput}
                placeholder="Email (optional, for follow-up)"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                maxLength={255}
                accessibilityLabel="Email address (optional)"
                testID="feedback-email"
              />

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setAgreedToTerms(!agreedToTerms)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreedToTerms }}
                testID="feedback-terms"
              >
                <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
                  {agreedToTerms && <Text style={styles.checkmark}>&#10003;</Text>}
                </View>
                <Text style={styles.checkboxLabel}>
                  I agree to the{' '}
                  <Text
                    style={styles.link}
                    onPress={() => { if (typeof window !== 'undefined') window.open('/terms', '_blank'); }}
                  >
                    Terms of Service
                  </Text>
                  {' '}and{' '}
                  <Text
                    style={styles.link}
                    onPress={() => { if (typeof window !== 'undefined') window.open('/privacy', '_blank'); }}
                  >
                    Privacy Policy
                  </Text>
                </Text>
              </TouchableOpacity>

              {status === 'error' && (
                <Text style={styles.errorText}>{errorText}</Text>
              )}

              <View style={styles.buttons}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  testID="feedback-submit"
                >
                  <Text style={styles.submitText}>
                    {status === 'sending' ? 'Sending...' : 'Send Feedback'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    width: '92%',
    maxWidth: 440,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
    marginBottom: 16,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 12,
  } as any,
  emailInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 16,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#4A90D9',
    borderColor: '#4A90D9',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#6B7280',
  },
  link: {
    color: '#4A90D9',
    textDecorationLine: 'underline',
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    marginBottom: 12,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  submitButton: {
    backgroundColor: '#4A90D9',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default SupportModal;
