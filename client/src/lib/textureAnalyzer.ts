/**
 * Passive Texture Analyzer for Face Liveness Detection
 * 
 * Detects photo/screen attacks by analyzing:
 * 1. Moiré patterns - periodic patterns from screen pixels
 * 2. Texture variance - real skin has micro-texture variations, screens are uniform
 */

interface TextureAnalysisResult {
  moireScore: number;       // 0-1, higher = more likely screen/photo
  textureVariance: number;  // 0-1, lower = more likely screen/photo
  isLikelySpoof: boolean;
  confidence: number;       // 0-1, how confident we are in the analysis
  reason?: string;
}

export interface AnalyzerState {
  frameCount: number;
  moireScores: number[];
  varianceScores: number[];
}

const ANALYSIS_CONFIG = {
  TILE_SIZE: 128,                    // Downscale to 128x128 for performance
  MIN_FRAMES: 15,                    // More frames before deciding (reduce noise)
  MAX_FRAMES: 25,                    // Maximum frames to average
  MOIRE_THRESHOLD: 0.70,             // More conservative - only flag obvious screens
  VARIANCE_THRESHOLD: 0.06,          // More lenient - soft lighting produces low variance
  HIGH_FREQ_CUTOFF: 0.25,            // Nyquist fraction for high-frequency detection
  CONFIDENCE_THRESHOLD: 0.75,        // Only flag spoof if confidence >= this
};

/**
 * Create a new analyzer state
 */
export function createAnalyzerState(): AnalyzerState {
  return {
    frameCount: 0,
    moireScores: [],
    varianceScores: [],
  };
}

/**
 * Extract face region from canvas based on bounding box
 */
function extractFaceRegion(
  canvas: HTMLCanvasElement,
  faceBox: { minX: number; minY: number; maxX: number; maxY: number }
): ImageData | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const width = Math.floor((faceBox.maxX - faceBox.minX) * canvas.width);
  const height = Math.floor((faceBox.maxY - faceBox.minY) * canvas.height);
  const x = Math.floor(faceBox.minX * canvas.width);
  const y = Math.floor(faceBox.minY * canvas.height);

  if (width < 50 || height < 50) return null;

  try {
    return ctx.getImageData(x, y, width, height);
  } catch {
    return null;
  }
}

/**
 * Downscale image data to target size for efficient processing
 */
function downscaleImageData(
  imageData: ImageData,
  targetSize: number
): { grayscale: number[][]; width: number; height: number } {
  const { data, width, height } = imageData;
  
  const scaleX = width / targetSize;
  const scaleY = height / targetSize;
  
  const grayscale: number[][] = [];
  
  for (let y = 0; y < targetSize; y++) {
    const row: number[] = [];
    for (let x = 0; x < targetSize; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      const idx = (srcY * width + srcX) * 4;
      
      const r = data[idx] || 0;
      const g = data[idx + 1] || 0;
      const b = data[idx + 2] || 0;
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      row.push(gray);
    }
    grayscale.push(row);
  }
  
  return { grayscale, width: targetSize, height: targetSize };
}

/**
 * Compute Laplacian variance - measures texture sharpness/detail
 * Real skin has micro-texture, screens are unnaturally smooth
 */
function computeLaplacianVariance(grayscale: number[][]): number {
  const height = grayscale.length;
  const width = grayscale[0]?.length || 0;
  
  if (height < 3 || width < 3) return 0;
  
  const laplacianValues: number[] = [];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const laplacian = 
        -4 * grayscale[y][x] +
        grayscale[y - 1][x] +
        grayscale[y + 1][x] +
        grayscale[y][x - 1] +
        grayscale[y][x + 1];
      laplacianValues.push(Math.abs(laplacian));
    }
  }
  
  if (laplacianValues.length === 0) return 0;
  
  const mean = laplacianValues.reduce((a, b) => a + b, 0) / laplacianValues.length;
  const variance = laplacianValues.reduce((sum, val) => sum + (val - mean) ** 2, 0) / laplacianValues.length;
  
  const normalizedVariance = Math.min(1, Math.sqrt(variance) / 50);
  
  return normalizedVariance;
}

/**
 * Detect moiré patterns using simplified frequency analysis
 * Screens show periodic patterns from pixel grid when photographed
 */
