let Tts: any = null
let TtsReady = false
import { Platform } from 'react-native'

export const initTts = () => {
  if (Tts) return true
  try {
    let mod: any = require('react-native-tts')
    Tts = mod && mod.default ? mod.default : mod
    try { if (Tts.setDefaultLanguage) Tts.setDefaultLanguage('en-US') } catch (e) { console.log('TTS setDefaultLanguage failed', e) }
    try { if (Tts.setDefaultRate) Tts.setDefaultRate(0.5) } catch (e) { console.log('TTS setDefaultRate failed', e) }
    try { console.log('react-native-tts loaded', { speak: !!Tts.speak, stop: !!Tts.stop, getInitStatus: !!Tts.getInitStatus, rawModuleType: typeof mod, resolvedType: typeof Tts }) } catch (e) {}
    try {
      if (Tts && Tts.getInitStatus) {
        Tts.getInitStatus().then(() => { TtsReady = true; console.log('TTS getInitStatus resolved -> ready') }).catch((err:any) => { TtsReady = false; console.log('TTS getInitStatus failed', err) })
      } else {
        TtsReady = !!(Tts && (Tts.speak || Tts.stop));
      }
    } catch (e) {
      console.log('TTS getInitStatus check failed', e)
      TtsReady = !!(Tts && (Tts.speak || Tts.stop))
    }
    return true
  } catch (e) {
    Tts = null
    return false
  }
}



export const speak = (text: string) => {
  if (!Tts) {
    if (!initTts()) return false
  }
  try {
    if (Tts.getInitStatus && !TtsReady) {
      console.log('TTS not ready yet, scheduling speak after init:', text)
      const scheduled = () => {
        try { Tts.stop && Tts.stop(); Tts.speak && Tts.speak(text); console.log('TTS speak executed after init:', text) } catch (e) { console.log('TTS speak error after init', e) }
      }
      Tts.getInitStatus().then(() => { TtsReady = true; scheduled() }).catch((err:any) => { console.log('TTS getInitStatus failed when scheduling speak', err);  scheduled() })
      setTimeout(() => { try { Tts.stop && Tts.stop(); Tts.speak && Tts.speak(text); console.log('TTS speak attempted by timeout:', text) } catch (e) { console.log('TTS speak timeout error', e) } }, 2000)
      return true
    }

    Tts.stop && Tts.stop()
    try {
      if (Platform.OS === 'android') {
        const params = { androidParams: { KEY_PARAM_STREAM: 'STREAM_MUSIC' } }
        console.log('TTS speak immediate (android) with params:', params)
        Tts.speak && Tts.speak(text, params)
      } else {
        console.log('TTS speak immediate:', text)
        Tts.speak && Tts.speak(text)
      }
    } catch (e) {
      console.log('TTS speak immediate error', e)
    }
    return true
  } catch (e) {
    console.log('TTS speak error', e)
    return false
  }
}

export const stop = () => {
  try { Tts && Tts.stop && Tts.stop() } catch (e) {}
}
