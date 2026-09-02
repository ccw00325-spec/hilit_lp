/* 브라우저에서 도는 모델 3종. 서버가 필요 없다.
 *
 * 이 파일의 NanoTrack 디코딩은 추측이 아니다.
 * benchmarks/verify_nanotrack_decode.py 로 파이썬 참조 구현을 만들고
 * 실제 농구 영상 150프레임에서 cv2.TrackerNano 와 대조했다.
 *
 *     IoU 평균 0.9006   중앙값 0.9085   IoU>=0.70  149/150
 *
 * 아래 상수를 고치면 그 검증이 깨진다. 고치기 전에 위 스크립트를 다시 돌려라.
 *
 * 실행 프로바이더 선택 근거 (헤드리스 Edge 152 / Intel gen-9 실측):
 *
 *                       WASM        WebGPU
 *   nanotrack backbone  15.80ms     23.65ms
 *   nanotrack head       6.22ms     13.02ms
 *   osnet              277.42ms     실패 (InstanceNormalization 미지원)
 *   nanodet             94.70ms    104.09ms
 *
 * 모델이 작아서 WebGPU 디스패치 오버헤드가 이득을 먹는다. 그래서 기본을
 * WASM 으로 두고, WebGPU 는 옵션으로만 시도한다. OSNet 은 항상 WASM 이다.
 */
import { CONFIG } from './config.generated.js';

const ORT_VERSION = '1.23.0';
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

let ortReady = null;

/** onnxruntime-web 을 한 번만 로드한다. */
export function loadOrt() {
  if (ortReady) return ortReady;
  ortReady = new Promise((resolve, reject) => {
    if (window.ort) return resolve(window.ort);
    const s = document.createElement('script');
    s.src = `${ORT_BASE}ort.min.js`;
    s.onload = () => {
      // wasm 바이너리도 같은 CDN 에서 가져오게 한다.
      window.ort.env.wasm.wasmPaths = ORT_BASE;
      // 스레드는 SharedArrayBuffer 가 필요하고 그건 COOP/COEP 헤더를 요구한다.
      // Vercel 정적 배포에 그 헤더를 붙이지 않았으므로 단일 스레드로 둔다.
      window.ort.env.wasm.numThreads = 1;
      window.ort.env.logLevel = 'error';
      resolve(window.ort);
    };
    s.onerror = () => reject(new Error('onnxruntime-web 을 불러오지 못했습니다'));
    document.head.appendChild(s);
  });
  return ortReady;
}

async function createSession(url, { preferWebgpu = false } = {}) {
  const ort = await loadOrt();
  const eps = [];
  if (preferWebgpu && navigator.gpu) eps.push('webgpu');
  eps.push('wasm');
  let lastErr;
  for (const ep of eps) {
    try {
      const sess = await ort.InferenceSession.create(url, {
        executionProviders: [ep],
        graphOptimizationLevel: 'all',
      });
      return { sess, ep };
    } catch (e) { lastErr = e; }
  }
  throw new Error(`세션 생성 실패 (${url}): ${lastErr?.message || lastErr}`);
}

/* =====================================================================
 * 이미지 전처리
 * ===================================================================== */

/** 캔버스에서 정사각형을 잘라 out 크기로 리사이즈한 뒤 NCHW BGR float32 로 만든다.
 *
 * BGR 인 이유: 파이썬 참조 구현이 cv2 프레임(BGR)을 그대로 transpose 해서
 * 넣었고, 그 상태로 검증이 통과했다. 브라우저 캔버스는 RGBA 라서
 * 여기서 채널 순서를 뒤집어야 같은 결과가 나온다.
 *
 * 프레임 밖으로 나가는 부분은 프레임 평균색으로 채운다. 0(검정)으로 채우면
 * 검은 테두리가 특징을 오염시킨다.
 */
