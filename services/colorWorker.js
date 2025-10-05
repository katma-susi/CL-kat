// Simple worker for color matching. Runs inside react-native-threads if available.
// Listens for JSON messages: { type: 'match', id, rgb, topN }
// Replies with JSON: { type: 'result', id, result }

const Color = require('colorjs.io');
const dataset = require('../colormodel.json');

function normalizeHex(hex) {
  if (!hex) return '#000000';
  hex = String(hex).trim();
  if (!hex.startsWith('#')) hex = '#' + hex;
  if (hex.length === 4) {
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex.toLowerCase();
}

function rgbToLab(rgb) {
  const srgb = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
  const c = new (Color)('srgb', srgb);
  return c.to('lab');
}

// Precompute dataset lab and rgb
const PRE = (dataset || []).map((row) => {
  try {
    let labColor = null;
    if (row.lab && Array.isArray(row.lab) && row.lab.length >= 3) {
      labColor = new (Color)('lab', row.lab);
    } else {
      labColor = new (Color)(normalizeHex(row.hex)).to('lab');
    }
    const hx = normalizeHex(row.hex).slice(1);
    const r = parseInt(hx.slice(0, 2), 16) || 0;
    const g = parseInt(hx.slice(2, 4), 16) || 0;
    const b = parseInt(hx.slice(4, 6), 16) || 0;
    return { ...row, labColor, rgb: [r, g, b] };
  } catch (e) {
    return { ...row, labColor: new (Color)('lab', [0, 0, 0]), rgb: [0, 0, 0] };
  }
});

function findClosest(rgb, topN) {
  try {
    const srgb = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
    const detectedColor = new (Color)('srgb', srgb);
    const detectedLab = detectedColor.to('lab');

    const prefilterCount = Math.min(40, PRE.length);
    const rgbCandidates = PRE
      .map((row) => {
        const dr = rgb[0] - row.rgb[0];
        const dg = rgb[1] - row.rgb[1];
        const db = rgb[2] - row.rgb[2];
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
      return {
        name: row.name,
        hex: normalizeHex(row.hex),
        family: row.family,
        deltaE: Number((isFinite(dE) ? Number(dE) : 9999).toFixed(2)),
      };
    });

    results.sort((a, b) => a.deltaE - b.deltaE);
    const out = {
      detected_color_rgb: rgb,
      detected_color_hex: normalizeHex(rgb.map((v) => v.toString(16).padStart(2, '0')).join('')),
      closest_match: results[0],
      alternatives: results.slice(1, topN),
    };
    return out;
  } catch (e) {
    return null;
  }
}

// react-native-threads will expose a global postMessage/onmessage when running as a thread.
function tryWire() {
  try {
    if (typeof global?.onmessage === 'function' || typeof onmessage === 'function') {
      // already wired by environment
    }
  } catch (e) {
    // ignore
  }
}

// Message handler (works in both RN Thread and node-like envs that expose onmessage)
const handleMessage = (raw) => {
  try {
    const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!msg || !msg.type) return;
    if (msg.type === 'match') {
      const res = findClosest(msg.rgb || [0, 0, 0], msg.topN || 3);
      const out = { type: 'result', id: msg.id, result: res };
      try {
        if (typeof postMessage === 'function') postMessage(JSON.stringify(out));
        else if (typeof global?.postMessage === 'function') global.postMessage(JSON.stringify(out));
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // ignore
  }
};

if (typeof self !== 'undefined' && typeof self.onmessage !== 'undefined') {
  self.onmessage = (ev) => handleMessage(ev.data);
} else if (typeof onmessage !== 'undefined') {
  onmessage = (ev) => handleMessage(ev.data);
} else if (typeof global !== 'undefined') {
  global.onmessage = (ev) => handleMessage(ev.data);
}

tryWire();
