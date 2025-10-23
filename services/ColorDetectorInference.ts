import ColorTFLite from './ColorTFLiteNative'
import { findClosestColor } from './ColorMatcher'

export type InferenceResult = { family: string; hex: string; realName: string; score?: number }

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

export async function inferColorFromRGB(rgb: { r: number; g: number; b: number }, confidenceThreshold = 0.6): Promise<InferenceResult | null> {
  try {
    console.log("ColorDetectorInference: Starting color inference for RGB:", rgb);
    const loaded = await ensureModelLoaded();
    const sr = rgb.r / 255;
    const sg = rgb.g / 255;
    const sb = rgb.b / 255;
    
    if (!loaded) {
      console.log("ColorDetectorInference: Model not loaded, using fallback ColorMatcher");
      const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3);
      return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
    }

    console.log("ColorDetectorInference: Using TensorFlow Lite model for inference");
    const Color = require('colorjs.io');
    const detected = new (Color as any)('srgb', [sr, sg, sb]).to('lab');
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
      return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
    }
    
    const score = res.score ?? 0;
    const idx = res.index;
    console.log("ColorDetectorInference: Final prediction - Index:", idx, "Score:", score, "Threshold:", confidenceThreshold);
    
    if (score >= confidenceThreshold) {
      const labels = require('../android/app/src/main/assets/labels.json') as string[];
      const label = labels[idx] || '';
      const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3);
      return { family: label || (match.closest_match.family || match.closest_match.name), hex: match.closest_match.hex, realName: match.closest_match.name, score };
    }
    
    const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3);
    return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name, score };
  } catch (e) {
    console.log("ColorDetectorInference: Error during inference:", e);
    try { const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3); return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name } } catch (_e2) { return null }
  }
}

export default { inferColorFromRGB }
