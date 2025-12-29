import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageTransition from '@/components/PageTransition';
import AuthCard from '@/components/auth/AuthCard';
import AuthPageShell, {
  AUTH_PAGE_DEFAULT_BACKGROUND,
} from '@/components/auth/AuthPageShell';
import AuthBrandIntro from '@/components/auth/AuthBrandIntro';
import { useAuth } from '@/components/AuthContext';

const STORAGE_KEY = 'login_otp_context';
const DIGIT_COUNT = 6;

const maskEmail = (email = '') => {
  const [name = '', domain = ''] = email.split('@');
  if (!domain) return email;
  if (name.length <= 2) return `${name.slice(0, 1)}***@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
};

const formatCountdown = (ms) => {
  if (!ms || ms <= 0) return 'Expired';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
};

const OtpVerificationPage = () => {
  const { verifyLoginOtp, resendLoginOtp } = useAuth();
  const navigate = useNavigate();

  const alertRef = useRef(null);
  const inputRefs = useRef(Array(DIGIT_COUNT).fill(null));
  const lastSubmittedRef = useRef('');

  const [context, setContext] = useState(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [digits, setDigits] = useState(() => Array(DIGIT_COUNT).fill(''));
  const [pending, setPending] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const expiresAt = context?.expiresAt ? Number(context.expiresAt) : null;
  const [remaining, setRemaining] = useState(() =>
    expiresAt ? Math.max(0, expiresAt - Date.now()) : null
  );

  const code = useMemo(() => digits.join(''), [digits]);

  const expired = useMemo(() => {
    if (!expiresAt) return false;
    return Date.now() >= expiresAt;
  }, [expiresAt]);

  useEffect(() => {
    if (!context?.otpToken) {
      navigate('/login', { replace: true });
    }
  }, [context, navigate]);

  useEffect(() => {
    if (!expiresAt) return undefined;
    const tick = () => setRemaining(Math.max(0, expiresAt - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const moveFocus = useCallback((index) => {
    const target = inputRefs.current?.[index];
    if (target) {
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
      target.select?.();
    }
  }, []);

  useEffect(() => {
    if (!expired && context?.otpToken) {
      moveFocus(0);
    }
  }, [context, expired, moveFocus]);

  useEffect(() => {
    if ((error || info) && alertRef.current) {
      alertRef.current.focus();
    }
  }, [error, info]);

  const handleDigitInput = useCallback(
    (index, value) => {
      if (pending || resendPending || expired) return;
      const sanitized = value.replace(/\D/g, '');
      setDigits((prev) => {
        const next = [...prev];
        next[index] = sanitized ? sanitized.slice(-1) : '';
        return next;
      });
      if (sanitized) {
        moveFocus(Math.min(DIGIT_COUNT - 1, index + 1));
      }
    },
    [expired, moveFocus, pending, resendPending]
  );

  const handleKeyDown = useCallback(
    (index, event) => {
      if (event.key === 'Backspace' && !digits[index]) {
        event.preventDefault();
        handleDigitInput(index, '');
        moveFocus(Math.max(0, index - 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveFocus(Math.max(0, index - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveFocus(Math.min(DIGIT_COUNT - 1, index + 1));
      }
    },
    [digits, handleDigitInput, moveFocus]
  );

  const handlePaste = useCallback(
    (event) => {
      event.preventDefault();
      if (pending || resendPending || expired) return;
      const pasted = event.clipboardData?.getData('text') ?? '';
      if (!pasted) return;
      const numeric = pasted.replace(/\D/g, '').slice(0, DIGIT_COUNT).split('');
      if (!numeric.length) return;
      setDigits((prev) => {
        const next = [...prev];
        numeric.forEach((digit, idx) => {
          next[idx] = digit;
        });
        return next;
      });
      moveFocus(Math.min(DIGIT_COUNT - 1, numeric.length));
    },
    [expired, moveFocus, pending, resendPending]
  );

  const verifyCode = useCallback(async () => {
    if (pending || resendPending) return;
    if (expired) {
      setError('The code has expired. Please request a new one.');
      return;
    }
    if (!context?.otpToken) {
      setError('Session expired. Please log in again.');
      return;
    }
    if (code.length !== DIGIT_COUNT) return;
    if (code === lastSubmittedRef.current) return;

    lastSubmittedRef.current = code;
    setPending(true);
    setError('');
    setInfo('');
    try {
      const res = await verifyLoginOtp({
        email: context.email,
        otpToken: context.otpToken,
        code,
        remember: context.remember,
      });
      if (!res?.success) {
        setError(res?.message || res?.error || 'Invalid or expired code.');
        return;
      }
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
      navigate('/');
    } catch (err) {
      setError(err?.message || 'Verification failed. Try again.');
    } finally {
      setPending(false);
    }
  }, [
    code,
    context,
    expired,
    navigate,
    pending,
    resendPending,
    verifyLoginOtp,
  ]);

  useEffect(() => {
    if (code.length !== DIGIT_COUNT) return undefined;
    if (pending || resendPending) return undefined;
    if (code === lastSubmittedRef.current) return undefined;
    if (code === lastSubmittedRef.current) return undefined;

    const id = window.setTimeout(() => {
      verifyCode();
    }, 150);

    return () => window.clearTimeout(id);
  }, [code, pending, resendPending, verifyCode]);

  const handleResend = useCallback(async () => {
    if (!context?.otpToken || resendPending) return;
    setError('');
    setInfo('');
    setResendPending(true);
    try {
      const res = await resendLoginOtp({
        email: context.email,
        otpToken: context.otpToken,
        remember: context.remember,
      });
      if (!res?.success || !res?.otpToken) {
        setError(res?.message || res?.error || 'Could not resend the code.');
        return;
      }
      const ttlSeconds = Math.max(30, Number(res.expiresIn || 0));
      const updated = {
        ...context,
        otpToken: res.otpToken,
        expiresAt: Date.now() + ttlSeconds * 1000,
      };
      setContext(updated);
      setDigits(Array(DIGIT_COUNT).fill(''));
      lastSubmittedRef.current = '';
      setRemaining(ttlSeconds * 1000);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      setInfo('A new code was sent to your email.');
      moveFocus(0);
    } catch (err) {
      setError(err?.message || 'Could not resend the code.');
    } finally {
      setResendPending(false);
    }
  }, [context, moveFocus, resendLoginOtp, resendPending]);

  const handleBack = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
    navigate('/login');
  }, [navigate]);

  const otpCard = (
    <AuthCard
      title="Verify your login"
      compact
      className="mx-auto"
      cardClassName="shadow-2xl"
    >
      <p className="text-sm text-gray-600 mb-4">
        Enter the 6-digit code we sent to{' '}
        <span className="font-medium">{maskEmail(context?.email || '')}</span>.
      </p>
      {expiresAt && (
        <p className="text-xs text-gray-500 mb-4">
          Code expires in {formatCountdown(remaining)}
        </p>
      )}

      {(error || info) && (
        <div
          className={`p-3 mb-4 rounded-lg text-sm ${
            info ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
          role="alert"
          tabIndex={-1}
          ref={alertRef}
        >
          {info || error}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          verifyCode();
        }}
        className="space-y-3"
        noValidate
        aria-busy={pending || resendPending || undefined}
      >
        <div className="flex justify-between gap-2" onPaste={handlePaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputRefs.current[index] = element;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              aria-label={`Digit ${index + 1}`}
              value={digit}
              onChange={(event) => handleDigitInput(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              disabled={pending || resendPending || expired}
              maxLength={1}
              className="w-12 h-12 text-center text-xl font-semibold border border-gray-300 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
            />
          ))}
        </div>
        {pending && (
          <p className="text-xs text-gray-500 text-center">Verifying...</p>
        )}
        {resendPending && (
          <p className="text-xs text-gray-500 text-center">
            Sending new code...
          </p>
        )}
      </form>

      {expired && (
        <p className="text-xs text-red-600 mt-3">
          The code has expired. Return to the login page to request a new one.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleBack}
          className="text-primary underline underline-offset-2"
        >
          Back to Login
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={pending || resendPending || expired}
          className="text-primary hover:text-primary-dark disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Resend Code
        </button>
      </div>
    </AuthCard>
  );

  const otpIntro = (
    <AuthBrandIntro
      title="Secure verification"
      description="Enter the one-time passcode so we can confirm it's really you."
    />
  );

  return (
    <PageTransition>
      <AuthPageShell
        backgroundImage={AUTH_PAGE_DEFAULT_BACKGROUND}
        waveImage="/images/b1bc6b54-fe3f-45eb-8a39-005cc575deef.png"
        formWrapperClassName="max-w-md mr-auto md:mr-[min(8rem,14vw)] md:ml-0"
        formSlot={otpCard}
        asideSlot={otpIntro}
      />
    </PageTransition>
  );
};

export default OtpVerificationPage;
