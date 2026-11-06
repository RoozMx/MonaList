export const CFG = {
  K: 5,
  MIN_CONF: 0.6,
  FPS: 15,
  FEATURE_LEN: 129,
  // Si el overlay aparece invertido en la cámara frontal, cambia a false (o viceversa)
  FLIP_X_FRONT: true,
};

export const ETIQUETAS = [
  ...'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split(''),
  '_ESPACIO',
  '_BORRAR',
];

export const HAND_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17],
];