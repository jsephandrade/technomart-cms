import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Scan,
  Camera,
  CheckCircle,
  XCircle,
  ArrowLeft,
  RefreshCw,
  Clock,
} from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import AuthCard from '@/components/auth/AuthCard';
import AuthPageShell, {
  AUTH_PAGE_DEFAULT_BACKGROUND,
} from '@/components/auth/AuthPageShell';
import AuthBrandIntro from '@/components/auth/AuthBrandIntro';

const FaceScanPage = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [permissionStatus, setPermissionStatus] = useState('prompt');
  const [permissionMessage, setPermissionMessage] = useState('');
  const [permissionPending, setPermissionPending] = useState(false);
  const videoRef = useRef(null);
  const cameraConstraintsRef = useRef({
    audio: false,
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: { ideal: 'user' },
    },
  });
  const navigate = useNavigate();
  const { loginWithFace } = useAuth();

  const requestCameraStream = useCallback(async (constraints) => {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (!nav) {
      throw { code: 'camera-not-supported' };
    }
    const resolvedConstraints = constraints || cameraConstraintsRef.current;

    if (!nav.mediaDevices) {
      nav.mediaDevices = {};
    }

    if (!nav.mediaDevices.getUserMedia) {
      const legacyGetUserMedia =
        nav.getUserMedia ||
        nav.webkitGetUserMedia ||
        nav.mozGetUserMedia ||
        nav.msGetUserMedia;
      if (legacyGetUserMedia) {
        nav.mediaDevices.getUserMedia = (gumConstraints) =>
          new Promise((resolve, reject) =>
            legacyGetUserMedia.call(nav, gumConstraints, resolve, reject)
          );
      }
    }

    if (typeof nav.mediaDevices.getUserMedia === 'function') {
      return nav.mediaDevices.getUserMedia(resolvedConstraints);
    }

    const win = typeof window !== 'undefined' ? window : undefined;
    const hostname = win?.location?.hostname || '';
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]';
    if (win && win.isSecureContext === false && !isLocalhost) {
      throw { code: 'camera-insecure-context' };
    }
    throw { code: 'camera-not-supported' };
  }, []);

  useEffect(() => {
    let permissionHandle;
    let isMounted = true;
    const syncPermission = async () => {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (!nav?.permissions?.query) return;
      try {
        permissionHandle = await nav.permissions.query({ name: 'camera' });
        if (!isMounted) return;
        setPermissionStatus(permissionHandle.state);
        permissionHandle.onchange = () => {
          setPermissionStatus(permissionHandle.state);
        };
      } catch {}
    };
    syncPermission();
    return () => {
      isMounted = false;
      if (permissionHandle) permissionHandle.onchange = null;
    };
  }, []);

  const requestCameraPermission = useCallback(async () => {
    if (permissionPending) return;
    setPermissionPending(true);
    setPermissionMessage('');
    try {
      const stream = await requestCameraStream();
      stream.getTracks().forEach((track) => track.stop());
      setPermissionStatus('granted');
      setPermissionMessage('Camera ready. You can start scanning now.');
    } catch (err) {
      if (err?.code === 'camera-insecure-context') {
        setPermissionMessage(
          'Camera access requires a secure (https) connection. Use https:// or a trusted tunneling tool when accessing this page.'
        );
      } else if (err?.code === 'camera-not-supported') {
        setPermissionMessage(
          'Camera access is not supported in this browser. Please try Chrome, Edge, or Safari with the latest updates.'
        );
      } else {
        setPermissionMessage(
          'Camera permission is blocked. Allow access in your browser settings (Chrome on Android or Safari on iPhone).'
        );
      }
      setPermissionStatus('denied');
    } finally {
      setPermissionPending(false);
    }
  }, [permissionPending, requestCameraStream]);

  const startFaceScan = async () => {
    let stream;
    const stopStream = () => {
      if (stream) {
        try {
          stream.getTracks().forEach((track) => track.stop());
        } catch {}
        stream = null;
      }
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
      setIsScanning(true);
      setError('');
      setScanResult(null);

      try {
        stream = await requestCameraStream();
        setPermissionStatus('granted');
      } catch (cameraErr) {
        if (cameraErr?.code === 'camera-not-supported') {
          throw cameraErr;
        }
        const name = cameraErr?.name || cameraErr?.original?.name;
        const denied =
          name === 'NotAllowedError' ||
          name === 'PermissionDeniedError' ||
          cameraErr?.code === 20;
        throw {
          code: denied ? 'camera-permission' : 'camera-error',
          original: cameraErr,
        };
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // allow camera to stabilise before countdown
      await new Promise((resolve) => setTimeout(resolve, 500));
      await runCountdown();

      const video = videoRef.current;
      if (!video) throw new Error('Camera not ready');

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

      stopStream();

      const res = await loginWithFace(dataUrl, { remember: true });
      if (res?.success && !res?.pending) {
        setScanResult('success');
        setTimeout(() => navigate('/'), 1000);
      } else if (res?.pending) {
        setScanResult('success');
        setTimeout(() => navigate('/verify'), 1000);
      } else {
        const errorMsg = res?.message || 'Face not recognized';
        setError(errorMsg);
        setScanResult('failed');
      }
    } catch (err) {
      if (err?.code === 'camera-permission') {
        setPermissionStatus('denied');
        setError(
          'Camera access is required. Please allow camera permissions in your browser (Chrome on Android or Safari on iPhone).'
        );
        setScanResult('failed');
      } else if (err?.code === 'camera-insecure-context') {
        setError(
          'Camera requires a secure (https) connection. Please reload this page over https or use a secure tunnel.'
        );
        setScanResult('failed');
      } else if (err?.code === 'camera-not-supported') {
        setError(
          'Camera access is not supported in this browser. Try Chrome, Edge, or Safari over a secure (https) connection.'
        );
        setScanResult('failed');
      } else {
        setError(err?.message || 'Face scan failed');
        setScanResult('failed');
      }
    } finally {
      stopStream();
      setIsScanning(false);
      setCountdown(0);
    }
  };

  const resetScan = () => {
    setScanResult(null);
    setError('');
    setCountdown(0);
  };

  const scanCard = (
    <AuthCard
      title="Face Scan Login"
      compact
      className="!max-w-full sm:!max-w-md lg:!max-w-lg"
      cardClassName="shadow-2xl lg:p-8"
    >
      <p className="text-xs sm:text-sm text-gray-600 mb-6 leading-relaxed max-w-prose text-center sm:text-left mx-auto">
        Use your face to securely log into your account using advanced DeepFace
        recognition.
      </p>

      {/* Camera viewport */}
      <div className="relative mb-6">
        <div className="w-full h-60 sm:h-72 bg-muted rounded-lg overflow-hidden flex items-center justify-center border-2 border-dashed border-border">
          {!isScanning && !scanResult && (
            <div className="text-center text-muted-foreground px-4">
              <Camera className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 text-primary/70" />
              <p className="text-xs sm:text-sm">Camera will appear here</p>
            </div>
          )}

          {isScanning && (
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
                    <p className="text-[0.65rem] sm:text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Get ready
                    </p>
                    <p className="text-2xl sm:text-3xl font-semibold text-primary">
                      {countdown}
                    </p>
                  </div>
                </div>
              )}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 transform">
                <div className="bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full">
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    {countdown > 0 ? (
                      <>
                        <Clock className="w-4 h-4 text-primary" />
                        Capturing in {countdown}...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Scanning with DeepFace...
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {scanResult === 'success' && (
            <div className="text-center text-green-600 px-4">
              <CheckCircle className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-2" />
              <p className="font-medium text-sm sm:text-base">
                Face recognized!
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Logging you in...
              </p>
            </div>
          )}

          {scanResult === 'failed' && (
            <div className="text-center text-destructive px-4">
              <XCircle className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-2" />
              <p className="font-medium text-sm sm:text-base">
                {error || 'Face not recognized'}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Please try again
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <Alert
          variant="destructive"
          className="mb-4 text-xs sm:text-sm leading-relaxed"
        >
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {(permissionStatus === 'prompt' || permissionStatus === 'denied') && (
        <div className="mb-6 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 sm:p-4 text-xs sm:text-sm text-primary-900 space-y-2">
          <p className="font-semibold text-primary">Allow camera access</p>
          <p className="text-primary/80 leading-relaxed">
            Choose "Allow" when the browser asks for camera access. On Android
            Chrome, tap the lock icon, open Permissions, and set Camera to
            Allow. On iPhone Safari, tap the AA icon, open Website Settings, and
            set Camera to Allow.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={requestCameraPermission}
            disabled={permissionPending}
          >
            {permissionPending ? 'Requesting...' : 'Request camera permission'}
          </Button>
          {permissionMessage && (
            <p className="text-[11px] sm:text-xs text-primary/80">
              {permissionMessage}
            </p>
          )}
        </div>
      )}

      {/* Instructions */}
      {!isScanning && !scanResult && (
        <div className="text-center text-xs sm:text-sm text-muted-foreground space-y-1.5 sm:space-y-2 mb-6 leading-relaxed">
          <p>- Position your face in the center of the frame</p>
          <p>- Ensure good lighting</p>
          <p>- Look directly at the camera</p>
          <p>- Only one person should be visible</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3 sm:space-y-4">
        {!isScanning && !scanResult && (
          <Button
            onClick={startFaceScan}
            className="w-full py-3.5 text-sm sm:text-base"
            size="lg"
          >
            <Scan className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            Start Face Scan
          </Button>
        )}

        {scanResult === 'failed' && (
          <Button
            onClick={resetScan}
            className="w-full py-3.5 text-sm sm:text-base"
            variant="outline"
            size="lg"
          >
            <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            Try Again
          </Button>
        )}

        <div className="text-center">
          <Link
            to="/login"
            className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Use password instead
          </Link>
        </div>
      </div>

      {/* Security note */}
      <div className="mt-6 pt-4 border-t text-center text-[10px] sm:text-xs text-muted-foreground leading-relaxed space-y-1">
        <p>Secured with DeepFace AI technology</p>
        <p>Only encrypted facial embeddings are stored</p>
      </div>
    </AuthCard>
  );

  const welcomeIntro = (
    <AuthBrandIntro
      title="Secure Face Recognition"
      description="Experience lightning-fast and secure authentication with advanced DeepFace AI technology."
      className="w-full max-w-xl px-3 sm:px-6 lg:px-8"
      contentClassName="space-y-1 sm:space-y-3 text-center sm:text-left"
      titleClassName="text-[20px] sm:text-4xl"
      descriptionClassName="text-[9px] sm:text-sm"
    />
  );

  return (
    <PageTransition>
      <div className="w-full min-h-screen overflow-y-auto [scrollbar-width:none] [scrollbar-color:transparent_transparent] [&::-webkit-scrollbar]:hidden">
        <AuthPageShell
          backgroundImage={AUTH_PAGE_DEFAULT_BACKGROUND}
          waveImage="/images/b1bc6b54-fe3f-45eb-8a39-005cc575deef.png"
          paddingClassName="px-4 sm:px-6 lg:px-10 xl:px-16 py-10 sm:py-12 lg:py-16"
          gridClassName="gap-2 sm:gap-10 lg:gap-16"
          formWrapperClassName="order-2 md:order-1 w-full flex justify-center px-2 sm:px-4 md:px-0"
          asideWrapperClassName="order-1 md:order-2 mb-4 sm:mb-0 flex justify-center px-2 sm:px-4"
          formSlot={scanCard}
          asideSlot={welcomeIntro}
        />
      </div>
    </PageTransition>
  );
};

export default FaceScanPage;
