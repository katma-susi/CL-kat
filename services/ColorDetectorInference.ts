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

export async function inferColorFromRGB(rgb: { r: number; g: number; b: number }, confidenceThreshold = 0.65): Promise<InferenceResult | null> {
  try {
    console.log("ColorDetectorInference: Starting color inference for RGB:", rgb);
    const loaded = await ensureModelLoaded();
    const sr = rgb.r / 255;
    const sg = rgb.g / 255;
    const sb = rgb.b / 255;
    
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
    const matcherResult = findClosestColor([rgb.r, rgb.g, rgb.b], 3);
    const matcherConfidence = matcherResult.closest_match.confidence || 50;
    
    if (score >= confidenceThreshold) {
      const labels = require('../android/app/src/main/assets/labels.json') as string[];
      const label = labels[idx] || '';
      const datasetFamily = (matcherResult.closest_match.family || '').trim();
      const chosenFamily = datasetFamily || label || matcherResult.closest_match.name;
      
      // Use the average of model confidence and matcher confidence for more robust results
      const blendedConfidence = Math.round((confidenceFromModel + matcherConfidence) / 2);
      console.log("ColorDetectorInference: Model accepted - blending model conf:", confidenceFromModel, "with matcher conf:", matcherConfidence, "= ", blendedConfidence);
      
      return { family: chosenFamily, hex: matcherResult.closest_match.hex, realName: matcherResult.closest_match.name, score, confidence: blendedConfidence };
    }
    
    const datasetFamily = (matcherResult.closest_match.family || '').trim();
    const fallbackFamily = datasetFamily || matcherResult.closest_match.name;
    console.log("ColorDetectorInference: Model rejected, using matcher fallback with confidence:", matcherConfidence);
    // Use matcher confidence for fallback
    return { family: fallbackFamily, hex: matcherResult.closest_match.hex, realName: matcherResult.closest_match.name, score, confidence: matcherConfidence };
  } catch (e) {
    console.log("ColorDetectorInference: Error during inference:", e);
    try { const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3); return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name, confidence: match.closest_match.confidence } } catch (_e2) { return null }
  }
}

export default { inferColorFromRGB }
