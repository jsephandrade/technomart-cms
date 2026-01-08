import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthContext';
import { useNavigate } from 'react-router-dom';
import LoginForm from '@/components/auth/LoginForm';
import SocialProviders from '@/components/auth/SocialProviders';
import PageTransition from '@/components/PageTransition';
import AuthCard from '@/components/auth/AuthCard';
import AuthPageShell, {
  AUTH_PAGE_DEFAULT_BACKGROUND,
} from '@/components/auth/AuthPageShell';
import AuthBrandIntro from '@/components/auth/AuthBrandIntro';
import { signInWithGoogle } from '@/lib/google';
import {
  getRememberedEmail,
  rememberEmail,
  clearRememberedEmail,
} from '@/lib/credentials';
import { getMutedUser } from '@/lib/mutedUsers';

const PASSWORD_MISMATCH_MESSAGE = 'Invalid email or password.';
const PENDING_APPROVAL_MESSAGE = 'Your account is still pending for approval.';

const isPasswordMismatchError = (result) => {
  const status = result?.status ?? null;
  if (!result || (status !== 401 && status !== 404)) return false;
  const raw = result?.error || result?.message || '';
  const code = result?.code || '';

  const normalize = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    try {
      return String(value);
    } catch {
      return '';
    }
  };

  const rawMessage = normalize(raw);
  if (
    /invalid credential/i.test(rawMessage) ||
    /incorrect password/i.test(rawMessage) ||
    /invalid email or password/i.test(rawMessage)
  ) {
    return true;
  }

  if (
    typeof code === 'string' &&
    /invalid_credential|invalid_password/i.test(code)
  ) {
    return true;
  }

  const details = result?.details;
  if (typeof details === 'string') {
    return /invalid credential|incorrect password|invalid email or password/i.test(
      details
    );
  }
  if (details && typeof details === 'object') {
    const detailMessage = normalize(details.message || details.reason);
    if (detailMessage) {
      return /invalid credential|incorrect password|invalid email or password/i.test(
        detailMessage
      );
    }
  }

  return false;
};

const formatMuteUntil = (timestamp) => {
  if (!timestamp) return '';
  try {
    const dt = new Date(timestamp);
    if (Number.isNaN(dt.getTime())) return String(timestamp);
    return dt.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(timestamp);
  }
};

