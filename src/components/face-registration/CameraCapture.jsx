import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { Camera, RefreshCw } from 'lucide-react';

const CameraCapture = forwardRef(
  (
    { step, currentPosition, capturedImages, capturePositions, countdown = 0 },
    ref
  ) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    useImperativeHandle(ref, () => ({
      getVideoRef: () => videoRef.current,
      getCanvasRef: () => canvasRef.current,
      captureImage: (index) => {
        if (videoRef.current && canvasRef.current) {
          const canvas = canvasRef.current;
          const video = videoRef.current;
          const ctx = canvas.getContext('2d');

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);

          const imageData = canvas.toDataURL('image/jpeg', 0.8);
          return {
            id: index,
            position: capturePositions[index].name,
            data: imageData,
            timestamp: Date.now(),
          };
        }
        return null;
      },
    }));

    return (
      <div className="w-full h-64 bg-muted rounded-lg overflow-hidden flex items-center justify-center border-2 border-dashed border-border">
        {step === 'initial' && (
          <div className="text-center text-muted-foreground">
            <Camera className="w-12 h-12 mx-auto mb-2" />
            <p className="text-sm">Ready to capture your face</p>
            <p className="text-xs text-muted-foreground mt-1">
              We'll take 5 photos from different angles
            </p>
          </div>
        )}

        {step === 'scanning' && (
          <div className="relative w-full h-full">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
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

            {/* Current instruction */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <div className="bg-background/90 backdrop-blur-sm px-4 py-2 rounded-full text-center">
                <div className="text-sm font-medium text-foreground">
                  {currentPosition?.instruction || 'Hold still...'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {Math.min(capturedImages.length + 1, capturePositions.length)}{' '}
                  of {capturePositions.length}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="text-center">
            <RefreshCw className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
            <p className="font-medium">Processing face data...</p>
            <p className="text-sm text-muted-foreground">
              This may take a moment
            </p>
          </div>
        )}
      </div>
    );
  }
);

CameraCapture.displayName = 'CameraCapture';

export default CameraCapture;
