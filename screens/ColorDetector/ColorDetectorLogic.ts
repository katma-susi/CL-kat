export function getFallbackColor() {
  return { family: 'Unknown', hex: '#000000', realName: 'Unknown' };
}
export const getJpegUtils = () => {
  try {
    const jpegjsLocal = require('jpeg-js');
    const BufferLocal = require('buffer').Buffer;
    return { jpegjs: jpegjsLocal, BufferShim: BufferLocal };
  } catch (_e) {
    return { jpegjs: null, BufferShim: null };
  }
};
export const getJpegOrientation = (buf: any): number => {
  try {
    let arr: Uint8Array;
    if (buf && typeof buf === 'object' && typeof buf.length === 'number' && typeof buf[0] === 'number') {
      arr = buf;
    } else if (buf && typeof (buf as any).toArray === 'function') {
      arr = (buf as any).toArray();
    } else {
      try { arr = new Uint8Array(buf); } catch (_e) { return 1; }
    }
    if (arr.length < 4) return 1;
    if (arr[0] !== 0xFF || arr[1] !== 0xD8) return 1;
    let offset = 2;
    while (offset < arr.length) {
      if (arr[offset] !== 0xFF) break;
      const marker = arr[offset + 1];
      if (marker === 0xE1) {
        const len = (arr[offset + 2] << 8) + arr[offset + 3];
        const exifStart = offset + 4;
        if (exifStart + 6 <= arr.length) {
          if (arr[exifStart] === 0x45 && arr[exifStart + 1] === 0x78 && arr[exifStart + 2] === 0x69 && arr[exifStart + 3] === 0x66 && arr[exifStart + 4] === 0x00 && arr[exifStart + 5] === 0x00) {
            const tiffOffset = exifStart + 6;
            const isLittle = arr[tiffOffset] === 0x49 && arr[tiffOffset + 1] === 0x49;
            const readUint16 = (off: number) => isLittle ? (arr[off] + (arr[off+1]<<8)) : ((arr[off]<<8) + arr[off+1]);
            const readUint32 = (off: number) => isLittle ? (arr[off] + (arr[off+1]<<8) + (arr[off+2]<<16) + (arr[off+3]<<24)) : ((arr[off]<<24) + (arr[off+1]<<16) + (arr[off+2]<<8) + arr[off+3]);
            const magic = readUint16(tiffOffset + 2);
            if (magic !== 0x002A && magic !== 42) return 1;
            const ifdOffset = readUint32(tiffOffset + 4);
            let dirStart = tiffOffset + ifdOffset;
            if (dirStart + 2 > arr.length) return 1;
            const entries = readUint16(dirStart);
            dirStart += 2;
            for (let i = 0; i < entries; i++) {
              const entryOffset = dirStart + i * 12;
              if (entryOffset + 12 > arr.length) break;
              const tag = readUint16(entryOffset);
              if (tag === 0x0112) {
                const type = readUint16(entryOffset + 2);
                const count = readUint32(entryOffset + 4);
                let valueOff = entryOffset + 8;
                let val = 0;
                if (type === 3 && count === 1) {
                  val = readUint16(valueOff);
                } else {
                  const actualValOffset = tiffOffset + readUint32(valueOff);
                  if (actualValOffset + 2 <= arr.length) val = readUint16(actualValOffset);
                }
                if (val >= 1 && val <= 8) return val;
                return 1;
              }
            }
          }
        }
        offset += 2 + len;
        continue;
      } else {
        if (offset + 4 > arr.length) break;
        const len = (arr[offset + 2] << 8) + arr[offset + 3];
        offset += 2 + len;
        continue;
      }
    }
  } catch (_e) {}
  return 1;
};
export const hexToRgb = (hex: string): number[] => {
  if (!hex) return [0,0,0];
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0,2), 16) || 0;
  const g = parseInt(h.slice(2,4), 16) || 0;
  const b = parseInt(h.slice(4,6), 16) || 0;
  return [r,g,b];
};

