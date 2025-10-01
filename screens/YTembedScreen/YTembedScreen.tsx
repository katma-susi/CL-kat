import React from 'react';
import { View, Text, TouchableOpacity, StatusBar, Image } from 'react-native';
import { ICONS } from '../../Images';
import { styles } from './YTembedScreen.styles';
// lazy-require navigation hook to avoid hard dependency on react-navigation
// Always provide a function for the navigation hook so we can call it unconditionally.
let useNavigationHook: any = null;
try {
  useNavigationHook = require('@react-navigation/native').useNavigation;
} catch (e) {
  // Fallback: provide a no-op hook that returns null to satisfy hooks rules.
  useNavigationHook = () => null;
}

interface YTembedScreenProps {
  onBack: () => void;
}

const YTembedScreen: React.FC<YTembedScreenProps> = ({ onBack }) => {
  // Call the hook unconditionally; fallback returns null when nav isn't available
  const navigation = useNavigationHook();

  const handleBackToSettings = () => {
    // Prefer navigating to the CLSetting screen explicitly so Back returns to settings
    try {
      if (navigation && navigation.navigate) {
        navigation.navigate('CLSetting');
        return;
      }
    } catch (e) { /* ignore */ }
    // fallback to provided onBack prop if navigation is not available
    if (onBack) onBack();
  };
  // Replace with your actual YouTube video ID
  const youtubeVideoId = 'qIkLXRTS6Ik'; // Example video ID
  const youtubeUrl = `https://www.youtube.com/embed/${youtubeVideoId}`;

  // Lazy-load WebView to avoid typecheck/build failures when package is not installed
  let WebViewComponent: any = null;
  try {
     
    WebViewComponent = require('react-native-webview').WebView;
  } catch (e) {
    WebViewComponent = null;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header with Back Button */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={handleBackToSettings}
            activeOpacity={0.7}
            hitSlop={{ top: 12, left: 12, bottom: 12, right: 12 }}
          >
            <Image source={ICONS.ARROWicon} style={styles.backIconImage} />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Video Tutorial</Text>
      </View>
      
      {/* YouTube Video Embed */}
      <View style={styles.videoContainer}>
        {WebViewComponent ? (
          <WebViewComponent
            source={{ uri: youtubeUrl }}
            style={styles.webView}
            allowsFullscreenVideo={true}
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled={true}
            domStorageEnabled={true}
          />
        ) : (
          <View style={[styles.webView, styles.webViewFallback]}>
            <Text style={styles.infoDescription}>Install react-native-webview to play videos inside the app.</Text>
          </View>
        )}
      </View>
      
      {/* Video Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>ColorLens Tutorial</Text>
        <Text style={styles.infoDescription}>
          Watch this short guide to learn how to detect colors with ColorLens, interpret family and real name results, and customize the app using the Settings screen. The video demonstrates live detection, freezing and sampling, and how to enable or disable voice prompts.
        </Text>
      </View>
    </View>
  );
};

export default YTembedScreen;
