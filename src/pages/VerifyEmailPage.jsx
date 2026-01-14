import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Header from '@/components/auth/Header';
import PageTransition from '@/components/PageTransition';
import authService from '@/api/services/authService';

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

const VerifyEmailPage = () => {
  const query = useQuery();
  const navigate = useNavigate();
  const [status, setStatus] = useState('idle'); // idle | verifying | success | error
  const [message, setMessage] = useState('');
  const alertRef = useRef(null);

  useEffect(() => {
    const token = query.get('token') || '';
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token.');
      return;
    }
    (async () => {
      setStatus('verifying');
      try {
        const res = await authService.verifyEmail(token);
        if (res?.success) {
          setStatus('success');
          setMessage('Your email has been verified. You can now log in.');
        } else {
          setStatus('error');
          setMessage(res?.message || 'Verification failed or token expired.');
        }
      } catch (e) {
        setStatus('error');
        setMessage('Verification failed or token expired.');
      }
    })();
  }, [query]);

  useEffect(() => {
    if (alertRef.current) alertRef.current.focus();
  }, [status]);

  return (
    <PageTransition>
      <div className="min-h-screen flex flex-col bg-white">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md bg-white p-6 rounded-xl shadow-lg">
            <h1 className="text-2xl font-semibold mb-2">Verify Email</h1>
            <div
              ref={alertRef}
              tabIndex={-1}
              className={`p-3 mb-4 rounded-lg text-sm ${
                status === 'success'
                  ? 'bg-green-50 text-green-700'
                  : status === 'verifying'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-yellow-50 text-yellow-700'
              }`}
            >
              {status === 'verifying'
                ? 'Verifying your email…'
                : message || 'Processing…'}
            </div>

            <div className="flex items-center justify-between text-sm">
              <Link
                to="/login"
                className="text-primary underline underline-offset-2"
              >
                Back to Login
              </Link>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-800"
                onClick={() => navigate('/forgot-password')}
              >
                Forgot Password?
              </button>
            </div>
          </div>
        </main>
      </div>
    </PageTransition>
  );
};

export default VerifyEmailPage;
