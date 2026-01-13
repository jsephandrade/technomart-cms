import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_700Bold,
  Roboto_900Black,
} from '@expo-google-fonts/roboto';
import { registerAccount } from '../api/api';
import { useRegistration } from '../context/RegistrationContext';

export default function AccountCaptureIdScreen() {
  const router = useRouter();
  const { draft, clearDraft } = useRegistration();
  const [frontPhoto, setFrontPhoto] = useState(null);
  const [backPhoto, setBackPhoto] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const requestCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera Required',
        'Please enable camera access to capture your ID.'
      );
      return false;
    }
    return true;
  };

  const handleCapture = async (side) => {
    const ok = await requestCamera();
    if (!ok) return;

    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.7,
    });

    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.base64) {
      Alert.alert('Capture Failed', 'Please try capturing your ID again.');
      return;
    }

    if (side === 'front') {
      setFrontPhoto(asset);
      setErrors((prev) => ({ ...prev, front: '' }));
    } else {
      setBackPhoto(asset);
      setErrors((prev) => ({ ...prev, back: '' }));
    }
  };

  const toDataUrl = (asset) => {
    if (!asset?.base64) return '';
    const mime = asset?.mimeType || 'image/jpeg';
    return `data:${mime};base64,${asset.base64}`;
  };

  const validate = () => {
    const next = {};
    if (!frontPhoto?.base64) next.front = 'Front ID photo is required';
    if (!backPhoto?.base64) next.back = 'Back ID photo is required';
    return next;
  };

  const handleSubmit = async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (!draft) {
      Alert.alert('Missing details', 'Please complete registration first.');
      router.replace('/account-registration');
      return;
    }

    setLoading(true);
    try {
      const result = await registerAccount({
        ...draft,
        id_front: toDataUrl(frontPhoto),
        id_back: toDataUrl(backPhoto),
      });

      if (result.success) {
        clearDraft();
        router.push('/account-pending-approval');
        return;
      }

      if (result.errors) {
        setErrors({
          front: result.errors.id_front || result.errors.id_image || '',
          back: result.errors.id_back || '',
        });
        return;
      }

      Alert.alert('Error', result.message || 'Failed to create account.');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
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

  if (!draft) {
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
        <View style={styles.missingContainer}>
          <View style={styles.missingCard}>
            <Text style={styles.title}>Capture ID Photo</Text>
            <Text style={styles.subtitle}>
              Registration details are missing. Please restart signup.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.replace('/account-registration')}
            >
              <Text style={styles.primaryButtonText}>Back to Signup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    );
  }

  const canSubmit = Boolean(frontPhoto?.base64 && backPhoto?.base64);

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
      <View style={styles.container}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.card}>
          <Text style={styles.title}>Capture ID Photo</Text>
          <Text style={styles.subtitle}>
            Upload clear photos of the front and back of your ID.
          </Text>

          <View
            style={[
              styles.idUploadCard,
              errors.front && styles.inputWrapperError,
            ]}
          >
            <Text style={styles.idLabel}>Front of ID</Text>
            {frontPhoto?.uri ? (
              <Image
                source={{ uri: frontPhoto.uri }}
                style={styles.idPreview}
              />
            ) : (
              <View style={styles.idPlaceholder}>
                <MaterialCommunityIcons
                  name="card-account-details-outline"
                  size={28}
                  color="#9CA3AF"
                />
                <Text style={styles.idPlaceholderText}>
                  Capture the front of your ID
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.idCaptureButton}
              onPress={() => handleCapture('front')}
            >
              <MaterialCommunityIcons
                name="camera-outline"
                size={18}
                color="#fff"
              />
              <Text style={styles.idCaptureButtonText}>
                {frontPhoto?.uri ? 'Retake Front' : 'Capture Front'}
              </Text>
            </TouchableOpacity>
          </View>
          {errors.front ? (
            <Text style={styles.errorText}>{formatError(errors.front)}</Text>
          ) : null}

          <View
            style={[
              styles.idUploadCard,
              errors.back && styles.inputWrapperError,
            ]}
          >
            <Text style={styles.idLabel}>Back of ID</Text>
            {backPhoto?.uri ? (
              <Image source={{ uri: backPhoto.uri }} style={styles.idPreview} />
            ) : (
              <View style={styles.idPlaceholder}>
                <MaterialCommunityIcons
                  name="card-account-details-outline"
                  size={28}
                  color="#9CA3AF"
                />
                <Text style={styles.idPlaceholderText}>
                  Capture the back of your ID
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.idCaptureButton}
              onPress={() => handleCapture('back')}
            >
              <MaterialCommunityIcons
                name="camera-outline"
                size={18}
                color="#fff"
              />
              <Text style={styles.idCaptureButtonText}>
                {backPhoto?.uri ? 'Retake Back' : 'Capture Back'}
              </Text>
            </TouchableOpacity>
          </View>
          {errors.back ? (
            <Text style={styles.errorText}>{formatError(errors.back)}</Text>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.back()}
              disabled={loading}
            >
              <Ionicons name="arrow-back" size={18} color="#9A3412" />
              <Text style={styles.secondaryButtonText}>Back to Signup</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!canSubmit || loading) && styles.primaryButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <View style={styles.primaryContent}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color="#fff"
                  />
                  <Text style={styles.primaryButtonText}>Continue</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
  },
  missingContainer: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 85, height: 85, marginTop: 12, marginBottom: 8 },
  title: {
    fontSize: 26,
    fontFamily: 'Roboto_900Black',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
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
  missingCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    padding: 22,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,140,0,0.12)',
  },
  idUploadCard: {
    borderWidth: 1,
    borderColor: '#F3D6B7',
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#FFF7ED',
    marginBottom: 10,
  },
  idLabel: {
    fontSize: 14,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
    marginBottom: 8,
  },
  idPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  idPlaceholderText: {
    color: '#6B7280',
    fontSize: 12,
    fontFamily: 'Roboto_400Regular',
    textAlign: 'center',
  },
  idPreview: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    marginBottom: 10,
  },
  idCaptureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F97316',
    paddingVertical: 10,
    borderRadius: 12,
  },
  idCaptureButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Roboto_700Bold',
  },
  actions: {
    marginTop: 8,
    gap: 12,
  },
  secondaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#F3D6B7',
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: '#FFF7ED',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: 'Roboto_700Bold',
    color: '#9A3412',
  },
  primaryButton: {
    backgroundColor: '#FF8C00',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
  },
  errorText: {
    color: '#DC2626',
    alignSelf: 'flex-start',
    marginBottom: 10,
    marginLeft: 5,
    fontSize: 13,
  },
  inputWrapperError: {
    borderColor: '#EF4444',
  },
});