export function cropToBlob(ctx, cx, cy, origSz, out, avg, scratch) {
  const half = (origSz - 1) / 2;
  const sx = Math.round(cx - half);
  const sy = Math.round(cy - half);
  const sz = Math.round(origSz);

  const c = scratch.canvas, g = scratch.ctx;
  if (c.width !== out || c.height !== out) { c.width = out; c.height = out; }
  g.fillStyle = `rgb(${avg[0]},${avg[1]},${avg[2]})`;
  g.fillRect(0, 0, out, out);

  // 원본과 겹치는 부분만 그린다. 나머지는 위에서 칠한 평균색으로 남는다.
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const x1 = Math.max(0, sx), y1 = Math.max(0, sy);
  const x2 = Math.min(W, sx + sz), y2 = Math.min(H, sy + sz);
  if (x2 > x1 && y2 > y1) {
    const scale = out / sz;
    g.drawImage(ctx.canvas, x1, y1, x2 - x1, y2 - y1,
                (x1 - sx) * scale, (y1 - sy) * scale,
                (x2 - x1) * scale, (y2 - y1) * scale);
  }

  const px = g.getImageData(0, 0, out, out).data;
  const n = out * out;
  const data = scratch.buf && scratch.buf.length === n * 3
    ? scratch.buf : (scratch.buf = new Float32Array(n * 3));
  // NCHW, 채널 순서 B G R
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    data[i]         = px[p + 2];  // B
    data[n + i]     = px[p + 1];  // G
    data[2 * n + i] = px[p];      // R
  }
  return data;
}

/** 프레임 평균색. crop 패딩에 쓴다. */
export function frameAverage(ctx) {
  const w = 32, h = 32;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(ctx.canvas, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < px.length; i += 4) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
  const n = px.length / 4;
  return [Math.round(r / n), Math.round(gg / n), Math.round(b / n)];
}

function makeScratch() {
  const canvas = document.createElement('canvas');
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }), buf: null };
}

/* =====================================================================
 * NanoTrack — 매 프레임 추적
 * ===================================================================== */

const EXEMPLAR_SIZE = 127;
const INSTANCE_SIZE = 255;
const CONTEXT_AMOUNT = 0.5;
const STRIDE = 16;
const SCORE_SIZE = 16;
const PENALTY_K = 0.148;
const WINDOW_INFLUENCE = 0.455;
const TRACK_LR = 0.34;

function hanning2d(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[y * n + x] = w[y] * w[x];
  return out;
}

function makeGrid(n, stride) {
  const ori = -Math.floor(n / 2) * stride;
  const gx = new Float32Array(n * n), gy = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      gx[y * n + x] = ori + stride * x;
      gy[y * n + x] = ori + stride * y;
    }
  }
  return { gx, gy };
}

const WINDOW = hanning2d(SCORE_SIZE);
const { gx: GRID_X, gy: GRID_Y } = makeGrid(SCORE_SIZE, STRIDE);

function contextSize(w, h) {
  const wc = w + CONTEXT_AMOUNT * (w + h);
  const hc = h + CONTEXT_AMOUNT * (w + h);
  return Math.sqrt(wc * hc);
}

function padSize(w, h) {
  const pad = (w + h) * 0.5;
  return Math.sqrt((w + pad) * (h + pad));
}

export class NanoTrack {
  constructor(backbone, head, ort) {
    this.bb = backbone.sess; this.hd = head.sess;
    this.bbEp = backbone.ep; this.hdEp = head.ep;
    this.ort = ort;
    this.bbIn = this.bb.inputNames[0];
    this.hdIn = this.hd.inputNames;
    this.scratch = makeScratch();
  }

  static async load(base, opts = {}) {
    const ort = await loadOrt();
    const [backbone, head] = await Promise.all([
      createSession(`${base}${CONFIG.MODEL_FILES.nanotrackBackboneDyn}`, opts),
      createSession(`${base}${CONFIG.MODEL_FILES.nanotrackHead}`, opts),
    ]);
    return new NanoTrack(backbone, head, ort);
  }

  async init(ctx, box) {
    this.avg = frameAverage(ctx);
    this.cx = box.x + box.width / 2;
    this.cy = box.y + box.height / 2;
    this.w = box.width; this.h = box.height;

    const sZ = contextSize(this.w, this.h);
    const blob = cropToBlob(ctx, this.cx, this.cy, sZ, EXEMPLAR_SIZE, this.avg, this.scratch);
    const t = new this.ort.Tensor('float32', blob.slice(), [1, 3, EXEMPLAR_SIZE, EXEMPLAR_SIZE]);
    const out = await this.bb.run({ [this.bbIn]: t });
    this.zf = out[this.bb.outputNames[0]];   // (1,48,8,8)
  }