function detectMoirePatterns(grayscale: number[][]): number {
  const height = grayscale.length;
  const width = grayscale[0]?.length || 0;
  
  if (height < 8 || width < 8) return 0;
  
  let horizontalPeriodicity = 0;
  let verticalPeriodicity = 0;
  
  for (let y = 0; y < height; y++) {
    const row = grayscale[y];
    let signChanges = 0;
    let lastDiff = 0;
    
    for (let x = 2; x < width; x++) {
      const diff = row[x] - row[x - 2];
      if (lastDiff !== 0 && diff * lastDiff < 0) {
        signChanges++;
      }
      lastDiff = diff;
    }
    
    horizontalPeriodicity += signChanges / (width - 2);
  }
  horizontalPeriodicity /= height;
  
  for (let x = 0; x < width; x++) {
    let signChanges = 0;
    let lastDiff = 0;
    
    for (let y = 2; y < height; y++) {
      const diff = grayscale[y][x] - grayscale[y - 2][x];
      if (lastDiff !== 0 && diff * lastDiff < 0) {
        signChanges++;
      }
      lastDiff = diff;
    }
    
    verticalPeriodicity += signChanges / (height - 2);
  }
  verticalPeriodicity /= width;
  
  const periodicityScore = (horizontalPeriodicity + verticalPeriodicity) / 2;
  
  const normalizedScore = Math.min(1, periodicityScore * 2);
  
  return normalizedScore;
}

/**
 * Analyze a single frame for texture/moire patterns
 */
export function analyzeFrame(
  state: AnalyzerState,
  canvas: HTMLCanvasElement,
  faceBox: { minX: number; minY: number; maxX: number; maxY: number }
): TextureAnalysisResult | null {
  const faceRegion = extractFaceRegion(canvas, faceBox);
  if (!faceRegion) return null;
  
  const { grayscale } = downscaleImageData(faceRegion, ANALYSIS_CONFIG.TILE_SIZE);
  
  const moireScore = detectMoirePatterns(grayscale);
  const textureVariance = computeLaplacianVariance(grayscale);
  
  state.moireScores.push(moireScore);
  state.varianceScores.push(textureVariance);
  state.frameCount++;
  
  if (state.moireScores.length > ANALYSIS_CONFIG.MAX_FRAMES) {
    state.moireScores.shift();
    state.varianceScores.shift();
  }
  
  if (state.frameCount < ANALYSIS_CONFIG.MIN_FRAMES) {
    return {
      moireScore,
      textureVariance,
      isLikelySpoof: false,
      confidence: state.frameCount / ANALYSIS_CONFIG.MIN_FRAMES,
      reason: 'Analyzing...',
    };
  }
  
  const avgMoire = state.moireScores.reduce((a, b) => a + b, 0) / state.moireScores.length;
  const avgVariance = state.varianceScores.reduce((a, b) => a + b, 0) / state.varianceScores.length;
  
  // Real-time analysis: NEVER flag as spoof during live updates
  // Only the final analysis (getFinalAnalysis) can determine spoof status
  // This prevents accidental capture of transient spoof flags
  
  const confidence = Math.min(1, state.frameCount / ANALYSIS_CONFIG.MIN_FRAMES);
  
  return {
    moireScore: avgMoire,
    textureVariance: avgVariance,
    isLikelySpoof: false,  // Always false during real-time - use getFinalAnalysis for decision
    confidence,
    reason: 'Analyzing...',
  };
}

/**
 * Reset analyzer state for a new verification session
 */
export function resetAnalyzerState(state: AnalyzerState): void {
  state.frameCount = 0;
  state.moireScores = [];
  state.varianceScores = [];
}

/**
 * Get final analysis result for submission
 * Only flags spoof if confidence is high enough to avoid false positives
 */
export function getFinalAnalysis(state: AnalyzerState): TextureAnalysisResult {
  if (state.moireScores.length === 0) {
    return {
      moireScore: 0,
      textureVariance: 0,
      isLikelySpoof: false,
      confidence: 0,
      reason: 'No frames analyzed',
    };
  }
  
  const avgMoire = state.moireScores.reduce((a, b) => a + b, 0) / state.moireScores.length;
  const avgVariance = state.varianceScores.reduce((a, b) => a + b, 0) / state.varianceScores.length;
  const confidence = Math.min(1, state.frameCount / ANALYSIS_CONFIG.MIN_FRAMES);
  
  const moireSuspicious = avgMoire > ANALYSIS_CONFIG.MOIRE_THRESHOLD;
  const varianceSuspicious = avgVariance < ANALYSIS_CONFIG.VARIANCE_THRESHOLD;
  
  // Only flag as spoof if:
  // 1. Confidence is high enough (enough frames analyzed)
  // 2. BOTH indicators are suspicious (require stronger evidence to block XP)
  const hasEnoughConfidence = confidence >= ANALYSIS_CONFIG.CONFIDENCE_THRESHOLD;
  const isLikelySpoof = hasEnoughConfidence && moireSuspicious && varianceSuspicious;
  
  let reason: string | undefined;
  if (isLikelySpoof) {
    reason = 'Screen/photo detected (pattern + uniformity)';
  } else if (hasEnoughConfidence && (moireSuspicious || varianceSuspicious)) {
    // Log the suspicious signal but don't block (data gathering)
    reason = moireSuspicious ? 'Periodic patterns (monitoring)' : 'Low texture (monitoring)';
  }
  
  return {
    moireScore: avgMoire,
    textureVariance: avgVariance,
    isLikelySpoof,
    confidence,
    reason,
  };
}
