import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Switch, ScrollView, Image } from 'react-native';
import { ICONS } from '../../Images';
import { styles } from './CLSetting.styles';

interface CLSettingProps {
  onBack: () => void;
  voiceEnabled?: boolean;
  colorCodesVisible?: boolean;
  voiceMode?: 'family' | 'real' | 'disable';
  
  onToggleColorCodes?: (v:boolean)=>void;
  onNavigateToYT?: ()=>void;
  onChangeVoiceMode?: (m:'family'|'real'|'disable')=>void;
  showFamily?: boolean;
  showRealName?: boolean;
  onToggleShowFamily?: (v:boolean)=>void;
  onToggleShowRealName?: (v:boolean)=>void;
}
const CLSetting: React.FC<CLSettingProps> = ({ onBack, colorCodesVisible=true, voiceMode='family', onToggleColorCodes, onNavigateToYT, onChangeVoiceMode, showFamily=true, showRealName=true, onToggleShowFamily, onToggleShowRealName }) => {
  const [localColorCodesVisible, setLocalColorCodesVisible] = useState<boolean>(colorCodesVisible);
  const [localVoiceMode, setLocalVoiceMode] = useState<'family'|'real'|'disable'>(voiceMode);
  const [localShowFamily, setLocalShowFamily] = useState<boolean>(showFamily);
  const [localShowRealName, setLocalShowRealName] = useState<boolean>(showRealName);
  const [fabOpen, setFabOpen] = useState<boolean>(false);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  const saveAndBack = () => {
    onToggleColorCodes && onToggleColorCodes(localColorCodesVisible);
    onToggleShowFamily && onToggleShowFamily(localShowFamily);
    onToggleShowRealName && onToggleShowRealName(localShowRealName);
    onChangeVoiceMode && onChangeVoiceMode(localVoiceMode);
    onBack();
  };
  return (
    <View style={styles.container}>
  <TouchableOpacity onPress={saveAndBack} style={styles.backButton} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
    <Image source={ICONS.ARROWicon} style={styles.backIconImage} />
  </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.contentContainer} style={styles.scrollView}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.label}>Display Hex Color Codes</Text>
            <Text style={styles.note}>on by default</Text>
                
          </View>
          <Switch value={localColorCodesVisible} onValueChange={(v)=>{ setLocalColorCodesVisible(v); onToggleColorCodes && onToggleColorCodes(v); }} />
        </View>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.label}>Display Family Color</Text>
            <Text style={styles.note}>on by default</Text>
          </View>
          <Switch value={localShowFamily} onValueChange={(v)=>{ setLocalShowFamily(v); onToggleShowFamily && onToggleShowFamily(v); }} />
        </View>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.label}>Display the real name of color</Text>
            <Text style={styles.note}>on by default</Text>
          </View>
          <Switch value={localShowRealName} onValueChange={(v)=>{ setLocalShowRealName(v); onToggleShowRealName && onToggleShowRealName(v); }} />
        </View>
        
  <View style={styles.voiceSection}>
          <Text style={styles.label}>Say the color</Text>
          <Text style={styles.note}>selected: {localVoiceMode === 'family' ? 'Family Color' : localVoiceMode === 'real' ? 'Real Name' : 'Disabled'}</Text>
          <View style={styles.voiceDropdownWrap}>
            <TouchableOpacity style={styles.dropdownButton} onPress={()=>setDropdownOpen(v=>!v)}>
              <Text style={styles.dropdownButtonText}>{localVoiceMode === 'family' ? 'Family Color' : localVoiceMode === 'real' ? 'Real Name' : 'Disabled'}</Text>
              <Text style={styles.caret}>{dropdownOpen ? '▲' : '▾'}</Text>
            </TouchableOpacity>
            {dropdownOpen && (
              <View style={styles.dropdownMenu}>
                <TouchableOpacity style={styles.dropdownItem} onPress={() => { setLocalVoiceMode('family'); onChangeVoiceMode && onChangeVoiceMode('family'); setDropdownOpen(false); }}>
                  <Text style={styles.dropdownItemText}>Family Color</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dropdownItem} onPress={() => { setLocalVoiceMode('real'); onChangeVoiceMode && onChangeVoiceMode('real'); setDropdownOpen(false); }}>
                  <Text style={styles.dropdownItemText}>Real Name</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dropdownItem} onPress={() => { setLocalVoiceMode('disable'); onChangeVoiceMode && onChangeVoiceMode('disable'); setDropdownOpen(false); }}>
                  <Text style={styles.dropdownItemText}>Disable</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

      </ScrollView>

      <View style={styles.fabContainer}>
        
        {fabOpen && (
          <View style={styles.fabSubmenu}>
            <TouchableOpacity
              style={styles.fabSubmenuItem}
              onPress={() => {
                setFabOpen(false);
                Alert.alert(
                  'About ColorLens',
                  `🎨 ColorLens is a lightweight color detection tool that lets you identify colors in the real world or from photos.
📷 Use your device camera for live scanning or 📁 upload an image — then tap to detect the color.
The app shows the hex code, color family, and the actual name of the color, and can even 🔊 speak the result aloud for accessibility.

🖼️ When you upload a photo, you can enter Adjust mode to move the image so the area you want to detect sits under the crosshair 🎯.
✅ Tap Done to lock the image, then tap to detect colors.

🔒 All sampling is performed locally on your device — images are not uploaded to any server by default.

✨ Key Features:

📸 Live camera sampling

🖼️ Upload & pan/adjust images

🧾 Hex code display

🧩 Color family & name detection

🔈 Optional voice feedback for accessibility

🔐 Privacy & Permissions:

Camera and photo library access are required only for their respective features.
Your images and sampling data are processed entirely on-device and are never shared.

💬 Support & Feedback:

For bug reports, feature requests, or help, contact us at:
📧 colorlens@supportteam.com`
                );
              }}
            >
              <Text style={styles.fabSubmenuIcon}>?</Text>
              <Text style={styles.fabSubmenuText} numberOfLines={1} ellipsizeMode="tail">About</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fabSubmenuItem} onPress={()=>{ setFabOpen(false); onNavigateToYT && onNavigateToYT(); }}>
              <Image source={ICONS.YTicon} style={[styles.fabSubmenuIcon, styles.fabSubmenuImageSize]} />
              <Text style={styles.fabSubmenuText} numberOfLines={1} ellipsizeMode="tail">Video Tutorial</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity
          style={styles.fabMain}
          onPress={() => setFabOpen(v => !v)}
          activeOpacity={0.85}
        >
          <Text style={styles.fabMainIcon}>{fabOpen ? '✕' : '?'}</Text>
        </TouchableOpacity>
      </View>
  
    </View>
  );
};
export default CLSetting;