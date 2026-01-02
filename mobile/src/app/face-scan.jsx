import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BASE_URL,
  FACE_REGISTERED_KEY,
  getValidToken,
  storeTokens,
  USER_CACHE_KEY,
} from '../api/api';

const RING_SIZE = 230;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_ARC = RING_CIRCUMFERENCE * 0.16;

export default function FaceScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const scanMode = modeParam === 'register' ? 'register' : 'login';
  const isRegister = scanMode === 'register';

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const cameraRef = useRef(null);

  const title = isRegister ? 'Register Face' : 'Face Scan';
  const subtitle = isRegister
    ? 'We will register your face for quick login.'
    : 'Align your face inside the circle.';

  const captureLabel = isRegister ? 'Register face' : 'Scan face';

  const handleScan = useCallback(async () => {
    if (scanning || !cameraReady) return;
    setScanning(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.75,
        base64: true,
        skipProcessing: true,
      });

      if (!photo?.base64) {
        throw new Error('Unable to capture the image. Please try again.');
      }

      const imageData = `data:image/jpeg;base64,${photo.base64}`;

      if (isRegister) {
        const token = await getValidToken();
        if (!token) {
          Alert.alert(
            'Sign in required',
            'Please sign in before registering your face.'
          );
          router.replace('/account-login');
          return;
        }

        const res = await fetch(`${BASE_URL}/auth/face-register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ image: imageData, model: 'Facenet512' }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Face registration failed.');
        }

        await AsyncStorage.setItem(FACE_REGISTERED_KEY, 'true');
        Alert.alert('Face registered', 'You can now sign in with Face scan.', [
          { text: 'Done', onPress: () => router.back() },
        ]);
        return;
      }

      const res = await fetch(`${BASE_URL}/auth/face-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Face not recognized.');
      }

      if (data.pending) {
        Alert.alert(
          'Account pending',
          'Your account is still pending verification. Please contact admin.'
        );
        router.replace('/account-login');
        return;
      }

      const accessToken = data.token || data.access;
      const refreshToken = data.refreshToken || data.refresh;
      if (accessToken || refreshToken) {
        await storeTokens({ accessToken, refreshToken });
      }
      if (data.user) {
        await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.user));
      }

      router.replace('/home-dashboard');
    } catch (error) {
      console.error('Face scan error:', error);
      Alert.alert('Face Scan Failed', error.message || 'Please try again.');
    } finally {
      setScanning(false);
    }
  }, [cameraReady, isRegister, router, scanning]);

  const permissionReady = useMemo(() => Boolean(permission), [permission]);

  if (!permissionReady) {
    return (
      <View style={styles.permissionContainer}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionSubtitle}>
          Enable camera access to complete face scan.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Allow camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#fff7ed', '#ffffff']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.ringWrapper}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="#D1D5DB"
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="#22C55E"
              strokeWidth={RING_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${RING_ARC} ${RING_CIRCUMFERENCE}`}
              rotation="-90"
              origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
            />
          </Svg>
          <View style={styles.cameraPreview}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFillObject}
              facing="front"
              onCameraReady={() => setCameraReady(true)}
            />
            {scanning ? (
              <View style={styles.scanOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.scanOverlayText}>Scanning...</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={styles.promptTitle}>Hold phone upright</Text>
        <Text style={styles.promptSubtitle}>{subtitle}</Text>

        <TouchableOpacity
          style={[styles.scanButton, scanning && styles.scanButtonDisabled]}
          onPress={handleScan}
          disabled={scanning || !cameraReady}
        >
          {scanning ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.scanButtonText}>{captureLabel}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1E6',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ringWrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cameraPreview: {
    position: 'absolute',
    width: RING_SIZE - 26,
    height: RING_SIZE - 26,
    borderRadius: (RING_SIZE - 26) / 2,
    overflow: 'hidden',
    backgroundColor: '#111827',
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  scanOverlayText: {
    marginTop: 8,
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  promptTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  promptSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  scanButton: {
    backgroundColor: '#F97316',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  scanButtonDisabled: {
    opacity: 0.7,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#fff',
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  permissionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: '#F97316',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
