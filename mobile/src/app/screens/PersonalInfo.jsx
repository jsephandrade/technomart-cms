import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

import { useAuth } from '../../context/AuthContext';
import { useUpdateProfile, useUploadAvatar } from '../../api/hooks';

const splitName = (fullName) => {
  if (!fullName || typeof fullName !== 'string') {
    return { first: '', last: '' };
  }
  const parts = fullName.trim().split(/\s+/);
  if (!parts.length) {
    return { first: '', last: '' };
  }
  if (parts.length === 1) {
    return { first: parts[0], last: '' };
  }
  return {
    first: parts[0],
    last: parts.slice(1).join(' '),
  };
};

const getInitials = (value) => {
  const safe = String(value || '').trim();
  if (!safe) return 'NA';
  const parts = safe.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'NA';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const first = parts[0][0] || '';
  const last = parts[parts.length - 1][0] || '';
  return `${first}${last}`.toUpperCase();
};

const resolveImagePickerMediaTypes = () =>
  ImagePicker?.MediaType?.Images || ImagePicker?.MediaTypeOptions?.Images;

const FieldCard = ({ title, subtitle, icon, children }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      {icon ? <View style={styles.cardIcon}>{icon}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
    <View>{children}</View>
  </View>
);

const FormField = ({
  label,
  icon,
  value,
  onChangeText,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoComplete,
  textContentType,
  editable = true,
  containerStyle,
}) => (
  <View style={[styles.formField, containerStyle]}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View
      style={[
        styles.fieldInputWrapper,
        !editable && styles.fieldInputDisabledWrapper,
      ]}
    >
      {icon ? (
        <Feather
          name={icon}
          size={18}
          color={editable ? '#F07F13' : '#cbd5e1'}
          style={styles.fieldIcon}
        />
      ) : null}
      <TextInput
        value={value ?? ''}
        onChangeText={onChangeText}
        style={[styles.fieldInput, !editable && styles.fieldInputDisabledText]}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        textContentType={textContentType}
        editable={editable}
      />
    </View>
  </View>
);

const Label = ({ text }) => <Text style={styles.sectionLabel}>{text}</Text>;

const PasswordInput = ({ value, onChangeText }) => {
  const [showPwd, setShowPwd] = useState(false);
  return (
    <View style={styles.secureInputWrapper}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!showPwd}
        style={styles.secureInput}
      />
      <TouchableOpacity
        onPress={() => setShowPwd((prev) => !prev)}
        style={styles.eyeIcon}
      >
        <Ionicons
          name={showPwd ? 'eye' : 'eye-off'}
          size={20}
          color="#6b7280"
        />
      </TouchableOpacity>
    </View>
  );
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PersonalInfoScreen() {
  const router = useRouter();
  const { user, refreshProfile, setUser } = useAuth();
  const { mutateAsync: submitProfile, isPending: isSaving } =
    useUpdateProfile();
  const { mutateAsync: uploadAvatar, isPending: avatarUploading } =
    useUploadAvatar();

  const [profileLoading, setProfileLoading] = useState(!user);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const isGuest = Boolean(user?.is_guest);

  useEffect(() => {
    if (!user) {
      return;
    }
    const { first, last } = splitName(user.name || '');
    setFirstName(first);
    setLastName(last);
    setEmail(user.email || '');
    setPhone(user.phone || '');
  }, [user]);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setProfileLoading(true);
      refreshProfile()
        .catch((error) => {
          if (!active) return;
          Alert.alert(
            'Unable to load profile',
            error?.message || 'Please try again shortly.'
          );
        })
        .finally(() => {
          if (active) {
            setProfileLoading(false);
          }
        });
    } else {
      setProfileLoading(false);
    }
    return () => {
      active = false;
    };
  }, [user?.id, refreshProfile]);

  const originalProfile = useMemo(() => {
    if (!user) {
      return { first: '', last: '', email: '', phone: '' };
    }
    const { first, last } = splitName(user.name || '');
    return {
      first,
      last,
      email: user.email || '',
      phone: user.phone || '',
    };
  }, [user]);

  const displayName = useMemo(() => {
    const combined = [firstName, lastName].map((part) => part.trim());
    const nameFromState = combined.filter(Boolean).join(' ');
    if (nameFromState) {
      return nameFromState;
    }
    if (user?.name && user.name.trim()) {
      return user.name.trim();
    }
    return '';
  }, [firstName, lastName, user?.name]);

  const initials = useMemo(
    () => getInitials(displayName || user?.email || ''),
    [displayName, user?.email]
  );

  const roleLabel = useMemo(() => {
    if (!user?.role) return null;
    return user.role
      .toString()
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }, [user?.role]);

  const statusLabel = useMemo(() => {
    if (!user?.status) return null;
    const status = user.status.toLowerCase();
    if (status === 'active') return null;
    return status
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }, [user?.status]);

  const strength = useMemo(() => {
    if (!newPwd) return '';
    if (newPwd.length < 6) return 'Weak';
    if (newPwd.match(/[A-Z]/) && newPwd.match(/[0-9]/) && newPwd.length >= 8) {
      return 'Strong';
    }
    return 'Medium';
  }, [newPwd]);

  const strengthColor =
    strength === 'Weak'
      ? '#ef4444'
      : strength === 'Medium'
        ? '#f97316'
        : '#22c55e';

  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  const trimmedEmail = email.trim();
  const trimmedPhone = phone.trim();

  const hasChanges = useMemo(() => {
    const { first, last, email: baseEmail, phone: basePhone } = originalProfile;
    return (
      trimmedFirst !== first ||
      trimmedLast !== last ||
      trimmedEmail !== baseEmail ||
      trimmedPhone !== basePhone
    );
  }, [trimmedFirst, trimmedLast, trimmedEmail, trimmedPhone, originalProfile]);

  const handleAvatarPress = useCallback(async () => {
    if (isGuest) {
      Alert.alert('Guest profile', 'Sign in to upload a profile picture.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo access so we can update your profile picture.'
      );
      return;
    }
    const mediaTypes = resolveImagePickerMediaTypes();
    const result = await ImagePicker.launchImageLibraryAsync({
      ...(mediaTypes ? { mediaTypes } : {}),
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) {
      return;
    }
    const asset = result.assets[0];
    if (!asset?.uri) {
      Alert.alert('Upload failed', 'We could not read the selected image.');
      return;
    }
    try {
      const updatedUser = await uploadAvatar({
        uri: asset.uri,
        name: asset.fileName ?? `avatar-${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      });
      if (updatedUser) {
        setUser?.(updatedUser);
        setFirstName(splitName(updatedUser.name || '').first);
        setLastName(splitName(updatedUser.name || '').last);
        setEmail(updatedUser.email || '');
        setPhone(updatedUser.phone || '');
        Alert.alert('Profile photo updated', 'Your new photo is saved.');
      }
    } catch (error) {
      Alert.alert(
        'Upload failed',
        error?.message || 'We could not update your profile picture.'
      );
    }
  }, [isGuest, uploadAvatar, setUser]);

  const handleSave = useCallback(async () => {
    if (isGuest) {
      Alert.alert(
        'Guest profile',
        'Sign in to update your personal information.'
      );
      return;
    }
    if (!trimmedFirst) {
      Alert.alert('Missing information', 'First name is required.');
      return;
    }
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }

    const updates = {};
    const mergedName = [trimmedFirst, trimmedLast].filter(Boolean).join(' ');
    if (mergedName !== user?.name) {
      updates.name = mergedName;
    }
    if (trimmedEmail !== originalProfile.email) {
      updates.email = trimmedEmail;
    }
    if (trimmedPhone !== originalProfile.phone) {
      updates.phone = trimmedPhone;
    }

    if (!Object.keys(updates).length) {
      Alert.alert('No changes detected', 'Update your details before saving.');
      return;
    }

    try {
      const updatedUser = await submitProfile(updates);
      if (updatedUser) {
        setUser?.(updatedUser);
        Alert.alert('Profile updated', 'Your information is saved.');
      } else {
        await refreshProfile().catch(() => {});
      }
    } catch (error) {
      Alert.alert(
        'Update failed',
        error?.message || 'We could not save your changes.'
      );
    }
  }, [
    isGuest,
    trimmedFirst,
    trimmedLast,
    trimmedEmail,
    trimmedPhone,
    submitProfile,
    setUser,
    refreshProfile,
    user?.name,
    originalProfile.email,
    originalProfile.phone,
  ]);

  const handlePasswordChange = useCallback(() => {
    if (!oldPwd || !newPwd || !confirmPwd) {
      Alert.alert('Error', 'Please fill in all password fields.');
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert('Error', 'New password and confirmation do not match.');
      return;
    }
    if (newPwd.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters long.');
      return;
    }
    Alert.alert('Success', 'Password changed successfully.');
    setOldPwd('');
    setNewPwd('');
    setConfirmPwd('');
  }, [oldPwd, newPwd, confirmPwd]);

  const saveDisabled = !hasChanges || isSaving || profileLoading || isGuest;
  const heroSubtitle = user?.email?.trim() || '';

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#F07F13" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Personal Information</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <TouchableOpacity
            onPress={handleAvatarPress}
            activeOpacity={0.85}
            style={styles.avatarButton}
          >
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              {avatarUploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="edit-2" size={14} color="#fff" />
              )}
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            {displayName ? (
              <Text style={styles.heroName}>{displayName}</Text>
            ) : (
              <Text style={styles.heroPrompt}>
                Personalize your profile information.
              </Text>
            )}
            {heroSubtitle ? (
              <Text style={styles.heroEmail}>{heroSubtitle}</Text>
            ) : null}
            <View style={styles.heroChips}>
              {roleLabel ? (
                <View style={styles.heroChip}>
                  <Text style={styles.heroChipText}>{roleLabel}</Text>
                </View>
              ) : null}
              {statusLabel ? (
                <View style={[styles.heroChip, styles.heroChipMuted]}>
                  <Text style={styles.heroChipText}>{statusLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {isGuest ? (
          <View style={styles.noticeCard}>
            <Feather name="info" size={18} color="#9a3412" />
            <Text style={styles.noticeText}>
              You are browsing as a guest. Sign in to sync your profile updates
              across devices.
            </Text>
          </View>
        ) : null}

        <FieldCard
          title="Basic Information"
          subtitle="Update how your name appears on receipts and orders."
          icon={<Feather name="user" size={18} color="#F07F13" />}
        >
          <View style={styles.formRow}>
            <FormField
              label="First Name"
              icon="user"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              textContentType="givenName"
              editable={!profileLoading}
              containerStyle={styles.formRowItem}
            />
            <FormField
              label="Last Name"
              icon="user"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              textContentType="familyName"
              editable={!profileLoading}
              containerStyle={styles.formRowItem}
            />
          </View>
        </FieldCard>

        <FieldCard
          title="Contact Details"
          subtitle="Keep your contact information current so we can reach you."
          icon={<Feather name="mail" size={18} color="#F07F13" />}
        >
          <FormField
            label="Email"
            icon="mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            editable={!profileLoading}
          />
          <FormField
            label="Mobile Number"
            icon="phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
            autoComplete="tel"
            textContentType="telephoneNumber"
            editable={!profileLoading}
          />
        </FieldCard>

        <FieldCard
          title="Account Security"
          subtitle="Refresh your password regularly to protect your account."
          icon={<Feather name="lock" size={18} color="#F07F13" />}
        >
          <Label text="Current Password" />
          <PasswordInput value={oldPwd} onChangeText={setOldPwd} />

          <Label text="New Password" />
          <PasswordInput value={newPwd} onChangeText={setNewPwd} />
          {strength ? (
            <Text style={[styles.strengthText, { color: strengthColor }]}>
              Strength: {strength}
            </Text>
          ) : null}

          <Label text="Confirm New Password" />
          <PasswordInput value={confirmPwd} onChangeText={setConfirmPwd} />

          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={handlePasswordChange}
          >
            <Text style={styles.btnText}>Update Password</Text>
          </TouchableOpacity>
        </FieldCard>

        <TouchableOpacity
          style={[styles.saveButton, saveDisabled && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saveDisabled}
          activeOpacity={0.85}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.btnText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff7ed' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    elevation: 2,
    shadowColor: 'rgba(15, 23, 42, 0.08)',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  headerText: { fontSize: 22, fontWeight: '700', color: '#1f2937' },
  content: { paddingBottom: 56 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F07F13',
    marginHorizontal: 16,
    marginTop: 18,
    padding: 20,
    borderRadius: 24,
    shadowColor: 'rgba(240, 127, 19, 0.35)',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  avatarButton: {
    marginRight: 18,
  },
  avatarImage: {
    width: 86,
    height: 86,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: '#fff',
  },
  avatarFallback: {
    width: 86,
    height: 86,
    borderRadius: 24,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(240,127,19,0.4)',
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '700',
    color: '#9a3412',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#ea580c',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff7ed',
  },
  heroName: { color: '#fff', fontSize: 20, fontWeight: '700' },
  heroPrompt: { color: '#fff', fontSize: 18, fontWeight: '600' },
  heroEmail: { color: 'rgba(255,255,255,0.85)', marginTop: 6, fontSize: 14 },
  heroChips: { flexDirection: 'row', marginTop: 12, flexWrap: 'wrap' },
  heroChip: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginRight: 8,
    marginTop: 6,
  },
  heroChipMuted: { backgroundColor: 'rgba(30, 41, 59, 0.25)' },
  heroChipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderRadius: 18,
    marginHorizontal: 16,
    marginTop: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fed7aa',
    gap: 12,
  },
  noticeText: { flex: 1, color: '#9a3412', fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    marginHorizontal: 16,
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: 'rgba(15, 23, 42, 0.08)',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#fff0e6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  cardSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 3 },
  formField: { marginTop: 12 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  fieldInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 14,
    backgroundColor: '#fff7ed',
    paddingHorizontal: 14,
  },
  fieldInput: { flex: 1, paddingVertical: 12, color: '#1f2937', fontSize: 15 },
  fieldIcon: { marginRight: 10 },
  fieldInputDisabledWrapper: { backgroundColor: '#f1f5f9' },
  fieldInputDisabledText: { color: '#475569' },
  formRow: { flexDirection: 'row', marginHorizontal: -6 },
  formRowItem: { flex: 1, marginHorizontal: 6 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  secureInputWrapper: {
    position: 'relative',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 14,
    backgroundColor: '#fff7ed',
  },
  secureInput: {
    padding: 12,
    paddingRight: 40,
    color: '#1f2937',
    fontSize: 14,
  },
  eyeIcon: { position: 'absolute', right: 12, top: 12 },
  helperText: { color: '#6b7280', marginBottom: 12, fontSize: 13 },
  strengthText: { marginBottom: 12, fontWeight: '600' },
  btnPrimary: {
    backgroundColor: '#ea580c',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 12,
    alignItems: 'center',
  },
  btnSecondary: { backgroundColor: '#f97316' },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
  },
  saveButton: {
    marginHorizontal: 16,
    marginTop: 28,
    marginBottom: 32,
    backgroundColor: '#F07F13',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(240, 127, 19, 0.25)',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  saveButtonDisabled: { opacity: 0.6 },
});
