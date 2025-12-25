import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Settings, User, Shield, Scan } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/components/AuthContext';
import { toast } from 'sonner';
import authService from '@/api/services/authService';
import userService from '@/api/services/userService';
// Minimal password rule only (no strength meter)
const SettingsPage = () => {
  const { user, updateProfile } = useAuth();
  const [faceEnabled, setFaceEnabled] = useState(false);

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [currentError, setCurrentError] = useState('');
  const [newError, setNewError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  // Profile settings state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [profilePending, setProfilePending] = useState(false);
  const [disablePending, setDisablePending] = useState(false);

  useEffect(() => {
    try {
      // Initialize profile fields from current user
      if (user) {
        const fullName = user.name || '';
        const parts = fullName.trim().split(/\s+/);
        setFirstName(parts.slice(0, -1).join(' ') || parts[0] || '');
        setLastName(parts.length > 1 ? parts.slice(-1).join(' ') : '');
        setEmail(user.email || '');
        setContactNumber(user.phone || user.contactNumber || '');
      }
      // Compute faceEnabled from user flag OR persisted flags
      const ls =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('face_enabled')
          : null;
      const ss =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem('face_enabled')
          : null;
      const enabledFromStorage = ls === '1' || ss === '1';
      const enabledFromUser = Boolean(
        user && typeof user.faceEnabled !== 'undefined' && user.faceEnabled
      );
      setFaceEnabled(enabledFromUser || enabledFromStorage);
    } catch {
      setFaceEnabled(false);
    }
  }, [user]);

  const validatePasswords = () => {
    let ok = true;
    setCurrentError('');
    setNewError('');
    setConfirmError('');
    if (!currentPassword) {
      setCurrentError('Current password is required.');
      ok = false;
    }
    if (!newPassword) {
      setNewError('New password is required.');
      ok = false;
    } else if (newPassword.length < 8) {
      setNewError('Password must be at least 8 characters.');
      ok = false;
    }
    if (!confirmPassword) {
      setConfirmError('Please confirm your new password.');
      ok = false;
    } else if (newPassword && confirmPassword !== newPassword) {
      setConfirmError('Passwords do not match.');
      ok = false;
    }
    return ok;
  };

  const handleChangePassword = async () => {
    if (pending) return;
    if (!validatePasswords()) return;
    setPending(true);
    try {
      const res = await authService.changePassword(
        currentPassword,
        newPassword
      );
      if (res?.success) {
        toast.success('Password updated', {
          description: 'Your password has been changed.',
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error('Change password failed', {
          description:
            res?.message ||
            'Please verify your current password and try again.',
        });
      }
    } catch (err) {
      toast.error('Change password failed', {
        description: err?.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setPending(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id || profilePending) return;
    const name = `${firstName} ${lastName}`.trim();
    const updates = { name, email, phone: contactNumber };
    setProfilePending(true);
    try {
      const res = await userService.updateUser(user.id, updates);
      if (!res?.success) throw new Error(res?.message || 'Update failed');
      await updateProfile({ ...updates });
      toast.success('Profile updated', {
        description: 'Your account details have been saved.',
      });
    } catch (err) {
      toast.error('Update failed', {
        description: err?.message || 'Could not save profile changes.',
      });
    } finally {
      setProfilePending(false);
    }
  };

  const handleDisableFace = async () => {
    if (disablePending) return;
    setDisablePending(true);
    try {
      const res = await authService.unregisterFace();
      if (!res?.success) throw new Error(res?.message || 'Request failed');
      try {
        if (typeof localStorage !== 'undefined')
          localStorage.removeItem('face_enabled');
        if (typeof sessionStorage !== 'undefined')
          sessionStorage.removeItem('face_enabled');
      } catch {}
      await updateProfile({ faceEnabled: false });
      setFaceEnabled(false);
      toast.success('Face login disabled', {
        description: 'Your face data has been removed.',
      });
    } catch (err) {
      toast.error('Failed to disable', {
        description: err?.message || 'Could not disable face login.',
      });
    } finally {
      setDisablePending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <div className="grid gap-6">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Profile Settings</span>
            </CardTitle>
            <CardDescription>
              Manage your account information and preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter your first name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter your last name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactNumber">Contact Number</Label>
              <Input
                id="contactNumber"
                type="tel"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="Enter your contact number"
              />
            </div>
            <Button onClick={handleSaveProfile} disabled={profilePending}>
              {profilePending ? 'Saving…' : 'Save Profile Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>Security Settings</span>
            </CardTitle>
            <CardDescription>
              Manage your account security and privacy
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              {currentError && (
                <p className="text-xs text-destructive">{currentError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The password should be at least 8 characters.
              </p>
              {newError && (
                <p className="text-xs text-destructive">{newError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {confirmError && (
                <p className="text-xs text-destructive">{confirmError}</p>
              )}
            </div>
            <Button
              variant="outline"
              onClick={handleChangePassword}
              disabled={
                pending ||
                !currentPassword ||
                !newPassword ||
                newPassword.length < 8 ||
                !confirmPassword ||
                confirmPassword !== newPassword
              }
            >
              {pending ? 'Updating…' : 'Change Password'}
            </Button>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Label>Face Recognition Login</Label>
                  {faceEnabled ? (
                    <Badge variant="secondary">Registered</Badge>
                  ) : (
                    <Badge variant="outline">Not Registered</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {faceEnabled
                    ? 'Face scan is set up. You can re-register to update your template.'
                    : 'Set up face scan for quick and secure login'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/face-registration">
                  <Button variant="outline" size="sm">
                    <Scan className="w-4 h-4 mr-2" />
                    {faceEnabled ? 'Manage Face Scan' : 'Setup Face Scan'}
                  </Button>
                </Link>
                {faceEnabled && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisableFace}
                    disabled={disablePending}
                  >
                    {disablePending ? 'Removing…' : 'Disable Face Login'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appearance Settings */}
      </div>
    </div>
  );
};

export default SettingsPage;
