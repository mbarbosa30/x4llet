import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Camera, Check, AlertTriangle, RefreshCw, Eye, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFingerprint } from '@/lib/fingerprint';
import { apiRequest } from '@/lib/queryClient';
import { Progress } from '@/components/ui/progress';
import { Link } from 'wouter';

interface FaceLandmarkerResult {
  faceLandmarks: Array<Array<{ x: number; y: number; z: number }>>;
  faceBlendshapes?: Array<{ categories: Array<{ categoryName: string; score: number }> }>;
}

type Challenge = 'blink' | 'turn_left' | 'turn_right' | 'nod';

interface ChallengeState {
  type: Challenge;
  label: string;
  completed: boolean;
  progress: number;
}

const CHALLENGES: ChallengeState[] = [
  { type: 'blink', label: 'Blink twice', completed: false, progress: 0 },
  { type: 'turn_left', label: 'Turn head left', completed: false, progress: 0 },
  { type: 'turn_right', label: 'Turn head right', completed: false, progress: 0 },
];

const getChallengeIcon = (type: Challenge, className: string = "h-5 w-5") => {
  switch (type) {
    case 'blink':
      return <Eye className={className} />;
    case 'turn_left':
      return <ArrowLeft className={className} />;
    case 'turn_right':
      return <ArrowRight className={className} />;
    default:
      return <Camera className={className} />;
  }
};

interface FaceVerificationProps {
  walletAddress: string;
  onComplete: (success: boolean, data?: any) => void;
  onReset?: () => void;
}

