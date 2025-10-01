import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  backButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  backText: { fontSize: 20, fontWeight: '700', color: '#fff' },
  // contentContainer used for ScrollView content, less vertically centered so top gap is smaller
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  contentContainer: { paddingTop: 8, paddingBottom: 40, paddingHorizontal: 12 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  note: { fontSize: 15, color: '#666', textAlign: 'center' },
  saveButton: { backgroundColor: '#3A86FF', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 8, alignItems: 'center', marginBottom: 24 },
  saveText: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
  label: { fontSize: 18, fontWeight: '700' },
  choice: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#EEE', marginRight: 10, marginBottom: 8 },
  choiceSelected: { backgroundColor: '#D7C9FF' },
  dropdownButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8 },
  dropdownButtonText: { fontSize: 16, fontWeight: '600' },
  caret: { marginLeft: 8, color: '#666' },
  dropdownMenu: { marginTop: 8, backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#EEE', overflow: 'hidden' },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F4F4F4' },
  dropdownItemText: { fontSize: 16 },
  scrollView: { flex: 1 },
  rowLeft: { flex: 1 },
  voiceSection: { marginTop: 20, width: '100%' },
  voiceDropdownWrap: { marginTop: 12 },
  fabSubmenuImage: { width: 22, height: 14 },
  // Container is sized to the main FAB so submenu doesn't change its layout
  fabContainer: { position: 'absolute', right: 16, bottom: 24, width: 64, height: 64 },
  // Position submenu absolutely above the main FAB so it doesn't expand container width
  fabSubmenu: { position: 'absolute', right: 0, bottom: 70, backgroundColor: 'transparent', alignItems: 'flex-end' },
  fabSubmenuItem: { backgroundColor: '#F4E6FF', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', minWidth: 180, justifyContent: 'flex-start' },
  fabSubmenuIcon: { marginRight: 10 },
  fabSubmenuIconImage: { width: 22, height: 14, resizeMode: 'contain' },
  fabSubmenuImageSize: { width: 22, height: 14 },
  fabSubmenuText: { fontWeight: '600', flexShrink: 1, flexWrap: 'nowrap' },
  fabMain: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#6A46FF', justifyContent: 'center', alignItems: 'center', elevation: 6 },
  fabMainIcon: { color: '#fff', fontSize: 26, fontWeight: '700' },
  backIconImage: { width: 18, height: 18, tintColor: '#fff', resizeMode: 'contain' },
  // modal styles removed — using Alert.alert for About text
});