  async update(ctx) {
    const sZ = contextSize(this.w, this.h);
    const scaleZ = EXEMPLAR_SIZE / sZ;
    const sX = sZ * (INSTANCE_SIZE / EXEMPLAR_SIZE);

    const blob = cropToBlob(ctx, this.cx, this.cy, sX, INSTANCE_SIZE, this.avg, this.scratch);
    const t = new this.ort.Tensor('float32', blob.slice(), [1, 3, INSTANCE_SIZE, INSTANCE_SIZE]);
    const feat = await this.bb.run({ [this.bbIn]: t });
    const xf = feat[this.bb.outputNames[0]];

    const res = await this.hd.run({ [this.hdIn[0]]: this.zf, [this.hdIn[1]]: xf });
    const cls = res[this.hd.outputNames[0]].data;    // (1,2,16,16)
    const reg = res[this.hd.outputNames[1]].data;    // (1,4,16,16)

    const N = SCORE_SIZE * SCORE_SIZE;
    const wZ = this.w * scaleZ, hZ = this.h * scaleZ;
    const szPrev = padSize(wZ, hZ);
    const rPrev = this.w / Math.max(this.h, 1e-6);

    let best = 0, bestScore = -Infinity, bestP = 0, bestRaw = 0;
    let bx1 = 0, by1 = 0, bx2 = 0, by2 = 0;

    for (let i = 0; i < N; i++) {
      // 2채널 softmax -> 전경 채널
      const a = cls[i], b = cls[N + i];
      const m = a > b ? a : b;
      const ea = Math.exp(a - m), eb = Math.exp(b - m);
      const score = eb / (ea + eb);

      // ltrb 오프셋 (search crop 픽셀)
      const x1 = GRID_X[i] - reg[i];
      const y1 = GRID_Y[i] - reg[N + i];
      const x2 = GRID_X[i] + reg[2 * N + i];
      const y2 = GRID_Y[i] + reg[3 * N + i];
      const pw = x2 - x1, ph = y2 - y1;

      // 크기/비율 변화 벌점
      const szNow = Math.max(padSize(pw, ph), 1e-6);
      const sC = Math.max(szNow / szPrev, szPrev / szNow);
      const rNow = pw / Math.max(ph, 1e-6);
      const rC = Math.max(rPrev / Math.max(rNow, 1e-6), rNow / Math.max(rPrev, 1e-6));
      const penalty = Math.exp(-(rC * sC - 1) * PENALTY_K);

      // cosine window
      const p = penalty * score * (1 - WINDOW_INFLUENCE) + WINDOW[i] * WINDOW_INFLUENCE;
      if (p > bestScore) {
        bestScore = p; best = i; bestP = penalty; bestRaw = score;
        bx1 = x1; by1 = y1; bx2 = x2; by2 = y2;
      }
    }

    const pw = bx2 - bx1, ph = by2 - by1;
    const cxNew = this.cx + ((bx1 + bx2) / 2) / scaleZ;
    const cyNew = this.cy + ((by1 + by2) / 2) / scaleZ;
    const lr = bestP * bestRaw * TRACK_LR;
    const wNew = this.w * (1 - lr) + (pw / scaleZ) * lr;
    const hNew = this.h * (1 - lr) + (ph / scaleZ) * lr;

    const W = ctx.canvas.width, H = ctx.canvas.height;
    this.cx = Math.min(Math.max(cxNew, 0), W);
    this.cy = Math.min(Math.max(cyNew, 0), H);
    this.w = Math.min(Math.max(wNew, 10), W);
    this.h = Math.min(Math.max(hNew, 10), H);

    return {
      box: {
        x: Math.round(this.cx - this.w / 2), y: Math.round(this.cy - this.h / 2),
        width: Math.round(this.w), height: Math.round(this.h),
      },
      confidence: bestRaw,
    };
  }

  /** 복구 후 위치를 강제로 옮긴다. template 은 갱신하지 않는다.
   *  (사용자 확인 없이 template 을 갱신하면 Identity Poisoning 이다.) */
  reposition(box) {
    this.cx = box.x + box.width / 2;
    this.cy = box.y + box.height / 2;
    this.w = box.width; this.h = box.height;
  }
}

/* =====================================================================
 * OSNet — 사람 재식별
 * ===================================================================== */

export class OSNet {
  constructor(sess, ort) {
    this.sess = sess; this.ort = ort;
    this.inName = sess.inputNames[0];
    this.scratch = makeScratch();
  }

  static async load(base) {
    const ort = await loadOrt();
    // WebGPU 에서 InstanceNormalization 이 실패한다(실측). 항상 WASM 이다.
    const { sess } = await createSession(`${base}${CONFIG.MODEL_FILES.osnet}`,
                                         { preferWebgpu: false });
    return new OSNet(sess, ort);
  }

