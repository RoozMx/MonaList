import { VisionCameraProxy, type Frame } from 'react-native-vision-camera';

const plugin = VisionCameraProxy.initFrameProcessorPlugin('handLandmarks', {});


export function handLandmarks(frame: Frame): number[][] {
  'worklet';

  if (plugin == null) {
    throw new Error('Plugin handLandmarks no encontrado. Revisa el registro nativo.');
  }

  const result: unknown = plugin.call(frame);

  if (!Array.isArray(result)) {
    console.warn ('HandLandmarksPlugin devolvió un valor no válido:', result);
    return [];
  }

  return result as number[][];
}