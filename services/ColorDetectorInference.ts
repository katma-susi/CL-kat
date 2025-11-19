import ColorTFLite from './ColorTFLiteNative'
import { findClosestColor } from './ColorMatcher'

export type InferenceResult = { family: string; hex: string; realName: string; score?: number; confidence?: number }

async function ensureModelLoaded() {
  try {
    console.log("ColorDetectorInference: Attempting to load TensorFlow Lite model...");
    await ColorTFLite.loadModel();
    console.log("ColorDetectorInference: TensorFlow Lite model loaded successfully!");
    return true;
  } catch (e) {
    console.log("ColorDetectorInference: Failed to load TensorFlow Lite model:", e);
    return false;
  }
}

function scaleLabForModel(l: number, a: number, b: number) {
  return { l: l / 100.0, a: a / 128.0, b: b / 128.0 }
}

function preprocessRGBForShadow(rgb: { r: number; g: number; b: number }) {
  // Make a simple, fast preprocessing step to reduce shadow/overexposure issues
  // Strategy:
  // - If pixel is very dark, boost chromaticity and set a reasonable intensity
  // - If pixel is very bright, slightly clamp to avoid wash-out
  // - Apply light gamma correction for dark pixels
  try {
    let { r, g, b } = rgb;
    r = Math.round(r); g = Math.round(g); b = Math.round(b);
    const avg = (r + g + b) / 3;

    let outR = r, outG = g, outB = b;

    // Dark (shadow) handling: boost chromaticity and set moderate intensity
    if (avg < 90) {
      const sum = (r + g + b) || 1;
      const nr = r / sum; const ng = g / sum; const nb = b / sum;
      // pick a target intensity so the color is visible but not clipped
      const targetIntensity = Math.min(220, Math.max(120, Math.round(avg * 1.8)));
      outR = Math.round(nr * targetIntensity);
      outG = Math.round(ng * targetIntensity);
      outB = Math.round(nb * targetIntensity);
      // gentle gamma to lift midtones
      const gamma = 0.85;
      outR = Math.round(255 * Math.pow(outR / 255, gamma));
      outG = Math.round(255 * Math.pow(outG / 255, gamma));
      outB = Math.round(255 * Math.pow(outB / 255, gamma));
    }

    // Bright (overexposed) handling: scale down a bit to recover color
    if (avg > 230) {
      const maxc = Math.max(r, g, b) || 1;
      const scale = 230 / maxc;
      outR = Math.round(outR * scale);
      outG = Math.round(outG * scale);
      outB = Math.round(outB * scale);
    }

    // Clamp values
    outR = Math.min(255, Math.max(0, outR));
    outG = Math.min(255, Math.max(0, outG));
    outB = Math.min(255, Math.max(0, outB));

    return { r: outR, g: outG, b: outB };
  } catch (e) {
    return rgb;
  }
}

