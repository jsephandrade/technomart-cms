import React, { useState, useEffect } from 'react';
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Picker } from '@react-native-picker/picker';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_700Bold,
  Roboto_900Black,
} from '@expo-google-fonts/roboto';
import { registerAccount, loginWithGoogle } from '../api/api';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export default function AccountRegistrationScreen() {
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    role: '',
    email: '',
    password: '',
    confirm: '',
  });

  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  // Google Auth setup
  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId:
      '286008841345-05ir6hhh63hhktol4qpo9hqnvlqpl4v7.apps.googleusercontent.com',
    androidClientId:
      '286008841345-05ir6hhh63hhktol4qpo9hqnvlqpl4v7.apps.googleusercontent.com',
    webClientId:
      '286008841345-05ir6hhh63hhktol4qpo9hqnvlqpl4v7.apps.googleusercontent.com',
    scopes: ['profile', 'email'],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      handleGoogleLogin(authentication.accessToken);
    }
  }, [response]);

  const handleGoogleLogin = async (accessToken) => {
    try {
      const result = await loginWithGoogle({ accessToken }); // call your backend to register/login
      if (result.success) {
        Alert.alert('Success', 'Logged in with Google!', [
          { text: 'OK', onPress: () => router.replace('/dashboard') },
        ]);
      } else {
        Alert.alert('Error', result.message || 'Google login failed.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Unable to login with Google.');
    }
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validateForm = () => {
    const errs = {};
    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.lastName.trim()) errs.lastName = 'Last name is required';
    if (!form.role) errs.role = 'Please select a role';
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email))
      errs.email = 'Valid email is required';
    if (form.password.length < 6)
      errs.password = 'Password must be at least 6 characters';
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match';
    return errs;
  };

  const handleRegister = async () => {
    const errs = validateForm();
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      setLoading(true);
      try {
        const result = await registerAccount({
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email,
          password: form.password,
          confirm: form.confirm,
          role: form.role,
        });
        if (result.success) {
          Alert.alert('Success', 'Account created successfully!', [
            { text: 'OK', onPress: () => router.push('/AccountCreatedScreen') },
          ]);
          setForm({
            firstName: '',
            lastName: '',
            role: '',
            email: '',
            password: '',
            confirm: '',
          });
        } else if (result.errors) {
          setErrors(result.errors);
        } else {
          Alert.alert('Error', result.message);
        }
      } catch (error) {
        console.error(error);
        Alert.alert('Error', 'Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const formatError = (value) => {
    if (!value) return '';
    if (Array.isArray(value)) return value.join('\n');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  let [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_700Bold,
    Roboto_900Black,
  });
  if (!fontsLoaded) return null;

  const firstNameHasError = Boolean(errors.firstName);
  const lastNameHasError = Boolean(errors.lastName);
  const roleHasError = Boolean(errors.role);
  const emailHasError = Boolean(errors.email);
  const passwordHasError = Boolean(errors.password);
  const confirmHasError = Boolean(errors.confirm);
  const registerDisabled = loading;

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
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>
                  Fill in the details to register
                </Text>
              </View>
              <View style={styles.secureBadge}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={16}
                  color="#9A3412"
                />
                <Text style={styles.secureBadgeText}>Secure sign-up</Text>
              </View>
            </View>

            <View style={styles.securityRow}>
              <View style={styles.securityPill}>
                <Ionicons name="person-add-outline" size={14} color="#B45309" />
                <Text style={styles.securityPillText}>Quick profile setup</Text>
              </View>
              <View style={styles.securityPill}>
                <Ionicons name="key-outline" size={14} color="#B45309" />
                <Text style={styles.securityPillText}>
                  Passwords are encrypted
                </Text>
              </View>
            </View>

            {/* First Name */}
            <View
              style={[
                styles.inputWrapper,
                focusedField === 'firstName' && styles.inputWrapperFocused,
                firstNameHasError && styles.inputWrapperError,
              ]}
            >
              <Ionicons name="person-outline" size={20} color="#888" />
              <TextInput
                placeholder="First Name"
                value={form.firstName}
                onChangeText={(text) => handleChange('firstName', text)}
                style={styles.input}
                onFocus={() => setFocusedField('firstName')}
                onBlur={() => setFocusedField(null)}
                returnKeyType="next"
              />
            </View>
            {errors.firstName && (
              <Text style={styles.errorText}>
                {formatError(errors.firstName)}
              </Text>
            )}

            {/* Last Name */}
            <View
              style={[
                styles.inputWrapper,
                focusedField === 'lastName' && styles.inputWrapperFocused,
                lastNameHasError && styles.inputWrapperError,
              ]}
            >
              <Ionicons name="person-outline" size={20} color="#888" />
              <TextInput
                placeholder="Last Name"
                value={form.lastName}
                onChangeText={(text) => handleChange('lastName', text)}
                style={styles.input}
                onFocus={() => setFocusedField('lastName')}
                onBlur={() => setFocusedField(null)}
                returnKeyType="next"
              />
            </View>
            {errors.lastName && (
              <Text style={styles.errorText}>
                {formatError(errors.lastName)}
              </Text>
            )}

            {/* Role */}
            <View
              style={[
                styles.inputWrapper,
                styles.roleInputWrapper,
                roleHasError && styles.inputWrapperError,
              ]}
            >
              <MaterialCommunityIcons
                name="account-badge-outline"
                size={20}
                color="#888"
              />
              <Picker
                selectedValue={form.role}
                onValueChange={(value) => handleChange('role', value)}
                style={[
                  styles.input,
                  { color: form.role ? '#333' : '#9CA3AF' },
                ]}
                dropdownIconColor="#9CA3AF"
              >
                <Picker.Item label="Select Role" value="" />
                <Picker.Item label="Customer" value="customer" />
                <Picker.Item label="Faculty" value="faculty" />
              </Picker>
            </View>
            {errors.role && (
              <Text style={styles.errorText}>{formatError(errors.role)}</Text>
            )}
            <Text style={styles.roleHint}>
              Customer is for regular orders; Faculty unlocks catering access.
            </Text>

            {/* Email */}
            <View
              style={[
                styles.inputWrapper,
                focusedField === 'email' && styles.inputWrapperFocused,
                emailHasError && styles.inputWrapperError,
              ]}
            >
              <MaterialCommunityIcons
                name="email-outline"
                size={20}
                color="#888"
              />
              <TextInput
                placeholder="Email"
                keyboardType="email-address"
                autoCapitalize="none"
                value={form.email}
                onChangeText={(text) => handleChange('email', text)}
                style={styles.input}
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                returnKeyType="next"
              />
            </View>
            {errors.email && (
              <Text style={styles.errorText}>{formatError(errors.email)}</Text>
            )}

            {/* Password */}
            <View
              style={[
                styles.inputWrapper,
                focusedField === 'password' && styles.inputWrapperFocused,
                passwordHasError && styles.inputWrapperError,
              ]}
            >
              <MaterialCommunityIcons
                name="lock-outline"
                size={20}
                color="#888"
              />
              <TextInput
                placeholder="Password"
                secureTextEntry={!passwordVisible}
                value={form.password}
                onChangeText={(text) => handleChange('password', text)}
                style={[styles.input, { flex: 1 }]}
                autoCorrect={false}
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                returnKeyType="next"
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
              <Text style={styles.errorText}>
                {formatError(errors.password)}
              </Text>
            )}

            {/* Confirm Password */}
            <View
              style={[
                styles.inputWrapper,
                focusedField === 'confirm' && styles.inputWrapperFocused,
                confirmHasError && styles.inputWrapperError,
              ]}
            >
              <MaterialCommunityIcons
                name="lock-check-outline"
                size={20}
                color="#888"
              />
              <TextInput
                placeholder="Confirm Password"
                secureTextEntry={!confirmVisible}
                value={form.confirm}
                onChangeText={(text) => handleChange('confirm', text)}
                style={[styles.input, { flex: 1 }]}
                autoCorrect={false}
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                onFocus={() => setFocusedField('confirm')}
                onBlur={() => setFocusedField(null)}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={() => setConfirmVisible(!confirmVisible)}
              >
                <Ionicons
                  name={confirmVisible ? 'eye' : 'eye-off'}
                  size={20}
                  color="#888"
                />
              </TouchableOpacity>
            </View>
            {errors.confirm && (
              <Text style={styles.errorText}>
                {formatError(errors.confirm)}
              </Text>
            )}

            {/* Register Button */}
            <TouchableOpacity
              style={[
                styles.loginButton,
                registerDisabled && styles.loginButtonDisabled,
              ]}
              onPress={handleRegister}
              disabled={registerDisabled}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={styles.loginContent}>
                  <Ionicons name="person-add-outline" size={18} color="#fff" />
                  <Text style={styles.loginText}>Create Account</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.securityNotes}>
              <Text style={styles.securityNotesTitle}>Before you sign up</Text>
              <Text style={styles.securityNotesText}>
                Choose a strong password and keep your account details private.
                You can update your profile anytime after registration.
              </Text>
            </View>

            {/* Google Sign-Up */}
            <TouchableOpacity
              style={styles.googleButton}
              onPress={() => promptAsync()}
              disabled={!request}
            >
              <Image
                source={require('../../assets/google.png')}
                style={styles.googleIcon}
              />
              <Text style={styles.googleText}>Continue with Google</Text>
            </TouchableOpacity>

            {/* Back to Login */}
            <TouchableOpacity onPress={() => router.push('/account-login')}>
              <Text style={styles.linkText}>
                Already have an account?{' '}
                <Text style={{ fontFamily: 'Roboto_700Bold' }}>Login</Text>
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
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE7C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginLeft: 10,
  },
  secureBadgeText: {
    marginLeft: 6,
    fontSize: 11,
    fontFamily: 'Roboto_700Bold',
    color: '#9A3412',
  },
  securityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  securityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  securityPillText: {
    marginLeft: 6,
    fontSize: 11,
    color: '#7C2D12',
    fontFamily: 'Roboto_700Bold',
    flexShrink: 1,
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
  roleInputWrapper: {
    borderColor: '#FDBA74',
    backgroundColor: '#FFF1E6',
    marginBottom: 8,
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
  securityNotes: {
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  securityNotesTitle: {
    fontSize: 12,
    color: '#9A3412',
    fontFamily: 'Roboto_700Bold',
    marginBottom: 6,
  },
  securityNotesText: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'Roboto_400Regular',
    lineHeight: 18,
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
  roleHint: {
    color: '#9A3412',
    fontSize: 12,
    fontFamily: 'Roboto_400Regular',
    marginBottom: 12,
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
