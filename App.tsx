import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Share,
  Alert,
  Vibration,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useFrameProcessor,
  runAtTargetFps,
} from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import Svg, { Circle, Line } from 'react-native-svg';
import Tts from 'react-native-tts';

import { CFG, ETIQUETAS, HAND_CONNECTIONS } from './src/config';
import { handLandmarks } from './src/native/handLandmarks';
import { extractFeatures, flipX } from './src/ml/features';
import { predict } from './src/ml/knn';
import { loadSamples, saveSamples, type Sample } from './src/store';

export default function App() {
  const { width } = useWindowDimensions();
  const camH = (width * 4) / 3;

  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const device = useCameraDevice(facing);
  const format = useCameraFormat(device, [
    { videoResolution: { width: 640, height: 480 } },
    { fps: 30 },
  ]);

  const [mode, setMode] = useState<'T' | 'E'>('T');
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [chip, setChip] = useState('—');
  const [progress, setProgress] = useState(0);
  const [hands, setHands] = useState<number[][]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [recording, setRecording] = useState(false);
  const [thr, setThr] = useState(3);
  const [hold, setHold] = useState(8);

  const samples = useRef<Sample[]>([]);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const labelRef = useRef(label);
  labelRef.current = label.trim().toUpperCase();
  const recRef = useRef(recording);
  recRef.current = recording;
  const thrRef = useRef(thr);
  thrRef.current = thr;
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const facingRef = useRef(facing);
  facingRef.current = facing;

  const st = useRef({
    cand: null as string | null,
    count: 0,
    last: null as string | null,
    noHand: 0,
    released: true,
  });

  const refreshCounts = useCallback(() => {
    const c: Record<string, number> = {};
    samples.current.forEach((s) => {
      c[s.l] = (c[s.l] || 0) + 1;
    });
    setCounts(c);
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      if (!hasPermission) {
        await requestPermission();
      }

      if (!active) return;

      samples.current = await loadSamples();
      refreshCounts();

      Tts.setDefaultLanguage('es-MX').catch(() => {});
    })();

    return () => {
      active = false;
    };
  }, [hasPermission, refreshCounts, requestPermission]);

  const commit = useCallback((l: string) => {
    setText((t) => {
      if (l === '_ESPACIO') return t + ' ';
      if (l === '_BORRAR') return t.slice(0, -1);
      if (l.length === 1) return t + l;
      return t + (t && !t.endsWith(' ') ? ' ' : '') + l + ' ';
    });
    Vibration.vibrate(30);
  }, []);

  const onHands = useCallback(
    (raw: number[][]) => {
      const s = st.current;
      const hs =
        facingRef.current === 'front' && CFG.FLIP_X_FRONT
          ? raw.map(flipX)
          : raw;

      setHands(hs);

      if (!hs.length) {
        s.noHand++;
        s.cand = null;
        s.count = 0;
        if (s.noHand > 4) s.released = true;
        setChip('—');
        setProgress(0);
        return;
      }

      s.noHand = 0;
      const v = extractFeatures(hs);

      if (modeRef.current === 'E' && recRef.current && labelRef.current) {
        samples.current.push({
          l: labelRef.current,
          v: v.map((x) => +x.toFixed(3)),
        });
        if (samples.current.length % 5 === 0) refreshCounts();
      }

      const p = predict(samples.current, v, thrRef.current);
      if (!p || p.conf < CFG.MIN_CONF) {
        s.cand = null;
        s.count = 0;
        setChip('?');
        setProgress(0);
        return;
      }

      setChip(p.label.startsWith('_') ? p.label.slice(1) : p.label);

      if (p.label === s.cand) {
        s.count++;
      } else {
        s.cand = p.label;
        s.count = 1;
      }

      setProgress(Math.min(1, s.count / holdRef.current));

      if (
        modeRef.current === 'T' &&
        s.count >= holdRef.current &&
        (s.last !== p.label || s.released)
      ) {
        commit(p.label);
        s.last = p.label;
        s.released = false;
        s.count = 0;
      }
    },
    [commit, refreshCounts]
  );

  const onHandsJS = useMemo(() => Worklets.createRunOnJS(onHands), [onHands]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';

      runAtTargetFps(CFG.FPS, () => {
        'worklet';
        onHandsJS(handLandmarks(frame));
      });
    },
    [onHandsJS]
  );

  const startRec = useCallback(() => {
    if (!labelRef.current) {
      Alert.alert('Falta etiqueta', 'Escribe o elige la seña a registrar.');
      return;
    }
    setRecording(true);
  }, []);

  const stopRec = useCallback(() => {
    setRecording(false);
    refreshCounts();
    saveSamples(samples.current);
  }, [refreshCounts]);

  const exportModel = useCallback(() => {
    Share.share({
      message: JSON.stringify({ version: 1, samples: samples.current }),
    });
  }, []);

  const wipe = useCallback(() => {
    Alert.alert('Borrar todo', '¿Eliminar todas las muestras?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () => {
          samples.current = [];
          refreshCounts();
          saveSamples([]);
        },
      },
    ]);
  }, [refreshCounts]);

  const delLabel = useCallback(
    (l: string) => {
      samples.current = samples.current.filter((x) => x.l !== l);
      refreshCounts();
      saveSamples(samples.current);
    },
    [refreshCounts]
  );

  if (!hasPermission) {
    return (
      <SafeAreaView style={s.center}>
        <Text style={s.txt}>Se necesita acceso a la cámara</Text>
        <Pressable style={s.btn} onPress={requestPermission}>
          <Text style={s.txt}>Dar permiso</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={s.center}>
        <Text style={s.txt}>Sin cámara disponible</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView>
        <View style={{ width, height: camH, backgroundColor: '#000' }}>
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            format={format}
            isActive
            pixelFormat="rgb"
            resizeMode="contain"
            frameProcessor={frameProcessor}
          />

          <Svg
            style={StyleSheet.absoluteFill}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            {hands.map((h, i) => (
              <React.Fragment key={i}>
                {HAND_CONNECTIONS.map(([a, b], k) => (
                  <Line
                    key={k}
                    x1={h[a * 3]}
                    y1={h[a * 3 + 1]}
                    x2={h[b * 3]}
                    y2={h[b * 3 + 1]}
                    stroke="#22d3ee"
                    strokeWidth={0.004}
                  />
                ))}
                {Array.from({ length: 21 }).map((_, j) => (
                  <Circle
                    key={j}
                    cx={h[j * 3]}
                    cy={h[j * 3 + 1]}
                    r={0.007}
                    fill="#f472b6"
                  />
                ))}
              </React.Fragment>
            ))}
          </Svg>

          <View style={s.chip}>
            <Text style={s.chipTxt}>{chip}</Text>
          </View>
          <View style={[s.bar, { width: `${progress * 100}%` }]} />
        </View>

        <View style={s.pad}>
          <View style={s.row}>
            <Pressable
              style={[s.btn, mode === 'T' && s.active]}
              onPress={() => setMode('T')}
            >
              <Text style={s.txt}>Traducir</Text>
            </Pressable>

            <Pressable
              style={[s.btn, mode === 'E' && s.active]}
              onPress={() => setMode('E')}
            >
              <Text style={s.txt}>Entrenar</Text>
            </Pressable>

            <Pressable
              style={s.btn}
              onPress={() =>
                setFacing((f) => (f === 'front' ? 'back' : 'front'))
              }
            >
              <Text style={s.txt}>🔄</Text>
            </Pressable>
          </View>

          {mode === 'T' ? (
            <>
              <TextInput
                style={[s.input, { minHeight: 90, fontSize: 22 }]}
                multiline
                value={text}
                onChangeText={setText}
                placeholder="Aquí aparecerá el texto…"
                placeholderTextColor="#64748b"
              />

              <View style={s.row}>
                <Pressable style={s.btn} onPress={() => Tts.speak(text)}>
                  <Text style={s.txt}>🔊 Leer</Text>
                </Pressable>

                <Pressable
                  style={s.btn}
                  onPress={() => Share.share({ message: text })}
                >
                  <Text style={s.txt}>📤</Text>
                </Pressable>

                <Pressable
                  style={s.btn}
                  onPress={() => setText((t) => t.slice(0, -1))}
                >
                  <Text style={s.txt}>⌫</Text>
                </Pressable>

                <Pressable
                  style={[s.btn, s.danger]}
                  onPress={() => {
                    setText('');
                    st.current.last = null;
                  }}
                >
                  <Text style={s.txt}>Limpiar</Text>
                </Pressable>
              </View>

              <Stepper
                label="Sensibilidad (dist. máx.)"
                value={thr.toFixed(1)}
                onMinus={() =>
                  setThr((v) => Math.max(1, +(v - 0.2).toFixed(1)))
                }
                onPlus={() =>
                  setThr((v) => Math.min(8, +(v + 0.2).toFixed(1)))
                }
              />

              <Stepper
                label="Frames para confirmar"
                value={String(hold)}
                onMinus={() => setHold((v) => Math.max(3, v - 1))}
                onPlus={() => setHold((v) => Math.min(30, v + 1))}
              />

              <Text style={s.hint}>
                Mantén la seña quieta hasta llenar la barra azul. Para repetir
                una letra, baja la mano y vuelve a hacerla.
              </Text>
            </>
          ) : (
            <>
              <Text style={s.lbl}>Seña / palabra a registrar</Text>
              <TextInput
                style={s.input}
                value={label}
                onChangeText={setLabel}
                autoCapitalize="characters"
                placeholder="Ej. A, B, HOLA…"
                placeholderTextColor="#64748b"
              />

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 8 }}
              >
                {ETIQUETAS.map((l) => (
                  <Pressable
                    key={l}
                    style={[
                      s.tag,
                      label.toUpperCase() === l && s.active,
                    ]}
                    onPress={() => setLabel(l)}
                  >
                    <Text style={s.txt}>
                      {l.startsWith('_') ? l.slice(1) : l}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                style={[s.rec, recording && s.recOn]}
                onPressIn={startRec}
                onPressOut={stopRec}
              >
                <Text style={s.txt}>
                  {recording ? '● Grabando…' : '● Mantén para grabar'}
                </Text>
              </Pressable>

              <Text style={s.hint}>
                Mueve ligeramente la mano y cambia el ángulo mientras grabas.
                Ideal: 60–150 muestras por seña, con distintas personas y luz.
              </Text>

              <Text style={s.lbl}>
                Muestras ({Object.values(counts).reduce((a, b) => a + b, 0)})
              </Text>

              <View style={s.tags}>
                {Object.entries(counts)
                  .sort()
                  .map(([l, n]) => (
                    <Pressable
                      key={l}
                      style={s.tag}
                      onLongPress={() => delLabel(l)}
                    >
                      <Text style={s.txt}>
                        <Text style={{ color: '#22d3ee', fontWeight: '700' }}>
                          {l}
                        </Text>{' '}
                        {n}
                      </Text>
                    </Pressable>
                  ))}
              </View>

              <Text style={s.hint}>
                Mantén presionada una etiqueta para borrar sus muestras.
              </Text>

              <View style={s.row}>
                <Pressable style={s.btn} onPress={exportModel}>
                  <Text style={s.txt}>⬇ Exportar JSON</Text>
                </Pressable>

                <Pressable style={[s.btn, s.danger]} onPress={wipe}>
                  <Text style={s.txt}>Borrar todo</Text>
                </Pressable>
              </View>

              <Text style={s.hint}>
                Las muestras se guardan en el dispositivo. Para distribuirlas con
                la app, reemplaza src/assets/model.json con el JSON exportado.
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={[s.row, { alignItems: 'center', marginTop: 10 }]}>
      <Text style={[s.lbl, { flex: 2, marginTop: 0 }]}>{label}</Text>
      <Pressable style={s.btn} onPress={onMinus}>
        <Text style={s.txt}>−</Text>
      </Pressable>
      <Text style={[s.txt, { flex: 1, textAlign: 'center' }]}>{value}</Text>
      <Pressable style={s.btn} onPress={onPlus}>
        <Text style={s.txt}>+</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  center: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  pad: { padding: 14 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  txt: { color: '#e2e8f0', fontSize: 15 },
  btn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  active: { backgroundColor: '#0891b2', borderColor: '#0891b2' },
  danger: { borderColor: '#ef4444' },
  input: {
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginTop: 8,
  },
  lbl: { color: '#94a3b8', fontSize: 13, marginTop: 12 },
  hint: { color: '#94a3b8', fontSize: 12, marginTop: 8, lineHeight: 17 },
  chip: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    backgroundColor: 'rgba(15,23,42,.8)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    minWidth: 64,
    alignItems: 'center',
  },
  chipTxt: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  bar: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 4,
    backgroundColor: '#22d3ee',
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
  },
  rec: {
    marginTop: 12,
    backgroundColor: '#b91c1c',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  recOn: { backgroundColor: '#ef4444' },
});