  /** 박스 하나의 임베딩(512차원, L2 정규화). */
  async embed(ctx, box) {
    const H = CONFIG.OSNET_INPUT_H, W = CONFIG.OSNET_INPUT_W;
    const pad = CONFIG.REID_CROP_PADDING;
    const px = box.width * pad, py = box.height * pad;
    const x = box.x - px, y = box.y - py;
    const w = box.width + 2 * px, h = box.height + 2 * py;

    if (Math.min(w, h) < CONFIG.REID_MIN_CROP_PIXELS) return null;

    const c = this.scratch.canvas, g = this.scratch.ctx;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const sx = Math.max(0, x), sy = Math.max(0, y);
    const ex = Math.min(cw, x + w), ey = Math.min(ch, y + h);
    if (ex <= sx || ey <= sy) return null;
    g.drawImage(ctx.canvas, sx, sy, ex - sx, ey - sy,
                (sx - x) * (W / w), (sy - y) * (H / h),
                (ex - sx) * (W / w), (ey - sy) * (H / h));

    const data = g.getImageData(0, 0, W, H).data;
    const n = W * H;
    const buf = new Float32Array(n * 3);
    // torchreid 전처리: RGB, /255, ImageNet 평균/표준편차
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      buf[i]         = (data[p]     / 255 - mean[0]) / std[0];
      buf[n + i]     = (data[p + 1] / 255 - mean[1]) / std[1];
      buf[2 * n + i] = (data[p + 2] / 255 - mean[2]) / std[2];
    }
    const t = new this.ort.Tensor('float32', buf, [1, 3, H, W]);
    const out = await this.sess.run({ [this.inName]: t });
    const f = out[this.sess.outputNames[0]].data;

    let norm = 0;
    for (let i = 0; i < f.length; i++) norm += f[i] * f[i];
    norm = Math.sqrt(norm) || 1;
    const e = new Float32Array(f.length);
    for (let i = 0; i < f.length; i++) e[i] = f[i] / norm;
    return e;
  }
}

/** L2 정규화된 벡터 두 개의 코사인 유사도. */
export function cosine(a, b) {
  if (!a || !b) return null;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/* =====================================================================
 * NanoDet — 사람 검출 (필요할 때만)
 * ===================================================================== */

const DET_SIZE = 416;
const REG_MAX = 7;                 // 4*(reg_max+1) = 32 채널
const DET_STRIDES = [8, 16, 32];   // 3레벨. 공식 데모는 4레벨로 가정한다 (틀렸다)
const PERSON_CLASS = 0;

export class NanoDet {
  constructor(sess, ort) {
    this.sess = sess; this.ort = ort;
    this.inName = 'input.1';
    this.scratch = makeScratch();
  }

  static async load(base, opts = {}) {
    const ort = await loadOrt();
    const { sess } = await createSession(`${base}${CONFIG.MODEL_FILES.nanodet}`, opts);
    return new NanoDet(sess, ort);
  }

  /* 출력 판별을 이름/순서로 하지 않고 shape 으로 한다.
   * 공식 데모는 (cls, bbox, cls, bbox, ...) 인터리브를 가정하는데
   * 실제 모델은 (cls,cls,cls, bbox,bbox,bbox) 블록 순서다.
   * 이름 순서를 믿으면 conf=1.015 같은 값이 나온다. */
  _pair(outputs) {
    const cls = [], box = [];
    for (const name of Object.keys(outputs)) {
      const t = outputs[name];
      const last = t.dims[t.dims.length - 1];
      if (last === 4 * (REG_MAX + 1)) box.push(t);
      else cls.push(t);
    }
    // grid 개수(2704/676/169)가 큰 것부터 = stride 작은 것부터
    const byGrid = (a, b) => b.dims[1] - a.dims[1];
    cls.sort(byGrid); box.sort(byGrid);
    return cls.map((c, i) => [c, box[i]]);
  }

  async detect(ctx) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const c = this.scratch.canvas, g = this.scratch.ctx;
    if (c.width !== DET_SIZE || c.height !== DET_SIZE) { c.width = DET_SIZE; c.height = DET_SIZE; }
    g.drawImage(ctx.canvas, 0, 0, DET_SIZE, DET_SIZE);   // 종횡비 왜곡은 뒤에서 되돌린다
    const px = g.getImageData(0, 0, DET_SIZE, DET_SIZE).data;

    const n = DET_SIZE * DET_SIZE;
    const buf = new Float32Array(n * 3);
    // opencv_zoo NanoDet 전처리: BGR, ImageNet 평균/표준편차 (0~255 스케일)
    const mean = [103.53, 116.28, 123.675], std = [57.375, 57.12, 58.395];
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      buf[i]         = (px[p + 2] - mean[0]) / std[0];  // B
      buf[n + i]     = (px[p + 1] - mean[1]) / std[1];  // G
      buf[2 * n + i] = (px[p]     - mean[2]) / std[2];  // R
    }

    const t = new this.ort.Tensor('float32', buf, [1, 3, DET_SIZE, DET_SIZE]);
    const out = await this.sess.run({ [this.inName]: t });
    const pairs = this._pair(out);

    const cands = [];
    const sx = W / DET_SIZE, sy = H / DET_SIZE;

    pairs.forEach(([clsT, boxT], level) => {
      const stride = DET_STRIDES[level];
      const gw = Math.ceil(DET_SIZE / stride);
      const nCells = clsT.dims[1], nCls = clsT.dims[2];
      const cd = clsT.data, bd = boxT.data;

      for (let i = 0; i < nCells; i++) {
        const score = cd[i * nCls + PERSON_CLASS];
        if (score < CONFIG.DETECTOR_PROB_THRESHOLD) continue;

        // Distribution Focal Loss 디코딩: 4변 각각 softmax 기대값
        const base = i * 4 * (REG_MAX + 1);
        const d = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const o = base + k * (REG_MAX + 1);
          let m = -Infinity;
          for (let j = 0; j <= REG_MAX; j++) if (bd[o + j] > m) m = bd[o + j];
          let sum = 0, acc = 0;
          for (let j = 0; j <= REG_MAX; j++) { const e = Math.exp(bd[o + j] - m); sum += e; acc += e * j; }
          d[k] = (acc / sum) * stride;
        }

        const gxi = i % gw, gyi = Math.floor(i / gw);
        const cx = (gxi + 0.5) * stride, cy = (gyi + 0.5) * stride;
        const x1 = Math.max(0, (cx - d[0]) * sx);
        const y1 = Math.max(0, (cy - d[1]) * sy);
        const x2 = Math.min(W, (cx + d[2]) * sx);
        const y2 = Math.min(H, (cy + d[3]) * sy);
        if (x2 <= x1 || y2 <= y1) continue;
        cands.push({ box: { x: Math.round(x1), y: Math.round(y1),
                            width: Math.round(x2 - x1), height: Math.round(y2 - y1) },
                     score });
      }
    });

    return mergeDuplicates(nms(cands, CONFIG.DETECTOR_IOU_THRESHOLD))
      .slice(0, CONFIG.DETECTOR_MAX_CANDIDATES);
  }
}