export const rgbToHex = (r: number, g: number, b: number): string => {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

// Color space helpers: sRGB -> linear -> XYZ -> Lab
export const srgbToLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export const linearToSrgb = (v: number) => {
  const c = Math.max(0, Math.min(1, v));
  return c <= 0.0031308 ? Math.round((12.92 * c) * 255) : Math.round(((1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255));
};

const rgbToXyz = (r: number, g: number, b: number) => {
  // convert sRGB to linear
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  // sRGB D65 conversion matrix
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  return { X, Y, Z };
};

const xyzToLab = (X: number, Y: number, Z: number) => {
  // Reference white D65
  const Xn = 0.95047;
  const Yn = 1.00000;
  const Zn = 1.08883;
  const eps = 216/24389; // 0.008856
  const k = 24389/27; // 903.3
  const fx = X / Xn;
  const fy = Y / Yn;
  const fz = Z / Zn;
  const f = (t: number) => t > eps ? Math.cbrt(t) : (t * k + 16) / 116;
  const l = 116 * f(fy) - 16;
  const a = 500 * (f(fx) - f(fy));
  const b = 200 * (f(fy) - f(fz));
  return { L: l, a, b };
};

export const rgbToLab = (r: number, g: number, b: number) => {
  const xyz = rgbToXyz(r, g, b);
  return xyzToLab(xyz.X, xyz.Y, xyz.Z);
};

// Compute per-channel white gains from a measured white RGB sample
export const computeWhiteGains = (r: number, g: number, b: number) => {
  // convert to linear
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const avg = (lr + lg + lb) / 3 || 1e-6;
  const gr = avg / Math.max(lr, 1e-6);
  const gg = avg / Math.max(lg, 1e-6);
  const gb = avg / Math.max(lb, 1e-6);
  return { gr, gg, gb };
};

// Simple per-channel white normalization matching Color Meter: corr = 255 / white_channel
export const computeSimpleWhiteGains = (r: number, g: number, b: number) => {
  const rr = Math.max(1, r);
  const gg = Math.max(1, g);
  const bb = Math.max(1, b);
  const gr = 255 / rr;
  const ggain = 255 / gg;
  const gb = 255 / bb;
  return { gr, gg: ggain, gb };
};

// Apply per-channel gains to a sample RGB and return corrected sRGB 0..255
export const applyWhiteBalanceCorrection = (sample: {r:number;g:number;b:number}, gains: {gr:number;gg:number;gb:number}) => {
  const lr = srgbToLinear(sample.r) * gains.gr;
  const lg = srgbToLinear(sample.g) * gains.gg;
  const lb = srgbToLinear(sample.b) * gains.gb;
  const cr = linearToSrgb(Math.min(1, lr));
  const cg = linearToSrgb(Math.min(1, lg));
  const cb = linearToSrgb(Math.min(1, lb));
  return { r: cr, g: cg, b: cb };
};

// Simple apply: multiply each channel by gain and clamp to 0..255 (Color Meter approach)
export const applySimpleWhiteBalanceCorrection = (sample: {r:number;g:number;b:number}, gains: {gr:number;gg:number;gb:number}) => {
  const r = Math.round(Math.max(0, Math.min(255, sample.r * gains.gr)));
  const g = Math.round(Math.max(0, Math.min(255, sample.g * gains.gg)));
  const b = Math.round(Math.max(0, Math.min(255, sample.b * gains.gb)));
  return { r, g, b };
};

// Store computed white gains for automatic calibration
let calibratedGains: { gr: number; gg: number; gb: number } | null = null;

export const setCalibratedGains = (gains: { gr: number; gg: number; gb: number }) => {
  calibratedGains = gains;
};

export const getCalibratedGains = () => calibratedGains;

export const clearCalibratedGains = () => { calibratedGains = null; };
export const decodeJpegAndSampleCenter = (base64: string): { r:number,g:number,b:number } | null => {
  const { jpegjs: _jpegjs, BufferShim: _BufferShim } = getJpegUtils();
  if (!_jpegjs || !_BufferShim) return null;
  try {
    if (base64.length > 5_000_000) return null;
    const buffer = _BufferShim.from(base64, 'base64');
    const decoded = _jpegjs.decode(buffer, {useTArray: true});
    if (!decoded || !decoded.width || !decoded.data) return null;
    const w = decoded.width; const h = decoded.height; const data = decoded.data;
    const cx = Math.floor(w/2); const cy = Math.floor(h/2);
    const half = 4;
    let rSum=0,gSum=0,bSum=0,count=0;
    for (let yy = Math.max(0, cy-half); yy <= Math.min(h-1, cy+half); yy++) {
      for (let xx = Math.max(0, cx-half); xx <= Math.min(w-1, cx+half); xx++) {
        const idx = (yy * w + xx) * 4;
        rSum += data[idx]; gSum += data[idx+1]; bSum += data[idx+2]; count++;
      }
    }
    if (count === 0) return null;
    return { r: Math.round(rSum/count), g: Math.round(gSum/count), b: Math.round(bSum/count) };
  } catch (_e) {
    return null;
  }
};
export function decodeJpegAndSampleAt(base64: string, relX: number, relY: number): { r:number,g:number,b:number } | null;
export function decodeJpegAndSampleAt(base64: string, relX: number, relY: number, pw?: number, ph?: number): { r:number,g:number,b:number } | null;
export function decodeJpegAndSampleAt(base64: string, relX: number, relY: number, pw?: number, ph?: number): { r:number,g:number,b:number } | null {
  const { jpegjs: _jpegjs, BufferShim: _BufferShim } = getJpegUtils();
  if (!_jpegjs || !_BufferShim) return null;
  try {
    if (base64.length > 8_000_000) return null;
    const buffer = _BufferShim.from(base64, 'base64');
    const decoded = _jpegjs.decode(buffer, {useTArray: true});
    if (!decoded || !decoded.width || !decoded.data) return null;
    const w = decoded.width; const h = decoded.height; const data = decoded.data;
    if (!pw || !ph) return decodeJpegAndSampleCenter(base64);
    const ix = Math.max(0, Math.min(w - 1, Math.round((relX / pw) * w)));
    const iy = Math.max(0, Math.min(h - 1, Math.round((relY / ph) * h)));
    const half = 4;
    let rSum=0,gSum=0,bSum=0,count=0;
    for (let yy = Math.max(0, iy-half); yy <= Math.min(h-1, iy+half); yy++) {
      for (let xx = Math.max(0, ix-half); xx <= Math.min(w-1, ix+half); xx++) {
        const idx = (yy * w + xx) * 4;
        rSum += data[idx]; gSum += data[idx+1]; bSum += data[idx+2]; count++;
      }
    }
    if (count === 0) return null;
    return { r: Math.round(rSum/count), g: Math.round(gSum/count), b: Math.round(bSum/count) };
  } catch (_e) {
    return null;
  }
}

export async function processWithIndicator(setProcessing: (v:boolean)=>void, fn: ()=>Promise<any>) {
  try {
    try { setProcessing(true); } catch (_e) {}
  try { await new Promise<void>((resolve) => setTimeout(() => resolve(), 50)); } catch (_e) {}
    const res = await fn();
    return res;
  } finally {
    try { setProcessing(false); } catch (_e) {}
  }
}

export async function mapPressToPreviewCoords(e: any, previewRef: any, previewLayoutRef: { current: { x:number,y:number,width:number,height:number } }) {
  const pageX = (e && e.nativeEvent && typeof e.nativeEvent.pageX === 'number') ? e.nativeEvent.pageX : (e && typeof e.pageX === 'number' ? e.pageX : 0);
  const pageY = (e && e.nativeEvent && typeof e.nativeEvent.pageY === 'number') ? e.nativeEvent.pageY : (e && typeof e.pageY === 'number' ? e.pageY : 0);
  const locX = (e && e.nativeEvent && typeof e.nativeEvent.locationX === 'number') ? e.nativeEvent.locationX : undefined;
  const locY = (e && e.nativeEvent && typeof e.nativeEvent.locationY === 'number') ? e.nativeEvent.locationY : undefined;
  let px = previewLayoutRef.current?.x || 0;
  let py = previewLayoutRef.current?.y || 0;
  let pw = previewLayoutRef.current?.width || 0;
  let ph = previewLayoutRef.current?.height || 0;
  try {
    if (previewRef && previewRef.current && typeof previewRef.current.measureInWindow === 'function') {
      await new Promise<void>((resolve) => {
        try {
          previewRef.current.measureInWindow((mx: number, my: number, mw: number, mh: number) => {
            if (typeof mx === 'number' && typeof my === 'number' && typeof mw === 'number' && typeof mh === 'number') {
              previewLayoutRef.current = { x: mx, y: my, width: mw, height: mh };
              px = mx; py = my; pw = mw; ph = mh;
            }
            resolve();
          });
        } catch (_e) { resolve(); }
      });
    }
  } catch (_e) {}
  let relX = (typeof pageX === 'number') ? Math.max(0, Math.min(pw, pageX - px)) : NaN;
  let relY = (typeof pageY === 'number') ? Math.max(0, Math.min(ph, pageY - py)) : NaN;
  const outsideThreshold = 10;
  const isOutside = isNaN(relX) || isNaN(relY) || relX < -outsideThreshold || relY < -outsideThreshold || relX > pw + outsideThreshold || relY > ph + outsideThreshold;
  if (isOutside && typeof locX === 'number' && typeof locY === 'number') {
    relX = Math.max(0, Math.min(pw, locX));
    relY = Math.max(0, Math.min(ph, locY));
  }
  if (isNaN(relX) || isNaN(relY)) { relX = 0; relY = 0; }
  try {
    const key = (previewLayoutRef && previewLayoutRef.current) ? `${Math.round(previewLayoutRef.current.width)}x${Math.round(previewLayoutRef.current.height)}` : 'default';
    const globalAny: any = globalThis as any;
    if (!globalAny.__clTapCorrection) globalAny.__clTapCorrection = {};
    if (!globalAny.__clTapCorrection[key]) globalAny.__clTapCorrection[key] = { dx: 0, dy: 0, count: 0 };
    const entry = globalAny.__clTapCorrection[key];
    const appliedDx = Math.max(-40, Math.min(40, Math.round(entry.dx)));
    const appliedDy = Math.max(-40, Math.min(40, Math.round(entry.dy)));
    const correctedX = Math.max(0, Math.min(pw, relX + appliedDx));
    const correctedY = Math.max(0, Math.min(ph, relY + appliedDy));
    try {
      const observedDx = (typeof locX === 'number' && !isOutside) ? (pageX - px - locX) : (pageX - px - relX);
      const observedDy = (typeof locY === 'number' && !isOutside) ? (pageY - py - locY) : (pageY - py - relY);
      if (Math.abs(observedDx) < 200 && Math.abs(observedDy) < 200) {
        const alpha = 0.08;
        entry.dx = entry.dx * (1 - alpha) + observedDx * alpha;
        entry.dy = entry.dy * (1 - alpha) + observedDy * alpha;
        entry.count = (entry.count || 0) + 1;
      }
    } catch (_e) {}
    return { relX: Math.round(correctedX), relY: Math.round(correctedY) };
  } catch (_e) { return { relX: Math.round(relX), relY: Math.round(relY) }; }
}

export function mapLocalPressToPreviewCoords(e: any, previewLayoutRef: { current: { x:number,y:number,width:number,height:number } }) {
  try {
    const locX = e && e.nativeEvent && typeof e.nativeEvent.locationX === 'number' ? e.nativeEvent.locationX : 0;
    const locY = e && e.nativeEvent && typeof e.nativeEvent.locationY === 'number' ? e.nativeEvent.locationY : 0;
    const pw = previewLayoutRef.current?.width || 0;
    const ph = previewLayoutRef.current?.height || 0;
    let relX = Math.max(0, Math.min(pw, locX));
    let relY = Math.max(0, Math.min(ph, locY));
    const key = (previewLayoutRef && previewLayoutRef.current) ? `${Math.round(previewLayoutRef.current.width)}x${Math.round(previewLayoutRef.current.height)}` : 'default';
    const globalAny: any = globalThis as any;
    if (!globalAny.__clTapCorrection) globalAny.__clTapCorrection = {};
    if (!globalAny.__clTapCorrection[key]) globalAny.__clTapCorrection[key] = { dx: 0, dy: 0, count: 0 };
    const entry = globalAny.__clTapCorrection[key];
    const appliedDx = Math.max(-40, Math.min(40, Math.round(entry.dx)));
    const appliedDy = Math.max(-40, Math.min(40, Math.round(entry.dy)));
    const correctedX = Math.max(0, Math.min(pw, relX + appliedDx));
    const correctedY = Math.max(0, Math.min(ph, relY + appliedDy));
    return { relX: Math.round(correctedX), relY: Math.round(correctedY) };
  } catch (_e) {
    return { relX: 0, relY: 0 };
  }
}

// White surface validation functions
export const isWhiteSurface = (r: number, g: number, b: number): boolean => {
  // Use Lab-based check: high lightness and low chroma indicates neutral white
  try {
    const lab = rgbToLab(r, g, b);
    const L = lab.L; // 0..100 typical
    const a = lab.a;
    const b_ = lab.b;
    const chroma = Math.sqrt(a*a + b_*b_);
    // Relaxed thresholds to tolerate typical printing paper under smartphone lighting:
    // - Lightness >= 60 (allows RGB ~140-160 range)
    // - Chroma <= 16 (low color cast)
    if (L >= 60 && chroma <= 16) return true;
    // Fallback RGB test - more lenient to handle varied lighting conditions
    const minWhiteThreshold = 140;  // Lowered from 170
    const maxDelta = 35;             // Increased from 28 to allow more variance
    if (r < minWhiteThreshold || g < minWhiteThreshold || b < minWhiteThreshold) return false;
    const maxVal = Math.max(r, g, b);
    const minVal = Math.min(r, g, b);
    const delta = maxVal - minVal;
    return delta <= maxDelta;
  } catch (_e) {
    // On error, fallback to RGB check
    const minWhiteThreshold = 140;  // Lowered from 170
    const maxDelta = 35;             // Increased from 28
    if (r < minWhiteThreshold || g < minWhiteThreshold || b < minWhiteThreshold) return false;
    const maxVal = Math.max(r, g, b);
    const minVal = Math.min(r, g, b);
    const delta = maxVal - minVal;
    return delta <= maxDelta;
  }
};



// Adaptive white calibration: stores a reference white from user calibration
let calibratedWhiteLab: { L: number; a: number; b: number; chroma: number } | null = null;

export const setCalibratedWhite = (r: number, g: number, b: number) => {
  const lab = rgbToLab(r, g, b);
  const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  calibratedWhiteLab = { L: lab.L, a: lab.a, b: lab.b, chroma };
};

export const getCalibratedWhite = () => calibratedWhiteLab;

export const clearCalibratedWhite = () => {
  calibratedWhiteLab = null;
};

// Check white surface against calibration reference with tolerance
const isWhiteSurfaceCalibrated = (r: number, g: number, b: number): boolean => {
  if (!calibratedWhiteLab) return false;
  const lab = rgbToLab(r, g, b);
  const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  // Tolerance: relaxed a bit for handheld phones
  const lTol = 14;
  const chromaTol = 12;
  return (
    Math.abs(lab.L - calibratedWhiteLab.L) <= lTol &&
    chroma <= calibratedWhiteLab.chroma + chromaTol
  );
};

export const getWhiteSurfaceStatus = (r: number, g: number, b: number, useCalibration?: boolean): { status: 'ok' | 'not_white', message: string } => {
  // If calibration is available and enabled, use adaptive threshold
  if (useCalibration && calibratedWhiteLab) {
    if (isWhiteSurfaceCalibrated(r, g, b)) {
      return { status: 'ok', message: '' };
    }
    // If calibration exists but doesn't match, still try default test
  }
  if (!isWhiteSurface(r, g, b)) {
    return { status: 'not_white', message: 'Left box not on white paper - ensure white surface is visible' };
  }
  return { status: 'ok', message: '' };
};

// Median sampling: given an array of RGB values, return the median
export const medianRgb = (samples: Array<{r: number; g: number; b: number}>): {r: number; g: number; b: number} | null => {
  if (samples.length === 0) return null;
  const rs = samples.map(s => s.r).sort((a, b) => a - b);
  const gs = samples.map(s => s.g).sort((a, b) => a - b);
  const bs = samples.map(s => s.b).sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return {
    r: samples.length % 2 === 1 ? rs[mid] : Math.round((rs[mid - 1] + rs[mid]) / 2),
    g: samples.length % 2 === 1 ? gs[mid] : Math.round((gs[mid - 1] + gs[mid]) / 2),
    b: samples.length % 2 === 1 ? bs[mid] : Math.round((bs[mid - 1] + bs[mid]) / 2),
  };
};

// Return fraction (0..1) of pixels in a patch that are near-white by a simple RGB test
export const fractionWhiteInSamples = (samples: Array<{r:number;g:number;b:number}>, minWhiteThreshold = 170, maxDelta = 28) => {
  if (!samples || samples.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s) continue;
    if (s.r >= minWhiteThreshold && s.g >= minWhiteThreshold && s.b >= minWhiteThreshold) {
      const maxv = Math.max(s.r, s.g, s.b);
      const minv = Math.min(s.r, s.g, s.b);
      if ((maxv - minv) <= maxDelta) count++;
    }
  }
  return count / samples.length;
};