export async function inferColorFromRGB(rgb: { r: number; g: number; b: number }, confidenceThreshold = 0.65): Promise<InferenceResult | null> {
  try {
    console.log("ColorDetectorInference: Starting color inference for RGB:", rgb);
    const loaded = await ensureModelLoaded();
    // Preprocess the RGB to reduce shadow/overexposure errors
    const pre = preprocessRGBForShadow(rgb);
    const sr = pre.r / 255;
    const sg = pre.g / 255;
    const sb = pre.b / 255;
    
    if (!loaded) {
      console.log("ColorDetectorInference: Model not loaded, using fallback ColorMatcher");
      const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3);
      return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name, confidence: match.closest_match.confidence };
    }

    console.log("ColorDetectorInference: Using TensorFlow Lite model for inference");
    let detected;
    try {
      const Color = require('colorjs.io');
      detected = new Color('srgb', [sr, sg, sb]).to('lab');
    } catch (colorError) {
      console.log("ColorDetectorInference: Color.js failed, using manual RGB to LAB conversion");
      //first git commit -m "first commit"Manual RGB to LAB conversion as fallback
      const r = sr > 0.04045 ? Math.pow((sr + 0.055) / 1.055, 2.4) : sr / 12.92;
      const g = sg > 0.04045 ? Math.pow((sg + 0.055) / 1.055, 2.4) : sg / 12.92;
      const b = sb > 0.04045 ? Math.pow((sb + 0.055) / 1.055, 2.4) : sb / 12.92;
      
      const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
      const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
      const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
      
      const fx = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
      const fy = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
      const fz = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);
      
      const l = 116 * fy - 16;
      const a = 500 * (fx - fy);
      const b_lab = 200 * (fy - fz);
      
      detected = { coords: [l, a, b_lab] };
    }
    const l = detected.coords[0];
    const a = detected.coords[1];
    const b = detected.coords[2];
    const scaled = scaleLabForModel(l, a, b);
    console.log("ColorDetectorInference: Scaled LAB values:", scaled);
    
    const res = await ColorTFLite.predictLab(scaled.l, scaled.a, scaled.b);
    console.log("ColorDetectorInference: TensorFlow Lite prediction result:", res);
    
    if (!res) {
      console.log("ColorDetectorInference: TensorFlow Lite prediction failed, using fallback");
      const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3);
      return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name, confidence: match.closest_match.confidence };
    }
    
    const score = res.score ?? 0;
    const confidenceFromModel = Number((score * 100).toFixed(2));
    const idx = res.index;
    console.log("ColorDetectorInference: Final prediction - Index:", idx, "Score:", score, "Threshold:", confidenceThreshold);
    
    // Two-stage detection: Model + Delta E validation (ColorBlindPal approach)
    // Use matcher on preprocessed RGB as well to be consistent under shadow/lighting
    const matcherResult = findClosestColor([pre.r, pre.g, pre.b], 3);
    const matcherConfidence = matcherResult.closest_match.confidence || 50;
    
    if (score >= confidenceThreshold) {
      const labels = require('../android/app/src/main/assets/labels.json') as string[];
      const label = labels[idx] || '';
      const datasetFamily = (matcherResult.closest_match.family || '').trim();
      const chosenFamily = datasetFamily || label || matcherResult.closest_match.name;

      // If the detection is from a very dark region, prefer the matcher a bit more
      // Determine luminance (L) to detect shadow situations
      const detectedL = l;
      let blendedConfidence = Math.round((confidenceFromModel + matcherConfidence) / 2);
      if (detectedL < 30) {
        // shadow: weighted blend favoring matcher
        blendedConfidence = Math.round((confidenceFromModel * 0.4) + (matcherConfidence * 0.6));
      } else if (detectedL < 55) {
        // somewhat dim: slight preference to matcher
        blendedConfidence = Math.round((confidenceFromModel * 0.45) + (matcherConfidence * 0.55));
      }

      console.log("ColorDetectorInference: Model accepted - blending model conf:", confidenceFromModel, "with matcher conf:", matcherConfidence, "= ", blendedConfidence, "(L=", detectedL, ")");

      return { family: chosenFamily, hex: matcherResult.closest_match.hex, realName: matcherResult.closest_match.name, score, confidence: blendedConfidence };
    }
    
    const datasetFamily = (matcherResult.closest_match.family || '').trim();
    const fallbackFamily = datasetFamily || matcherResult.closest_match.name;
    console.log("ColorDetectorInference: Model rejected, using matcher fallback with confidence:", matcherConfidence);
    // Use matcher confidence for fallback (preprocessed input used)
    return { family: fallbackFamily, hex: matcherResult.closest_match.hex, realName: matcherResult.closest_match.name, score, confidence: matcherConfidence };
  } catch (e) {
    console.log("ColorDetectorInference: Error during inference:", e);
    try { const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3); return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name, confidence: match.closest_match.confidence } } catch (_e2) { return null }
  }
}

export default { inferColorFromRGB }
