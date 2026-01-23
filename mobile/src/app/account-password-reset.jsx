import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_700Bold,
  Roboto_900Black,
} from '@expo-google-fonts/roboto';

import { requestPasswordReset, confirmPasswordReset } from '../api/api';

export default function AccountPasswordResetScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [resetStep, setResetStep] = useState(1); // 1 = enter email, 2 = enter code + new password
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  // Load fonts
  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_700Bold,
    Roboto_900Black,
  });
  if (!fontsLoaded) return null;

  // Step 1: Request reset code
  const handleRequestReset = async () => {
    const trimmedEmail = email.trim();
    if (!/\S+@\S+\.\S+/.test(trimmedEmail)) {
      setErrors({ email: 'Invalid email address' });
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      const response = await requestPasswordReset({ email: trimmedEmail });
      const status = response?.status;
      const message = response?.data?.message;

      if (!status) {
        setErrors({ form: message || 'Network error or server unreachable' });
        return;
      }
      if (status >= 400) {
        setErrors({ email: message || 'Email not found' });
        return;
      }

      Alert.alert(
        'Reset Email Sent',
        `A reset code has been sent to ${trimmedEmail}`
      );
      setResetStep(2);
    } catch (err) {
      console.error(err);
      setErrors({ form: 'Network error or server unreachable' });
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Confirm code & set new password
  const handleConfirmReset = async () => {
    const trimmedCode = resetCode.trim();
    const nextErrors = {};

    if (!trimmedCode) nextErrors.resetCode = 'Reset code is required';
    if (!newPassword) nextErrors.newPassword = 'New password is required';
    if (newPassword && newPassword.length < 6) {
      nextErrors.newPassword = 'Password must be at least 6 characters';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const response = await confirmPasswordReset({
        email: email.trim(),
        reset_code: trimmedCode,
        new_password: newPassword,
      });
      const status = response?.status;
      const message = response?.data?.message;
      const normalizedMessage = String(message || '').toLowerCase();

      if (status && status >= 400) {
        if (normalizedMessage.includes('invalid reset code')) {
          setErrors({
            resetCode:
              'Reset code does not match. Check the email and try again.',
          });
          return;
        }
        if (normalizedMessage.includes('expired')) {
          setErrors({
            resetCode: 'Reset code expired. Request a new code.',
          });
          return;
        }
        setErrors({ form: message || 'Reset failed' });
        return;
      }

      if (!status) {
        if (normalizedMessage.includes('invalid reset code')) {
          setErrors({
            resetCode:
              'Reset code does not match. Check the email and try again.',
          });
          return;
        }
        if (normalizedMessage.includes('expired')) {
          setErrors({
            resetCode: 'Reset code expired. Request a new code.',
          });
          return;
        }
        setErrors({ form: message || 'Reset failed' });
        return;
      }

      if (message) {
        Alert.alert('Success', message);
        router.push('/account-login');
        return;
      }

      setErrors({ form: 'Reset failed' });
    } catch (err) {
      console.error(err);
      setErrors({ form: 'Network error or server unreachable' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/drop_3.png')}
      style={styles.background}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.3)']}
        style={StyleSheet.absoluteFillObject}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContainer}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.title}>
                  {resetStep === 1 ? 'Forgot Password?' : 'Reset Password'}
                </Text>
                <Text style={styles.subtitle}>
                  {resetStep === 1
                    ? 'Enter your email to receive a reset code.'
                    : `Enter the code sent to ${
                        email.trim() || 'your email'
                      } and choose a new password.`}
                </Text>
              </View>
            </View>
            {resetStep === 1 ? (
              <>
                {/* Email Input */}
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === 'email' && styles.inputWrapperFocused,
                    errors.email && styles.inputWrapperError,
                  ]}
                >
                  <Ionicons name="mail-outline" size={20} color="#888" />
                  <TextInput
                    placeholder="Email Address"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      if (errors.email || errors.form) {
                        setErrors((prev) => ({
                          ...prev,
                          email: null,
                          form: null,
                        }));
                      }
                    }}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="done"
                    style={styles.input}
                  />
                </View>
                {errors.email ? (
                  <Text style={styles.errorText}>{errors.email}</Text>
                ) : null}
                {errors.form ? (
                  <Text style={styles.errorText}>{errors.form}</Text>
                ) : null}

                {/* Reset Button */}
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    loading && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleRequestReset}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={styles.primaryContent}>
                      <Ionicons name="send-outline" size={18} color="#fff" />
                      <Text style={styles.primaryText}>Send Reset Code</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Reset Code Input */}
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === 'resetCode' && styles.inputWrapperFocused,
                    errors.resetCode && styles.inputWrapperError,
                  ]}
                >
                  <Ionicons name="key-outline" size={20} color="#888" />
                  <TextInput
                    placeholder="Reset Code"
                    value={resetCode}
                    onChangeText={(value) => {
                      setResetCode(value);
                      if (errors.resetCode || errors.form) {
                        setErrors((prev) => ({
                          ...prev,
                          resetCode: null,
                          form: null,
                        }));
                      }
                    }}
                    onFocus={() => setFocusedField('resetCode')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="number-pad"
                    maxLength={6}
                    textContentType="oneTimeCode"
                    returnKeyType="next"
                    style={styles.input}
                  />
                </View>
                {errors.resetCode ? (
                  <Text style={styles.errorText}>{errors.resetCode}</Text>
                ) : null}
                {/* New Password Input */}
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === 'newPassword' &&
                      styles.inputWrapperFocused,
                    errors.newPassword && styles.inputWrapperError,
                  ]}
                >
                  <Ionicons name="lock-closed-outline" size={20} color="#888" />
                  <TextInput
                    placeholder="New Password"
                    value={newPassword}
                    onChangeText={(value) => {
                      setNewPassword(value);
                      if (errors.newPassword || errors.form) {
                        setErrors((prev) => ({
                          ...prev,
                          newPassword: null,
                          form: null,
                        }));
                      }
                    }}
                    onFocus={() => setFocusedField('newPassword')}
                    onBlur={() => setFocusedField(null)}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    returnKeyType="done"
                    style={styles.input}
                  />
                </View>
                {errors.newPassword ? (
                  <Text style={styles.errorText}>{errors.newPassword}</Text>
                ) : null}
                {errors.form ? (
                  <Text style={styles.errorText}>{errors.form}</Text>
                ) : null}

                {/* Confirm Button */}
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    loading && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleConfirmReset}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={styles.primaryContent}>
                      <Ionicons name="key-outline" size={18} color="#fff" />
                      <Text style={styles.primaryText}>Reset Password</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Back to Login */}
            <View style={styles.linkRow}>
              <Text style={styles.linkMuted}>Remembered your password? </Text>
              <TouchableOpacity onPress={() => router.push('/account-login')}>
                <Text style={styles.linkStrong}>Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  container: { alignItems: 'center', justifyContent: 'flex-start', flex: 1 },
  logo: { width: 170, height: 170, marginTop: 24, marginBottom: 8 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Roboto_900Black',
    color: '#333',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    textAlign: 'left',
    fontFamily: 'Roboto_400Regular',
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    padding: 22,
    elevation: 4,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,140,0,0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3D6B7',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 15,
    backgroundColor: '#FFF7ED',
  },
  inputWrapperFocused: {
    borderColor: '#F97316',
    backgroundColor: '#FFF3E4',
  },
  inputWrapperError: {
    borderColor: '#EF4444',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    fontFamily: 'Roboto_400Regular',
  },
  errorText: {
    color: '#DC2626',
    alignSelf: 'flex-start',
    marginBottom: 10,
    marginLeft: 5,
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: '#FF8C00',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginVertical: 10,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    marginLeft: 8,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 6,
  },
  linkMuted: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'Roboto_400Regular',
  },
  linkStrong: {
    color: '#FF8C00',
    fontFamily: 'Roboto_700Bold',
    fontSize: 14,
  },
});