const LoginPage = () => {
  const { login, socialLogin, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    try {
      const savedEmail = getRememberedEmail();
      if (savedEmail) {
        setEmail(savedEmail);
        setRemember(true);
      }
    } catch {}
  }, []);

  const resolveLoginErrorMessage = (result) => {
    const status = result?.status ?? null;
    const raw = result?.error || result?.message || '';
    if (status === 401 || status === 404) {
      return PASSWORD_MISMATCH_MESSAGE;
    }
    if (status === 423) {
      if (typeof raw === 'string' && raw.trim()) return raw;
      return 'Too many attempts. Try again later.';
    }
    if (typeof raw === 'string') {
      if (/invalid credentials/i.test(raw)) return PASSWORD_MISMATCH_MESSAGE;
      return raw;
    }
    return raw || 'Something went wrong. Please try again.';
  };

  const applyAuthFailure = (result) => {
    const mismatch = isPasswordMismatchError(result);
    setPasswordError(mismatch ? PASSWORD_MISMATCH_MESSAGE : '');
    setError(resolveLoginErrorMessage(result));
  };

  const validate = () => {
    let ok = true;
    setEmailError('');
    setPasswordError('');
    if (!email) {
      setEmailError('Email is required.');
      ok = false;
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      setEmailError('Enter a valid email address.');
      ok = false;
    }
    if (!password) {
      setPasswordError('Password is required.');
      ok = false;
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      ok = false;
    }
    return ok;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pending) return;
    setInfo('');
    setError('');
    if (!validate()) return;

    const mutedRecord = getMutedUser(email);
    if (mutedRecord?.mutedUntil) {
      setPasswordError('');
      setError(
        `Your account has been muted for 24 hours due to suspicious activity. Try again after ${formatMuteUntil(
          mutedRecord.mutedUntil
        )}.`
      );
      return;
    }

    setPending(true);
    try {
      const res = await login(email, password, { remember });
      if (!res?.success) {
        applyAuthFailure(res);
        return;
      }

      if (res?.otpRequired) {
        sessionStorage.setItem(
          'login_otp_context',
          JSON.stringify({
            email,
            otpToken: res?.otpToken || '',
            remember,
            user: res?.user || null,
            expiresAt: Date.now() + (res?.otpExpiresIn || 60) * 1000,
          })
        );
        remember ? rememberEmail(email) : clearRememberedEmail();
        navigate('/otp');
        return;
      }

      if (
        res?.pending ||
        (res?.user?.status || '').toLowerCase() !== 'active'
      ) {
        const verifyToken = res?.verifyToken || '';
        setInfo(PENDING_APPROVAL_MESSAGE);
        sessionStorage.setItem('login_pending_note', PENDING_APPROVAL_MESSAGE);
        sessionStorage.setItem('pending_user', JSON.stringify(res.user || {}));
        sessionStorage.setItem('verify_token', verifyToken);
        navigate(verifyToken ? '/verify' : '/still-pending');
        return;
      }

      remember ? rememberEmail(email) : clearRememberedEmail();
      navigate('/');
    } catch (err) {
      applyAuthFailure({
        error: err?.message,
        status: err?.status ?? null,
        code: err?.code ?? null,
        details: err?.details ?? null,
      });
    } finally {
      setPending(false);
    }
  };

  const handleSocial = async (provider, payload) => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      if (provider === 'google-credential' || provider === 'google') {
        const credential =
          provider === 'google-credential' ? payload : await signInWithGoogle();
        const res = await loginWithGoogle(credential, { remember });
        if (!res?.success) throw new Error('Google login failed');
        const verifyToken = res?.verifyToken || '';
        if (verifyToken) {
          sessionStorage.setItem('verify_token', verifyToken);
          sessionStorage.setItem(
            'pending_user',
            JSON.stringify(res.user || {})
          );
          navigate('/verify');
          return;
        }
        if (
          res?.pending ||
          (res?.user?.status || '').toLowerCase() !== 'active'
        ) {
          sessionStorage.setItem(
            'login_pending_note',
            PENDING_APPROVAL_MESSAGE
          );
          sessionStorage.setItem(
            'pending_user',
            JSON.stringify(res.user || {})
          );
          sessionStorage.setItem('verify_token', '');
          navigate('/still-pending');
          return;
        }
      } else {
        await socialLogin(provider);
      }
      navigate('/');
    } catch (err) {
      setError(err?.message || 'Social login failed. Please try again.');
    } finally {
      setPending(false);
    }
  };

  const handleForgotPassword = () => {
    if (!pending) navigate('/forgot-password');
  };

  const loginCard = (
    <AuthCard
      title="Login"
      compact
      className="!max-w-full sm:!max-w-md lg:!max-w-lg"
      cardClassName="shadow-2xl lg:p-8"
    >
      <LoginForm
        email={email}
        password={password}
        pending={pending}
        info={info}
        error={error}
        emailError={emailError}
        passwordError={passwordError}
        remember={remember}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onRememberChange={setRemember}
        onForgotPassword={handleForgotPassword}
        onSubmit={handleSubmit}
      />
      <SocialProviders onSocial={handleSocial} pending={pending} />
      <p className="mt-6 text-xs sm:text-sm md:text-base text-gray-600 text-center leading-relaxed max-w-prose mx-auto px-2 sm:px-0">
        Don't have an account yet?{' '}
        <button
          onClick={() => navigate('/signup')}
          className="font-semibold text-primary hover:text-primary-dark disabled:opacity-60 text-xs sm:text-sm"
          type="button"
          disabled={pending}
        >
          Sign up now
        </button>
      </p>
    </AuthCard>
  );

  const welcomeIntro = (
    <AuthBrandIntro
      title="Welcome back"
      description="Sign in to manage orders, inventory, and your team for a smooth day at the canteen."
      className="w-full max-w-xl px-3 sm:px-6 lg:px-8"
      contentClassName="space-y-1 sm:space-y-3 text-center sm:text-left"
      titleClassName="text-[20px] sm:text-4xl"
      descriptionClassName="text-[9px] sm:text-sm"
    />
  );

  return (
    <PageTransition>
      <AuthPageShell
        backgroundImage={AUTH_PAGE_DEFAULT_BACKGROUND}
        waveImage="/images/b1bc6b54-fe3f-45eb-8a39-005cc575deef.png"
        paddingClassName="px-4 sm:px-6 lg:px-10 xl:px-16 py-10 sm:py-12 lg:py-16"
        gridClassName="gap-2 sm:gap-10 lg:gap-16"
        formWrapperClassName="order-2 md:order-1 w-full flex justify-center px-2 sm:px-4 md:px-0"
        asideWrapperClassName="order-1 md:order-2 mb-2 sm:mb-0 flex justify-center px-2 sm:px-4"
        formSlot={loginCard}
        asideSlot={welcomeIntro}
      />
    </PageTransition>
  );
};

export default LoginPage;
