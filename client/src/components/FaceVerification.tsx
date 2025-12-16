import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Camera, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFingerprint } from '@/lib/fingerprint';
import { apiRequest } from '@/lib/queryClient';

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
  
  const [status, setStatus] = useState<'loading' | 'ready' | 'detecting' | 'challenges' | 'processing' | 'complete' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<ChallengeState[]>(CHALLENGES.map(c => ({ ...c })));
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [videoAspect, setVideoAspect] = useState<number>(3/4); // Default portrait ratio
  
  const blinkCountRef = useRef(0);
  const lastBlinkStateRef = useRef(false);
  const headTurnProgressRef = useRef({ left: 0, right: 0 });
  const faceEmbeddingsRef = useRef<number[][]>([]);
  
  // Refs to mirror state for animation frame loop (avoids stale closures)
  const currentChallengeIndexRef = useRef(0);
  const challengesRef = useRef<ChallengeState[]>(CHALLENGES.map(c => ({ ...c })));
  const statusRef = useRef<typeof status>('loading');

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

  const loadMediaPipe = useCallback(async () => {
    try {
      setStatus('loading');
      setError(null);
      
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
      
      await startCamera();
      setStatus('ready');
    } catch (err) {
      console.error('[FaceVerification] Failed to load MediaPipe:', err);
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
            }
            
            const embedding = landmarks.slice(0, 68).flatMap(l => [l.x, l.y, l.z]);
            if (faceEmbeddingsRef.current.length < 5) {
              faceEmbeddingsRef.current.push(embedding);
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
        throw new Error('No face data captured');
      }
      
      const avgEmbedding = faceEmbeddingsRef.current[0].map((_, i) => 
        faceEmbeddingsRef.current.reduce((sum, emb) => sum + emb[i], 0) / faceEmbeddingsRef.current.length
      );
      
      const embeddingHash = await hashEmbedding(avgEmbedding);
      const fingerprint = await getFingerprint();
      const passedChallenges = challenges.filter(c => c.completed).map(c => c.type);
      
      const response = await apiRequest('POST', '/api/face-verification/submit', {
        walletAddress,
        embeddingHash,
        storageToken: fingerprint.storageToken,
        challengesPassed: passedChallenges,
      });
      
      const result = await response.json();
      
      cleanup();
      setStatus('complete');
      
      toast({
        title: result.isDuplicate ? 'Verification Complete (Duplicate Detected)' : 'Verification Complete!',
        description: result.isDuplicate 
          ? 'Your face matches another wallet. This has been recorded.'
          : 'Face verification successful! +50 XP earned.',
        variant: result.isDuplicate ? 'destructive' : 'default',
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
    loadMediaPipe();
  };

  useEffect(() => {
    loadMediaPipe();
  }, [loadMediaPipe]);

  useEffect(() => {
    if (status === 'ready' || status === 'detecting' || status === 'challenges') {
      startDetection();
    }
  }, [status, startDetection]);

  return (
    <div className="space-y-4">
      <div 
        className="relative bg-black rounded-md overflow-hidden mx-auto w-full max-w-[280px]"
        style={{ aspectRatio: videoAspect }}
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
        
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-center text-white space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              <p>Loading face detection...</p>
            </div>
          </div>
        )}
        
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-center text-white space-y-2 p-4">
              <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {(status === 'detecting' || status === 'ready') && !faceDetected && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-white bg-black/50 p-4">
              <Camera className="h-8 w-8 mx-auto mb-2" />
              <p>Position your face in the frame</p>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-center text-white space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              <p>Processing verification...</p>
            </div>
          </div>
        )}

        {status === 'complete' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-center text-white space-y-2">
              <Check className="h-12 w-12 mx-auto text-green-500" />
              <p className="font-semibold">Verification Complete!</p>
            </div>
          </div>
        )}
      </div>

      {status === 'challenges' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-center">
            {challenges[currentChallengeIndex]?.label}
          </p>
          <div className="flex gap-2 justify-center">
            {challenges.map((challenge, i) => (
              <div
                key={challenge.type}
                className={`flex items-center gap-1 px-2 py-1 text-xs ${
                  challenge.completed
                    ? 'bg-green-500/20 text-green-500'
                    : i === currentChallengeIndex
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {challenge.completed ? (
                  <Check className="h-3 w-3" />
                ) : i === currentChallengeIndex ? (
                  <span>{Math.round(challenge.progress)}%</span>
                ) : null}
                <span>{challenge.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Title and description below camera */}
      <div className="text-center space-y-1">
        <h3 className="font-semibold text-lg">Face Check</h3>
        <p className="text-sm text-muted-foreground">
          Complete blink and head turn challenges to prove you're human. Earn 50 XP as a reward.
        </p>
      </div>

      <div className="flex gap-3 justify-center flex-wrap">
        {status === 'error' && (
          <>
            <Button size="default" onClick={handleRetry} data-testid="button-retry-face-verification">
              <RefreshCw className="h-4 w-4" />
              <span className="ml-2">Retry</span>
            </Button>
            {onReset && (
              <Button size="default" variant="outline" onClick={onReset} data-testid="button-reset-face-verification">
                <span>Reset Camera</span>
              </Button>
            )}
          </>
        )}
        
        {(status === 'ready' || status === 'detecting') && faceDetected && (
          <Button size="default" onClick={startChallenges} data-testid="button-start-challenges">
            <Camera className="h-4 w-4" />
            <span className="ml-2">Start Verification</span>
          </Button>
        )}
      </div>
    </div>
  );
}
