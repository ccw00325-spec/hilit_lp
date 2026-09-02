/* 판정 로직. 모델이 아니라 순수 계산이다.
 *
 * mobile/confidence/tracking_health.py, confidence_trend.py,
 * mobile/tracker/occlusion_memory.py, mobile/reid/candidate_ranking.py 의
 * 브라우저 이식본이다. 상수는 config.generated.js 에서 가져온다 —
 * 손으로 적으면 파이썬 경로와 어긋나고, 그러면 두 경로의 측정치를
 * 비교할 수 없다.
 */
import { CONFIG, badFramesRequired } from './config.generated.js';
import { iou, cosine } from './models.js';

export const State = {
  OK: 'TRACKING_OK',
  WARNING: 'TRACKING_WARNING',
  OCCLUDED: 'OCCLUDED',
  REACQUIRING: 'REACQUIRING_MOBILE',
  LOST: 'TRACKING_LOST',
  ASK_USER: 'USER_CONFIRMATION',
  FINISHED: 'FINISHED',
};

export const Cause = {
  OCCLUSION: 'occlusion',
  FAST_MOTION: 'fast_motion',
  CAMERA_MOTION: 'camera_motion',
  REID_FAILURE: 'reid_failure',
  TARGET_EXIT: 'target_exit',
  SIMILAR_APPEARANCE: 'similar_appearance',
  DETECTOR_FAILURE: 'detector_failure',
  UNKNOWN: 'unknown',
};

/* =====================================================================
 * tracker confidence 추세 — 절대값이 아니라 기준선 대비 하락률
 * ===================================================================== */

/* 실제 영상에서 confidence 가 0.917 -> 0.757 로 급락했는데 아무 신호도
 * 되지 못했다. 0.757 은 여전히 높은 값이기 때문이다. 문제는 값이 아니라
 * 떨어졌다는 사실이다.
 *
 * 기준선은 비대칭 EMA 로 갱신한다. 대칭으로 두면 하락이 기준선에 흡수되어
 * 아무것도 감지하지 못한다 (올라갈 때 0.15, 내려갈 때 0.01 — 15배 차이). */
export class ConfidenceTrend {
  constructor() { this.baseline = null; this.n = 0; this.drop = 0; this.dropped = false; }

  update(confidence) {
    this.n += 1;
    if (this.baseline === null) { this.baseline = confidence; return; }
    const alpha = confidence >= this.baseline
      ? CONFIG.TRACKER_BASELINE_ALPHA_UP
      : CONFIG.TRACKER_BASELINE_ALPHA_DOWN;
    this.baseline = alpha * confidence + (1 - alpha) * this.baseline;
    const base = Math.max(this.baseline, 1e-6);
    this.drop = Math.max(0, 1 - confidence / base);
    this.dropped = this.n >= CONFIG.TRACKER_TREND_WARMUP
                && this.drop >= CONFIG.TRACKER_DROP_RATIO;
  }
}

/* =====================================================================
 * Tracking Health — 7신호
 * ===================================================================== */

function normalizedWeights() {
  const w = CONFIG.HEALTH_WEIGHTS;
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  for (const [k, v] of Object.entries(w)) out[k] = v / total;
  return out;
}
const W = normalizedWeights();

/* NaN 을 0 으로 떨군다.
 *
 * v < 0 / v > 1 비교만 쓰면 NaN 이 두 조건을 모두 빠져나가 그대로 반환된다
 * (NaN 비교는 항상 false). 신호 하나가 NaN 이면 health 전체가 NaN 이 되고
 * 평균까지 오염되는데, 예외는 나지 않아서 조용히 틀린다.
 *
 * 실제로 그 일이 있었다 — 앱 어댑터가 박스를 {w,h} 로 넘겼고 파이프라인은
 * {width,height} 를 읽어서 undefined -> NaN 이 됐다. 화면에는 평균 건강도가
 * NaN 으로만 찍혔고 원인은 전혀 드러나지 않았다.
 *
 * NaN 을 0 으로 만들면 "신호가 나쁘다" 로 보수적으로 읽히므로 안전한 쪽이다.
 * 단 조용히 넘기지 않기 위해 호출부에서 non-finite 여부를 note 로 남긴다. */
