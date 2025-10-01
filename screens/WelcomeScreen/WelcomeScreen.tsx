import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  ScrollView,
  Dimensions,
  PixelRatio,
} from 'react-native';
import { styles } from './WelcomeScreen.styles';

interface WelcomeScreenProps {
  onNext: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onNext }) => {
  const { width } = Dimensions.get('window');

  // Baseline is iPhone 8 width ~375. Scale fonts/paddings relative to that.
  const scale = useMemo(() => {
    const s = width / 375;
    // clamp scale to reasonable bounds
    return Math.max(0.85, Math.min(s, 1.25));
  }, [width]);

  const scaled = useMemo(() => {
    const rf = (size: number) => Math.round(PixelRatio.roundToNearestPixel(size * scale));
    return {
      titleSize: rf(36),
      titleMargin: rf(28),
      descSize: rf(16),
      descLineHeight: rf(24),
      buttonPaddingVertical: rf(14),
      buttonPaddingHorizontal: rf(28),
    };
  }, [scale]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: Math.max(20, Math.min(40, Math.round(width * 0.08))),
          paddingTop: 20,
          paddingBottom: 12,
        }}
        accessibilityLabel="Welcome scroll"
      >
        <View style={styles.content}>
          <Text
            style={[
              styles.title,
              { fontSize: scaled.titleSize, marginBottom: scaled.titleMargin },
            ]}
            accessibilityRole="header"
            accessibilityLabel="Welcome to ColorLens"
          >
            Welcome
          </Text>

          <View style={styles.descriptionContainer}>
            <Text
              style={[
                styles.description,
                { fontSize: scaled.descSize, lineHeight: scaled.descLineHeight },
              ]}
            >
              Welcome to ColorLens — your AI-based color recognition and voice feedback assistant.
            </Text>

            <Text
              style={[
                styles.description,
                { marginTop: 10, fontSize: scaled.descSize, lineHeight: scaled.descLineHeight },
              ]}
            >
              Use your camera in real time or upload an image. ColorLens helps you identify colors, hear their names spoken aloud, and see hex codes and color families.
            </Text>

            <Text
              style={[
                styles.description,
                { marginTop: 10, fontSize: scaled.descSize, lineHeight: scaled.descLineHeight },
              ]}
            >
              Perfect for people with color vision differences and useful for designers, educators, and curious learners.
            </Text>

            <Text
              style={[
                styles.description,
                { marginTop: 10, fontSize: scaled.descSize, lineHeight: scaled.descLineHeight, fontWeight: '600' },
              ]}
            >
              Fast, intuitive, and inclusive.
            </Text>

            <Text style={[styles.connectedText, { marginTop: 12 }]}>— ColorLens makes color recognition easy for everyone.</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.buttonContainer, { paddingHorizontal: Math.max(20, Math.round(width * 0.06)), paddingBottom: 24 }]}> 
        <TouchableOpacity
          style={[
            styles.nextButton,
            {
              paddingVertical: scaled.buttonPaddingVertical,
              paddingHorizontal: scaled.buttonPaddingHorizontal,
              borderRadius: Math.max(20, Math.round(25 * scale)),
            },
          ]}
          onPress={onNext}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Go to next screen"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.nextButtonText}>Next</Text>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default WelcomeScreen;