export function iou(a, b) {
  const ax2 = a.x + a.width, ay2 = a.y + a.height;
  const bx2 = b.x + b.width, by2 = b.y + b.height;
  const iw = Math.min(ax2, bx2) - Math.max(a.x, b.x);
  const ih = Math.min(ay2, by2) - Math.max(a.y, b.y);
  if (iw <= 0 || ih <= 0) return 0;
  const inter = iw * ih;
  return inter / (a.width * a.height + b.width * b.height - inter);
}

function nms(cands, thr) {
  const sorted = cands.slice().sort((p, q) => q.score - p.score);
  const keep = [];
  for (const c of sorted) {
    if (keep.every((k) => iou(k.box, c.box) < thr)) keep.push(c);
  }
  return keep;
}

/** 중복 검출 병합. IoU 만 보면 크기 차이가 큰 포함 관계를 놓친다.
 *
 * 실측 사례 — 나란히 선 두 사람을 검출기가 다르게 분할해 6명으로 내놓았다.
 *   P1 x=233 w=59 h=85 / P3 x=245 w=42 h=63 (P1 안에 완전히 포함)
 *   IoU     2646/5015           = 0.528  <- 임계 0.55 를 통과해버린다
 *   포함률  2646/min(5015,2646) = 1.00   <- 이걸로 걸린다
 */
export function mergeDuplicates(cands) {
  const out = [];
  for (const c of cands) {
    let dup = false;
    for (const k of out) {
      const a = k.box, b = c.box;
      const iw = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const ih = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (iw <= 0 || ih <= 0) continue;
      const inter = iw * ih;
      const areaA = a.width * a.height, areaB = b.width * b.height;
      const j = inter / (areaA + areaB - inter);
      const contain = inter / Math.min(areaA, areaB);
      if (j >= CONFIG.CANDIDATE_MERGE_IOU || contain >= CONFIG.CANDIDATE_CONTAIN_RATIO) {
        dup = true; break;
      }
    }
    if (!dup) out.push(c);
  }
  return out;
}
