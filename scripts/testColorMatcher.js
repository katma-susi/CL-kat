const Color = require('colorjs.io').default || require('colorjs.io');
const dataset = require('../colormodel.json');

function normalizeHex(hex) {
  if (!hex) return '#000000';
  hex = hex.trim();
  if (!hex.startsWith('#')) hex = '#' + hex;
  if (hex.length === 4) {
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex.toLowerCase();
}

function rgbToLab(rgb) {
  const srgb = rgb.map((v) => v / 255);
  const c = new Color('srgb', srgb);
  return c.to('lab');
}

function hexToLab(hex) {
  const h = normalizeHex(hex);
  const c = new Color(h);
  return c.to('lab');
}

function findClosestColor(detectedRGB, topN = 3) {
  const detectedLab = rgbToLab(detectedRGB);
  const results = dataset.map((row) => {
    const datasetLab = hexToLab(row.hex);
    const dE = detectedLab.deltaE2000(datasetLab);
    return {
      name: row.name,
      hex: normalizeHex(row.hex),
      family: row.family,
      deltaE: Number(dE.toFixed(2)),
    };
  });
  results.sort((a, b) => a.deltaE - b.deltaE);
  return {
    detected_color_rgb: detectedRGB,
    detected_color_hex: normalizeHex(
      detectedRGB.map((v) => v.toString(16).padStart(2, '0')).join('')
    ),
    closest_match: results[0],
    alternatives: results.slice(1, topN),
  };
}

const test = findClosestColor([120,80,50], 3);
console.log(JSON.stringify(test, null, 2));