function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class TrackingHealth {
  constructor(reidThreshold = CONFIG.REID_THRESHOLD) {
    this.reidThreshold = reidThreshold;
    this.window = [];
    this.state = State.OK;
    this.trend = new ConfidenceTrend();
    this.lastReid = null;
    this.framesSinceReid = 1e9;
    this.history = [];
  }

  /** 신호 -> health + is_bad. 파이썬 compute() 와 같은 순서로 계산한다. */
  evaluate(sig) {
    const notes = [];
    const fw = sig.frameWidth, fh = sig.frameHeight;
    const diag = Math.sqrt(fw * fw + fh * fh);

    // A. Re-ID
    let reidScore = 1.0;
    if (sig.reidSimilarity !== null && sig.reidSimilarity !== undefined) {
      // threshold 를 0.5 로 매핑한다. 파이썬과 동일.
      reidScore = clamp01(sig.reidSimilarity / Math.max(this.reidThreshold * 2, 1e-6));
    }

    // B. tracker confidence
    const trackerScore = clamp01(sig.trackerConfidence);

    // C. 중심 이동량 (카메라 보정 후 값이 들어온다)
    let motionScore = 1.0;
    if (sig.prevBox && sig.box) {
      const dx = (sig.box.x + sig.box.width / 2) - (sig.prevBox.x + sig.prevBox.width / 2);
      const dy = (sig.box.y + sig.box.height / 2) - (sig.prevBox.y + sig.prevBox.height / 2);
      const jump = Math.sqrt(dx * dx + dy * dy) / Math.max(diag, 1e-6);
      motionScore = clamp01(1 - jump / Math.max(CONFIG.CENTROID_JUMP_RATIO, 1e-6));
      if (jump > CONFIG.CENTROID_JUMP_RATIO) notes.push('centroid_jump');
    }

    // D. 박스 면적 변화율
    let boxScore = 1.0;
    if (sig.prevBox && sig.box) {
      const a0 = Math.max(sig.prevBox.width * sig.prevBox.height, 1);
      const ratio = (sig.box.width * sig.box.height) / a0;
      if (ratio < CONFIG.BOX_CHANGE_LOW || ratio > CONFIG.BOX_CHANGE_HIGH) {
        boxScore = 0.0; notes.push('box_jump');
      }
    }

    // E. 가시성
    let visibilityScore = 1.0;
    if (sig.box) {
      const areaRatio = (sig.box.width * sig.box.height) / Math.max(fw * fh, 1);
      if (areaRatio < CONFIG.MIN_BOX_AREA_RATIO) { visibilityScore = 0.0; notes.push('too_small'); }
      const cx = sig.box.x + sig.box.width / 2, cy = sig.box.y + sig.box.height / 2;
      if (cx < 0 || cy < 0 || cx > fw || cy > fh) { visibilityScore = 0.0; notes.push('out_of_frame'); }
    } else {
      visibilityScore = 0.0; notes.push('no_box');
    }

    // F. 가림 (V3)
    const occlusionScore = sig.occluded ? 0.0 : 1.0;
    // G. 후보 애매함 (V3). 1.0 = 애매하지 않음
    const ambiguityScore = sig.ambiguity === undefined ? 1.0 : clamp01(sig.ambiguity);

    let health = W.reid * reidScore + W.tracker * trackerScore
               + W.motion * motionScore + W.box * boxScore
               + W.visibility * visibilityScore + W.occlusion * occlusionScore
               + W.ambiguity * ambiguityScore;

    // 예측 박스로 계산한 Health 에는 상한을 둔다. 없으면 가려진 동안
    // Health 가 높게 유지되어 재획득이 늦어진다.
    if (sig.predicted) health = Math.min(health, CONFIG.PREDICTED_HEALTH_CAP);

    let isBad = health < CONFIG.BAD_FRAME_HEALTH;

    // 거부권 1 — 신원 증거는 가중 합산에 묻히지 않는다.
    // 실측: Re-ID 0.52 인데 나머지 신호가 만점이라 합산이 0.83 으로 유지됐다.
    if (sig.reidSimilarity !== null && sig.reidSimilarity !== undefined
        && sig.reidSimilarity < this.reidThreshold) {
      isBad = true; notes.push('reid_veto');
    }
    // 거부권 2 — 기준선 대비 급락
    if (sig.trackerDropped) { isBad = true; notes.push('tracker_dropped'); }

    return { health, isBad, reidScore, trackerScore, motionScore,
             boxScore, visibilityScore, occlusionScore, ambiguityScore, notes };
  }

  /** 20프레임 창을 밀고 상태를 전이한다. */
  push(result, nLevel = CONFIG.N_LEVEL) {
    this.window.push(result.isBad ? 1 : 0);
    if (this.window.length > CONFIG.TRACKING_WINDOW) this.window.shift();
    const bad = this.window.reduce((a, b) => a + b, 0);
    const ratio = bad / Math.max(this.window.length, 1);

    const needed = badFramesRequired(nLevel);
    let next = this.state;
    if (bad >= needed && this.window.length >= Math.min(CONFIG.TRACKING_WINDOW, needed)) {
      next = State.LOST;
    } else if (ratio >= CONFIG.WARNING_LOST_RATIO) {
      next = State.WARNING;
    } else {
      next = State.OK;
    }
    this.state = next;
    return { state: next, badRatio: ratio, badFrames: bad, needed };
  }

  /** Adaptive Re-ID 간격. 위험하면 좁힌다. */
  reidInterval() {
    if (!CONFIG.ADAPTIVE_REID) return CONFIG.REID_INTERVAL_NORMAL;
    if (this.trend.dropped) return CONFIG.REID_MIN_GAP_ON_DROP;
    // threshold 바로 위(0.608 vs 0.60)에서 안 걸리는 문제가 실제로 있었다.
    // 여유를 둬서 경계에서도 좁힌다.
    const risky =
      this.state === State.WARNING || this.state === State.OCCLUDED
      || this.state === State.REACQUIRING
      || (this.lastReid !== null
          && this.lastReid < this.reidThreshold + CONFIG.REID_RISKY_MARGIN);
    return risky ? CONFIG.REID_INTERVAL_WARNING : CONFIG.REID_INTERVAL_NORMAL;
  }

  shouldMeasureReid() {
    return this.framesSinceReid >= this.reidInterval() || this.trend.dropped;
  }
}

