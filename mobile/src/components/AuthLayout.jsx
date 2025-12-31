import React from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

/**
 * Shared layout for all authentication-related screens.
 *
 * - Uses a full-screen container without safe-area padding
 * - Adds KeyboardAvoidingView to prevent inputs from being hidden by the keyboard
 * - Applies Tailwind background color (peach-50, from your tailwind config)
 */
export default function AuthLayout({ children }) {
  return (
    <View className="bg-peach-50 flex-1">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}
