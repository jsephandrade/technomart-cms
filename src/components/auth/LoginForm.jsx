import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Eye, EyeOff } from 'lucide-react';

const Spinner = () => (
  <svg
    className="animate-spin -ml-1 mr-3 h-4 w-4 sm:h-5 sm:w-5"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
    />
  </svg>
);

const LoginForm = ({
  email,
  password,
  pending,
  info,
  error,
  emailError,
  passwordError,
  remember = false,
  onEmailChange,
  onPasswordChange,
  onRememberChange,
  onSubmit,
  onForgotPassword,
}) => {
  const alertRef = useRef(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (error && alertRef.current) {
      alertRef.current.focus();
    }
  }, [error]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit?.(e);
  };

  return (
    <>
      {info && !error && (
        <div
          className="p-3 sm:p-4 mb-4 rounded-md text-xs sm:text-sm leading-relaxed bg-primary/10 text-primary"
          role="status"
        >
          {info}
        </div>
      )}
      {error && (
        <div
          className="p-3 sm:p-4 mb-4 bg-red-50 text-red-700 rounded-md text-xs sm:text-sm leading-relaxed"
          role="alert"
          tabIndex={-1}
          ref={alertRef}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 sm:space-y-5 lg:space-y-6"
        noValidate
        aria-busy={pending || undefined}
      >
        <div>
          <div className="relative">
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => onEmailChange?.(e.target.value)}
              placeholder=" "
              className="peer w-full h-12 sm:h-11 lg:h-12 px-3 sm:px-4 pt-3 pb-3 text-sm sm:text-base border border-gray-300 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary transition-all"
              required
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'email-error' : undefined}
              disabled={pending}
              autoFocus
            />
            <label
              htmlFor="email"
              className="absolute left-3 text-muted-foreground pointer-events-none transition-all
                top-0 -translate-y-1/2 text-[0.7rem] sm:text-xs px-1 bg-white
                peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:px-0
                peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:px-1 peer-focus:bg-white"
            >
              Email
            </label>
          </div>
          {emailError && (
            <p
              id="email-error"
              className="mt-1 text-xs sm:text-sm text-red-700"
            >
              {emailError}
            </p>
          )}
        </div>

        <div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => onPasswordChange?.(e.target.value)}
              placeholder=" "
              className="peer w-full h-12 sm:h-11 lg:h-12 px-3 sm:px-4 pt-3 pb-3 pr-10 sm:pr-12 text-sm sm:text-base border border-gray-300 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary transition-all"
              required
              autoComplete="current-password"
              aria-invalid={!!passwordError}
              aria-describedby={passwordError ? 'password-error' : undefined}
              disabled={pending}
              minLength={8}
            />
            <label
              htmlFor="password"
              className="absolute left-3 text-muted-foreground pointer-events-none transition-all
                top-0 -translate-y-1/2 text-[0.7rem] sm:text-xs px-1 bg-white
                peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:px-0
                peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:px-1 peer-focus:bg-white"
            >
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none disabled:opacity-50 p-2 sm:p-2.5"
              disabled={pending}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {!showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {passwordError && (
            <p
              id="password-error"
              className="mt-1 text-xs sm:text-sm text-red-700"
            >
              {passwordError}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              className="rounded border-gray-300 h-3.5 w-3.5 sm:h-4 sm:w-4"
              checked={!!remember}
              onChange={(e) => onRememberChange?.(e.target.checked)}
              disabled={pending}
            />
            <span className="text-xs sm:text-sm text-gray-700">
              Remember me
            </span>
          </label>

          <button
            type="button"
            className="text-[0.7rem] sm:text-xs text-primary underline underline-offset-2 disabled:opacity-60"
            onClick={onForgotPassword}
            disabled={pending}
          >
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-primary hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-3.5 sm:py-3 md:py-3.5 px-4 rounded-md text-base sm:text-lg transition-colors duration-300 inline-flex items-center justify-center gap-2"
        >
          {pending ? (
            <>
              <Spinner /> Processing...
            </>
          ) : (
            'Login'
          )}
        </button>
      </form>
    </>
  );
};

LoginForm.propTypes = {
  email: PropTypes.string.isRequired,
  password: PropTypes.string.isRequired,
  pending: PropTypes.bool,
  info: PropTypes.string,
  error: PropTypes.string,
  emailError: PropTypes.string,
  passwordError: PropTypes.string,
  remember: PropTypes.bool,
  onEmailChange: PropTypes.func.isRequired,
  onPasswordChange: PropTypes.func.isRequired,
  onRememberChange: PropTypes.func,
  onSubmit: PropTypes.func.isRequired,
  onForgotPassword: PropTypes.func,
};

export default LoginForm;