/* =====================================================================
 * 가림 대응 — 모션 예측 (Lv1)
 * ===================================================================== */

/* 칼만 필터를 쓰지 않는다. 칼만은 등속·선형 가정에서 잘 듣는데 농구는
 * 점프하고 급정지하고 방향을 꺾는다. 가정이 깨진 칼만은 자신 있게 틀린
 * 위치를 내놓아서 단순 이동 평균보다 나쁘다. 불확실성을 감쇠로 표현한다. */
export class OcclusionMemory {
  constructor() { this.vel = []; this.frozen = 0; this.lastBox = null; }

  observe(box) {
    if (this.lastBox) {
      this.vel.push({
        dx: (box.x + box.width / 2) - (this.lastBox.x + this.lastBox.width / 2),
        dy: (box.y + box.height / 2) - (this.lastBox.y + this.lastBox.height / 2),
      });
      if (this.vel.length > CONFIG.VELOCITY_WINDOW) this.vel.shift();
    }
    this.lastBox = { ...box };
    this.frozen = 0;
  }

  predict() {
    if (!this.lastBox) return null;
    this.frozen += 1;
    if (this.frozen > CONFIG.OCCLUSION_MAX_FRAMES) return null;   // 포기 -> LOST
    const n = this.vel.length || 1;
    let dx = 0, dy = 0;
    for (const v of this.vel) { dx += v.dx; dy += v.dy; }
    const decay = Math.pow(CONFIG.PREDICTION_DECAY, this.frozen);
    const b = this.lastBox;
    return {
      x: Math.round(b.x + (dx / n) * decay),
      y: Math.round(b.y + (dy / n) * decay),
      width: b.width, height: b.height,
    };
  }
}

