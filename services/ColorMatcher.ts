import Color from 'colorjs.io';
import dataset from '../colormodel.json';

export type ColorRow = {
  name: string;
  hex: string; // like '#7b463b' or '7b463b'
  family?: string;
  lab?: number[]; // optional precomputed Lab [L,a,b]
};

export type MatchResult = {
  detected_color_rgb: number[]; // [r,g,b]
  detected_color_hex: string; // '#rrggbb'
  closest_match: {
    name: string;
    hex: string;
    family?: string;
    deltaE: number;
  };
  alternatives: Array<{
    name: string;
    hex: string;
    family?: string;
    deltaE: number;
  }>;
};

function normalizeHex(hex: string): string {
  if (!hex) return '#000000';
  hex = hex.trim();
  if (!hex.startsWith('#')) hex = '#' + hex;
  if (hex.length === 4) {
    // short form #rgb -> #rrggbb
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex.toLowerCase();
}

function hexToLab(hex: string) {
  const h = normalizeHex(hex);
  const c = new Color(h);
  return c.to('lab');
}

function rgbToLab(rgb: number[]) {
  // rgb array [r,g,b] in 0-255
  const srgb: [number, number, number] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
  const c = new (Color as any)('srgb', srgb as any);
  return c.to('lab');
}

// Precompute Lab values for the dataset once to speed up repeated lookups.
type PrecomputedRow = ColorRow & { labColor: any };
type PrecomputedRowRGB = PrecomputedRow & { rgb: [number, number, number] };
const PRECOMPUTED_DATASET: PrecomputedRowRGB[] = (dataset as ColorRow[]).map((row) => {
  // Prefer using precomputed lab from the dataset when available (array [L,a,b]).
  // Convert the array into a Color lab-space instance to allow deltaE2000 calls.
  try {
    let labColor: any = null;
    if (row.lab && Array.isArray(row.lab) && row.lab.length >= 3) {
      // convert numeric lab array into a Color instance in 'lab' space
      labColor = new (Color as any)('lab', row.lab);
    } else {
      // fallback: compute from hex (only when dataset lacks lab)
      labColor = new (Color as any)(normalizeHex(row.hex)).to('lab');
    }
    // also precompute rgb (0-255) for fast approximate filtering
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

  // Convert detected RGB to a Color instance and then to lab-space Color for deltaE calculation
  const srgb: [number, number, number] = [detectedRGB[0] / 255, detectedRGB[1] / 255, detectedRGB[2] / 255];
  const detectedColor = new (Color as any)('srgb', srgb as any);
  // lab-space instance derived from detectedColor to allow deltaE calculations
  const detectedLab = detectedColor.to('lab');
  

  // Fast prefilter: compute simple Euclidean RGB distance (cheap) and pick a small candidate set
  const prefilterCount = Math.min(40, PRECOMPUTED_DATASET.length); // adjust for performance/accuracy tradeoff
  const rgbCandidates = PRECOMPUTED_DATASET
    .map((row) => {
      const dr = detectedRGB[0] - row.rgb[0];
      const dg = detectedRGB[1] - row.rgb[1];
      const db = detectedRGB[2] - row.rgb[2];
      const dist2 = dr * dr + dg * dg + db * db; // squared distance
      return { row, dist2 };
    })
    .sort((a, b) => a.dist2 - b.dist2)
    .slice(0, prefilterCount)
    .map((r) => r.row);

  // Now compute DeltaE only on the filtered candidates (more expensive but far fewer)
  const results = rgbCandidates.map((row) => {
    // row.labColor is a Color instance in lab space
    let dE = 9999;
    try {
      dE = detectedLab.deltaE2000 ? detectedLab.deltaE2000(row.labColor) : (detectedColor.deltaE ? detectedColor.deltaE(row.labColor, { method: '2000' }) : NaN);
    } catch (e) {
      // fallback: if deltaE not available, treat as large distance
      dE = 9999;
    }
    return {
      name: row.name,
      hex: normalizeHex(row.hex),
      family: row.family,
      deltaE: Number((isFinite(dE) ? Number(dE) : 9999).toFixed(2)),
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

// (Removed Node test block — keep this module focused on runtime use in React Native)
