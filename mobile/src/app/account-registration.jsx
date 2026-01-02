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
  Modal,
  Pressable,
  Platform,
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
  const [roleModalVisible, setRoleModalVisible] = useState(false);

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
  const roleOptions = [
    {
      label: 'Customer',
      value: 'customer',
      description: 'Regular orders and menu browsing.',
      icon: 'person-outline',
    },
    {
      label: 'Faculty',
      value: 'faculty',
      description: 'Includes catering access.',
      icon: 'school-outline',
    },
  ];
  const selectedRole = roleOptions.find((option) => option.value === form.role);
  const roleLabel = selectedRole?.label || 'Select Role';
  const roleDescription = selectedRole?.description || '';

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
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Fill in the details to register</Text>

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
            {Platform.OS === 'android' ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.inputWrapper,
                    styles.roleInputWrapper,
                    roleHasError && styles.inputWrapperError,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setRoleModalVisible(true)}
                >
                  <MaterialCommunityIcons
                    name="account-badge-outline"
                    size={20}
                    color="#888"
                  />
                  <View style={styles.roleSelectText}>
                    <Text
                      style={[
                        styles.roleSelectLabel,
                        !form.role && styles.roleSelectPlaceholder,
                      ]}
                    >
                      {roleLabel}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
                </TouchableOpacity>
                <Modal
                  transparent
                  animationType="fade"
                  visible={roleModalVisible}
                  onRequestClose={() => setRoleModalVisible(false)}
                >
                  <View style={styles.modalBackdrop}>
                    <Pressable
                      style={StyleSheet.absoluteFillObject}
                      onPress={() => setRoleModalVisible(false)}
                    />
                    <View style={styles.modalCard}>
                      <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Select Role</Text>
                        <TouchableOpacity
                          onPress={() => setRoleModalVisible(false)}
                        >
                          <Ionicons name="close" size={20} color="#6B7280" />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.modalSubtitle}>
                        Choose how you plan to use the app.
                      </Text>
                      {roleOptions.map((option) => {
                        const isSelected = option.value === form.role;
                        return (
                          <TouchableOpacity
                            key={option.value}
                            style={[
                              styles.roleOption,
                              isSelected && styles.roleOptionSelected,
                            ]}
                            onPress={() => {
                              handleChange('role', option.value);
                              setRoleModalVisible(false);
                            }}
                          >
                            <View style={styles.roleOptionIcon}>
                              <Ionicons
                                name={option.icon}
                                size={18}
                                color="#F97316"
                              />
                            </View>
                            <View style={styles.roleOptionText}>
                              <Text style={styles.roleOptionTitle}>
                                {option.label}
                              </Text>
                              <Text style={styles.roleOptionDesc}>
                                {option.description}
                              </Text>
                            </View>
                            {isSelected ? (
                              <Ionicons
                                name="checkmark-circle"
                                size={20}
                                color="#F97316"
                              />
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        style={styles.modalPrimaryButton}
                        onPress={() => setRoleModalVisible(false)}
                      >
                        <Text style={styles.modalPrimaryText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              </>
            ) : (
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
            )}
            {errors.role && (
              <Text style={styles.errorText}>{formatError(errors.role)}</Text>
            )}

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
  logo: { width: 85, height: 85, marginTop: 12, marginBottom: 8 },
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
  roleInputWrapper: {
    borderColor: '#FDBA74',
    backgroundColor: '#FFF1E6',
    paddingVertical: 12,
  },
  roleSelectText: {
    flex: 1,
    marginHorizontal: 10,
  },
  roleSelectLabel: {
    fontSize: 16,
    color: '#111827',
    fontFamily: 'Roboto_700Bold',
  },
  roleSelectPlaceholder: {
    color: '#9CA3AF',
    fontFamily: 'Roboto_400Regular',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FDE2C7',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
    fontFamily: 'Roboto_400Regular',
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FCE1C6',
    marginBottom: 12,
  },
  roleOptionSelected: {
    borderColor: '#F97316',
    backgroundColor: '#FFEFE1',
  },
  roleOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF1E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  roleOptionText: {
    flex: 1,
  },
  roleOptionTitle: {
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  roleOptionDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontFamily: 'Roboto_400Regular',
  },
  modalPrimaryButton: {
    marginTop: 4,
    backgroundColor: '#F97316',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
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