/* =====================================================================
 * 후보 랭킹 (Lv2 재획득)
 * ===================================================================== */

/** 평균 색(유니폼)으로 후보를 걸러내는 보조 신호. */
export function jerseyColor(ctx, box) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const g = c.getContext('2d', { willReadFrequently: true });
  // 상체만 본다 (박스 상단 45%). 다리·바닥이 섞이면 신호가 흐려진다.
  const h = Math.max(1, Math.round(box.height * 0.45));
  try {
    g.drawImage(ctx.canvas, box.x, box.y, Math.max(1, box.width), h, 0, 0, 8, 8);
  } catch { return null; }
  const px = g.getImageData(0, 0, 8, 8).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < px.length; i += 4) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
  const n = px.length / 4;
  return [r / n / 255, gg / n / 255, b / n / 255];
}

function colorSim(a, b) {
  if (!a || !b) return 0.5;
  const d = Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2) / Math.sqrt(3);
  return 1 - d;
}

/** 후보 여러 명 중 우리 대상 고르기.
 *
 * 수락 조건이 AND 다 — 종합 점수가 높아도 Re-ID 가 최소선 미만이면 거부한다.
 * 다른 근거로 Re-ID 를 상쇄하지 못하게 한 것이다 (reid_veto 와 같은 원칙).
 *
 * 1등과 2등 차가 작으면 찍지 않고 사용자에게 묻는다 (Lv4).
 */
export function rankCandidates(cands, ctx, anchors, prediction, prevBox, diag) {
  const cw = CONFIG.CANDIDATE_WEIGHTS;
  const wReid = cw.reid ?? 0.55, wDist = cw.distance ?? 0.2;
  const wSize = cw.size ?? 0.15, wJersey = cw.jersey ?? 0.1;
  const anchorColor = anchors.color;

  const scored = cands.map((c) => {
    const reid = c.embedding
      ? Math.max(...anchors.embeddings.map((a) => cosine(a, c.embedding) ?? -1))
      : -1;

    let dist = 0.5;
    const ref = prediction || prevBox;
    if (ref) {
      const dx = (c.box.x + c.box.width/2) - (ref.x + ref.width/2);
      const dy = (c.box.y + c.box.height/2) - (ref.y + ref.height/2);
      dist = 1 - Math.min(1, Math.sqrt(dx*dx + dy*dy) / Math.max(diag * 0.25, 1e-6));
    }

    let size = 0.5;
    if (prevBox) {
      const r = (c.box.width * c.box.height) / Math.max(prevBox.width * prevBox.height, 1);
      size = 1 - Math.min(1, Math.abs(Math.log(Math.max(r, 1e-6))) / Math.log(4));
    }

    const jersey = CONFIG.USE_JERSEY_COLOR
      ? colorSim(anchorColor, jerseyColor(ctx, c.box)) : 0.5;

    const score = wReid * Math.max(0, reid) + wDist * dist
                + wSize * size + wJersey * jersey;
    return { ...c, reid, dist, size, jersey, score };
  }).sort((a, b) => b.score - a.score);

  if (!scored.length) return { accepted: null, ambiguous: false, cause: Cause.DETECTOR_FAILURE, scored };

  const top = scored[0];
  const gap = scored.length > 1 ? top.score - scored[1].score : 1;
  if (gap < CONFIG.CANDIDATE_AMBIGUOUS_MARGIN) {
    return { accepted: null, ambiguous: true, cause: Cause.SIMILAR_APPEARANCE, scored, gap };
  }
  const ok = top.score >= CONFIG.REACQUIRE_ACCEPT_SCORE
          && top.reid >= CONFIG.REACQUIRE_MIN_REID;
  return {
    accepted: ok ? top : null,
    ambiguous: false,
    cause: ok ? null : Cause.REID_FAILURE,
    scored, gap,
  };
}

