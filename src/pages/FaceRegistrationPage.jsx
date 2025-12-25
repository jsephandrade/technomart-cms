import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  UserPlus,
  XCircle,
  CheckCircle,
  Camera,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import AuthCard from '@/components/auth/AuthCard';
import AuthPageShell, {
  AUTH_PAGE_DEFAULT_BACKGROUND,
} from '@/components/auth/AuthPageShell';
import AuthBrandIntro from '@/components/auth/AuthBrandIntro';
import { toast } from 'sonner';
import authService from '@/api/services/authService';

const FaceRegistrationPage = () => {
  const [step, setStep] = useState('initial'); // initial, capturing, processing, complete, error
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [capturedImage, setCapturedImage] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const navigate = useNavigate();

  const startCapture = async () => {
    setStep('capturing');
    setError('');
    setProgress(0);
    setCapturedImage(null);

    let stream;
    const stopStream = () => {
      const activeStream = streamRef.current || stream;
      if (activeStream) {
        try {
          activeStream.getTracks().forEach((track) => track.stop());
        } catch {}
      }
      streamRef.current = null;
      stream = null;
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject = null;
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
        video: {
          width: 640,
          height: 480,
          facingMode: 'user',
        },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      setProgress(20);

      await runCountdown();
      setProgress(45);

      const video = videoRef.current;
      if (!video) throw new Error('Camera not ready');

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

      setCapturedImage(dataUrl);
      setProgress(70);

      stopStream();

      setStep('processing');
      setProgress(85);

      const res = await authService.registerFace([{ data: dataUrl }]);

      if (!res?.success) {
        throw new Error(res?.message || 'Registration failed');
      }

      setProgress(100);
      setStep('complete');

      try {
        localStorage.setItem('face_enabled', '1');
        sessionStorage.setItem('face_enabled', '1');
      } catch {}

      toast.success('Face registered successfully!', {
        description: 'You can now use face scan to log in.',
      });

      setTimeout(() => navigate('/settings'), 2000);
    } catch (err) {
      stopStream();
      setError(
        err?.message ||
          'Unable to register face. Please ensure camera permissions are granted and try again.'
      );
      setStep('error');
    } finally {
      setCountdown(0);
    }
  };

  const resetRegistration = () => {
    setStep('initial');
    setProgress(0);
    setCountdown(0);
    setError('');
    setCapturedImage(null);

    // Stop camera if running
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const registrationCard = (
    <AuthCard
      title="Register Your Face"
      compact
      className="!max-w-full sm:!max-w-md lg:!max-w-2xl"
      cardClassName="shadow-2xl lg:p-8"
    >
      <p className="text-xs sm:text-sm text-gray-600 mb-6 leading-relaxed max-w-prose">
        Set up secure face recognition using advanced DeepFace AI for
        passwordless login.
      </p>

      {/* Progress indicator */}
      {(step === 'capturing' || step === 'processing') && (
        <div className="space-y-2 mb-6">
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="font-medium">
              {step === 'capturing' ? 'Capturing...' : 'Processing...'}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="w-full" />
        </div>
      )}

      {/* Camera viewport */}
      <div className="relative mb-6">
        <div className="w-full h-64 bg-muted rounded-lg overflow-hidden flex items-center justify-center border-2 border-dashed border-border">
          {step === 'initial' && (
            <div className="text-center text-muted-foreground">
              <Camera className="w-12 h-12 mx-auto mb-2" />
              <p className="text-xs sm:text-sm">Ready to capture your face</p>
            </div>
          )}

          {step === 'capturing' && (
            <div className="relative w-full h-full">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-4 border-primary rounded-lg animate-pulse" />
              {countdown > 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[2px]">
                  <div className="rounded-full bg-background/90 px-6 py-3 text-center shadow-md">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Get ready
                    </p>
                    <p className="text-3xl font-semibold text-primary">
                      {countdown}
                    </p>
                  </div>
                </div>
              )}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 transform">
                <div className="bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full">
                  <p className="text-xs sm:text-sm font-medium">
                    {countdown > 0
                      ? `Capturing in ${countdown}...`
                      : 'Hold steady while we capture your face'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 'processing' && capturedImage && (
            <div className="relative w-full h-full">
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                <div className="bg-background/90 backdrop-blur-sm px-4 py-2 rounded-lg">
                  <p className="text-xs sm:text-sm font-medium">
                    Processing with DeepFace...
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center text-green-600">
              <CheckCircle className="w-16 h-16 mx-auto mb-2" />
              <p className="font-medium">Registration Complete!</p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Redirecting to settings...
              </p>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center text-destructive">
              <XCircle className="w-16 h-16 mx-auto mb-2" />
              <p className="font-medium">Registration Failed</p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Please try again
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <XCircle className="h-4 w-4" />
          <AlertDescription className="text-xs sm:text-sm leading-relaxed">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Instructions */}
      {step === 'initial' && (
        <div className="text-center text-xs sm:text-sm text-muted-foreground space-y-2 mb-6 leading-relaxed">
          <p>- Position your face in the center of the frame</p>
          <p>- Ensure good lighting (avoid backlighting)</p>
          <p>- Remove glasses or hats if possible</p>
          <p>- Look directly at the camera</p>
          <p>- Only one person should be visible</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        {step === 'initial' && (
          <Button onClick={startCapture} className="w-full" size="lg">
            <UserPlus className="w-4 h-4 mr-2" />
            Start Registration
          </Button>
        )}

        {step === 'error' && (
          <Button
            onClick={resetRegistration}
            className="w-full"
            variant="outline"
            size="lg"
          >
            Try Again
          </Button>
        )}

        {(step === 'initial' || step === 'error') && (
          <div className="text-center">
            <Button
              variant="ghost"
              onClick={() => navigate('/settings')}
              className="text-xs sm:text-sm"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Security note */}
      <div className="mt-6 pt-4 border-t text-center text-xs text-muted-foreground">
        <p>Your face data is encrypted using DeepFace embeddings</p>
        <p>You can remove it anytime from settings</p>
      </div>
    </AuthCard>
  );

  const welcomeIntro = (
    <AuthBrandIntro
      title="Enable Face Recognition"
      description="Set up passwordless authentication with military-grade DeepFace AI technology in seconds."
      className="w-full max-w-xl px-3 sm:px-6 lg:px-8"
      contentClassName="space-y-1 sm:space-y-3 text-center sm:text-left"
      titleClassName="text-[20px] sm:text-4xl"
      descriptionClassName="text-[9px] sm:text-sm"
    >
      <div className="mt-6 sm:mt-8 space-y-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="mt-1">
            <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base sm:text-lg mb-1">
              Advanced Security
            </h3>
            <p className="text-gray-600 text-xs sm:text-sm">
              Powered by Facenet512 deep learning model with facial embeddings.
              Your actual photos are never stored.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 sm:gap-4">
          <div className="mt-1">
            <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base sm:text-lg mb-1">
              Quick Setup
            </h3>
            <p className="text-gray-600 text-xs sm:text-sm">
              Registration takes less than 10 seconds. One photo is all we need
              for accurate recognition.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 sm:gap-4">
          <div className="mt-1">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base sm:text-lg mb-1">
              Seamless Login
            </h3>
            <p className="text-gray-600 text-xs sm:text-sm">
              Skip passwords entirely. Just look at your camera and you're in -
              works even with different lighting and angles.
            </p>
          </div>
        </div>
      </div>
    </AuthBrandIntro>
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
        formSlot={registrationCard}
        asideSlot={welcomeIntro}
      />
    </PageTransition>
  );
};

export default FaceRegistrationPage;
