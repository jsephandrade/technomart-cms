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
  storeTokens,
  USER_CACHE_KEY,
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

WebBrowser.maybeCompleteAuthSession();

// ✅ Backend API base
const LOCAL_IP = '192.168.1.5';
const API_BASE = `http://${LOCAL_IP}:8000/api/accounts`;

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

  const MAX_LOGIN_ATTEMPTS = 3;
  const LOGIN_COOLDOWN_SECONDS = 20;

  const formatMessage = (msg) => {
    if (Array.isArray(msg)) return msg.join('\n');
    if (typeof msg === 'object' && msg !== null) return JSON.stringify(msg);
    return String(msg);
  };

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSeconds((value) => (value > 1 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // ✅ Google Auth Config
  const googleConfig = {
    expoClientId:
      '286008841345-f316kiittefdfi03ns17jljlc14urr2k.apps.googleusercontent.com',
    androidClientId:
      '286008841345-05ir6hhh63hhktol4qpo9hqnvlqpl4v7.apps.googleusercontent.com',
    webClientId:
      '286008841345-f316kiittefdfi03ns17jljlc14urr2k.apps.googleusercontent.com',
    responseType: 'id_token',
    scopes: ['profile', 'email'],
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
        return {
          success: false,
          message: data.detail || data.message || 'Invalid credentials',
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
        return Alert.alert('Login Failed', message || 'Incorrect credentials');
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

      // ✅ Save user profile
      await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(profile));
      setUser(profile);
      setAttemptCount(0);
      setCooldownSeconds(0);

      router.replace('/home-dashboard');
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Login Failed', formatMessage(error.message));
    } finally {
      setLoading(false);
    }
  };

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
      const res = await promptAsync();
      if (!res || res.type !== 'success') return;

      const idToken = res.authentication?.idToken || res.params?.id_token;
      if (!idToken) throw new Error('Missing Google ID token');

      const loginResponse = await fetch(`${API_BASE}/google-login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: idToken }),
      });

      const loginData = await loginResponse.json();

      if (loginResponse.ok && loginData.access) {
        await storeTokens({
          accessToken: loginData.access,
          refreshToken: loginData.refresh,
        });

        const profileRes = await fetch(`${API_BASE}/profile/`, {
          headers: { Authorization: `Bearer ${loginData.access}` },
        });

        const profile = await profileRes.json();
        await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(profile));
        setUser(profile);

        router.replace('/home-dashboard');
      } else {
        Alert.alert(
          'Google Login Failed',
          formatMessage(
            loginData.detail || 'Unable to authenticate with Google.'
          )
        );
      }
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
