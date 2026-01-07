import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PageTransition from '@/components/PageTransition';
import AuthPageShell, {
  AUTH_PAGE_DEFAULT_BACKGROUND,
} from '@/components/auth/AuthPageShell';
import AuthBrandIntro from '@/components/auth/AuthBrandIntro';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import CameraCapture from '@/components/face-registration/CameraCapture';
import verificationService from '@/api/services/verificationService';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

const VerifyIdentityPage = () => {
  const navigate = useNavigate();
  const cameraRef = useRef(null);

  const [pendingUser, setPendingUser] = useState(null);
  const [verifyToken, setVerifyToken] = useState('');
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState('initial'); // initial | scanning | processing | done | error
  const [error, setError] = useState('');
  const [imageData, setImageData] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    try {
      const vt = sessionStorage.getItem('verify_token') || '';
      const pu = sessionStorage.getItem('pending_user');
      setVerifyToken(vt);
      setPendingUser(pu ? JSON.parse(pu) : null);
    } catch {}
  }, []);

  const startCapture = async () => {
    setError('');
    setImageData('');
    if (!consent) {
      setError('Please provide consent to proceed.');
      return;
    }
    setStep('scanning');

    let stream;
    const stopStream = () => {
      if (stream) {
        try {
          stream.getTracks().forEach((track) => track.stop());
        } catch {}
        stream = null;
      }
      const videoEl = cameraRef.current?.getVideoRef();
      if (videoEl && videoEl.srcObject) {
        videoEl.srcObject = null;
      }
    };

    const runCountdown = (seconds = 3) =>
      new Promise((resolve) => {
        let remaining = seconds;
        setCountdown(remaining);
        const interval = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearInterval(interval);
            setCountdown(0);
            resolve();
          } else {
            setCountdown(remaining);
          }
        }, 1000);
      });

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      const video = cameraRef.current?.getVideoRef();
      if (video) video.srcObject = stream;

      // brief warm-up before countdown
      await new Promise((resolve) => setTimeout(resolve, 500));
      await runCountdown();

      const shot = cameraRef.current?.captureImage(0);
      stopStream();

      if (!shot?.data) throw new Error('Failed to capture image');
      setImageData(shot.data);
      setStep('processing');

      const res = await verificationService.uploadHeadshot({
        verifyToken,
        imageData: shot.data,
        consent: true,
      });
      if (res?.success) {
        setStep('done');
        toast.success('Verification submitted', {
          description: 'Your request is pending admin review.',
        });
      } else {
        throw new Error(res?.message || 'Upload failed');
      }
    } catch (err) {
      stopStream();
      setStep('error');
      setError(err?.message || 'Could not complete verification.');
    } finally {
      setCountdown(0);
    }
  };

  const formContent = (
    <div className="space-y-6">
      <Card className="shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Verify Your
            Identity
          </CardTitle>
          <CardDescription>
            For security, we need a headshot to complete access approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex">
            <Link
              to="/login"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
            </Link>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="consent"
              checked={consent}
              onCheckedChange={(value) => setConsent(Boolean(value))}
            />
            <label htmlFor="consent" className="text-sm">
              I consent to the collection and processing of my photo for
              verification.
            </label>
          </div>

          <div className="relative">
            <CameraCapture
              ref={cameraRef}
              step={
                step === 'initial'
                  ? 'initial'
                  : step === 'scanning'
                    ? 'scanning'
                    : step === 'processing'
                      ? 'processing'
                      : 'initial'
              }
              currentPosition={{ instruction: 'Look straight at the camera' }}
              capturedImages={imageData ? [{ data: imageData }] : []}
              capturePositions={[{ name: 'Center' }]}
              countdown={countdown}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => navigate('/login')}
              disabled={step === 'processing'}
            >
              Cancel
            </Button>
            <Button
              onClick={startCapture}
              disabled={!consent || step === 'processing'}
            >
              {step === 'processing' ? 'Submitting...' : 'Capture & Submit'}
            </Button>
          </div>

          {step === 'done' && (
            <div className="text-center text-sm text-muted-foreground">
              Your submission has been received. You will be notified after
              approval. You can close this page.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const introContent = (
    <AuthBrandIntro
      title="Thanks for helping us keep accounts secure"
      description="Upload a clear headshot so the admin team can confirm your identity and activate your account."
    >
      {pendingUser?.email ? (
        <p className="text-xs text-muted-foreground">
          Signed in as{' '}
          <span className="font-medium text-foreground">
            {pendingUser.email}
          </span>
        </p>
      ) : null}
    </AuthBrandIntro>
  );

  return (
    <PageTransition>
      <AuthPageShell
        backgroundImage={AUTH_PAGE_DEFAULT_BACKGROUND}
        waveImage="/images/b1bc6b54-fe3f-45eb-8a39-005cc575deef.png"
        formWrapperClassName="max-w-xl mr-auto md:mr-[min(8rem,14vw)] md:ml-0"
        formSlot={formContent}
        asideSlot={introContent}
      />
    </PageTransition>
  );
};

export default VerifyIdentityPage;