/* =====================================================================
 * 앵커 — Identity Poisoning 방지
 * ===================================================================== */

/* 가장 위험한 실패 모드다. 틀린 대상을 앵커로 저장하면 그때부터 시스템이
 * 틀린 사람을 "본인" 으로 확신한다. 그 뒤로는 정상 동작이 전부 오작동이 된다.
 *
 * 그래서 사용자가 확인한 프레임만 앵커가 될 수 있다. 자동 갱신은 기본 꺼짐. */
export class IdentityMemory {
  constructor() { this.embeddings = []; this.color = null; this.stable = 0; }

  add(embedding, color, { confirmedByUser = false } = {}) {
    if (!confirmedByUser) {
      throw new Error('앵커는 사용자가 확인한 프레임만 될 수 있습니다 (Identity Poisoning 방지)');
    }
    if (!embedding) return false;
    if (this.embeddings.length >= CONFIG.AUTO_ANCHOR_MAX_COUNT) this.embeddings.shift();
    this.embeddings.push(embedding);
    if (color) this.color = color;
    return true;
  }

  /** 자동 갱신. 기본으로 꺼져 있고, 켜도 조건 넷을 다 넘어야 한다. */
  maybeAutoUpdate(embedding, color, sig, neighbors) {
    if (!CONFIG.AUTO_ANCHOR_UPDATE) return false;
    if (sig.trackerConfidence < CONFIG.AUTO_ANCHOR_MIN_TRACKER_CONF) { this.stable = 0; return false; }
    if ((sig.reidSimilarity ?? 0) < CONFIG.AUTO_ANCHOR_MIN_REID) { this.stable = 0; return false; }
    // 다른 사람과 겹친 상태에서는 confidence 가 아무리 높아도 앵커로 삼지 않는다.
    for (const nb of neighbors || []) {
      if (iou(sig.box, nb) > CONFIG.AUTO_ANCHOR_MAX_NEIGHBOR_IOU) { this.stable = 0; return false; }
    }
    this.stable += 1;
    if (this.stable < CONFIG.AUTO_ANCHOR_STABLE_FRAMES) return false;
    this.stable = 0;
    if (this.embeddings.length >= CONFIG.AUTO_ANCHOR_MAX_COUNT) this.embeddings.shift();
    this.embeddings.push(embedding);
    if (color) this.color = color;
    return true;
  }
}

/* =====================================================================
 * ID Switch Hysteresis
 * ===================================================================== */

export class SwitchGuard {
  constructor() { this.streak = 0; }
  /** 한 프레임 신호로 대상을 갈아타지 않는다. 3프레임 연속 + 마진 0.12. */
  consider(candidateReid, currentReid) {
    if (candidateReid > currentReid + CONFIG.REID_SWITCH_MARGIN) this.streak += 1;
    else this.streak = 0;
    if (this.streak >= CONFIG.SWITCH_CONFIRM_FRAMES) { this.streak = 0; return true; }
    return false;
  }
}

/** 실패 원인 분류. threshold 를 낮춰 넘기는 대응을 막기 위한 것이다 —
 *  실패하면 원인을 남겨야 한다. */
export function classifyFailure(result, sig, candCount) {
  if (sig.occluded) return Cause.OCCLUSION;
  if (result.notes.includes('out_of_frame') || result.notes.includes('no_box')) return Cause.TARGET_EXIT;
  if (candCount === 0) return Cause.DETECTOR_FAILURE;
  if (result.notes.includes('centroid_jump')) return Cause.FAST_MOTION;
  if (result.notes.includes('reid_veto')) return Cause.REID_FAILURE;
  if (result.ambiguityScore < 0.5) return Cause.SIMILAR_APPEARANCE;
  return Cause.UNKNOWN;
}
