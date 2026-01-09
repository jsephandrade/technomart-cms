import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  clearStoredTokens,
  getValidToken,
  loginWithGoogle,
  storeTokens,
  USER_CACHE_KEY,
  BASE_URL,
} from '../api/api';

import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_700Bold,
  Roboto_900Black,
} from '@expo-google-fonts/roboto';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../firebase';
import * as LocalAuthentication from 'expo-local-authentication';

WebBrowser.maybeCompleteAuthSession();

// ✅ Backend API base
const API_BASE = `${BASE_URL}/accounts`;
const BIOMETRIC_STORAGE_KEY = '@technomart/biometric';

export default function AccountLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [focusedField, setFocusedField] = useState(null);
  const [user, setUser] = useState(null);
  const passwordInputRef = useRef(null);
  const [biometricData, setBiometricData] = useState(null);
  const [biometricReady, setBiometricReady] = useState(false);

  const MAX_LOGIN_ATTEMPTS = 3;
  const LOGIN_COOLDOWN_SECONDS = 20;

  const formatMessage = (msg) => {
    if (Array.isArray(msg)) return msg.join('\n');
    if (typeof msg === 'object' && msg !== null) return JSON.stringify(msg);
    return String(msg);
  };
  const AUTH_FAILURE_MESSAGE = 'Invalid email and password';

  const normalizeLoginError = (rawMessage) => {
    const formatted = formatMessage(rawMessage || '');
    const normalized = formatted.toLowerCase();
    if (
      normalized.includes('invalid credentials') ||
      normalized.includes('account not found') ||
      normalized.includes('invalid email or password')
    ) {
      return AUTH_FAILURE_MESSAGE;
    }
    return formatted || AUTH_FAILURE_MESSAGE;
  };

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSeconds((value) => (value > 1 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    let active = true;
    const loadBiometric = async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        if (!hasHardware) return;
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!isEnrolled) return;
        const stored = await AsyncStorage.getItem(BIOMETRIC_STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (active) {
          setBiometricData(parsed);
          setBiometricReady(true);
        }
      } catch (err) {
        console.warn('Biometric load error:', err);
      }
    };
    loadBiometric();
    return () => {
      active = false;
    };
  }, []);

  // ✅ Google Auth Config
  const googleConfig = {
    expoClientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    responseType: 'id_token',
    scopes: ['openid', 'profile', 'email'],
    selectAccount: true,
  };

  const [request, , promptAsync] = Google.useAuthRequest(googleConfig);
  const validateEmail = useCallback((value) => /\S+@\S+\.\S+/.test(value), []);

  // ✅ Auto redirect if already logged in
  useEffect(() => {
    const checkUser = async () => {
      const token = await getValidToken();
      if (!token) {
        await AsyncStorage.multiRemove([USER_CACHE_KEY, 'user']);
        return;
      }
      const entries = await AsyncStorage.multiGet([USER_CACHE_KEY, 'user']);
      const storedUser = entries[0][1] || entries[1][1];
      if (!storedUser) return;
      try {
        const parsed = JSON.parse(storedUser);
        const email = String(parsed?.email || '').toLowerCase();
        if (email.endsWith('@guest.local')) {
          await clearStoredTokens();
          return;
        }
        setUser(parsed);
        router.replace('/home-dashboard');
      } catch (err) {
        console.warn('Failed to parse stored user:', err);
        await AsyncStorage.multiRemove([USER_CACHE_KEY, 'user']);
      }
    };
    checkUser();
  }, []);

  // ✅ Login API
  const login = async ({ email, password }) => {
    try {
      const response = await fetch(`${API_BASE}/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        const rawMessage = data.detail || data.message;
        return {
          success: false,
          message: normalizeLoginError(rawMessage),
        };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Login API error:', error);
      return { success: false, message: 'Network error' };
    }
  };

  // ✅ Email/password login handler
  const handleLogin = async () => {
    if (loading) return;
    if (cooldownSeconds > 0) return;

    const errs = {};
    if (!validateEmail(email)) errs.email = 'Invalid email address';
    if (password.length < 6)
      errs.password = 'Password must be at least 6 characters';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);

    try {
      const { success, data, message } = await login({ email, password });

      if (!success) {
        setAttemptCount((prev) => {
          const next = prev + 1;
          if (next >= MAX_LOGIN_ATTEMPTS) {
            setCooldownSeconds(LOGIN_COOLDOWN_SECONDS);
            return 0;
          }
          return next;
        });
        return Alert.alert('Login Failed', message || AUTH_FAILURE_MESSAGE);
      }

      // ✅ Save tokens
      await storeTokens({
        accessToken: data.access,
        refreshToken: data.refresh,
      });

      // ✅ Use the token directly from API response
      const profileRes = await fetch(`${API_BASE}/profile/`, {
        headers: { Authorization: `Bearer ${data.access}` },
      });

      if (!profileRes.ok) {
        const errData = await profileRes.json();
        throw new Error(errData.detail || 'Failed to fetch profile');
      }

      const profile = await profileRes.json();

      const statusValue = String(profile?.status || '').toLowerCase();
      if (statusValue && statusValue !== 'active') {
        await clearStoredTokens();
        await AsyncStorage.removeItem(USER_CACHE_KEY);
        router.replace('/account-pending-approval');
        return;
      }

      // ✅ Save user profile
      await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(profile));
      setUser(profile);
      setAttemptCount(0);
      setCooldownSeconds(0);

      await promptBiometricEnrollment({
        email: email.trim().toLowerCase(),
        tokens: { access: data.access, refresh: data.refresh },
        profile,
      });

      router.replace('/home-dashboard');
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Login Failed', formatMessage(error.message));
    } finally {
      setLoading(false);
    }
  };

  const promptBiometricEnrollment = useCallback(async (payload) => {
    if (!payload) return;
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) return;
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) return;
      const stored = await AsyncStorage.getItem(BIOMETRIC_STORAGE_KEY);
      if (stored) return;

      Alert.alert(
        'Enable Fingerprint Login',
        'Use your fingerprint to sign in faster next time.',
        [
          { text: 'Maybe later', style: 'cancel' },
          {
            text: 'Enable',
            onPress: async () => {
              try {
                const auth = await LocalAuthentication.authenticateAsync({
                  promptMessage: 'Confirm fingerprint to enable',
                  cancelLabel: 'Cancel',
                });
                if (!auth.success) {
                  Alert.alert(
                    'Authentication failed',
                    'Fingerprint not recognized.'
                  );
                  return;
                }
                const dataToStore = {
                  ...payload,
                  method: 'biometric',
                };
                await AsyncStorage.setItem(
                  BIOMETRIC_STORAGE_KEY,
                  JSON.stringify(dataToStore)
                );
                setBiometricData(dataToStore);
                setBiometricReady(true);
                Alert.alert(
                  'Enabled',
                  'Fingerprint login is now active for this device.'
                );
              } catch (authErr) {
                console.warn('Failed to enable biometric login:', authErr);
              }
            },
          },
        ]
      );
    } catch (err) {
      console.warn('Biometric enrollment skipped:', err);
    }
  }, []);

  const handleBiometricLogin = useCallback(async () => {
    if (!biometricData) return;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Use fingerprint to login',
        cancelLabel: 'Cancel',
      });
      if (!result.success) {
        return Alert.alert(
          'Authentication failed',
          'Unable to read your fingerprint.'
        );
      }
      await storeTokens({
        accessToken: biometricData.tokens.access,
        refreshToken: biometricData.tokens.refresh,
      });
      await AsyncStorage.setItem(
        USER_CACHE_KEY,
        JSON.stringify(biometricData.profile)
      );
      setUser(biometricData.profile);
      router.replace('/home-dashboard');
    } catch (err) {
      console.error('Biometric login failed:', err);
      Alert.alert('Error', 'Unable to login with fingerprint.');
    }
  }, [biometricData, router]);

  // ✅ Google login handler
  const handleGoogleSignIn = useCallback(async () => {
    if (!request) {
      Alert.alert(
        'Unavailable',
        'Google Sign-In not configured for this build.'
      );
      return;
    }

    setGoogleLoading(true);
    try {
      const res = await promptAsync({ useProxy: true });
      if (!res || res.type !== 'success') return;

      const idToken = res.authentication?.idToken || res.params?.id_token;
      const accessToken =
        res.authentication?.accessToken || res.params?.access_token;
      if (!idToken) throw new Error('Missing Google ID token');

      const firebaseCredential = GoogleAuthProvider.credential(
        idToken,
        accessToken
      );
      await signInWithCredential(auth, firebaseCredential);

      const loginResult = await loginWithGoogle({ credential: idToken });
      if (!loginResult.success || !loginResult.data?.access) {
        Alert.alert(
          'Google Login Failed',
          formatMessage(
            loginResult.message || 'Unable to authenticate with Google.'
          )
        );
        return;
      }

      await storeTokens({
        accessToken: loginResult.data.access,
        refreshToken: loginResult.data.refresh,
      });

      const profileRes = await fetch(`${API_BASE}/profile/`, {
        headers: { Authorization: `Bearer ${loginResult.data.access}` },
      });

      const profile = await profileRes.json();
      await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(profile));
      setUser(profile);

      router.replace('/home-dashboard');
    } catch (error) {
      console.error('Google login error:', error);
      Alert.alert('Google Login Failed', formatMessage(error.message));
    } finally {
      setGoogleLoading(false);
    }
  }, [promptAsync, request, router]);

  const handleFaceSignIn = useCallback(() => {
    router.push({ pathname: '/face-scan', params: { mode: 'login' } });
  }, [router]);

  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_700Bold,
    Roboto_900Black,
  });
  if (!fontsLoaded) return null;

  const loginDisabled = loading || cooldownSeconds > 0;
  const emailHasError = Boolean(errors.email);
  const passwordHasError = Boolean(errors.password);

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
                <Text style={styles.title}>Welcome Back!</Text>
                <Text style={styles.subtitle}>
                  Sign in to enjoy delicious canteen meals
                </Text>
              </View>
            </View>

            {/* Email */}
            <View
              style={[
                styles.inputWrapper,
                focusedField === 'email' && styles.inputWrapperFocused,
                emailHasError && styles.inputWrapperError,
              ]}
            >
              <Ionicons name="mail-outline" size={20} color="#888" />
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                value={email}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                onChangeText={(value) => {
                  setEmail(value);
                  if (errors.email) {
                    setErrors((prev) => ({ ...prev, email: null }));
                  }
                }}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
              />
            </View>
            {errors.email && (
              <Text style={styles.errorText}>{errors.email}</Text>
            )}

            {/* Password */}
            <View
              style={[
                styles.inputWrapper,
                focusedField === 'password' && styles.inputWrapperFocused,
                passwordHasError && styles.inputWrapperError,
              ]}
            >
              <Ionicons name="lock-closed-outline" size={20} color="#888" />
              <TextInput
                ref={passwordInputRef}
                style={styles.input}
                placeholder="Password"
                secureTextEntry={!passwordVisible}
                autoCorrect={false}
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                value={password}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                onChangeText={(value) => {
                  setPassword(value);
                  if (errors.password) {
                    setErrors((prev) => ({ ...prev, password: null }));
                  }
                }}
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                onPress={() => setPasswordVisible(!passwordVisible)}
              >
                <Ionicons
                  name={passwordVisible ? 'eye' : 'eye-off'}
                  size={20}
                  color="#888"
                />
              </TouchableOpacity>
            </View>
            {errors.password && (
              <Text style={styles.errorText}>{errors.password}</Text>
            )}

            {cooldownSeconds > 0 ? (
              <View style={styles.securityAlert}>
                <Ionicons name="warning-outline" size={16} color="#B91C1C" />
                <Text style={styles.securityAlertText}>
                  Too many attempts. Try again in {cooldownSeconds}s.
                </Text>
              </View>
            ) : null}

            {/* Login Button */}
            <TouchableOpacity
              style={[
                styles.loginButton,
                loginDisabled && styles.loginButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={loginDisabled}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={styles.loginContent}>
                  <Ionicons name="lock-closed-outline" size={18} color="#fff" />
                  <Text style={styles.loginText}>Login</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Face Scan Button */}
            <TouchableOpacity
              style={styles.faceButton}
              onPress={handleFaceSignIn}
            >
              <View style={styles.faceContent}>
                <Ionicons
                  name="scan-circle-outline"
                  size={20}
                  color="#F97316"
                />
                <Text style={styles.faceText}>Continue with Face scan</Text>
              </View>
            </TouchableOpacity>

            {biometricReady && biometricData && (
              <TouchableOpacity
                style={[styles.faceButton, styles.biometricButton]}
                onPress={handleBiometricLogin}
              >
                <View style={styles.faceContent}>
                  <Ionicons
                    name="finger-print-outline"
                    size={20}
                    color="#16A34A"
                  />
                  <Text style={[styles.faceText, styles.biometricText]}>
                    Login with Fingerprint
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Google Button */}
            <TouchableOpacity
              style={styles.googleButton}
              disabled={!request || googleLoading}
              onPress={handleGoogleSignIn}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#4285F4" />
              ) : (
                <Image
                  source={require('../../assets/google.png')}
                  style={styles.googleIcon}
                />
              )}
              <Text style={styles.googleText}>
                {googleLoading ? 'Connecting...' : 'Continue with Google'}
              </Text>
            </TouchableOpacity>

            {/* Links */}
            <TouchableOpacity
              onPress={() => router.push('/account-password-reset')}
            >
              <Text style={styles.linkText}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/account-registration')}
            >
              <Text style={styles.linkText}>
                Don't have an account?{' '}
                <Text style={{ fontFamily: 'Roboto_700Bold' }}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  scrollContainer: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 32 },
  container: { alignItems: 'center', justifyContent: 'flex-start', flex: 1 },
  logo: { width: 170, height: 170, marginTop: 24, marginBottom: 8 },
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
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
  loginButton: {
    backgroundColor: '#FF8C00',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginVertical: 10,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    marginLeft: 8,
  },
  securityAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  securityAlertText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#7C2D12',
    fontFamily: 'Roboto_700Bold',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 15,
  },
  googleIcon: { width: 22, height: 22, marginRight: 10 },
  googleText: { fontSize: 16, fontFamily: 'Roboto_700Bold', color: '#333' },
  faceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE2C7',
    backgroundColor: '#FFF7ED',
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 15,
  },
  faceContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faceText: {
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
    color: '#C2410C',
    marginLeft: 8,
  },
  biometricButton: {
    backgroundColor: '#ECFDF5',
    borderColor: '#D1FAE5',
  },
  biometricText: {
    color: '#16A34A',
  },
  linkText: {
    color: '#EA580C',
    marginTop: 6,
    fontSize: 14,
    textAlign: 'center',
    fontFamily: 'Roboto_400Regular',
  },
  errorText: {
    color: '#DC2626',
    alignSelf: 'flex-start',
    marginBottom: 10,
    marginLeft: 5,
    fontSize: 13,
  },
});
