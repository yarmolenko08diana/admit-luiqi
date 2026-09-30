// Камера + MediaPipe HandLandmarker. Всё выполняется локально в браузере:
// библиотека, WASM и модель лежат в репозитории (vendor/, models/), видео никуда не отправляется.

const VISION_URL = new URL('../../vendor/mediapipe/vision_bundle.mjs', import.meta.url).href;
const WASM_URL = new URL('../../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL_URL = new URL('../../models/hand_landmarker.task', import.meta.url).href;

export class CameraError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

export async function startCamera(video, { mobile = false } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', window.isSecureContext ? 'Браузер не поддерживает доступ к камере' : 'Камера доступна только по HTTPS или на localhost');
  }
  const constraints = {
    audio: false,
    video: { facingMode: 'user', width: { ideal: mobile ? 640 : 1280 }, height: { ideal: mobile ? 480 : 720 } },
  };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw new CameraError('denied', 'Доступ к камере запрещён');
    if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') throw new CameraError('missing', 'Камера не найдена');
    if (e.name === 'NotReadableError') throw new CameraError('busy', 'Камера занята другим приложением');
    throw new CameraError('unknown', e.message);
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await new Promise((resolve) => {
    if (video.readyState >= 2) resolve();
    else video.onloadeddata = () => resolve();
  });
  await video.play().catch(() => {});
  return stream;
}

export class HandTracker {
  constructor() {
    this.landmarker = null;
    this.lastTs = -1;
    this.delegate = null;
  }

  async init(onProgress = () => {}) {
    onProgress('Загружаю библиотеку распознавания…');
    const { FilesetResolver, HandLandmarker } = await import(VISION_URL);
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    onProgress('Загружаю модель руки…');
    const make = (delegate) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
    try {
      this.landmarker = await make('GPU');
      this.delegate = 'GPU';
    } catch {
      // Нет WebGL2 — работаем на процессоре.
      this.landmarker = await make('CPU');
      this.delegate = 'CPU';
    }
  }

  /** Возвращает { landmarks: [[{x,y,z}]], handedness } или null, если кадр ещё не готов. */
  detect(video, nowMs) {
    if (!this.landmarker || video.readyState < 2) return null;
    const ts = Math.max(nowMs, this.lastTs + 1);
    this.lastTs = ts;
    return this.landmarker.detectForVideo(video, ts);
  }
}

/** Средняя яркость кадра (0..255) — чтобы подсказать про плохое освещение. */
export class BrightnessMeter {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 32;
    this.canvas.height = 18;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.value = null;
    this.frame = 0;
  }
  sample(video) {
    if (this.frame++ % 15 !== 0 || video.readyState < 2) return this.value;
    this.ctx.drawImage(video, 0, 0, 32, 18);
    const d = this.ctx.getImageData(0, 0, 32, 18).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    this.value = sum / (d.length / 4);
    return this.value;
  }
}
