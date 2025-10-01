/**
 * @format
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SplashScreen from './screens/SplashScreen/SplashScreen';
import WelcomeScreen from './screens/WelcomeScreen/WelcomeScreen';
import YTembedScreen from './screens/YTembedScreen/YTembedScreen';
import ColorDetector from './screens/ColorDetector/ColorDetector';
import CLSetting from './screens/CLSetting/CLSetting';

const App: React.FC = () => {

  const [currentScreen, setCurrentScreen] = useState<'splash' | 'welcome' | 'decision' | 'youtube' | 'main' | 'colorDetector' | 'settings' | 'cbc' | 'simulate'>('splash');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [colorCodesVisible, setColorCodesVisible] = useState(true);
  const [showFamily, setShowFamily] = useState(true);
  const [showRealName, setShowRealName] = useState(true);
  const [voiceMode, setVoiceMode] = useState<'family' | 'real' | 'disable'>('family');

  const handleSplashFinish = () => {
    setCurrentScreen('welcome');
  };

  const handleWelcomeNext = () => {
    // Skip decision screen — go straight to ColorDetector
    setCurrentScreen('colorDetector');
  };

  const handleNavigateToYT = () => {
    // Navigate to the YouTube embed screen
    console.log('handleNavigateToYT called — navigating to youtube screen');
    setCurrentScreen('youtube');
  };

  const handleBackFromYT = () => {
    // Return to Settings (CLSetting) when leaving the YouTube screen
    setCurrentScreen('settings');
  };

  // navigation helpers (used elsewhere)

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        {currentScreen === 'splash' && (
          <SplashScreen onFinish={handleSplashFinish} />
        )}
        {currentScreen === 'welcome' && (
          <WelcomeScreen onNext={handleWelcomeNext} />
        )}
        {currentScreen === 'colorDetector' && (
          <ColorDetector
            onBack={() => setCurrentScreen('welcome')}
            openSettings={() => setCurrentScreen('settings')}
            voiceEnabled={voiceEnabled}
            colorCodesVisible={colorCodesVisible}
            voiceMode={voiceMode}
            showFamily={showFamily}
            showRealName={showRealName}
          />
        )}
        {currentScreen === 'settings' && (
          <CLSetting
            onBack={() => setCurrentScreen('colorDetector')}
            voiceEnabled={voiceEnabled}
            colorCodesVisible={colorCodesVisible}
            voiceMode={voiceMode}
            showFamily={showFamily}
            showRealName={showRealName}
            onToggleVoice={(v: boolean) => setVoiceEnabled(v)}
            onToggleColorCodes={(v: boolean) => setColorCodesVisible(v)}
            onToggleShowFamily={(v: boolean) => setShowFamily(v)}
            onToggleShowRealName={(v: boolean) => setShowRealName(v)}
            onNavigateToYT={handleNavigateToYT}
            onChangeVoiceMode={(m:'family'|'real'|'disable')=>setVoiceMode(m)}
          />
        )}
        {currentScreen === 'youtube' && (
          <YTembedScreen onBack={handleBackFromYT} />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});

export default App;
