import ColorTFLite from './ColorTFLiteNative'
import { findClosestColor } from './ColorMatcher'

export type InferenceResult = { family: string; hex: string; realName: string; score?: number }

async function ensureModelLoaded() {
  try {
    await ColorTFLite.loadModel()
    return true
  } catch (_e) {
    return false
  }
}

function scaleLabForModel(l: number, a: number, b: number) {
  return { l: l / 100.0, a: a / 128.0, b: b / 128.0 }
}

export async function inferColorFromRGB(rgb: { r: number; g: number; b: number }, confidenceThreshold = 0.6): Promise<InferenceResult | null> {
  try {
    const loaded = await ensureModelLoaded()
    const sr = rgb.r / 255
    const sg = rgb.g / 255
    const sb = rgb.b / 255
    if (!loaded) {
      const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3)
      return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name }
    }

    const Color = require('colorjs.io')
    const detected = new (Color as any)('srgb', [sr, sg, sb]).to('lab')
    const l = detected.coords[0]
    const a = detected.coords[1]
    const b = detected.coords[2]
    const scaled = scaleLabForModel(l, a, b)
    const res = await ColorTFLite.predictLab(scaled.l, scaled.a, scaled.b)
    if (!res) {
      const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3)
      return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name }
    }
    const score = res.score ?? 0
    const idx = res.index
    if (score >= confidenceThreshold) {
      const labels = require('../android/app/src/main/assets/labels.json') as string[]
      const label = labels[idx] || ''
      const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3)
      return { family: label || (match.closest_match.family || match.closest_match.name), hex: match.closest_match.hex, realName: match.closest_match.name, score }
    }
    const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3)
    return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name, score }
  } catch (_e) {
    try { const match = findClosestColor([rgb.r, rgb.g, rgb.b], 3); return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name } } catch (_e2) { return null }
  }
}

export default { inferColorFromRGB }
