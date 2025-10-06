import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, TouchableWithoutFeedback, Platform, PermissionsAndroid, Image, PanResponder, Animated } from 'react-native';
// view-shot used to capture the rendered preview for exact-on-screen sampling
let captureRef: any = null;
try { captureRef = require('react-native-view-shot').captureRef; } catch (_e) { captureRef = null; }
import { ICONS } from '../../Images';
import { styles } from './ColorDetector.styles';
import { getRandomColor } from './ColorDetectorLogic';
import { findClosestColor } from '../../services/ColorMatcher';
import { findClosestColorAsync } from '../../services/ColorMatcherWorker';
import { speak, initTts, stop as stopTts } from '../../utils/tts';

// Optional camera modules (lazy-require)
let RNCamera: any = null;
let VisionCamera: any = null;
try { RNCamera = require('react-native-camera').RNCamera; } catch (err) { RNCamera = null; }
try { VisionCamera = require('react-native-vision-camera'); } catch (err) { VisionCamera = null; }
// try to import runOnJS from reanimated for calling JS from worklet
let runOnJS: any = null;
try { runOnJS = require('react-native-reanimated').runOnJS; } catch (_e) { runOnJS = null; }
// Check whether the native worklets core package is installed and available
// Conservative detection: only enable worklets when the native worklets core
// package is present AND reanimated's runOnJS is available. This avoids
// compiling unsafe/unsupported worklet code (Hermes errors like "invalid
// empty parentheses '( )'") which crash the app on some devices.
let workletsCoreAvailable = false;
try {
  const wc = require('react-native-worklets-core');
  if (wc && typeof runOnJS === 'function') {
    workletsCoreAvailable = true;
  } else {
    workletsCoreAvailable = false;
  }
} catch (_e) {
  workletsCoreAvailable = false;
}
// Only print the disabled message once to avoid log spam
const _frameProcessorDisabledLogged = { value: false } as any;
// image decoder libs (node/browser compatible shims installed via yarn)
// Lazy getter for jpeg decode utilities to avoid allocating/loading them at module import time
const getJpegUtils = () => {
  try {
    // require when actually decoding to reduce startup memory usage
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jpegjsLocal = require('jpeg-js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BufferLocal = require('buffer').Buffer;
    return { jpegjs: jpegjsLocal, BufferShim: BufferLocal };
  } catch (_e) {
    return { jpegjs: null, BufferShim: null };
  }
};

// Read EXIF Orientation from a JPEG Buffer (returns 1..8 or 1 if unknown)
const getJpegOrientation = (buf: any): number => {
  try {
    // Ensure we have a Uint8Array view
    let arr: Uint8Array;
    if (buf && typeof buf === 'object' && typeof buf.length === 'number' && typeof buf[0] === 'number') {
      arr = buf;
    } else if (buf && typeof buf === 'object' && (buf as any).toString && (buf as any).toString() === '[object Uint8Array]') {
      arr = buf as Uint8Array;
    } else if (buf && typeof (buf as any).toArray === 'function') {
      arr = (buf as any).toArray();
    } else {
      // try Buffer -> Uint8Array
      try { arr = new Uint8Array(buf); } catch (_e) { return 1; }
    }
    if (arr.length < 4) return 1;
    // check SOI
    if (arr[0] !== 0xFF || arr[1] !== 0xD8) return 1;
    let offset = 2;
    while (offset < arr.length) {
      if (arr[offset] !== 0xFF) break;
      const marker = arr[offset + 1];
      // APP1 marker
      if (marker === 0xE1) {
        const len = (arr[offset + 2] << 8) + arr[offset + 3];
        // Exif header starts at offset+4
        const exifStart = offset + 4;
        // check "Exif\0\0"
        if (exifStart + 6 <= arr.length) {
          if (arr[exifStart] === 0x45 && arr[exifStart + 1] === 0x78 && arr[exifStart + 2] === 0x69 && arr[exifStart + 3] === 0x66 && arr[exifStart + 4] === 0x00 && arr[exifStart + 5] === 0x00) {
            // TIFF header starts at exifStart + 6
            const tiffOffset = exifStart + 6;
            const isLittle = arr[tiffOffset] === 0x49 && arr[tiffOffset + 1] === 0x49;
            const readUint16 = (off: number) => isLittle ? (arr[off] + (arr[off+1]<<8)) : ((arr[off]<<8) + arr[off+1]);
            const readUint32 = (off: number) => isLittle ? (arr[off] + (arr[off+1]<<8) + (arr[off+2]<<16) + (arr[off+3]<<24)) : ((arr[off]<<24) + (arr[off+1]<<16) + (arr[off+2]<<8) + arr[off+3]);
            // check magic number 0x002A
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
                // orientation tag
                const type = readUint16(entryOffset + 2);
                const count = readUint32(entryOffset + 4);
                let valueOff = entryOffset + 8;
                let val = 0;
                if (type === 3 && count === 1) {
                  // short in-place
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
        // move past this marker
        offset += 2 + len;
        continue;
      } else {
        // other marker: has length
        if (offset + 4 > arr.length) break;
        const len = (arr[offset + 2] << 8) + arr[offset + 3];
        offset += 2 + len;
        continue;
      }
    }
  } catch (_e) {
    // ignore
  }
  return 1;
};

// Crosshair config: tweak these to change length (factor of preview), thickness (px), and dot size
const CROSSHAIR_LENGTH_FACTOR = 0.5; // 0..1 portion of preview dimension (0.5 = 50%)
const CROSSHAIR_LENGTH_FACTOR_FROZEN = 0.35; // shorter lines when frozen to preserve appearance
const CROSSHAIR_THICKNESS = 2; // px line thickness
const CROSSHAIR_DOT_SIZE = 10; // px diameter of center dot (visual size)
const CROSSHAIR_DOT_BORDER = 2; // px border around dot (white ring)
// Container size should include the dot plus border so centering math is consistent across devices
const CROSSHAIR_CONTAINER_SIZE = CROSSHAIR_DOT_SIZE + CROSSHAIR_DOT_BORDER * 2;

// How far from the top of the preview the Adjust pill should sit (fraction of preview height)
// Increase this to move the pill lower. For example: 0.06 = 6% down
const ADJUST_TOP_FACTOR = 0.06;

interface ColorDetectorProps {
  onBack: () => void;
  openSettings: () => void;
  voiceEnabled?: boolean;
  colorCodesVisible?: boolean;
  voiceMode?: 'family' | 'real' | 'disable';
  showFamily?: boolean;
  showRealName?: boolean;
}

const ColorDetector: React.FC<ColorDetectorProps> = ({ onBack, openSettings, voiceEnabled=true, colorCodesVisible=true, voiceMode='family', showFamily=true, showRealName=true }) => {
  // detected: user-selected sample while frozen (set on tap)
  const [detected, setDetected] = useState<{family:string,hex:string,realName:string} | null>(null);
  // liveDetected: continuously-updated live sample shown while not frozen
  const [liveDetected, setLiveDetected] = useState<{family:string,hex:string,realName:string} | null>(null);
  // frozenSnapshot: snapshot of the live sample at the moment the user froze the frame
  const [frozenSnapshot, setFrozenSnapshot] = useState<{family:string,hex:string,realName:string} | null>(null);
  const [_running, setRunning] = useState(true);
  const [freeze, setFreeze] = useState(false);
  const freezeRef = useRef<boolean>(false);
  const [crosshairPos, setCrosshairPos] = useState<{x:number,y:number}|null>(null);
  const intervalRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const previewLayout = useRef<{x:number,y:number,width:number,height:number}>({ x:0,y:0,width:0,height:0 });
  const previewRef = useRef<any>(null);
  const cameraContainerRef = useRef<any>(null);
  // when frame is frozen we capture one static image uri (small) and reuse it for taps
  const frozenImageUriRef = useRef<string | null>(null);
  const [previewSize, setPreviewSize] = useState<{width:number,height:number} | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  // (removed persistent decoded image cache to avoid retaining large RGBA buffers in memory)
  // adjust mode state
  const [adjusting, setAdjusting] = useState(false);
  // whether we're actively attempting a capture (keeps camera active)
  const [capturing, setCapturing] = useState(false);
  // pan for dragging uploaded image when in adjust mode
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const panResponder = useRef<any>(null);
  // Track natural and scaled sizes for the uploaded image so we can
  // scale it to cover the preview and clamp pan bounds when dragging.
  const [imageNaturalSize, setImageNaturalSize] = useState<{w:number,h:number} | null>(null);
  const [imageScaledSize, setImageScaledSize] = useState<{w:number,h:number} | null>(null);
  // Debug overlay state for uploaded-image mapping (helps visualize mapping during testing)
  const [uploadDebug, setUploadDebug] = useState<any | null>(null);
  // toast shown when we invoke TTS to help debug silent TTS
    // (Removed transient TTS debug toast)
  // Suppress automatic live speech around capture to avoid audio being cut by camera lifecycle
  const suppressSpeechRef = useRef<boolean>(false);
  // Track pending freeze-speak timers so we can cancel them when user taps
  const freezeSpeakTimersRef = useRef<number[]>([]);
  // throttle live speech so we don't spam the user when live detection updates rapidly
  const lastSpokenRef = useRef<number>(0);
  const LIVE_SPEAK_COOLDOWN = 1200; // ms
  const [cameraPermission, setCameraPermission] = useState<string | null>(null);
  // We'll discover devices explicitly using the VisionCamera APIs (getAvailableCameraDevices)
  const [availableDevices, setAvailableDevices] = useState<any[] | null>(null);
  const availableDevice = availableDevices ? availableDevices.find((d:any) => d.position === 'back') ?? availableDevices[0] : null;

  // Toggle to enable verbose debug logging in this file. Keep false in production/dev to avoid flooding Metro/DevTools.
  const DEBUG_LOG = true;
  const debugLog = (...args: any[]) => { try { if (DEBUG_LOG) console.log(...args); } catch (_e) {} };

  // processing guard so we don't overlap snapshot work
  const processingFrameRef = useRef(false);

  // JS handler invoked from the frame-processor worklet (via runOnJS) every Nth frame.

  // safeSpeak: show a short on-screen toast then call the project's speak() helper.
  // Returns whatever speak() returns (may be boolean or a Promise).
  const safeSpeak = (text: string, opts?: { force?: boolean }) => {
    try { if (suppressSpeechRef.current && !(opts && opts.force)) { debugLog('[ColorDetector] safeSpeak suppressed ->', text); return false; } } catch (_e) {}
    try { debugLog('[ColorDetector] safeSpeak invoked ->', text); } catch (_e) {}
    try {
      // no on-screen toast in release; just speak
      try { debugLog('[ColorDetector] safeSpeak would speak ->', text); } catch (_e) {}
    } catch (_e) {}
    try {
  const res = speak(text);
      try { debugLog('[ColorDetector] safeSpeak called utils.speak ->', res); } catch (_e) {}
      return res;
    } catch (err) {
      debugLog('safeSpeak: speak threw', err);
      return false;
    }
  };

  // cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      // nothing to cleanup for tts toast
    };
  }, []);

  // Ensure the TTS module is primed early so freeze-time speaks don't miss initialization
  useEffect(() => {
    try { initTts(); debugLog('[ColorDetector] initTts called'); } catch (_e) {}
  }, []);
  // It takes a lightweight snapshot (if available) and samples the center 3x3 block.
  const processSnapshotAndSample = async (): Promise<boolean> => {
    try {
      if (processingFrameRef.current) return false;
      // don't process while frozen (user wants to manually sample)
      if (freeze) return false;
      processingFrameRef.current = true;
      // Prefer a lightweight snapshot API if available on the camera ref
      const ref = cameraRef.current as any;
  if (!ref) { processingFrameRef.current = false; return false; }

      // Try a low-cost snapshot first (some VisionCamera builds expose takeSnapshot)
      let blobLike: any = null;
      try {
        if (ref.takeSnapshot) {
          // takeSnapshot is often faster and lighter than takePhoto. Use a modest width to limit memory.
          blobLike = await ref.takeSnapshot({ quality: 0.25, skipMetadata: true, width: 320 });
        } else if (ref.takePhoto) {
          blobLike = await ref.takePhoto({ qualityPrioritization: 'speed', skipMetadata: true, width: 320 });
        } else if (ref.takePictureAsync) {
          blobLike = await ref.takePictureAsync({ quality: 0.3, base64: true, width: 320, doNotSave: true });
        }
      } catch (err) {
          debugLog('[ColorDetector] processSnapshotAndSample: snapshot error', err);
        blobLike = null;
      }

  if (!blobLike) { processingFrameRef.current = false; return false; }

      // Resolve base64 from returned object shapes
      let base64: string | null = null;
      let uri: string | undefined = blobLike?.path || blobLike?.uri || blobLike?.localUri || blobLike?.filePath || blobLike?.file;
      // Some camera implementations return an absolute path like '/data/user/...', so normalize to file://
      try {
        if (uri && typeof uri === 'string' && uri.startsWith('/')) {
          uri = 'file://' + uri;
        }
      } catch (_e) { /* ignore */ }
      debugLog('[ColorDetector] processSnapshotAndSample: resolved snapshot uri ->', uri);

      // If we have a file or content URI, prefer the native decoder (lower memory, faster).
      // Normalization for leading '/' -> 'file://' was already done above.
      try {
        if (uri && typeof uri === 'string' && (uri.startsWith('file://') || uri.startsWith('content://'))) {
          try {
            const normalizedUri = (uri.startsWith('/') ? ('file://' + uri) : uri);
            debugLog('[ColorDetector] processSnapshotAndSample: trying native decode on', normalizedUri);
            const { decodeScaledRegion } = require('../../services/ImageDecoder');
            if (typeof decodeScaledRegion === 'function') {
              // Use preview layout mapping; fall back to center coords if preview not measured
              const pw = previewLayout.current?.width || 0;
              const ph = previewLayout.current?.height || 0;
              const cx = pw ? Math.round(pw / 2) : 0;
              const cy = ph ? Math.round(ph / 2) : 0;
              const nativeSample = await decodeScaledRegion(normalizedUri, cx, cy, pw, ph);
              if (nativeSample && typeof nativeSample.r === 'number') {
                const match = await findClosestColorAsync([nativeSample.r, nativeSample.g, nativeSample.b], 3).catch(() => null);
                if (match) {
                  const live = { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
                  if (!freeze) setLiveDetected(live);
                  processingFrameRef.current = false;
                  debugLog('[ColorDetector] processSnapshotAndSample: native decode -> match', live);
                  return true;
                }
              }
            }
          } catch (nativeErr) {
            debugLog('[ColorDetector] processSnapshotAndSample: native decode failed', nativeErr);
            // fall through to RNFS/base64 below
          }
        }
      } catch (_e) {
        // continue to RNFS/base64 fallback
      }

      if (blobLike?.base64) base64 = blobLike.base64;
      // If we have a file uri, try to read it if RNFS is present. Normalize file:// for RNFS.
      if (!base64 && uri && typeof uri === 'string' && uri.startsWith('file://')) {
        try {
          const RNFS = require('react-native-fs');
          base64 = await RNFS.readFile(uri.replace('file://',''), 'base64');
          debugLog('[ColorDetector] processSnapshotAndSample: RNFS readFile succeeded, base64 length=', base64?.length ?? 0);
        } catch (_e) {
          debugLog('[ColorDetector] processSnapshotAndSample: RNFS readFile failed', _e);
          // ignore
        }
      }

  if (!base64) { processingFrameRef.current = false; return false; }

      // decode with existing helper and sample a small 3x3 around center
      try {
        const { jpegjs: _jpegjs, BufferShim: _BufferShim } = getJpegUtils();
  if (!_jpegjs || !_BufferShim) { processingFrameRef.current = false; return false; }
        // Guard against extremely large payloads which may OOM on low-memory devices
        if (base64.length > 5_000_000) {
          // If base64 is huge (> ~5MB), skip decoding to avoid memory blowups
          debugLog('[ColorDetector] processSnapshotAndSample: skipping large image decode, size=', base64.length);
          processingFrameRef.current = false;
          return false;
        }
        const buffer = _BufferShim.from(base64, 'base64');
        const decoded = _jpegjs.decode(buffer, { useTArray: true });
  if (!decoded || !decoded.width || !decoded.data) { processingFrameRef.current = false; return false; }
        const w = decoded.width; const h = decoded.height; const data = decoded.data;
        // center coordinates
        const cx = Math.floor(w/2); const cy = Math.floor(h/2);
        // sample a small 3x3 block around center to reduce compute/memory pressure
        let rSum=0,gSum=0,bSum=0,count=0;
        for (let yy = Math.max(0, cy-1); yy <= Math.min(h-1, cy+1); yy++) {
          for (let xx = Math.max(0, cx-1); xx <= Math.min(w-1, cx+1); xx++) {
            const idx = (yy * w + xx) * 4;
            rSum += data[idx]; gSum += data[idx+1]; bSum += data[idx+2]; count++;
          }
        }
        if (count === 0) { processingFrameRef.current = false; return false; }
        const sampled = { r: Math.round(rSum/count), g: Math.round(gSum/count), b: Math.round(bSum/count) };
        // compute match and update liveDetected if not frozen
        try {
          const match = await findClosestColorAsync([sampled.r, sampled.g, sampled.b], 3).catch(() => null);
          if (match) {
            const live = { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
            if (!freeze) setLiveDetected(live);
            processingFrameRef.current = false;
            return true;
          }
        } catch (err) {
          // ignore matching errors
        }
      }
      catch (err) {
  debugLog('[ColorDetector] processSnapshotAndSample: decode/sample failed', err);
      }

      processingFrameRef.current = false;
      return false;
    } catch (err) {
  debugLog('[ColorDetector] processSnapshotAndSample: unexpected', err);
      processingFrameRef.current = false;
      return false;
    }
  };

  // Capture the preview view as an image (PNG) and sample the pixel(s) at preview-relative coordinates.
  // Returns sampled { r,g,b } or null.
  const sampleFromPreviewSnapshot = async (relX: number, relY: number): Promise<{r:number,g:number,b:number}|null> => {
    try {
      if (!captureRef) return null;
      if (!previewRef.current) return null;
      const pw = previewLayout.current.width || 0;
      const ph = previewLayout.current.height || 0;
      if (!pw || !ph) return null;
      // Capture to a temporary file path (tmpfile) so we can leverage the native decoder which handles orientation and PNG/JPEG reliably
      const tmp = await captureRef(previewRef.current, { format: 'png', quality: 0.9, result: 'tmpfile', width: Math.round(pw), height: Math.round(ph) });
      if (!tmp) return null;
      // normalize absolute paths to file:// if needed
      const normalized = (typeof tmp === 'string' && tmp.startsWith('/')) ? ('file://' + tmp) : tmp;
      try {
        const { decodeScaledRegion } = require('../../services/ImageDecoder');
        if (typeof decodeScaledRegion === 'function') {
          // decodeScaledRegion expects preview-relative coords
          const nativeSample = await decodeScaledRegion(normalized, relX, relY, pw, ph);
          if (nativeSample && typeof nativeSample.r === 'number') {
            return { r: nativeSample.r, g: nativeSample.g, b: nativeSample.b };
          }
        }
      } catch (err) {
        debugLog('[ColorDetector] sampleFromPreviewSnapshot: native decode of snapshot failed', err);
      }
      return null;
    } catch (err) {
      debugLog('[ColorDetector] sampleFromPreviewSnapshot: unexpected', err);
      return null;
    }
  };

  // Create a frame-processor worklet that triggers processing every 10th frame.
  // This uses VisionCamera.useFrameProcessor and reanimated.runOnJS when available.
  let frameProcessor: any = null;
  try {
    // Only create a frameProcessor when both VisionCamera frame processors are supported
    // and the native worklets core is available (installed + linked). Otherwise skip.
    if (workletsCoreAvailable && VisionCamera && (VisionCamera as any).useFrameProcessor) {
      const useFP = (VisionCamera as any).useFrameProcessor;
      frameProcessor = useFP((frame: any) => {
        'worklet';
  // persistent counter in worklet global
  // eslint-disable-next-line no-undef
  if ((globalThis as any).__clFPCount == null) (globalThis as any).__clFPCount = 0;
  // eslint-disable-next-line no-undef
  (globalThis as any).__clFPCount = ((globalThis as any).__clFPCount + 1) | 0;
  // sample every 20th frame (less frequent -> lower CPU/memory usage)
  // eslint-disable-next-line no-undef
  if (((globalThis as any).__clFPCount % 20) !== 0) return;
        // call JS handler if available
        try {
          if (typeof runOnJS === 'function') {
            runOnJS(processSnapshotAndSample)();
          } else {
            // fall back to no-op if runOnJS not present
          }
        } catch (_e) {
          // ignore worklet->JS errors
        }
      }, []);
    }
  } catch (_e) {
    frameProcessor = null;
  }
  if (!workletsCoreAvailable) {
  // Informational only; log once to avoid flooding logs when frame processors are disabled
  if (!_frameProcessorDisabledLogged.value) {
    _frameProcessorDisabledLogged.value = true;
    console.log('[ColorDetector] Frame processors disabled: react-native-worklets-core not available. To enable, install and rebuild the native app:');
    debugLog('  yarn add react-native-worklets-core');
    debugLog('  npx pod-install (iOS)');
    debugLog('  rebuild the Android app: cd android && ./gradlew assembleDebug');
  }
  }

  // Start detection and check permissions on mount
  useEffect(() => {
    // Check Android permission using PermissionsAndroid for reliability
    const checkPermission = async () => {
      try {
        if (Platform.OS === 'android') {
          const has = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
          setCameraPermission(has ? 'authorized' : 'denied');
        } else if (VisionCamera) {
          // Fallback: try vision-camera API
          if (VisionCamera.getCameraPermissionStatus) {
            const status = await VisionCamera.getCameraPermissionStatus();
            setCameraPermission(status);
          } else if (VisionCamera.Camera && VisionCamera.Camera.getCameraPermissionStatus) {
            const status = await VisionCamera.Camera.getCameraPermissionStatus();
            setCameraPermission(status);
          } else {
            setCameraPermission(null);
          }
        }
      } catch (err) {
  debugLog('permission check failed', err);
        setCameraPermission(null);
      }
    };
    checkPermission();
    // probe whether a native worker runtime is available (non-fatal)
    try {
      const probe = async () => {
        try {
          const { pingWorker } = require('../../services/ColorMatcherWorker');
          if (typeof pingWorker === 'function') {
            const ok = await pingWorker(500);
            debugLog('[ColorDetector] worker probe result:', ok);
          }
        } catch (_e) {
          // ignore
        }
      };
      probe();
    } catch (_e) {}

    startDetection();
    return () => {
      // stop periodic detection
      stopDetection();
      // best-effort release of camera resources to avoid holding memory/hardware on unmount
      try {
        const ref = cameraRef.current as any;
        if (ref) {
          if (typeof ref.stopPreview === 'function') {
            try { ref.stopPreview(); } catch (_e) { /* ignore */ }
          }
          if (typeof ref.pausePreview === 'function') {
            try { ref.pausePreview(); } catch (_e) { /* ignore */ }
          }
          // clear ref pointer
          try { cameraRef.current = null; } catch (_e) { /* ignore */ }
        }
      } catch (_e) {}
    };
    // startDetection/stopDetection are stable local functions (no external deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When permission becomes authorized, try to query available devices explicitly
  useEffect(() => {
    const discover = async () => {
      if (!VisionCamera) return;
      if (cameraPermission !== 'authorized') return;
      try {
        // Try the promise-based API
        if (VisionCamera.getAvailableCameraDevices) {
          const list = await VisionCamera.getAvailableCameraDevices();
          setAvailableDevices(list ?? null);
          // print only a compact summary to avoid very large object dumps
          debugLog('VisionCamera.getAvailableCameraDevices -> count=', Array.isArray(list) ? list.length : 0);
          return;
        }
        // Some versions may require Camera.getAvailableCameraDevices
        if (VisionCamera.Camera && VisionCamera.Camera.getAvailableCameraDevices) {
          const list = await VisionCamera.Camera.getAvailableCameraDevices();
          setAvailableDevices(list ?? null);
          debugLog('VisionCamera.Camera.getAvailableCameraDevices -> count=', Array.isArray(list) ? list.length : 0);
          return;
        }
      } catch (err) {
  debugLog('discover devices failed', err);
      }
    };
    discover();
  }, [cameraPermission]);

  // Speak when a new color family is detected
  useEffect(() => {
    // Only speak automatically while not frozen — when frozen we speak only on user taps
    if (!liveDetected || !voiceEnabled || freeze) return;
    if (voiceMode === 'disable') return;
    try {
      const now = Date.now();
      if (now - lastSpokenRef.current < LIVE_SPEAK_COOLDOWN) return;
      const textToSpeak = voiceMode === 'real' ? liveDetected.realName : liveDetected.family;
  const ok = safeSpeak(textToSpeak);
      lastSpokenRef.current = now;
      if (!ok) Alert.alert('Color', textToSpeak);
    } catch (err) {
  debugLog('TTS speak failed', err);
      const textToSpeak = voiceMode === 'real' ? liveDetected.realName : liveDetected.family;
      Alert.alert('Color', textToSpeak);
    }
  }, [liveDetected, voiceEnabled, freeze, voiceMode]);

  const startDetection = () => {
    stopDetection();
    intervalRef.current = setInterval(() => {
      // When running and not frozen, update the live detected sample for UI only
      // Use freezeRef.current to avoid stale closure capturing `freeze` value at interval creation
      if (!freezeRef.current) {
        // Try a lightweight snapshot/sample; if that fails, fall back to a synthetic random sample
        processSnapshotAndSample().then((ok) => {
          if (!ok) {
            const c = getRandomColor();
            try {
              const rgb = hexToRgb(c.hex);
              const match = findClosestColor(rgb, 3);
              const live = { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
              setLiveDetected(live);
            } catch (err) {
              setLiveDetected(c);
            }
          }
        }).catch(() => {
          const c = getRandomColor();
          try {
            const rgb = hexToRgb(c.hex);
            const match = findClosestColor(rgb, 3);
            const live = { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
            setLiveDetected(live);
          } catch (err) {
            setLiveDetected(c);
          }
        });
      }
    }, 800);
    setRunning(true);
  };

  const stopDetection = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
  };

  const toggleFreeze = () => {
    const next = !freeze;
    setFreeze(next);
    freezeRef.current = next;
    // when starting a freeze, suppress automatic live speech while we capture
    if (next) suppressSpeechRef.current = true;
  // no on-screen freeze/unfreeze toast
  debugLog('toggleFreeze ->', next);
    if (!next) {
      // unfreezing -> reset crosshair to center
      setCrosshairPos(null);
      // clear frozen snapshot when unfreezing
      setFrozenSnapshot(null);
      // clear stored frozen image
      frozenImageUriRef.current = null;
      // clear any uploaded image so camera preview resumes
      setSelectedImageUri(null);
    } else {
      // when freezing, set crosshair to center initially
      // center will be computed based on preview size; fallback to center of cameraArea via styles
      // measure the preview wrapper in window coordinates then set center
      setTimeout(() => {
        try {
          if (previewRef.current && previewRef.current.measureInWindow) {
            previewRef.current.measureInWindow((px: number, py: number, pw: number, ph: number) => {
              previewLayout.current = { x: px, y: py, width: pw, height: ph };
              const center = { x: pw / 2, y: ph / 2 };
              setCrosshairPos(center);
              // capture a frozen snapshot of the current live detection so UI doesn't update continuously
              setFrozenSnapshot(liveDetected);
              debugLog('toggleFreeze: measured preview ->', { px, py, pw, ph });
              // capture one frozen image to serve future tap samples without touching camera again
              (async () => {
                try {
                  // Attempt to capture a small snapshot/file and store its URI for later sampling
                  const ref: any = cameraRef.current;
                  if (ref && (ref.takeSnapshot || ref.takePhoto || ref.takePicture || ref.takePictureAsync || ref.capture)) {
                    const take = ref.takeSnapshot ? 'takeSnapshot' : ref.takePhoto ? 'takePhoto' : ref.takePicture ? 'takePicture' : ref.takePictureAsync ? 'takePictureAsync' : 'capture';
                    try {
                      const out = await (ref as any)[take]({ qualityPrioritization: 'speed', skipMetadata: true, width: 640, base64: false });
                      const uri = out?.path || out?.uri || out?.localUri || out?.file || null;
                      if (uri) {
                        // normalize absolute paths to file://
                        const normalized = (typeof uri === 'string' && uri.startsWith('/')) ? ('file://' + uri) : uri;
                        frozenImageUriRef.current = normalized;
                        debugLog('[ColorDetector] toggleFreeze: stored frozenImageUri', frozenImageUriRef.current);
                      }
                    } catch (_e) {
                      debugLog('[ColorDetector] toggleFreeze: frozen capture failed', _e);
                      frozenImageUriRef.current = null;
                    }
                  }
                } catch (_e) { frozenImageUriRef.current = null; }
              })();
              // Speak immediately when freezing so user hears the current live color.
              // If liveDetected is not available yet, attempt a quick center capture/sample and speak that.
              try {
                if (voiceEnabled && voiceMode !== 'disable' && liveDetected) {
                  const textToSpeak = voiceMode === 'real' ? liveDetected.realName : liveDetected.family;
                  try {
                    // show toast immediately for freeze so user sees TTS invocation even if TTS is delayed
                    // no on-screen toast; attempt to speak immediately
                    // Attempt forced speak twice (short retry) to improve chance audio plays
                    const speakWithLogging = (delayMs: number) => {
                      const tid = setTimeout(() => {
                        try {
                          const maybe = safeSpeak(textToSpeak, { force: true });
                          Promise.resolve(maybe).then((ok) => {
                            debugLog('[ColorDetector] freeze speak attempt result ->', ok, textToSpeak);
                            if (!ok) Alert.alert('Color', textToSpeak);
                          }).catch((err) => { debugLog('[ColorDetector] freeze speak promise rejected', err); Alert.alert('Color', textToSpeak); });
                        } catch (err) { debugLog('[ColorDetector] freeze speak threw', err); try { Alert.alert('Color', textToSpeak); } catch (_e2) {} }
                      }, delayMs) as unknown as number;
                      try { freezeSpeakTimersRef.current.push(tid); } catch (_e) {}
                    };
                    speakWithLogging(400);
                    speakWithLogging(900);
                    // clear suppression after retries
                    setTimeout(() => { try { suppressSpeechRef.current = false; } catch (_e) {} }, 1000);
                  } catch (_e) {
                    try { Alert.alert('Color', textToSpeak); } catch (_e2) {}
                  }
                } else if (voiceEnabled && voiceMode !== 'disable' && !liveDetected) {
                  // fire-and-forget center sample + speak as a fallback
                  (async () => {
                    try {
                      const c = await captureAndSampleCenter();
                      if (c) {
                        setFrozenSnapshot(c);
                        const textToSpeak = voiceMode === 'real' ? c.realName : c.family;
                        try {
                          // show toast immediately for freeze fallback
                          // no on-screen toast for fallback; attempt to speak
                          const speakWithLogging2 = (delayMs: number) => {
                            const tid2 = setTimeout(() => {
                              try {
                                const maybe2 = safeSpeak(textToSpeak, { force: true });
                                Promise.resolve(maybe2).then((ok) => {
                                  debugLog('[ColorDetector] freeze fallback speak result ->', ok, textToSpeak);
                                  if (!ok) Alert.alert('Color', textToSpeak);
                                }).catch((err) => { debugLog('[ColorDetector] freeze fallback speak promise rejected', err); Alert.alert('Color', textToSpeak); });
                              } catch (err) { debugLog('[ColorDetector] freeze fallback speak threw', err); try { Alert.alert('Color', textToSpeak); } catch (_e2) {} }
                            }, delayMs) as unknown as number;
                            try { freezeSpeakTimersRef.current.push(tid2); } catch (_e) {}
                          };
                          speakWithLogging2(400);
                          speakWithLogging2(900);
                          setTimeout(() => { try { suppressSpeechRef.current = false; } catch (_e) {} }, 1000);
                        } catch (_e) {
                          try { Alert.alert('Color', textToSpeak); } catch (_e2) {}
                        }
                      }
                    } catch (_e) {
                      // ignore sample failures
                    }
                  })();
                }
              } catch (_e) {
                // ignore TTS errors
              }
            });
          }
        } catch (err) { setCrosshairPos(null); }
      }, 50);
    }
  };

  const onScreenPress = (e: any) => {
    // Only allow moving the crosshair when frame is frozen
    if (!freeze) return;

    // Use absolute page coordinates and measure preview position to compute relative point
    const pageX = e.nativeEvent.pageX as number;
    const pageY = e.nativeEvent.pageY as number;
    try {
      if (previewRef.current && previewRef.current.measureInWindow) {
        previewRef.current.measureInWindow((px: number, py: number, pw: number, ph: number) => {
          debugLog('onScreenPress page:', { pageX, pageY }, 'preview measure:', { px, py, pw, ph });
          previewLayout.current = { x: px, y: py, width: pw, height: ph };
          const relX = Math.max(0, Math.min(pw, pageX - px));
          const relY = Math.max(0, Math.min(ph, pageY - py));
          debugLog('onScreenPress relative:', { relX, relY });
          // when frozen, tapping selects a new sampled color at that point
          // If an uploaded image is present, quickly determine if the tap is within the visible
          // image rect (cover-scaled + pan). If so, move the crosshair immediately; if not,
          // ignore the tap (user requested) without waiting for async sampling.
          try {
            if (selectedImageUri && imageScaledSize && previewLayout.current) {
              let panX = 0, panY = 0;
              try { panX = (pan.x as any).__getValue ? (pan.x as any).__getValue() : 0; } catch (_e) { panX = 0; }
              try { panY = (pan.y as any).__getValue ? (pan.y as any).__getValue() : 0; } catch (_e) { panY = 0; }
              const imageLeft = Math.round((pw - imageScaledSize.w) / 2) + panX;
              const imageTop = Math.round((ph - imageScaledSize.h) / 2) + panY;
              // If tap is outside visible image, ignore
              if (relX < imageLeft || relY < imageTop || relX > imageLeft + imageScaledSize.w || relY > imageTop + imageScaledSize.h) {
                debugLog('[ColorDetector] onScreenPress: tap outside uploaded image bounds, ignoring', { relX, relY, imageLeft, imageTop, scaled: imageScaledSize });
                return;
              }
              // move crosshair immediately for snappy feedback
              try { setCrosshairPos({ x: relX, y: relY }); } catch (_e) {}
            } else {
              // no uploaded image, move crosshair immediately
              try { setCrosshairPos({ x: relX, y: relY }); } catch (_e) {}
            }
          } catch (_e) {
            // fall back to previous behavior if any synchronous check fails
            try { setCrosshairPos({ x: relX, y: relY }); } catch (_e2) {}
          }
          let selectedSample: any = null;
          // If the user uploaded an image, sample from that image instead of trying to capture from camera
          const trySampleUploadedImage = async () => {
            try {
              if (selectedImageUri) {
                const res = await sampleUploadedImageAt(relX, relY);
                if (res) return res;
              }
            } catch (_e) {
              // ignore
            }
            return null;
          };

          // Try uploaded-image sampling first (if any), otherwise fall back to camera capture
          trySampleUploadedImage().then(async (uploadedRes:any) => {
            debugLog('[ColorDetector] onScreenPress: uploadedRes ->', uploadedRes);
            // If uploadedRes explicitly indicates the tap was off the visible image, ignore the tap.
            if (uploadedRes && (uploadedRes as any).offImage) {
              debugLog('[ColorDetector] onScreenPress: tap was outside visible uploaded image, ignoring');
              return;
            }

            if (uploadedRes) {
              debugLog('[ColorDetector] onScreenPress: using uploaded image sample ->', uploadedRes);
              selectedSample = uploadedRes;
              setDetected(selectedSample);
              setFrozenSnapshot(selectedSample);
            } else {
              // If we have a frozen captured image, sample from that file (avoid triggering camera capture)
              if (frozenImageUriRef.current) {
                try {
                  const uri = frozenImageUriRef.current;
                  debugLog('[ColorDetector] onScreenPress: attempting native decode of frozenImageUri ->', uri, 'rel', { relX, relY });
                  try {
                    const { decodeScaledRegion } = require('../../services/ImageDecoder');
                    const nativeSample = await decodeScaledRegion(uri, relX, relY, previewLayout.current.width || 0, previewLayout.current.height || 0);
                    debugLog('[ColorDetector] onScreenPress: nativeSample ->', nativeSample);
                    if (nativeSample) {
                      const match = await findClosestColorAsync([nativeSample.r, nativeSample.g, nativeSample.b], 3).catch(() => null);
                      if (match) {
                        selectedSample = { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
                        debugLog('[ColorDetector] onScreenPress: native decode matched ->', selectedSample);
                        setDetected(selectedSample);
                        setFrozenSnapshot(selectedSample);
                      }
                    }
                  } catch (_e) {
                    debugLog('[ColorDetector] onScreenPress: native decode of frozen image failed', _e);
                    try {
                      const RNFS = require('react-native-fs');
                      const base64 = await RNFS.readFile(uri.replace('file://',''), 'base64');
                      debugLog('[ColorDetector] onScreenPress: RNFS readFile returned base64 length=', base64?.length ?? 0);
                      const sample = decodeJpegAndSampleAt(base64, relX, relY);
                      debugLog('[ColorDetector] onScreenPress: decodeJpegAndSampleAt ->', sample);
                      if (sample) {
                        const match = await findClosestColorAsync([sample.r, sample.g, sample.b], 3).catch(() => null);
                        if (match) {
                          selectedSample = { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
                          debugLog('[ColorDetector] onScreenPress: RNFS decode matched ->', selectedSample);
                          setDetected(selectedSample);
                          setFrozenSnapshot(selectedSample);
                        }
                      }
                    } catch (_e2) { debugLog('[ColorDetector] onScreenPress: RNFS read of frozen image failed', _e2); }
                  }
                } catch (_e) {
                  debugLog('[ColorDetector] onScreenPress: sampling frozenImageUri failed', _e);
                }
              }

              // If we already have a selectedSample from the frozenImage decode, skip capture fallback
              if (selectedSample) {
                debugLog('[ColorDetector] onScreenPress: sample already obtained from frozen image, skipping capture fallback', selectedSample);
              } else {
                // Try to capture image and sample at the tapped preview coordinates
                try {
                  const res:any = await captureAndSampleAt(relX, relY);
                  debugLog('[ColorDetector] onScreenPress: captureAndSampleAt ->', res);
                  if (res) {
                    selectedSample = res;
                    setDetected(res);
                    setFrozenSnapshot(res);
                  } else {
                    debugLog('[ColorDetector] onScreenPress: captureAndSampleAt returned null, falling back to random');
                    // fallback to random match (existing behavior)
                    try {
                      const sampled = getRandomColor();
                      const rgb = hexToRgb(sampled.hex);
                      const match = findClosestColor(rgb, 3);
                      const c = { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
                      setDetected(c);
                      setFrozenSnapshot(c);
                      selectedSample = c;
                    } catch (err) {
                      const c = getRandomColor();
                      setDetected(c);
                      setFrozenSnapshot(c);
                      selectedSample = c;
                    }
                  }
                } catch (_err) {
                  debugLog('[ColorDetector] onScreenPress: captureAndSampleAt threw', _err);
                  // on capture failure, fallback to previous behavior
                  try {
                    const sampled = getRandomColor();
                    const rgb = hexToRgb(sampled.hex);
                    const match = findClosestColor(rgb, 3);
                    const c = { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
                    setDetected(c);
                    setFrozenSnapshot(c);
                    selectedSample = c;
                  } catch (err) {
                    const c = getRandomColor();
                    setDetected(c);
                    setFrozenSnapshot(c);
                    selectedSample = c;
                  }
                }
              }
            }

            // If we found a sample, move crosshair to the tapped point.
            if (selectedSample) {
              debugLog('[ColorDetector] onScreenPress: selectedSample ->', selectedSample);
              try { setCrosshairPos({ x: relX, y: relY }); } catch (_e) {}
            }

            // speak immediately for taps while frozen (bypass live cooldown)
            if (voiceEnabled && voiceMode !== 'disable' && selectedSample) {
              try {
                const textToSpeak = voiceMode === 'real' ? selectedSample.realName : selectedSample.family;
                debugLog('[ColorDetector] onScreenPress: about to safeSpeak ->', textToSpeak);
                // Cancel any pending freeze-speak timers so their queued audio doesn't override this tap
                try {
                  freezeSpeakTimersRef.current.forEach((tid) => { try { clearTimeout(tid as any); } catch (_e) {} });
                } catch (_e) {}
                freezeSpeakTimersRef.current = [];
                // stop any currently playing/scheduled TTS audio before speaking the tapped sample
                try { stopTts(); } catch (_e) {}
                const ok = safeSpeak(textToSpeak);
                debugLog('[ColorDetector] onScreenPress: safeSpeak result ->', ok, textToSpeak);
                lastSpokenRef.current = Date.now();
                if (!ok) Alert.alert('Color', textToSpeak);
              } catch (err) { /* ignore */ }
            }
          }).catch((_err:any) => {
            // ensure we always speak/fallback even if promise rejects
            try {
              debugLog('[ColorDetector] onScreenPress: promise chain rejected, falling back ->', _err);
              const sampled = getRandomColor();
              setDetected(sampled);
              setFrozenSnapshot(sampled);
              if (voiceEnabled && voiceMode !== 'disable') {
                try { safeSpeak(voiceMode === 'real' ? sampled.realName : sampled.family); } catch (_e) {}
              }
            } catch (_e) { /* ignore */ }
          });
        });
      }
    } catch (err) {
  debugLog('measure failed', err);
    }
  };

  const requestCameraPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
          title: 'Camera Permission',
          message: 'ColorLens needs access to your camera to detect colors in real time.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        });
        setCameraPermission(granted === PermissionsAndroid.RESULTS.GRANTED ? 'authorized' : 'denied');
        return;
      }
      if (!VisionCamera) return;
      if (VisionCamera.requestCameraPermission) {
        const res = await VisionCamera.requestCameraPermission();
        setCameraPermission(res);
      } else if (VisionCamera.Camera && VisionCamera.Camera.requestCameraPermission) {
        const res = await VisionCamera.Camera.requestCameraPermission();
        setCameraPermission(res);
      } else if (VisionCamera.requestPermissions) {
        const res = await VisionCamera.requestPermissions();
        setCameraPermission(res?.camera ?? 'denied');
      }
    } catch (err) {
  debugLog('requestCameraPermission failed', err);
    }
  };

  // Pick an image from the phone's library and treat it as a sampled frame.
  const pickImage = async () => {
    try {
      // Lazy-require so the project doesn't hard-depend on the native module at build-time
      let ImagePicker: any = null;
      try { ImagePicker = require('react-native-image-picker'); } catch (err) { ImagePicker = null; }
      if (!ImagePicker) {
        Alert.alert('Image Picker', 'Image picker not installed. Install react-native-image-picker to enable this feature.');
        return;
      }

      // Use the callback API since different versions expose different shapes
  ImagePicker.launchImageLibrary({ mediaType: 'photo' }, async (response: any) => {
        try {
          if (!response) return;
          if (response.didCancel) return;
          // `assets` is the modern response shape
              const uri = (response.assets && response.assets[0] && response.assets[0].uri) || response.uri || null;
          if (!uri) return;
              // Try to obtain natural image dimensions so we can scale it to cover the preview
              try {
                Image.getSize(uri, (w, h) => {
                  setImageNaturalSize({ w, h });
                }, (_err) => {
                  // ignore
                });
              } catch (_err) {
                // ignore
              }
          setSelectedImageUri(uri);
          // clear any stored frozen image when a new uploaded image is chosen
          frozenImageUriRef.current = null;
          // Sample the uploaded image at the center of the preview to provide an initial detected color
          let selectedSample: any = null;
          try {
            // Ensure preview is measured so sampleUploadedImageAt has correct mapping
            try { await ensurePreviewMeasured(); } catch (_e) { /* ignore */ }
            const centerX = (previewLayout.current.width || 0) / 2;
            const centerY = (previewLayout.current.height || 0) / 2;
            let res: any = null;
            try { res = await sampleUploadedImageAt(centerX, centerY); } catch (_e) { res = null; }
            if (res && !(res as any).offImage) {
              selectedSample = res;
              setDetected(res);
              setFrozenSnapshot(res);
              setFreeze(true);
            } else {
              // Try a JS decode-center fallback using RNFS if file:// URI available
              try {
                if (selectedImageUri && (selectedImageUri as string).startsWith('file://')) {
                  const RNFS = require('react-native-fs');
                  const base64 = await RNFS.readFile((selectedImageUri as string).replace('file://',''), 'base64');
                  if (base64) {
                    const centerSample = decodeJpegAndSampleCenter(base64);
                    if (centerSample) {
                      const match = await findClosestColorAsync([centerSample.r, centerSample.g, centerSample.b], 3).catch(() => null);
                      if (match) {
                        const c = { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
                        selectedSample = c;
                        setDetected(c);
                        setFrozenSnapshot(c);
                        setFreeze(true);
                      }
                    }
                  }
                }
              } catch (_e) {
                // ignore RNFS fallback errors
              }

              // If still no sample, fallback to random to avoid blank UI
              if (!selectedSample) {
                const sampled = getRandomColor();
                setDetected(sampled);
                setFrozenSnapshot(sampled);
                setFreeze(true);
                selectedSample = sampled;
              }
            }
          } catch (err) {
            const sampled = getRandomColor();
            setDetected(sampled);
            setFrozenSnapshot(sampled);
            setFreeze(true);
            selectedSample = sampled;
          }
          // speak sample immediately if allowed
          if (voiceEnabled && voiceMode !== 'disable' && selectedSample) {
            try {
              const textToSpeak = voiceMode === 'real' ? selectedSample.realName : selectedSample.family;
              safeSpeak(textToSpeak);
            } catch (err) { /* ignore */ }
          }
        } catch (innerErr) {
          debugLog('image pick callback failed', innerErr);
        }
      });
    } catch (err) {
  debugLog('pickImage failed', err);
      Alert.alert('Image Picker', 'Failed to open image picker.');
    }
  };

  // initialize pan responder for dragging uploaded image when adjusting
  useEffect(() => {
    panResponder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => adjusting,
      onMoveShouldSetPanResponder: () => adjusting,
      onPanResponderGrant: () => {
        try {
          pan.setOffset({ x: (pan.x as any).__getValue ? (pan.x as any).__getValue() : 0, y: (pan.y as any).__getValue ? (pan.y as any).__getValue() : 0 });
        } catch (_e) {
          // ignore
        }
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        clampPanToBounds();
      },
      onPanResponderTerminate: () => {
        pan.flattenOffset();
        clampPanToBounds();
      }
    });
  }, [adjusting, imageScaledSize, previewSize]);

  // compute scaled image size (cover) whenever preview or natural image size changes
  useEffect(() => {
    if (!previewSize || !imageNaturalSize) return;
    const pw = previewSize.width;
    const ph = previewSize.height;
    const iw = imageNaturalSize.w;
    const ih = imageNaturalSize.h;
    const scale = Math.max(pw / iw, ph / ih);
    setImageScaledSize({ w: Math.round(iw * scale), h: Math.round(ih * scale) });
    // center image
    pan.setValue({ x: 0, y: 0 });
  }, [previewSize, imageNaturalSize]);

  const clampPanToBounds = () => {
    if (!previewSize || !imageScaledSize) return;
    const maxOffsetX = Math.max(0, (imageScaledSize.w - previewSize.width) / 2);
    const maxOffsetY = Math.max(0, (imageScaledSize.h - previewSize.height) / 2);
    const curX = (pan.x as any).__getValue ? (pan.x as any).__getValue() : 0;
    const curY = (pan.y as any).__getValue ? (pan.y as any).__getValue() : 0;
    let clampedX = curX;
    let clampedY = curY;
    if (curX > maxOffsetX) clampedX = maxOffsetX;
    if (curX < -maxOffsetX) clampedX = -maxOffsetX;
    if (curY > maxOffsetY) clampedY = maxOffsetY;
    if (curY < -maxOffsetY) clampedY = -maxOffsetY;
    if (clampedX !== curX || clampedY !== curY) {
      Animated.spring(pan, { toValue: { x: clampedX, y: clampedY }, useNativeDriver: false }).start();
    }
  };

  const onAdjustToggle = () => {
    setAdjusting((v) => {
      const next = !v;
      if (!next) setTimeout(() => clampPanToBounds(), 10);
      return next;
    });
  };

  // Helper: convert #rrggbb or rrggbb or #rgb to [r,g,b]
  const hexToRgb = (hex: string): number[] => {
    if (!hex) return [0,0,0];
    let h = hex.trim();
    if (h.startsWith('#')) h = h.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0,2), 16) || 0;
    const g = parseInt(h.slice(2,4), 16) || 0;
    const b = parseInt(h.slice(4,6), 16) || 0;
    return [r,g,b];
  };

  // Decode base64 JPEG to raw pixels and compute average RGB over a small area (center 9x9)
  const decodeJpegAndSampleCenter = (base64: string): { r:number,g:number,b:number } | null => {
    const { jpegjs: _jpegjs, BufferShim: _BufferShim } = getJpegUtils();
    if (!_jpegjs || !_BufferShim) return null;
    try {
      // Guard against extremely large payloads which may OOM on low-memory devices
      if (base64.length > 5_000_000) {
        debugLog('[ColorDetector] decodeJpegAndSampleCenter: skipping decode of very large image, size=', base64.length);
        return null;
      }
      const buffer = _BufferShim.from(base64, 'base64');
      const decoded = _jpegjs.decode(buffer, {useTArray: true});
      if (!decoded || !decoded.width || !decoded.data) return null;
      const w = decoded.width;
      const h = decoded.height;
      const data = decoded.data; // Uint8Array of RGBA

      // sample a small square around the center (max 9x9 pixels)
      const cx = Math.floor(w/2);
      const cy = Math.floor(h/2);
      const half = 4; // 9x9
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let yy = Math.max(0, cy-half); yy <= Math.min(h-1, cy+half); yy++) {
        for (let xx = Math.max(0, cx-half); xx <= Math.min(w-1, cx+half); xx++) {
          const idx = (yy * w + xx) * 4;
          const r = data[idx];
          const g = data[idx+1];
          const b = data[idx+2];
          rSum += r; gSum += g; bSum += b; count++;
        }
      }
      if (count === 0) return null;
      return { r: Math.round(rSum/count), g: Math.round(gSum/count), b: Math.round(bSum/count) };
    } catch (e) {
      return null;
    }
  };

  // Capture a photo from available camera and sample center pixel using decodeJpegAndSampleCenter.
  const captureAndSampleCenter = async (): Promise<any> => {
    // wait for device readiness before attempting capture
    const ready = await waitForCameraReady();
    if (!ready) {
      debugLog('[ColorDetector] captureAndSampleCenter: camera not ready for capture. Aborting center capture.');
      return null;
    }
    try {
      // Ensure we have preview dimensions for coordinate mapping
      await ensurePreviewMeasured();
      const ref: any = cameraRef.current;
      // Prefer snapshot/capture methods on the camera ref (covers VisionCamera and RNCamera variants)
      if (ref && (ref.takeSnapshot || ref.takePhoto || ref.takePicture)) {
        const takeMethodName = ref.takeSnapshot ? 'takeSnapshot' : ref.takePhoto ? 'takePhoto' : 'takePicture';
        debugLog('[ColorDetector] captureAndSampleCenter: calling cameraRef.' + takeMethodName);
        try {
          const photo = await ref[takeMethodName]({ qualityPrioritization: 'speed', skipMetadata: true, width: 640 });
          debugLog('[ColorDetector] captureAndSampleCenter: cameraRef result keys', photo ? Object.keys(photo) : null);
          const uri = photo?.path || photo?.uri || photo?.localUri;
          const normalizedUri = (typeof uri === 'string' && uri.startsWith('/')) ? ('file://' + uri) : uri;
          if (normalizedUri && typeof normalizedUri === 'string' && normalizedUri.startsWith('file://')) {
            try {
              const { decodeScaledRegion } = require('../../services/ImageDecoder');
              const nativeSample = await decodeScaledRegion(normalizedUri, (previewLayout.current.width || 0) / 2, (previewLayout.current.height || 0) / 2, previewLayout.current.width || 0, previewLayout.current.height || 0);
              if (nativeSample) {
                const match = await findClosestColorAsync([nativeSample.r, nativeSample.g, nativeSample.b], 3).catch(() => null);
                if (match) return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
              }
            } catch (_e) {
              debugLog('[ColorDetector] captureAndSampleCenter: native decode failed, trying RNFS', _e);
              try {
                const RNFS = require('react-native-fs');
                const base64 = await RNFS.readFile(normalizedUri.replace('file://',''), 'base64');
                const sample = decodeJpegAndSampleCenter(base64);
                if (sample) {
                  const match = await findClosestColorAsync([sample.r, sample.g, sample.b], 3).catch(() => null);
                  if (match) return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
                }
              } catch (_e2) {
                debugLog('[ColorDetector] captureAndSampleCenter: RNFS.readFile failed', _e2);
              }
            }
          }
          if ((photo as any)?.base64) {
            debugLog('[ColorDetector] captureAndSampleCenter: cameraRef returned base64 length', (photo as any).base64?.length ?? 0);
            const sample = decodeJpegAndSampleCenter((photo as any).base64);
            if (sample) {
              const match = await findClosestColorAsync([sample.r, sample.g, sample.b], 3).catch(() => null);
              if (match) return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
            }
          }
        } catch (err) {
          debugLog('[ColorDetector] captureAndSampleCenter: cameraRef method failed', err);
        }
      }

      // Try older RNCamera-style methods if present
      if (ref && (ref.takePictureAsync || ref.capture)) {
        const takePicMethod = ref.takePictureAsync ? 'takePictureAsync' : 'capture';
        debugLog('[ColorDetector] captureAndSampleCenter: calling cameraRef.' + takePicMethod);
        try {
          const pic = await ref[takePicMethod]({ quality: 0.5, base64: true, width: 640, doNotSave: true });
          debugLog('[ColorDetector] captureAndSampleCenter: RNCamera result base64Length', pic?.base64?.length ?? 0);
          if (pic && pic.base64) {
            const sample = decodeJpegAndSampleCenter(pic.base64);
            if (sample) {
              const match = await findClosestColorAsync([sample.r, sample.g, sample.b], 3).catch(() => null);
              if (match) return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
            }
          }
        } catch (err) {
          debugLog('[ColorDetector] captureAndSampleCenter: RNCamera capture failed', err);
        }
      }

      debugLog('[ColorDetector] captureAndSampleCenter: no capture method returned usable data');
      return null;
    } catch (e) {
      debugLog('[ColorDetector] captureAndSampleCenter: unexpected error', e);
      return null;
    }
  };

  // Ensure previewLayout.current has width/height by measuring the previewRef if necessary
  const ensurePreviewMeasured = async (): Promise<void> => {
    try {
      const pw = previewLayout.current.width || 0;
      const ph = previewLayout.current.height || 0;
      if (pw > 0 && ph > 0) return;
      if (previewRef.current && previewRef.current.measureInWindow) {
        await new Promise<void>((resolve) => {
          try {
            previewRef.current.measureInWindow((px: number, py: number, pw2: number, ph2: number) => {
              previewLayout.current = { x: px, y: py, width: pw2, height: ph2 };
              debugLog('[ColorDetector] ensurePreviewMeasured: measured preview ->', previewLayout.current);
              resolve();
            });
          } catch (_e) { resolve(); }
        });
      }
    } catch (_e) { /* ignore */ }
  };

  // Wait helper: poll for camera device/ref readiness before attempting a capture.
  // Returns true if ready within timeout, false otherwise.
  const waitForCameraReady = async (timeoutMs = 3000, intervalMs = 120) => {
    const start = Date.now();
    try {
      // If there's no camera at all, bail quickly
      if (!VisionCamera && !RNCamera) return false;
      while (Date.now() - start < timeoutMs) {
        try {
          const ref = cameraRef.current;
          const hasMethod = !!ref && (
            !!ref.takePhoto || !!ref.takeSnapshot || !!ref.takePicture || !!ref.takePictureAsync || !!ref.capture
          );
          // If VisionCamera is used, prefer to ensure we discovered a device
          const deviceAvailable = !!availableDevice || (!!availableDevices && availableDevices.length > 0) || !VisionCamera;
          // If we have a ref with a capture method and a device (when applicable), consider ready
          if (hasMethod && deviceAvailable) {
            debugLog('[ColorDetector] waitForCameraReady: ready', { hasMethod, deviceAvailable });
            return true;
          }
        } catch (err) {
          // ignore per-iteration errors
        }
        // slight delay and retry
        // eslint-disable-next-line no-await-in-loop
        await new Promise((res) => setTimeout(() => res(undefined), intervalMs));
  debugLog('[ColorDetector] waitForCameraReady: polling for camera...', { elapsed: Date.now() - start });
      }
    } catch (_err) {
      // ignore
    }
  debugLog('[ColorDetector] waitForCameraReady: timeout waiting for camera');
    return false;
  };

  // Decode base64 JPEG and sample a small area around the provided preview-relative coordinates (relX, relY)
  const decodeJpegAndSampleAt = (base64: string, relX: number, relY: number): { r:number,g:number,b:number } | null => {
    const { jpegjs: _jpegjs, BufferShim: _BufferShim } = getJpegUtils();
    if (!_jpegjs || !_BufferShim) return null;
    try {
  debugLog('[ColorDetector] decodeJpegAndSampleAt: starting decode for rel', { relX, relY });
      // Guard against extremely large payloads which may OOM on low-memory devices
      if (base64.length > 8_000_000) {
        debugLog('[ColorDetector] decodeJpegAndSampleAt: skipping decode of very large image, size=', base64.length);
        return null;
      }
       const buffer = _BufferShim.from(base64, 'base64');
       const decoded = _jpegjs.decode(buffer, {useTArray: true});
  debugLog('[ColorDetector] decodeJpegAndSampleAt: decode result', { width: decoded?.width, height: decoded?.height });
      if (!decoded || !decoded.width || !decoded.data) return null;
      const w = decoded.width;
      const h = decoded.height;
      const data = decoded.data; // Uint8Array of RGBA

      // Map preview-relative coordinates to image pixel coordinates using the last measured preview size
      const pw = previewLayout.current.width || 0;
      const ph = previewLayout.current.height || 0;
      if (!pw || !ph) {
        // Fallback to center if we don't have a preview size
        return decodeJpegAndSampleCenter(base64);
      }
      const ix = Math.max(0, Math.min(w - 1, Math.round((relX / pw) * w)));
      const iy = Math.max(0, Math.min(h - 1, Math.round((relY / ph) * h)));

      const half = 4; // sample 9x9 block
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let yy = Math.max(0, iy - half); yy <= Math.min(h - 1, iy + half); yy++) {
        for (let xx = Math.max(0, ix - half); xx <= Math.min(w - 1, ix + half); xx++) {
          const idx = (yy * w + xx) * 4;
          const r = data[idx];
          const g = data[idx+1];
          const b = data[idx+2];
          rSum += r; gSum += g; bSum += b; count++;
        }
      }
      if (count === 0) return null;
      const sampled = { r: Math.round(rSum/count), g: Math.round(gSum/count), b: Math.round(bSum/count) };
  debugLog('[ColorDetector] decodeJpegAndSampleAt: sampled RGB', sampled, 'mappedImageSize', { w, h });
      return sampled;
    } catch (e) {
  debugLog('[ColorDetector] decodeJpegAndSampleAt: decode error', e);
      return null;
    }
  };

  // Capture a photo from available camera and sample at the tapped preview coordinates (relX, relY).
  const captureAndSampleAt = async (relX: number, relY: number): Promise<any> => {
    setCapturing(true);
    // wait for device readiness before attempting capture
    try {
      const ready = await waitForCameraReady();
      if (!ready) {
        Alert.alert('Capture failed', 'Camera not ready for capture. Try again.');
        setCapturing(false);
        return null;
      }
    } catch (_err) {
      setCapturing(false);
      return null;
    }
    try {
  debugLog('[ColorDetector] captureAndSampleAt: starting capture at rel', { relX, relY });
  debugLog('[ColorDetector] captureAndSampleAt: env', { VisionCameraExists: !!VisionCamera, RNCameraExists: !!RNCamera, cameraRefPresent: !!cameraRef.current });
      // Try VisionCamera first (modern API). Some VisionCamera builds expose takePhoto on the camera ref.
      if (VisionCamera && cameraRef.current && (cameraRef.current.takePhoto || cameraRef.current.takeSnapshot || cameraRef.current.takePicture)) {
        // pick the first available API on the camera ref
        const takeMethodName = cameraRef.current.takePhoto ? 'takePhoto' : cameraRef.current.takeSnapshot ? 'takeSnapshot' : 'takePicture';
  debugLog('[ColorDetector] captureAndSampleAt: will call cameraRef.current.' + takeMethodName);
        try {
          try {
            debugLog('[ColorDetector] captureAndSampleAt: cameraRef.current keys', Object.keys(cameraRef.current || {}));
            debugLog('[ColorDetector] captureAndSampleAt: cameraRef.current nativeTag', (cameraRef.current && cameraRef.current._nativeTag) || (cameraRef.current && cameraRef.current._internal && cameraRef.current._internal.tag) || null);
            debugLog('[ColorDetector] captureAndSampleAt: availableDevice info (summary)', { deviceId: availableDevice?.id, position: availableDevice?.position, devicesCount: availableDevices?.length ?? 0 });
          } catch (_logErr) {
            // ignore logging errors
          }
          const photo = await (cameraRef.current as any)[takeMethodName]({ qualityPrioritization: 'speed', skipMetadata: true });
          debugLog('[ColorDetector] captureAndSampleAt: cameraRef method result keys', { method: takeMethodName, photoKeys: photo ? Object.keys(photo) : null });
          const uri = photo?.path || photo?.uri || photo?.localUri;
          const normalizedUri = (typeof uri === 'string' && uri.startsWith('/')) ? ('file://' + uri) : uri;
          debugLog('[ColorDetector] captureAndSampleAt: resolved uri', normalizedUri);
          if (normalizedUri && normalizedUri.startsWith('file://')) {
            try {
              const { decodeScaledRegion } = require('../../services/ImageDecoder');
              const nativeSample = await decodeScaledRegion(normalizedUri, relX, relY, previewLayout.current.width || 0, previewLayout.current.height || 0);
              if (nativeSample) {
                const match = await findClosestColorAsync([nativeSample.r, nativeSample.g, nativeSample.b], 3).catch(() => null);
                if (match) {
                  debugLog('[ColorDetector] captureAndSampleAt: match from native decoder', { name: match.closest_match.name, family: match.closest_match.family });
                  return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
                }
              }
            } catch (_e) {
              debugLog('[ColorDetector] captureAndSampleAt: native decode failed, falling back to RNFS', _e);
              try {
                const RNFS = require('react-native-fs');
                debugLog('[ColorDetector] captureAndSampleAt: reading file via RNFS', normalizedUri);
                const base64 = await RNFS.readFile(normalizedUri.replace('file://',''), 'base64');
                debugLog('[ColorDetector] captureAndSampleAt: RNFS.readFile succeeded, base64 length', base64 ? base64.length : 0);
                const sample = decodeJpegAndSampleAt(base64, relX, relY);
                if (sample) {
                  const match = await findClosestColorAsync([sample.r, sample.g, sample.b], 3).catch(() => null);
                  if (match) {
                    debugLog('[ColorDetector] captureAndSampleAt: match from RNFS-read', { name: match.closest_match.name, family: match.closest_match.family });
                    return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
                  }
                }
              } catch (_e2) {
                debugLog('[ColorDetector] captureAndSampleAt: RNFS.readFile failed', _e2);
              }
            }
          }
          if ((photo as any)?.base64) {
            debugLog('[ColorDetector] captureAndSampleAt: cameraRef returned base64 length', (photo as any).base64?.length ?? 0);
            const sample = decodeJpegAndSampleAt((photo as any).base64, relX, relY);
            if (sample) {
              const match = await findClosestColorAsync([sample.r, sample.g, sample.b], 3).catch(() => null);
              if (match) {
                debugLog('[ColorDetector] captureAndSampleAt: match from cameraRef.base64', { name: match.closest_match.name, family: match.closest_match.family });
                return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
              }
            }
          }
          } catch (err) {
          try {
            const er: any = err;
            debugLog('[ColorDetector] captureAndSampleAt: cameraRef method call failed (full):', { name: er?.name, message: er?.message, code: er?._code });
          } catch (_e) {
            debugLog('[ColorDetector] captureAndSampleAt: cameraRef method call failed (err)', err);
          }
        }
      }
      // Fallback: try RNCamera takePictureAsync (older API)
      if (RNCamera && cameraRef.current && (cameraRef.current.takePictureAsync || cameraRef.current.capture)) {
        const takePicMethod = cameraRef.current.takePictureAsync ? 'takePictureAsync' : 'capture';
  debugLog('[ColorDetector] captureAndSampleAt: will call cameraRef.' + takePicMethod);
        try {
          const pic = await (cameraRef.current as any)[takePicMethod]({ quality: 0.5, base64: true, width: 640, doNotSave: true });
          debugLog('[ColorDetector] captureAndSampleAt: RNCamera method result', { method: takePicMethod, hasPic: !!pic, base64Length: pic?.base64?.length ?? 0 });
          if (pic && pic.base64) {
            const sample = decodeJpegAndSampleAt(pic.base64, relX, relY);
            if (sample) {
              const match = await findClosestColorAsync([sample.r, sample.g, sample.b], 3).catch(() => null);
              if (match) {
                debugLog('[ColorDetector] captureAndSampleAt: match from RNCamera.base64', { name: match.closest_match.name, family: match.closest_match.family });
                return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
              }
            }
          }
        } catch (err) {
          debugLog('[ColorDetector] captureAndSampleAt: RNCamera capture failed', err);
        }
      }

  debugLog('[ColorDetector] captureAndSampleAt: no capture method succeeded, attempting silent fallback');
      // Don't show a blocking alert in normal dev flow; instead try a silent fallback
      // 1) Try a center-capture attempt which may succeed on some devices/APIs
      try {
        const centerSample = await captureAndSampleCenter();
        if (centerSample) {
          setCapturing(false);
          return centerSample;
        }
      } catch (_e) {
        // ignore center-capture errors
      }
      // 2) Final fallback: return null and let caller use the random-match fallback (no alert)
      setCapturing(false);
      return null;
    } catch (e) {
  debugLog('[ColorDetector] captureAndSampleAt: unexpected error', e);
      // On unexpected errors, attempt silent fallback to center capture, otherwise return null
      try {
        const centerSample = await captureAndSampleCenter();
        if (centerSample) {
          setCapturing(false);
          return centerSample;
        }
      } catch (_e) {}
      setCapturing(false);
      return null;
    }
    finally {
      // ensure we clear capturing in case an earlier return didn't
      try { setCapturing(false); } catch (_e) {}
    }
  };

  // Sample the currently uploaded image (no camera capture) at preview-relative coordinates
  // Returns a matched color object { family, hex, realName } or null on failure.
  const sampleUploadedImageAt = async (relX: number, relY: number): Promise<any> => {
    if (!selectedImageUri) return null;
    try {
      // Prefer sampling from a snapshot of the rendered preview (exactly what user sees).
      try {
        if (captureRef && previewRef.current) {
          debugLog('[ColorDetector] sampleUploadedImageAt: attempting snapshot-based sampling at', { relX, relY });
          const snapSample = await sampleFromPreviewSnapshot(relX, relY);
          debugLog('[ColorDetector] sampleUploadedImageAt: snapshot sample ->', snapSample);
          if (snapSample) {
            const match = await findClosestColorAsync([snapSample.r, snapSample.g, snapSample.b], 3).catch(() => null);
            if (match) {
              const pw = previewLayout.current.width || 0;
              const ph = previewLayout.current.height || 0;
              const mappedPreviewX = relX;
              const mappedPreviewY = relY;
              setUploadDebug({ imageLeft: 0, imageTop: 0, scaledW: pw, scaledH: ph, ix: null, iy: null, mappedPreviewX, mappedPreviewY, sampled: snapSample, via: 'snapshot' });
              return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
            }
          }
        }
      } catch (_e) {
        debugLog('[ColorDetector] sampleUploadedImageAt: snapshot sampling failed', _e);
        // fall through to existing logic
      }
      // Resolve base64 from various URI shapes: data:, file://, http(s)://, content://
      let base64: string | null = null;
      const uri = selectedImageUri as string;

      // data URI with base64
      if (uri.startsWith('data:') && uri.indexOf('base64,') !== -1) {
        base64 = uri.split('base64,')[1];
      }

      // For Android file:// or content:// URIs, prefer native scaled decoder to avoid JS OOM
      try {
        const { decodeScaledRegion } = require('../../services/ImageDecoder');
        if (uri.startsWith('file://') || uri.startsWith('content://')) {
          const nativeSample = await decodeScaledRegion(uri, relX, relY, previewLayout.current.width || 0, previewLayout.current.height || 0);
          if (nativeSample) {
            const match = await findClosestColorAsync([nativeSample.r, nativeSample.g, nativeSample.b], 3).catch(() => null);
            if (!match) return null;
            try {
              // set upload debug info so overlay shows where we sampled (native decoder uses preview-relative coords)
              const pw = previewLayout.current.width || 0;
              const ph = previewLayout.current.height || 0;
              const scaled = imageScaledSize || { w: pw, h: ph };
              let panX = 0, panY = 0;
              try { panX = (pan.x as any).__getValue ? (pan.x as any).__getValue() : 0; } catch (_e) { panX = 0; }
              try { panY = (pan.y as any).__getValue ? (pan.y as any).__getValue() : 0; } catch (_e) { panY = 0; }
              const imageLeft = Math.round((pw - scaled.w) / 2) + panX;
              const imageTop = Math.round((ph - scaled.h) / 2) + panY;
              const mappedPreviewX = relX;
              const mappedPreviewY = relY;
              setUploadDebug({ imageLeft, imageTop, scaledW: scaled.w, scaledH: scaled.h, ix: null, iy: null, mappedPreviewX, mappedPreviewY, sampled: nativeSample });
            } catch (_e) { /* ignore debug set errors */ }
            return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
          }
          // if native decoder failed fall through to JS fallback
        }
      } catch (_e) {
        // ignore if native module not available
      }

      // content:// (Android) or http(s) -> try fetch and convert to base64
      if (!base64 && (uri.startsWith('content://') || uri.startsWith('http://') || uri.startsWith('https://'))) {
        try {
          const resp = await fetch(uri);
          // try arrayBuffer then convert
          // @ts-ignore arrayBuffer may exist in RN fetch
          const ab = await (resp as any).arrayBuffer();
          if (ab) {
            const { BufferShim: _BufferShim } = getJpegUtils();
            if (typeof _BufferShim !== 'undefined' && _BufferShim && (_BufferShim as any).from) {
              base64 = (_BufferShim as any).from(new Uint8Array(ab)).toString('base64');
            }
          }
        } catch (_e) {
          // ignore
        }
      }

      if (!base64) return null;

      // decode image on-demand; avoid caching the full decoded RGBA buffer to reduce memory usage
      let decoded: any = null;
      const { jpegjs: _jpegjs, BufferShim: _BufferShim } = getJpegUtils();
      if (!_jpegjs || !_BufferShim) return null;
  const buffer = _BufferShim.from(base64, 'base64');
  // detect EXIF orientation before decoding so we can map coords correctly
  let exifOrient = 1;
  try { exifOrient = getJpegOrientation(buffer); } catch (_e) { exifOrient = 1; }
  const dec = _jpegjs.decode(buffer, { useTArray: true });
      if (!dec || !dec.width || !dec.data) return null;
      decoded = dec;
      const w = decoded.width; const h = decoded.height; const data = decoded.data;

      // Compute mapping from preview-relative coords (relX,relY) to image pixel coords.
      // For uploaded images we render them scaled to cover the preview and allow pan offsets.
      const pw = previewLayout.current.width || 0;
      const ph = previewLayout.current.height || 0;
      if (!pw || !ph) {
        // fallback to center sampling
        const centerSample = decodeJpegAndSampleCenter(base64);
        if (!centerSample) return null;
        const match = await findClosestColorAsync([centerSample.r, centerSample.g, centerSample.b], 3).catch(() => null);
        if (!match) return null;
        return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
      }

      // imageScaledSize and pan help compute where the image pixels map inside the preview
      const scaled = imageScaledSize;
  if (!scaled) {
        // If scaled size not available, fall back to using preview-to-image mapping similar to camera
        const ix = Math.max(0, Math.min(w - 1, Math.round((relX / pw) * w)));
        const iy = Math.max(0, Math.min(h - 1, Math.round((relY / ph) * h)));
        // sample 9x9 around ix,iy
        const half = 4;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let yy = Math.max(0, iy - half); yy <= Math.min(h - 1, iy + half); yy++) {
          for (let xx = Math.max(0, ix - half); xx <= Math.min(w - 1, ix + half); xx++) {
            const idx = (yy * w + xx) * 4;
            rSum += data[idx]; gSum += data[idx+1]; bSum += data[idx+2]; count++;
          }
        }
        if (count === 0) return null;
        const sampled = { r: Math.round(rSum/count), g: Math.round(gSum/count), b: Math.round(bSum/count) };
        const match = await findClosestColorAsync([sampled.r, sampled.g, sampled.b], 3).catch(() => null);
        if (!match) return null;
        return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
      }

      // compute pan offsets numeric
      let panX = 0, panY = 0;
      try { panX = (pan.x as any).__getValue ? (pan.x as any).__getValue() : 0; } catch (_e) { panX = 0; }
      try { panY = (pan.y as any).__getValue ? (pan.y as any).__getValue() : 0; } catch (_e) { panY = 0; }

      const imageLeft = Math.round((pw - scaled.w) / 2) + panX;
      const imageTop = Math.round((ph - scaled.h) / 2) + panY;

      const localX = relX - imageLeft;
      const localY = relY - imageTop;

      debugLog('[ColorDetector] sampleUploadedImageAt: mapping debug', {
        uri, imageNaturalSize, scaled, previewLayout: { pw, ph }, pan: { panX, panY }, imageLeft, imageTop, localX, localY
      });

      // If the tap falls outside the visible image area, signal the caller to ignore the tap
      if (localX < 0 || localY < 0 || localX > scaled.w || localY > scaled.h) {
        debugLog('[ColorDetector] sampleUploadedImageAt: tap off visible image', { localX, localY, imageLeft, imageTop, scaled });
        return { offImage: true } as any;
      }

      // map local preview coords (localX/localY) -> image pixel coords (ix,iy)
      let ix = Math.max(0, Math.min(w - 1, Math.round((localX / scaled.w) * w)));
      let iy = Math.max(0, Math.min(h - 1, Math.round((localY / scaled.h) * h)));
      // adjust for EXIF orientation so ix/iy correspond to the rendered orientation
      try {
        switch (exifOrient) {
          case 2: // flipped horizontally
            ix = w - 1 - ix; break;
          case 3: // rotated 180
            ix = w - 1 - ix; iy = h - 1 - iy; break;
          case 4: // flipped vertically
            iy = h - 1 - iy; break;
          case 5: {
            // transpose
            const ox = ix; ix = iy; iy = ox; break;
          }
          case 6: { // rotate 90 CW
            const ox = ix; ix = h - 1 - iy; iy = ox; break;
          }
          case 7: { // transverse
            const ox = ix; ix = h - 1 - iy; iy = w - 1 - ox; break;
          }
          case 8: { // rotate 270 CW
            const ox = ix; ix = iy; iy = w - 1 - ox; break;
          }
          default: break;
        }
      } catch (_e) { /* ignore orientation mapping errors */ }

  debugLog('[ColorDetector] sampleUploadedImageAt: mapped image coords', { ix, iy, imagePixelSize: { w, h } });

      const half = 4;
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let yy = Math.max(0, iy - half); yy <= Math.min(h - 1, iy + half); yy++) {
        for (let xx = Math.max(0, ix - half); xx <= Math.min(w - 1, ix + half); xx++) {
          const idx = (yy * w + xx) * 4;
          rSum += data[idx]; gSum += data[idx+1]; bSum += data[idx+2]; count++;
        }
      }
      if (count === 0) return null;
  const sampled = { r: Math.round(rSum/count), g: Math.round(gSum/count), b: Math.round(bSum/count) };
  debugLog('[ColorDetector] sampleUploadedImageAt: sampled RGB ->', sampled);
  try {
    const mappedPreviewX = imageLeft + (ix / w) * scaled.w;
    const mappedPreviewY = imageTop + (iy / h) * scaled.h;
    setUploadDebug({ imageLeft, imageTop, scaledW: scaled.w, scaledH: scaled.h, ix, iy, mappedPreviewX, mappedPreviewY, sampled });
  } catch (_e) { /* ignore debug errors */ }
  const match = await findClosestColorAsync([sampled.r, sampled.g, sampled.b], 3).catch(() => null);
  if (!match) return null;
  return { family: match.closest_match.family || match.closest_match.name, hex: match.closest_match.hex, realName: match.closest_match.name };
    } catch (err) {
  debugLog('[ColorDetector] sampleUploadedImageAt: error', err);
      return null;
    }
  };

  const sampleColorAtCenter = () => {
    // If we already have a frozen snapshot (user froze but didn't tap), use that
    if (frozenSnapshot) {
      const s = frozenSnapshot;
      setDetected(s);
      if (voiceEnabled && voiceMode !== 'disable') {
        try { safeSpeak(voiceMode === 'real' ? s.realName : s.family); } catch (_e) {}
      }
      return;
    }
    // If we have a recent liveDetected value, use that to avoid capturing when unnecessary
    if (liveDetected) {
      const s = liveDetected;
      setDetected(s);
      setFrozenSnapshot(s);
      if (voiceEnabled && voiceMode !== 'disable') {
        try { safeSpeak(voiceMode === 'real' ? s.realName : s.family); } catch (_e) {}
      }
      return;
    }

    // Otherwise, fall back to capturing a center sample
    captureAndSampleCenter().then((c:any) => {
      if (c) {
        setDetected(c);
        setFrozenSnapshot(c);
        if (voiceEnabled && voiceMode !== 'disable') {
          try { safeSpeak(voiceMode === 'real' ? c.realName : c.family); } catch (_e) {}
        }
      } else {
        const sampled = getRandomColor();
        setDetected(sampled);
        setFrozenSnapshot(sampled);
      }
    }).catch((_err: any) => {
      const sampled = getRandomColor();
      setDetected(sampled);
      setFrozenSnapshot(sampled);
    });
  };


  // Debug helper: try multiple capture methods and report what each returns (visible Alert + logs)
  const debugCapture = async () => {
    if (!cameraRef.current) {
      Alert.alert('Debug Capture', 'No camera ref available');
      return;
    }
    setCapturing(true);
    const results: any[] = [];
    try {
      // try takePhoto (VisionCamera style)
      if ((cameraRef.current as any).takePhoto) {
        try {
          debugLog('[ColorDetector][debug] calling takePhoto');
          const photo = await (cameraRef.current as any).takePhoto({ qualityPrioritization: 'speed', skipMetadata: true });
          debugLog('[ColorDetector][debug] takePhoto -> keys', photo ? Object.keys(photo) : null);
          results.push({ method: 'takePhoto', ok: true, photo });
        } catch (err) {
          debugLog('[ColorDetector][debug] takePhoto error', err);
          results.push({ method: 'takePhoto', ok: false, err: String(err) });
        }
      }

      // try takePictureAsync (RNCamera style)
      if ((cameraRef.current as any).takePictureAsync) {
        try {
          debugLog('[ColorDetector][debug] calling takePictureAsync');
          const pic = await (cameraRef.current as any).takePictureAsync({ quality: 0.5, base64: true, width: 1024, doNotSave: true });
          debugLog('[ColorDetector][debug] takePictureAsync -> base64Length', pic?.base64?.length ?? 0);
          results.push({ method: 'takePictureAsync', ok: true, pic: { hasBase64: !!pic?.base64, keys: Object.keys(pic || {}) } });
        } catch (err) {
          debugLog('[ColorDetector][debug] takePictureAsync error', err);
          results.push({ method: 'takePictureAsync', ok: false, err: String(err) });
        }
      }

      // try cameraRef.capture if present
      if ((cameraRef.current as any).capture) {
        try {
          debugLog('[ColorDetector][debug] calling capture');
          const cap = await (cameraRef.current as any).capture({ quality: 0.5, base64: true });
          debugLog('[ColorDetector][debug] capture -> keys', cap ? Object.keys(cap) : null);
          results.push({ method: 'capture', ok: true, cap });
        } catch (err) {
          debugLog('[ColorDetector][debug] capture error', err);
          results.push({ method: 'capture', ok: false, err: String(err) });
        }
      }

      // Summarize
      const okOne = results.find((r) => r.ok);
      Alert.alert('Debug Capture Results', JSON.stringify(results, null, 2).slice(0, 2000));
  debugLog('[ColorDetector][debug] results', results);
      if (!okOne) {
        Alert.alert('Debug Capture', 'All capture methods failed. See console logs for details.');
      }
    } catch (err) {
  debugLog('[ColorDetector][debug] debugCapture unexpected error', err);
      Alert.alert('Debug Capture', 'Unexpected error: ' + String(err));
    } finally {
      setCapturing(false);
    }
  };

  const onPreviewTap = (evt: any) => {
    if (selectedImageUri && !adjusting) {
      // When an uploaded image is present and not adjusting, treat taps like screen presses
      // so the crosshair moves to the tapped location (onScreenPress handles freeze and sampling).
      onScreenPress(evt);
      return;
    }
    // fallback to existing onScreenPress behavior for camera taps
    onScreenPress(evt);
  };

    // Compute the center point used by the crosshair lines.
    // When frame is frozen and the user has moved the crosshair, use that position.
    // Otherwise use the visual center of the preview.
    const centerX = previewSize ? (freeze && crosshairPos ? crosshairPos.x : previewSize.width / 2) : 0;
    const centerY = previewSize ? (freeze && crosshairPos ? crosshairPos.y : previewSize.height / 2) : 0;
    const lengthFactor = freeze ? CROSSHAIR_LENGTH_FACTOR_FROZEN : CROSSHAIR_LENGTH_FACTOR;
    // Decide what to display in the info area:
    // - while frozen: prefer frozenSnapshot (snapshot at freeze time) or detected (user tap)
    // - while live: prefer liveDetected
    const displayDetected = freeze ? (frozenSnapshot ?? detected) : liveDetected ?? detected;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
          <Image source={ICONS.ARROWicon} style={styles.backIconImage} />
        </TouchableOpacity>
  <TouchableOpacity onPress={() => { openSettings(); }} style={styles.settingsButton}><Text style={styles.settingsText}>⚙️</Text></TouchableOpacity>
        {/* spacer for header actions */}
        {/* spacer for header actions */}
      </View>

      {/* (TTS debug toast removed) */}

      {/* Camera area (placeholder image) */}
      <TouchableWithoutFeedback onPress={onPreviewTap}>
        <View style={styles.cameraArea}>
          {/* preview wrapper measured for crosshair coordinate mapping */}
          <View style={styles.previewWrapper}>
          {/* If the user has uploaded an image, display it in the preview area instead of the live camera */}
          {selectedImageUri ? (
            <View ref={(el)=>{ cameraContainerRef.current = el; previewRef.current = el; }} style={styles.cameraPreviewContainer} onLayout={(e)=>{
                      try {
                        const { width: pw, height: ph } = e.nativeEvent.layout;
                        previewLayout.current.width = pw;
                        previewLayout.current.height = ph;
                        setPreviewSize({ width: pw, height: ph });
                      } catch (innerErr) { /* ignore */ }
            }}>
              {/* When an uploaded image is present we render it as an Animated.View so it can be
                  dragged while in adjust mode. We keep resizeMode: 'cover' semantics by computing
                  the scaled image size in an effect and letting the image overflow the preview bounds. */}
              {/* If we computed a scaled image size, render the image at that size and center it. */}
              {imageScaledSize && previewSize ? (
                <Animated.View
                  {...(adjusting && panResponder.current ? panResponder.current.panHandlers : {})}
                  pointerEvents={adjusting ? 'auto' : 'none'}
                  style={{
                    position: 'absolute',
                    left: Math.round((previewSize.width - imageScaledSize.w) / 2),
                    top: Math.round((previewSize.height - imageScaledSize.h) / 2),
                    width: Math.round(imageScaledSize.w),
                    height: Math.round(imageScaledSize.h),
                    transform: [{ translateX: pan.x }, { translateY: pan.y }],
                  }}
                >
                  <Image source={{ uri: selectedImageUri }} style={{ width: Math.round(imageScaledSize.w), height: Math.round(imageScaledSize.h), resizeMode: 'cover' }} />
                </Animated.View>
              ) : (
                <Animated.View
                  {...(adjusting && panResponder.current ? panResponder.current.panHandlers : {})}
                  pointerEvents={adjusting ? 'auto' : 'none'}
                  style={[ { transform: [{ translateX: pan.x }, { translateY: pan.y }] , width: '100%', height: '100%' }]}
                >
                  <Image source={{ uri: selectedImageUri }} style={[styles.cameraInner, { resizeMode: 'cover' }]} />
                </Animated.View>
              )}

              {/* (swatch removed from uploaded-image branch) */}
            </View>
          ) : RNCamera ? (
            <View ref={(el)=>{ cameraContainerRef.current = el; previewRef.current = el; }} style={styles.cameraPreviewContainer} onLayout={(e)=>{
                      try {
                        const { width: pw, height: ph } = e.nativeEvent.layout;
                        previewLayout.current.width = pw;
                        previewLayout.current.height = ph;
                        setPreviewSize({ width: pw, height: ph });
                      } catch (innerErr) { /* ignore */ }
            }}>
              <RNCamera
                ref={cameraRef}
                style={styles.cameraInner}
                type={RNCamera.Constants.Type.back}
                captureAudio={false}
                // ensure capture APIs are enabled on some builds
                captureTarget={RNCamera.constants?.CaptureTarget?.disk || undefined}
              />
            </View>
          ) : VisionCamera ? (
            // VisionCamera rendering: use the hook result computed at top-level (`device`)
            (() => {
              // Permission not authorized yet
              if (cameraPermission !== 'authorized') {
                return (
                  <View style={[styles.cameraPreview, styles.cameraFallback]}>
                    <Text style={styles.cameraFallbackText}>Camera permission not granted</Text>
                    <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
                      <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              // If we do have a device (from explicit discovery or the hook), render it
              const finalDevice = availableDevice;
                if (finalDevice) {
                try {
                  const CameraComp = VisionCamera.Camera;
                    return (
                    <View ref={(el)=>{ cameraContainerRef.current = el; previewRef.current = el; }} style={styles.cameraPreviewContainer} onLayout={(e)=>{
                      try {
                        const { width: pw, height: ph } = e.nativeEvent.layout;
                        previewLayout.current.width = pw;
                        previewLayout.current.height = ph;
                        setPreviewSize({ width: pw, height: ph });
                      } catch (innerErr) { /* ignore */ }
                    }}>
                        <CameraComp
                        ref={cameraRef}
                        style={styles.cameraInner}
                        device={finalDevice}
                        isActive={!freeze || capturing}
                        photo={true}
                        {...(frameProcessor ? { frameProcessor, frameProcessorFps: 2 } : {})}
                      />
                    </View>
                  );
                } catch (innerErr) {
                  debugLog('VisionCamera render error', innerErr);
                }
              }

              // No device found
              return (
                <View style={[styles.cameraPreview, styles.cameraFallback]}>
                  <Text style={styles.cameraFallbackText}>No camera device detected.
                    On an emulator, enable a virtual camera (AVD settings) or run on a physical device.
                  </Text>
                  {/* Debug info */}
                  <View style={styles.debugBlock}>
                    <Text style={styles.debugText}>Debug: VisionCamera loaded: {VisionCamera ? 'yes' : 'no'}</Text>
                    <Text style={styles.debugText}>cameraPermission: {String(cameraPermission)}</Text>
                    {/* hook-derived device removed: using explicit discovery only */}
                    <Text style={styles.debugText}>availableDevices: {availableDevices ? JSON.stringify(availableDevices.map((d:any)=>({id:d.id,position:d.position}))) : 'null'}</Text>
                  </View>
                </View>
              );
            })()
          ) : (
            <View style={[styles.cameraPreview, styles.cameraFallback]}>
              <Text style={styles.cameraFallbackText}>Camera not available</Text>
            </View>
          )}

    {/* Swatch overlay placeholder removed here; it will be rendered as a top-level overlay later to ensure visibility */}

    {/* Crosshair: full white lines (vertical + horizontal) placed relative to preview */}
      <View pointerEvents="none" style={[styles.absoluteOverlay, { width: previewSize?.width ?? '100%', height: previewSize?.height ?? '100%' }]}>
              {previewSize && (
                <>
                  {/* Vertical line: centered, height = previewHeight * CROSSHAIR_LENGTH_FACTOR */}
                  <View
                    style={[
                      styles.crosshairVertical,
                      {
                        left: Math.round(centerX) - Math.round(CROSSHAIR_THICKNESS / 2),
                        // extend more so the dot fully overlays the lines without a visible break
                        height: Math.round(previewSize.height * lengthFactor) + Math.round(CROSSHAIR_CONTAINER_SIZE),
                        top: Math.round(previewSize.height * ((1 - lengthFactor) / 2)) - Math.round(CROSSHAIR_CONTAINER_SIZE / 2),
                        width: CROSSHAIR_THICKNESS,
                      },
                    ]}
                  />

                  {/* Horizontal line: centered, width = previewWidth * CROSSHAIR_LENGTH_FACTOR */}
                  <View
                    style={[
                      styles.crosshairHorizontal,
                      {
                        top: Math.round(centerY) - Math.round(CROSSHAIR_THICKNESS / 2),
                        // extend horizontally so the dot overlay doesn't create a visible gap
                        width: Math.round(previewSize.width * lengthFactor) + Math.round(CROSSHAIR_CONTAINER_SIZE),
                        left: Math.round(previewSize.width * ((1 - lengthFactor) / 2)) - Math.round(CROSSHAIR_CONTAINER_SIZE / 2),
                        height: CROSSHAIR_THICKNESS,
                      },
                    ]}
                  />
                  {/* filler bars: drawn above the lines but beneath the dot to mask any seam */}
                  <View pointerEvents="none" style={[styles.fillerBar, { left: Math.round(centerX) - Math.round((CROSSHAIR_CONTAINER_SIZE * 1.2) / 2), top: Math.round(centerY) - Math.round((CROSSHAIR_THICKNESS + 1) / 2), width: Math.round(CROSSHAIR_CONTAINER_SIZE * 1.2), height: CROSSHAIR_THICKNESS + 1 }]} />
                  <View pointerEvents="none" style={[styles.fillerBar, { left: Math.round(centerX) - Math.round((CROSSHAIR_THICKNESS + 1) / 2), top: Math.round(centerY) - Math.round((CROSSHAIR_CONTAINER_SIZE * 1.2) / 2), width: CROSSHAIR_THICKNESS + 1, height: Math.round(CROSSHAIR_CONTAINER_SIZE * 1.2) }]} />
                </>
              )}

              {/* Red dot: centered by default, or placed at crosshairPos when frozen */}
              {freeze && crosshairPos ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.crosshairContainer,
                    { width: CROSSHAIR_CONTAINER_SIZE, height: CROSSHAIR_CONTAINER_SIZE, left: crosshairPos.x - Math.round(CROSSHAIR_CONTAINER_SIZE / 2), top: crosshairPos.y - Math.round(CROSSHAIR_CONTAINER_SIZE / 2) },
                  ]}
                >
                  <View style={{ width: CROSSHAIR_CONTAINER_SIZE, height: CROSSHAIR_CONTAINER_SIZE, alignItems: 'center', justifyContent: 'center' }}>
                    {/* red circular marker */}
                    <View style={{ width: CROSSHAIR_DOT_SIZE, height: CROSSHAIR_DOT_SIZE, borderRadius: Math.round(CROSSHAIR_DOT_SIZE/2), backgroundColor: 'rgba(255,0,0,0.95)' }} />
                    {/* vertical white crosshair line (2px) */}
                    <View style={{ position: 'absolute', width: 2, height: CROSSHAIR_CONTAINER_SIZE * 2, backgroundColor: 'white' }} />
                    {/* horizontal white crosshair line (2px) */}
                    <View style={{ position: 'absolute', height: 2, width: CROSSHAIR_CONTAINER_SIZE * 2, backgroundColor: 'white' }} />
                  </View>
                </View>
              ) : (
                previewSize && (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.crosshairContainer,
                      { width: CROSSHAIR_CONTAINER_SIZE, height: CROSSHAIR_CONTAINER_SIZE, left: Math.round(previewSize.width / 2) - Math.round(CROSSHAIR_CONTAINER_SIZE / 2), top: Math.round(previewSize.height / 2) - Math.round(CROSSHAIR_CONTAINER_SIZE / 2) },
                    ]}
                  >
                    <View style={{ width: CROSSHAIR_CONTAINER_SIZE, height: CROSSHAIR_CONTAINER_SIZE, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: CROSSHAIR_DOT_SIZE, height: CROSSHAIR_DOT_SIZE, borderRadius: Math.round(CROSSHAIR_DOT_SIZE/2), backgroundColor: 'rgba(255,0,0,0.95)' }} />
                      <View style={{ position: 'absolute', width: 2, height: CROSSHAIR_CONTAINER_SIZE * 2, backgroundColor: 'white' }} />
                      <View style={{ position: 'absolute', height: 2, width: CROSSHAIR_CONTAINER_SIZE * 2, backgroundColor: 'white' }} />
                    </View>
                  </View>
                )
              )}
    </View>
          </View>
          {/* Adjust control rendered as a sibling (outside the clipped preview container) */}
          {selectedImageUri && (
            <View style={styles.adjustArea} pointerEvents="box-none">
              <TouchableOpacity style={styles.adjustButton} onPress={onAdjustToggle} activeOpacity={0.85}>
                <View style={styles.adjustButtonContent}>
                  <Image source={ICONS.HANDicon} style={styles.adjustIcon} />
                  <Text style={styles.adjustText}>{adjusting ? 'Done' : 'Adjust Image'}</Text>
                </View>
              </TouchableOpacity>
              {adjusting && (
                <View style={styles.adjustHelp}>
                  <Text style={styles.adjustHelpText}>Drag the image to position it so the area you want to sample is visible under the crosshair. Tap done when finished.</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

        {/* Info */}
        <View style={styles.infoArea}>
          {/* Inline swatch placed under the preview (no text inside) */}
          <View style={styles.inlineSwatchRow}>
            <View style={[styles.swatchBoxLarge, { backgroundColor: displayDetected?.hex || '#000', opacity: adjusting ? 0 : 1 }]} />
          </View>
          {showFamily && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Family of:</Text>
              <Text style={styles.infoValue}>{displayDetected?.family ?? '—'}</Text>
            </View>
          )}
        {colorCodesVisible && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Hex:</Text>
            <Text style={styles.infoValue}>{displayDetected?.hex ?? '—'}</Text>
          </View>
        )}
        {showRealName && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Real Name:</Text>
            <Text style={styles.infoValue}>{displayDetected?.realName ?? '—'}</Text>
          </View>
        )}

        {/* Upload image from library (samples a color and freezes) */}
        <View style={styles.uploadRow}>
          <TouchableOpacity style={styles.uploadButton} onPress={pickImage} activeOpacity={0.8}>
            <View style={styles.uploadButtonContent}>
              <Image source={ICONS.UploadIcon} style={styles.uploadIcon} />
              <Text style={styles.uploadButtonText}>Upload Image</Text>
            </View>
          </TouchableOpacity>
          {selectedImageUri && (
            <Image source={{ uri: selectedImageUri }} style={styles.thumbnail} />
          )}
        </View>

        <TouchableOpacity style={[styles.freezeButton, freeze && styles.unfreezeButton]} onPress={toggleFreeze} activeOpacity={0.8}>
          <Text style={styles.freezeButtonText}>{freeze ? 'Unfreeze' : 'Freeze Frame'}</Text>
        </TouchableOpacity>
        {/* end info area */}
      </View>
    {/* old swatch overlay removed - inline swatch used instead */}
    </View>
  );
};

export default ColorDetector;
