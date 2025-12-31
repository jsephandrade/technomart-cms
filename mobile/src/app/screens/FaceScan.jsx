// FaceScanScreen.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  ActivityIndicator,
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Alert,
  Modal,
  BackHandler,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as LocalAuthentication from 'expo-local-authentication';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';

import AuthLayout from '../../components/AuthLayout';
import TermsNotice from '../../components/TermsNotice';

export default function FaceScanScreen() {
  const { autoPrompt } = useLocalSearchParams();
  const router = useRouter();
  const shouldAutoPrompt = autoPrompt === 'true' || autoPrompt === true;
  const autoPromptedRef = useRef(false);

  const [isSupported, setIsSupported] = useState(null);
  const [hasEnrollment, setHasEnrollment] = useState(null);
  const [biometryTypes, setBiometryTypes] = useState([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const hasFace = useMemo(
    () =>
      biometryTypes?.includes(
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
      ),
    [biometryTypes]
  );
  const hasFingerprint = useMemo(
    () =>
      biometryTypes?.includes(
        LocalAuthentication.AuthenticationType.FINGERPRINT
      ),
    [biometryTypes]
  );
  const supportedLabel = hasFace
    ? 'Face'
    : hasFingerprint
      ? 'Biometric'
      : 'Biometric';
  const canScan =
    !!isSupported &&
    !!hasEnrollment &&
    (hasFace || hasFingerprint) &&
    !authLoading;

  const [cameraOpen, setCameraOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [requesting, setRequesting] = useState(false);
  const [isFocused, setIsFocused] = useState(true);

  const insets = useSafeAreaInsets();

  // Animations
  const spin1 = useRef(new Animated.Value(0)).current;
  const spin2 = useRef(new Animated.Value(0)).current;
  const spin3 = useRef(new Animated.Value(0)).current;
  const rotate1 = spin1.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const rotate2 = spin2.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });
  const rotate3 = spin3.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  useEffect(() => {
    const loops = [
      Animated.loop(
        Animated.timing(spin1, {
          toValue: 1,
          duration: 9000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
      Animated.loop(
        Animated.timing(spin2, {
          toValue: 1,
          duration: 11000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
      Animated.loop(
        Animated.timing(spin3, {
          toValue: 1,
          duration: 10000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
          easing: Easing.in(Easing.quad),
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.15],
  });

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const types =
          await LocalAuthentication.supportedAuthenticationTypesAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!mounted) return;
        setIsSupported(compatible);
        setBiometryTypes(types || []);
        setHasEnrollment(enrolled);
      } catch (e) {
        if (!mounted) return;
        setIsSupported(false);
        setHasEnrollment(false);
        setBiometryTypes([]);
        setErrorMessage("We couldn't check biometrics on this device.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (shouldAutoPrompt && canScan && !autoPromptedRef.current) {
      autoPromptedRef.current = true;
      const id = setTimeout(() => handleBiometricAuth(), 300);
      return () => clearTimeout(id);
    }
  }, [shouldAutoPrompt, canScan]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        autoPromptedRef.current = false;
      };
    }, [])
  );

  const handleBiometricAuth = useCallback(async () => {
    if (authLoading) return;
    setErrorMessage('');
    setAuthLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Scan ${supportedLabel} to continue`,
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use passcode',
        disableDeviceFallback: true,
      });
      if (result.success) {
        AccessibilityInfo.announceForAccessibility?.(
          'Authenticated successfully'
        );
        router.replace('/(tabs)');
      } else if (result.error === 'lockout') {
        setErrorMessage('Too many attempts. Try your password instead.');
      } else if (
        !['user_cancel', 'system_cancel', 'app_cancel'].includes(result.error)
      ) {
        setErrorMessage('Authentication failed. Please try again.');
      }
    } catch (e) {
      setErrorMessage(
        e?.message || 'Something went wrong with biometric authentication.'
      );
    } finally {
      setAuthLoading(false);
    }
  }, [authLoading, router, supportedLabel]);

  const openSettings = useCallback(() => Linking.openSettings?.(), []);
  const openCamera = useCallback(async () => {
    if (!permission || !permission.granted) {
      setRequesting(true);
      const res = await requestPermission();
      setRequesting(false);
      if (!res.granted) {
        Alert.alert('Camera permission needed', 'Enable camera in Settings.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: openSettings },
        ]);
        return;
      }
    }
    setCameraOpen(true);
  }, [permission, requestPermission]);

  const closeCamera = useCallback(() => setCameraOpen(false), []);

  useEffect(() => {
    if (!cameraOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeCamera();
      return true;
    });
    return () => sub.remove();
  }, [cameraOpen, closeCamera]);

  const goPasswordLogin = useCallback(() => {
    router.replace('/account-login');
  }, [router]);

  return (
    <AuthLayout>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={{ flex: 1 }}>
            {/* background icons here ... */}

            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                padding: 24,
                justifyContent: 'center',
              }}
            >
              {/* biometrics UI here ... */}
              <TermsNotice />
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <Modal
        visible={cameraOpen}
        animationType="slide"
        onRequestClose={closeCamera}
        presentationStyle="fullScreen"
      >
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          {isFocused ? (
            <CameraView style={{ flex: 1 }} facing="front" />
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <TouchableOpacity
            onPress={closeCamera}
            style={{ position: 'absolute', top: insets.top + 12, right: 12 }}
          >
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </AuthLayout>
  );
}
