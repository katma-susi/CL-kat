import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import { bundleResourceIO } from '@tensorflow/tfjs-react-native';

export async function initializeTf(): Promise<void> {
  await tf.ready();
}

export async function loadModelFromBundle(modelJsonResource: any, weightResources: any[]): Promise<tf.LayersModel> {
  const ioHandler = bundleResourceIO(modelJsonResource, weightResources);
  const model = await tf.loadLayersModel(ioHandler);
  return model;
}

export async function loadModelFromUrl(url: string): Promise<tf.LayersModel> {
  const model = await tf.loadLayersModel(url);
  return model;
}

export function scaleLabForModel(lab: [number, number, number]): number[] {
  return [lab[0] / 100.0, lab[1] / 128.0, lab[2] / 128.0];
}

export async function predictLab(model: tf.LayersModel, lab: [number, number, number]): Promise<{index:number,score:number,probs:number[]}> {
  const scaled = scaleLabForModel(lab);
  const input = tf.tensor2d([scaled], [1, 3], 'float32');
  const out = model.predict(input) as tf.Tensor;
  const data = await out.data();
  input.dispose();
  out.dispose();
  let maxIdx = 0;
  for (let i = 1; i < data.length; i++) if (data[i] > data[maxIdx]) maxIdx = i;
  return { index: maxIdx, score: Number(data[maxIdx]), probs: Array.from(data) };
}

export function mapIndexToLabel(labels: string[], idx: number): string | null {
  if (!Array.isArray(labels)) return null;
  if (idx < 0 || idx >= labels.length) return null;
  return labels[idx] ?? null;
}