export default function FaceVerification({ walletAddress, onComplete, onReset }: FaceVerificationProps) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const faceLandmarkerRef = useRef<any>(null);
  const faceApiRef = useRef<any>(null); // face-api.js module for identity embeddings
  
  const [status, setStatus] = useState<'intro' | 'loading' | 'ready' | 'detecting' | 'challenges' | 'processing' | 'complete' | 'error'>('intro');
  const [error, setError] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<ChallengeState[]>(CHALLENGES.map(c => ({ ...c })));
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [videoAspect, setVideoAspect] = useState<number>(3/4); // Default portrait ratio
  const [loadingMessage, setLoadingMessage] = useState<string>('Initializing...');
  
  const blinkCountRef = useRef(0);
  const lastBlinkStateRef = useRef(false);
  const headTurnProgressRef = useRef({ left: 0, right: 0 });
  const faceEmbeddingsRef = useRef<Float32Array[]>([]); // Store 128D face descriptors
  
  // Refs to mirror state for animation frame loop (avoids stale closures)
  const currentChallengeIndexRef = useRef(0);
  const challengesRef = useRef<ChallengeState[]>(CHALLENGES.map(c => ({ ...c })));
  const statusRef = useRef<typeof status>('intro');

  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Keep refs in sync with state
  useEffect(() => {
    currentChallengeIndexRef.current = currentChallengeIndex;
  }, [currentChallengeIndex]);

  useEffect(() => {
    challengesRef.current = challenges;
  }, [challenges]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const loadModels = useCallback(async () => {
    try {
      setStatus('loading');
      setError(null);
      
      // Load MediaPipe for liveness detection (blink, head turn)
      setLoadingMessage('Loading liveness detection...');
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
      const { FaceLandmarker, FilesetResolver } = vision;
      
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true
      });
      
      // Load face-api.js for identity embeddings (128D face descriptors)
      // Use script loader approach since ESM import doesn't work reliably
      setLoadingMessage('Loading face recognition...');
      
      // Load face-api.js via script tag if not already loaded
      if (!(window as any).faceapi) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load face-api.js'));
          document.head.appendChild(script);
        });
      }
      
      const faceapi = (window as any).faceapi;
      if (!faceapi) {
        throw new Error('face-api.js not available');
      }
      faceApiRef.current = faceapi;
      
      // Load required models from CDN
      const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      console.log('[FaceVerification] face-api.js models loaded successfully');
      
      setLoadingMessage('Starting camera...');
      await startCamera();
      setStatus('ready');
    } catch (err) {
      console.error('[FaceVerification] Failed to load models:', err);
      setError('Failed to load face detection. Please try again.');
      setStatus('error');
    }
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user',
          width: { ideal: 480 },
          height: { ideal: 640 }
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((resolve) => {
          videoRef.current!.onloadedmetadata = () => {
            // Set canvas dimensions to match actual video dimensions
            if (canvasRef.current && videoRef.current) {
              const vw = videoRef.current.videoWidth;
              const vh = videoRef.current.videoHeight;
              canvasRef.current.width = vw;
              canvasRef.current.height = vh;
              // Update container aspect ratio to match video
              setVideoAspect(vw / vh);
            }
            resolve();
          };
        });
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('[FaceVerification] Camera access denied:', err);
      throw new Error('Camera access denied. Please allow camera access to continue.');
    }
  };

  const startDetection = useCallback(() => {
    if (!faceLandmarkerRef.current || !videoRef.current) return;
    
    // Only set to 'detecting' if we're in initial states, not 'challenges'
    setStatus(prev => prev === 'ready' || prev === 'loading' ? 'detecting' : prev);
    
    const detect = async () => {
      if (!videoRef.current || !faceLandmarkerRef.current || videoRef.current.readyState !== 4) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }
      
      try {
        const results: FaceLandmarkerResult = faceLandmarkerRef.current.detectForVideo(
          videoRef.current,
          performance.now()
        );
        
        const hasFace = results.faceLandmarks && results.faceLandmarks.length > 0;
        setFaceDetected(hasFace);
        
        if (hasFace && canvasRef.current && videoRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
            
            const landmarks = results.faceLandmarks[0];
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            
            const minX = Math.min(...landmarks.map(l => l.x)) * canvasRef.current.width;
            const maxX = Math.max(...landmarks.map(l => l.x)) * canvasRef.current.width;
            const minY = Math.min(...landmarks.map(l => l.y)) * canvasRef.current.height;
            const maxY = Math.max(...landmarks.map(l => l.y)) * canvasRef.current.height;
            
            const padding = 20;
            ctx.strokeRect(minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2);
            
            if (statusRef.current === 'challenges') {
              processChallenge(results);
              
              // Capture face descriptor using face-api.js (only during challenges, max 5 samples)
              if (faceEmbeddingsRef.current.length < 5 && faceApiRef.current && videoRef.current) {
                try {
                  const faceapi = faceApiRef.current;
                  const detection = await faceapi
                    .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
                    .withFaceLandmarks()
                    .withFaceDescriptor();
                  
                  if (detection?.descriptor) {
                    faceEmbeddingsRef.current.push(detection.descriptor);
                    console.log(`[FaceVerification] Captured face descriptor ${faceEmbeddingsRef.current.length}/5`);
                  }
                } catch (faceApiErr) {
                  console.warn('[FaceVerification] Face descriptor capture error:', faceApiErr);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('[FaceVerification] Detection error:', err);
      }
      
      animationFrameRef.current = requestAnimationFrame(detect);
    };
    
    animationFrameRef.current = requestAnimationFrame(detect);
  }, [status]);

  const processChallenge = (results: FaceLandmarkerResult) => {
    const blendshapes = results.faceBlendshapes?.[0]?.categories;
    const landmarks = results.faceLandmarks[0];
    
    if (!blendshapes || !landmarks) return;
    
    // Use refs to get fresh values (avoids stale closure)
    const idx = currentChallengeIndexRef.current;
    const currentChallenge = challengesRef.current[idx];
    if (!currentChallenge || currentChallenge.completed) return;
    
    switch (currentChallenge.type) {
      case 'blink': {
        const leftBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score ?? 0;
        const rightBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score ?? 0;
        const isBlinking = (leftBlink + rightBlink) / 2 > 0.4;
        
        if (isBlinking && !lastBlinkStateRef.current) {
          blinkCountRef.current++;
          setChallenges(prev => prev.map((c, i) => 
            i === idx ? { ...c, progress: blinkCountRef.current * 50 } : c
          ));
          
          if (blinkCountRef.current >= 2) {
            completeChallenge();
          }
        }
        lastBlinkStateRef.current = isBlinking;
        break;
      }
      
      case 'turn_left': {
        const noseX = landmarks[1].x;
        if (noseX > 0.6) {
          headTurnProgressRef.current.left = Math.min(100, headTurnProgressRef.current.left + 5);
          setChallenges(prev => prev.map((c, i) => 
            i === idx ? { ...c, progress: headTurnProgressRef.current.left } : c
          ));
          
          if (headTurnProgressRef.current.left >= 100) {
            completeChallenge();
          }
        }
        break;
      }
      
      case 'turn_right': {
        const noseX = landmarks[1].x;
        if (noseX < 0.4) {
          headTurnProgressRef.current.right = Math.min(100, headTurnProgressRef.current.right + 5);
          setChallenges(prev => prev.map((c, i) => 
            i === idx ? { ...c, progress: headTurnProgressRef.current.right } : c
          ));
          
          if (headTurnProgressRef.current.right >= 100) {
            completeChallenge();
          }
        }
        break;
      }
    }
  };

  const completeChallenge = () => {
    const idx = currentChallengeIndexRef.current;
    const challengeCount = challengesRef.current.length;
    
    // Update ref immediately so next frame sees correct state
    challengesRef.current = challengesRef.current.map((c, i) => 
      i === idx ? { ...c, completed: true, progress: 100 } : c
    );
    
    // Update React state for UI
    setChallenges(prev => prev.map((c, i) => 
      i === idx ? { ...c, completed: true, progress: 100 } : c
    ));
    
    if (idx < challengeCount - 1) {
      currentChallengeIndexRef.current = idx + 1;
      setCurrentChallengeIndex(idx + 1);
      blinkCountRef.current = 0;
      lastBlinkStateRef.current = false;
    } else {
      submitVerification();
    }
  };

  const hashEmbedding = async (embedding: number[]): Promise<string> => {
    const data = new Float32Array(embedding);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data.buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const submitVerification = async () => {
    setStatus('processing');
    setIsSubmitting(true);
    
    try {
      if (faceEmbeddingsRef.current.length === 0) {
        throw new Error('No face data captured. Please ensure your face is visible during the challenges.');
      }
      
      // Average the 128D face descriptors from face-api.js
      const numDescriptors = faceEmbeddingsRef.current.length;
      const avgEmbedding: number[] = new Array(128).fill(0);
      
      for (const descriptor of faceEmbeddingsRef.current) {
        for (let i = 0; i < 128; i++) {
          avgEmbedding[i] += descriptor[i] / numDescriptors;
        }
      }
      
      console.log(`[FaceVerification] Averaged ${numDescriptors} face descriptors`);
      
      const embeddingHash = await hashEmbedding(avgEmbedding);
      const fingerprint = await getFingerprint();
      // Use ref instead of state to get fresh challenge data (avoids stale closure)
      const passedChallenges = challengesRef.current.filter(c => c.completed).map(c => c.type);
      
      const response = await apiRequest('POST', '/api/face-verification/submit', {
        walletAddress,
        embeddingHash,
        embedding: avgEmbedding,
        storageToken: fingerprint.storageToken,
        challengesPassed: passedChallenges,
      });
      
      const result = await response.json();
      
      // Check if this was an error response (duplicate face)
      if (!response.ok) {
        cleanup();
        setStatus('error');
        setError(result.error || 'Verification failed');
        setIsSubmitting(false);
        toast({
          title: 'Verification Failed',
          description: result.error || 'This face has already been verified with another wallet.',
          variant: 'destructive',
        });
        // Notify parent that verification failed (duplicate)
        onComplete(false, { isDuplicate: true, ...result });
        return;
      }
      
      cleanup();
      setStatus('complete');
      
      toast({
        title: 'Verification Complete!',
        description: 'Face verification successful! +120 XP earned.',
      });
      
      onComplete(true, result);
    } catch (err) {
      console.error('[FaceVerification] Submit error:', err);
      setError('Failed to submit verification. Please try again.');
      setStatus('error');
      setIsSubmitting(false);
    }
  };

  const startChallenges = () => {
    const freshChallenges = CHALLENGES.map(c => ({ ...c }));
    setStatus('challenges');
    setChallenges(freshChallenges);
    setCurrentChallengeIndex(0);
    // Also update refs immediately
    challengesRef.current = freshChallenges;
    currentChallengeIndexRef.current = 0;
    statusRef.current = 'challenges';
    blinkCountRef.current = 0;
    lastBlinkStateRef.current = false;
    headTurnProgressRef.current = { left: 0, right: 0 };
    faceEmbeddingsRef.current = [];
  };

  const handleRetry = () => {
    cleanup();
    setError(null);
    const freshChallenges = CHALLENGES.map(c => ({ ...c }));
    setChallenges(freshChallenges);
    setCurrentChallengeIndex(0);
    // Also update refs immediately
    challengesRef.current = freshChallenges;
    currentChallengeIndexRef.current = 0;
    blinkCountRef.current = 0;
    faceEmbeddingsRef.current = [];
    loadModels();
  };

  // Start button handler - only request camera when user explicitly clicks
  const handleStartVerification = () => {
    loadModels();
  };

  useEffect(() => {
    if (status === 'ready' || status === 'detecting' || status === 'challenges') {
      startDetection();
    }
  }, [status, startDetection]);

  const currentChallenge = challenges[currentChallengeIndex];
  const completedCount = challenges.filter(c => c.completed).length;

  // Intro screen - shown before camera access
  if (status === 'intro') {
    return (
      <div className="space-y-6 py-4">
        {/* Title */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Face Check</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Verify you're human with a quick liveness check
          </p>
        </div>

        {/* What to expect */}
        <div className="space-y-3 px-2">
          <p className="text-xs text-muted-foreground text-center uppercase tracking-wide">What you'll do</p>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Eye className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm">Blink twice</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <ArrowLeft className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm">Turn your head left</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <ArrowRight className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm">Turn your head right</span>
            </div>
          </div>
        </div>

        {/* XP reward badge */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-full">
            <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300">+120 XP reward</span>
          </div>
        </div>

        {/* Privacy note */}
        <p className="text-xs text-muted-foreground text-center px-4">
          Your face data is processed locally and never stored as an image.
        </p>

        {/* Start button */}
        <div className="flex flex-col items-center gap-3">
          <Button 
            size="lg" 
            onClick={handleStartVerification}
            data-testid="button-start-liveness-check"
            className="px-8"
          >
            <Camera className="h-4 w-4 mr-2" />
            Start Liveness Check
          </Button>
          <Link href="/" data-testid="link-skip-face-check">
            <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">
              Skip for now
            </span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Title and reward badge - ABOVE camera */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Face Check</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Complete 3 quick challenges to verify you're human
        </p>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-full">
          <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">+120 XP reward</span>
        </div>
      </div>

      {/* Camera container - FULL WIDTH with face guide */}
      <div 
        className="relative bg-black rounded-lg overflow-hidden w-full"
        style={{ aspectRatio: '3/4', maxHeight: '400px' }}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        
        {/* Face guide oval overlay */}
        {(status === 'ready' || status === 'detecting' || status === 'challenges') && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div 
              className={`w-[55%] h-[70%] rounded-[50%] border-4 transition-all duration-300 ${
                faceDetected 
                  ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]' 
                  : 'border-white/40'
              }`}
              style={{
                boxShadow: faceDetected 
                  ? '0 0 0 3000px rgba(0,0,0,0.3), inset 0 0 30px rgba(16,185,129,0.2)' 
                  : '0 0 0 3000px rgba(0,0,0,0.4)'
              }}
            />
          </div>
        )}
        
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white space-y-3">
              <Loader2 className="h-10 w-10 animate-spin mx-auto" />
              <p className="text-sm">{loadingMessage}</p>
            </div>
          </div>
        )}
        
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white space-y-3 p-6">
              <AlertTriangle className="h-10 w-10 mx-auto text-red-400" />
              <p className="text-sm max-w-[200px]">{error}</p>
            </div>
          </div>
        )}

        {(status === 'detecting' || status === 'ready') && !faceDetected && (
          <div className="absolute inset-x-0 bottom-8 flex justify-center">
            <div className="text-center text-white bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full">
              <p className="text-sm">Position your face in the oval</p>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white space-y-3">
              <Loader2 className="h-10 w-10 animate-spin mx-auto" />
              <p className="text-sm">Verifying...</p>
            </div>
          </div>
        )}

        {status === 'complete' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white space-y-3">
              <div className="h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center mx-auto">
                <Check className="h-10 w-10" />
              </div>
              <p className="font-semibold text-lg">Verified!</p>
            </div>
          </div>
        )}

        {/* Challenge instruction overlay - inside camera */}
        {status === 'challenges' && currentChallenge && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-12 pb-4 px-4">
            <div className="text-center text-white space-y-2">
              <div className="flex items-center justify-center gap-2">
                {getChallengeIcon(currentChallenge.type, "h-6 w-6")}
                <span className="text-lg font-semibold">{currentChallenge.label}</span>
              </div>
              <div className="text-xs text-white/70">
                Step {currentChallengeIndex + 1} of {challenges.length}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Challenge progress indicators - BELOW camera */}
      {status === 'challenges' && (
        <div className="space-y-3">
          {/* Progress bar for current challenge */}
          <div className="space-y-1">
            <Progress value={currentChallenge?.progress || 0} className="h-2" />
          </div>

          {/* Step indicators */}
          <div className="flex gap-2 justify-center">
            {challenges.map((challenge, i) => (
              <div
                key={challenge.type}
                className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 ${
                  challenge.completed
                    ? 'bg-emerald-500 text-white'
                    : i === currentChallengeIndex
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {challenge.completed ? (
                  <Check className="h-5 w-5" />
                ) : (
                  getChallengeIcon(challenge.type, "h-5 w-5")
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 justify-center flex-wrap">
        {status === 'error' && (
          <>
            <Button onClick={handleRetry} data-testid="button-retry-face-verification">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            {onReset && (
              <Button variant="outline" onClick={onReset} data-testid="button-reset-face-verification">
                Reset Camera
              </Button>
            )}
          </>
        )}
        
        {(status === 'ready' || status === 'detecting') && faceDetected && (
          <Button 
            size="lg" 
            onClick={startChallenges} 
            data-testid="button-start-challenges"
            className="px-8"
          >
            <Camera className="h-4 w-4 mr-2" />
            Start Verification
          </Button>
        )}
      </div>
    </div>
  );
}
