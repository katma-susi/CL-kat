import { StyleSheet, Dimensions } from 'react-native';
const { width } = Dimensions.get('window');

// Responsive scale relative to a 375pt baseline (iPhone 8)
const SCALE = Math.max(0.9, Math.min(width / 375, 1.18));
const rf = (n: number) => Math.round(n * SCALE);

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: rf(14) },
  backButton: { width: rf(48), height: rf(48), borderRadius: rf(24), justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  backText: { fontSize: rf(20), fontWeight: '700', color: '#fff' },
  settingsButton: { paddingVertical: rf(8), paddingHorizontal: rf(8), borderRadius: 6, minWidth: rf(44), minHeight: rf(44), justifyContent: 'center', alignItems: 'center' },
  settingsText: { fontSize: rf(20) },
  // Caamera area holds the preview and crosshair. position: 'relative' so absolute children are positioned correctly.
  // Camera area holds the preview and crosshair. position: 'relative' so absolute children are positioned correctly.
  // Add horizontal padding so the preview sits visually centered with even white space.
  cameraArea: { flex: 1, justifyContent: 'flex-start', alignItems: 'center', backgroundColor: '#fff', position: 'relative', paddingTop: rf(8), paddingHorizontal: rf(12) },
  // Use a precise pixel width (screen width minus horizontal padding) so the preview centers exactly.
  // Responsive preview: fill available width inside the cameraArea padding, but don't exceed screen width minus padding
  cameraPreview: { width: '100%', maxWidth: width - 32, alignSelf: 'center', aspectRatio: 4 / 3, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', position: 'relative' },
  cameraFallback: { backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center', width: '100%', maxWidth: width - 32, aspectRatio: 4 / 3, borderRadius: 8 },
  cameraFallbackText: { color: '#666', fontSize: rf(15) },
  permissionButton: { marginTop: rf(12), backgroundColor: '#2B7FFF', paddingVertical: rf(12), paddingHorizontal: rf(16), borderRadius: 10 },
  permissionButtonText: { color: '#fff', fontWeight: '700', fontSize: rf(15) },
  // Crosshair base: lines will be sized at render time to match the preview size
  crosshairVertical: { position: 'absolute', width: 2, backgroundColor: '#fff', borderRadius: 0, elevation: 4 },
  crosshairHorizontal: { position: 'absolute', height: 2, backgroundColor: '#fff', borderRadius: 0, elevation: 4 },
  animatedImageAbsolute: { position: 'absolute' },
  animatedFull: { width: '100%', height: '100%' },
  selectedImage: { resizeMode: 'cover' },
  crosshairInner: { alignItems: 'center', justifyContent: 'center' },
  crosshairDotBase: { backgroundColor: 'rgba(255,0,0,0.95)' },
  crosshairLineBase: { position: 'absolute', backgroundColor: 'white' },
  // Container for the preview area (keeps even margins and centers inner preview)
  cameraPreviewContainer: { width: '100%', maxWidth: width - 32, alignSelf: 'center', aspectRatio: 4 / 3, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', position: 'relative' },
  // Inner preview fills the container (used for RNCamera or VisionCamera component)
  cameraInner: { width: '100%', height: '100%' },
  previewWrapper: { width: '100%', alignItems: 'center', position: 'relative' },
  debugText: { fontSize: 12, color: '#444' },
  debugBlock: { marginTop: 8 },
  absoluteOverlay: { position: 'absolute', left: 0, top: 0 },
  fillerBar: { position: 'absolute', backgroundColor: '#fff' },
  crosshairContainer: { position: 'absolute', width: rf(22), height: rf(22), justifyContent: 'center', alignItems: 'center', left: 0, top: 0 },
  crosshairDot: { width: rf(12), height: rf(12), borderRadius: rf(6), backgroundColor: 'red', borderWidth: 0, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  infoArea: { padding: 20 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoLabel: { fontSize: rf(15), color: '#333', width: Math.min(140, rf(120)) },
  infoValue: { fontSize: rf(20), fontWeight: '700', color: '#000' },
  freezeButton: { marginTop: rf(12), backgroundColor: '#FF8C2B', paddingVertical: rf(14), paddingHorizontal: rf(18), borderRadius: 10, alignItems: 'center' },
  unfreezeButton: { marginTop: rf(12), backgroundColor: '#2B7FFF', paddingVertical: rf(14), paddingHorizontal: rf(18), borderRadius: 10, alignItems: 'center' },
  freezeButtonText: { color: '#fff', fontWeight: '700', fontSize: rf(17) },
  backIconImage: { width: rf(20), height: rf(20), tintColor: '#fff', resizeMode: 'contain' },
  uploadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: rf(12) },
  // Make upload button violet and provide space for an icon on the left
  uploadButton: { backgroundColor: '#6A0DAF', paddingVertical: rf(10), paddingHorizontal: rf(14), borderRadius: 10, minWidth: rf(120) },
  uploadButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  uploadIcon: { width: rf(20), height: rf(20), marginRight: rf(10), tintColor: '#fff', resizeMode: 'contain' },
  uploadButtonText: { color: '#fff', fontWeight: '700', fontSize: rf(16) },
  thumbnail: { width: rf(72), height: rf(72), borderRadius: 10, marginLeft: rf(12), borderWidth: 1, borderColor: '#EEE' },
  // Adjust control area (renders outside the clipped preview so it remains visible)
  // Give a high stacking context so the adjust help can appear above other UI (swatch etc.)
  adjustArea: { width: '100%', alignItems: 'flex-end', marginTop: rf(8), paddingRight: rf(8), zIndex: 999999, elevation: 50 },
  adjustButton: { backgroundColor: '#fff', paddingVertical: rf(10), paddingHorizontal: rf(12), borderRadius: rf(26), elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 },
  adjustButtonContent: { flexDirection: 'row', alignItems: 'center' },
  adjustIcon: { width: rf(20), height: rf(20), marginRight: rf(8), tintColor: '#6A0DAF', resizeMode: 'contain' },
  adjustText: { color: '#6A0DAF', fontWeight: '700', fontSize: rf(15) },
  adjustHelp: { marginTop: rf(8), paddingHorizontal: rf(12), backgroundColor: '#FF8C2B', paddingVertical: rf(10), borderRadius: 8, alignSelf: 'stretch', zIndex: 999999, elevation: 50, position: 'relative' },
  adjustHelpText: { color: '#fff', fontSize: rf(14), textAlign: 'left', fontWeight: '600' },
  // Swatch overlay in preview (top-right corner)
  swatchContainer: { position: 'absolute', right: rf(12), top: rf(12), backgroundColor: 'rgba(255,255,255,0.97)', padding: rf(8), borderRadius: rf(8), flexDirection: 'row', alignItems: 'center', elevation: 10, borderWidth: 1, borderColor: '#DDD', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6 },
  swatchBox: { width: rf(44), height: rf(44), borderRadius: rf(6), borderWidth: 1, borderColor: '#DDD', marginRight: rf(8) },
  swatchText: { fontSize: rf(13), color: '#111', fontWeight: '600' },
  swatchRoot: { position: 'absolute', right: rf(12), top: rf(12), zIndex: 9999, elevation: 20 },
  // Inline swatch (placed below preview in info area)
  inlineSwatchRow: { width: '100%', alignItems: 'flex-start', marginBottom: rf(12) },
  swatchBoxLarge: { width: rf(104), height: rf(104), borderRadius: rf(12), borderWidth: 1, borderColor: '#DDD', backgroundColor: '#999' },
  // (TTS debug toast removed)
});
