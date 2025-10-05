import { NativeModules, Platform } from 'react-native';

const { ImageDecoderModule } = NativeModules as any;

type RGB = { r: number; g: number; b: number } | null;

export async function decodeScaledRegion(uri: string, relX: number, relY: number, previewW: number, previewH: number): Promise<RGB> {
  if (Platform.OS !== 'android') return null;
  if (!ImageDecoderModule || typeof ImageDecoderModule.decodeScaledRegion !== 'function') return null;
  try {
    const res = await ImageDecoderModule.decodeScaledRegion(uri, relX, relY, previewW, previewH);
    if (!res) return null;
    return { r: res.r, g: res.g, b: res.b };
  } catch (e) {
    return null;
  }
}

export default { decodeScaledRegion };
