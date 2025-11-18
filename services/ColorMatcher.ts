import Color from 'colorjs.io';
import dataset from '../android/app/src/main/assets/colormodel.json';

export type ColorRow = {
  name: string;
  hex: string;
  family?: string;
  lab?: number[];
};

export type MatchResult = {
  detected_color_rgb: number[];
  detected_color_hex: string;
  closest_match: {
    name: string;
    hex: string;
    family?: string;
    deltaE: number;
    confidence?: number;
  };
  alternatives: Array<{
    name: string;
    hex: string;
    family?: string;
    deltaE: number;
    confidence?: number;
  }>;
};

function normalizeHex(hex: string): string {
  if (!hex) return '#000000';
  hex = hex.trim();
  if (!hex.startsWith('#')) hex = '#' + hex;
  if (hex.length === 4) {
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex.toLowerCase();
}

type PrecomputedRow = ColorRow & { labColor: any };
type PrecomputedRowRGB = PrecomputedRow & { rgb: [number, number, number] };
const PRECOMPUTED_DATASET: PrecomputedRowRGB[] = (dataset as ColorRow[]).map((row) => {
  try {
    let labColor: any = null;
    if (row.lab && Array.isArray(row.lab) && row.lab.length >= 3) {
      labColor = new (Color as any)('lab', row.lab);
    } else {
      labColor = new (Color as any)(normalizeHex(row.hex)).to('lab');
    }
    const hx = normalizeHex(row.hex).slice(1);
    const r = parseInt(hx.slice(0, 2), 16) || 0;
    const g = parseInt(hx.slice(2, 4), 16) || 0;
    const b = parseInt(hx.slice(4, 6), 16) || 0;
    return { ...row, labColor, rgb: [r, g, b] };
  } catch (e) {
    const labColor = new (Color as any)('lab', [0, 0, 0]);
    return { ...row, labColor, rgb: [0, 0, 0] };
  }
});

export function findClosestColor(detectedRGB: number[], topN = 3): MatchResult {
  if (!Array.isArray(detectedRGB) || detectedRGB.length < 3) {
    throw new Error('detectedRGB must be an array of three numbers [r,g,b]');
  }

  const srgb: [number, number, number] = [detectedRGB[0] / 255, detectedRGB[1] / 255, detectedRGB[2] / 255];
  const detectedColor = new (Color as any)('srgb', srgb as any);
  const detectedLab = detectedColor.to('lab');

  const prefilterCount = Math.min(40, PRECOMPUTED_DATASET.length);
  const rgbCandidates = PRECOMPUTED_DATASET
    .map((row) => {
      const dr = detectedRGB[0] - row.rgb[0];
      const dg = detectedRGB[1] - row.rgb[1];
      const db = detectedRGB[2] - row.rgb[2];
      const dist2 = dr * dr + dg * dg + db * db;
      return { row, dist2 };
    })
    .sort((a, b) => a.dist2 - b.dist2)
    .slice(0, prefilterCount)
    .map((r) => r.row);

  const results = rgbCandidates.map((row) => {
    let dE = 9999;
    try {
      dE = detectedLab.deltaE2000 ? detectedLab.deltaE2000(row.labColor) : (detectedColor.deltaE ? detectedColor.deltaE(row.labColor, { method: '2000' }) : NaN);
    } catch (e) {
      dE = 9999;
    }
    // Convert deltaE to confidence: lower deltaE = higher confidence
    // deltaE <= 1 is imperceptible, <= 2 is just noticeable
    // We map this to a confidence percentage
    const confidence = Math.max(0, Math.min(100, 100 - (dE * 10)));
    
    return {
      name: row.name,
      hex: normalizeHex(row.hex),
      family: row.family,
      deltaE: Number((isFinite(dE) ? Number(dE) : 9999).toFixed(2)),
      confidence: Math.round(confidence),
    };
  });

  results.sort((a, b) => a.deltaE - b.deltaE);

  const output: MatchResult = {
    detected_color_rgb: detectedRGB,
    detected_color_hex: normalizeHex(
      detectedRGB.map((v) => v.toString(16).padStart(2, '0')).join('')
    ),
    closest_match: results[0],
    alternatives: results.slice(1, topN),
  };

  return output;
}
