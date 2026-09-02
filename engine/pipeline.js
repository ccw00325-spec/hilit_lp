/* 브라우저 단독 추적 파이프라인. 서버가 없다.
 *
 * 아키텍처상 달라지는 점 하나를 분명히 해둔다.
 *
 *   Lv1  모션 예측          그대로 된다
 *   Lv2  NanoDet + OSNet     그대로 된다
 *   Lv3  Cutie 정밀 복구     불가능 — PyTorch 134MB + 백본 143MB
 *   Lv4  사용자 확인         그대로 된다
 *
 * Cutie 를 브라우저에 올릴 수 없으므로 Lv3 가 빠지고, 원래 Lv3 로 갔을
 * 구간이 Lv4(사용자 확인)로 넘어간다. 정확도는 떨어지지만 4단계 우선순위가
 * 이미 Lv4 폴백을 갖고 있어서 구조는 유지된다.
 *
 * 카메라 이동 보정(sparse LK 광류)은 아직 이식하지 않았다. 없으면 카메라
 * Pan 을 사람의 이상 이동으로 오판할 수 있다. 미구현임을 화면에 표시한다.
 */
import { CONFIG } from './config.generated.js';
import { NanoTrack, OSNet, NanoDet, cosine, iou } from './models.js';
import {
  State, Cause, TrackingHealth, OcclusionMemory, IdentityMemory,
  SwitchGuard, rankCandidates, jerseyColor, classifyFailure,
} from './tracking.js';

export class BrowserPipeline {
  constructor({ weightsBase = 'weights/', onProgress = () => {} } = {}) {
    this.base = weightsBase;
    this.onProgress = onProgress;
    this.models = null;
  }

  /** 모델 4개를 받아 세션을 만든다. 최초 1회 약 14MB (이후 브라우저 캐시). */
  async loadModels({ preferWebgpu = false } = {}) {
    if (this.models) return this.models;
    this.onProgress({ phase: 'models', message: '모델 내려받는 중 (약 14MB, 처음 한 번만)' });
    const [tracker, reid, detector] = await Promise.all([
      NanoTrack.load(this.base, { preferWebgpu }),
      OSNet.load(this.base),                       // WebGPU 에서 실패한다. 항상 WASM.
      NanoDet.load(this.base, { preferWebgpu }),
    ]);
    this.models = { tracker, reid, detector };
    this.onProgress({ phase: 'models', message: '모델 준비 완료' });
    return this.models;
  }

  /** 영상 파일 -> 첫 프레임 + 사람 후보. */
  async openVideo(file) {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.src = url;

    await new Promise((res, rej) => {
      video.onloadedmetadata = res;
      video.onerror = () => rej(new Error('영상을 열 수 없습니다. MP4(H.264)를 권장합니다.'));
    });

    const srcW = video.videoWidth, srcH = video.videoHeight;
    if (!srcW || !srcH) throw new Error('영상 크기를 읽을 수 없습니다.');

    // 분석용 프록시 크기. 짧은 변을 PROXY_RESOLUTION 으로 맞춘다.
    // Orientation 은 보존한다 — 가로를 세로로 억지로 자르지 않는다.
    const short = Math.min(srcW, srcH);
    const scale = short > CONFIG.PROXY_RESOLUTION ? CONFIG.PROXY_RESOLUTION / short : 1;
    const w = Math.max(2, Math.round(srcW * scale / 2) * 2);
    const h = Math.max(2, Math.round(srcH * scale / 2) * 2);

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    this.video = video; this.url = url;
    this.ctx = ctx;
    this.meta = {
      srcWidth: srcW, srcHeight: srcH,
      width: w, height: h,
      duration: video.duration,
      scale,
      orientation: srcW >= srcH ? 'landscape' : 'portrait',
      // 브라우저는 컨테이너 fps 를 직접 주지 않는다. 분석 fps 로 샘플링한다.
      analysisFps: CONFIG.PROXY_FPS,
    };
    return this.meta;
  }

  async seekDraw(t) {
    const v = this.video;
    if (Math.abs(v.currentTime - t) > 1e-3) {
      await new Promise((res) => {
        const done = () => { v.removeEventListener('seeked', done); res(); };
        v.addEventListener('seeked', done);
        v.currentTime = Math.min(t, Math.max(0, v.duration - 1e-3));
      });
    }
    this.ctx.drawImage(v, 0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    return this.ctx;
  }

  /** 첫 프레임의 사람 후보. 중복은 이미 병합된 상태로 나온다. */
  async firstFrameCandidates() {
    return this.candidatesAt(0);
  }

  /** 현재 사용자가 보고 있는 장면에서 사람 후보를 찾는다. */
  async candidatesAt(t = 0) {
    await this.loadModels();
    const ctx = await this.seekDraw(t);
    const cands = await this.models.detector.detect(ctx);
    return { candidates: cands, frame: ctx.canvas.toDataURL('image/jpeg', 0.85) };
  }

  /** 본격 추적. box 는 사용자가 첫 프레임에서 고른 것이다. */
  async track(rawBox, { nLevel = CONFIG.N_LEVEL, reidThreshold = CONFIG.REID_THRESHOLD,
                       startTime = 0, signal } = {}) {
    /* 박스 키 이름을 여기서 한 번 정규화한다.
     *
     * 호출자가 {x,y,w,h} 로 넘기는 일이 실제로 있었다 (Hilit 웹 어댑터).
     * 그러면 box.width 가 undefined 가 되어 추적 전체가 조용히 NaN 이 된다.
     * 예외도 안 나고 화면에는 "평균 건강도 NaN" 만 찍힌다. 계약을 느슨하게
     * 받아주고, 대신 유효하지 않으면 즉시 던진다. */
    const box = {
      x: Number(rawBox?.x),
      y: Number(rawBox?.y),
      width: Number(rawBox?.width ?? rawBox?.w),
      height: Number(rawBox?.height ?? rawBox?.h),
    };
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite)
        || box.width < 1 || box.height < 1) {
      throw new Error(
        `추적 대상 박스가 유효하지 않습니다: ${JSON.stringify(rawBox)} ` +
        '(x, y, width/w, height/h 가 모두 유한한 값이어야 합니다)');
    }

    await this.loadModels();
    const { tracker, reid, detector } = this.models;
    const m = this.meta;
    const dt = 1 / m.analysisFps;
    const safeStart = Math.max(0, Math.min(Number(startTime) || 0, m.duration - 1e-3));
    const startFrame = Math.round(safeStart * m.analysisFps);
    const total = Math.max(1, Math.floor((m.duration - safeStart) * m.analysisFps));
    const diag = Math.sqrt(m.width ** 2 + m.height ** 2);

    const health = new TrackingHealth(reidThreshold);
    const occl = new OcclusionMemory();
    const anchors = new IdentityMemory();
    const guard = new SwitchGuard();

    // 첫 프레임 앵커. 사용자가 직접 고른 프레임이므로 confirmedByUser 다.
    let ctx = await this.seekDraw(safeStart);
    await tracker.init(ctx, box);
    const anchorEmb = await reid.embed(ctx, box);
    anchors.add(anchorEmb, jerseyColor(ctx, box), { confirmedByUser: true });

    const trajectory = [{ frame: startFrame, t: safeStart, box: { ...box }, state: State.OK,
                          health: 1, reid: 1, confidence: 1 }];
    const events = [];
    const reviews = [];      // Lv4 — 사용자에게 물어볼 구간
    let prevBox = { ...box };
    let reidCalls = 0, detectorCalls = 0, reacquireTried = 0, reacquireOk = 0;
    const causes = {};
    const t0 = performance.now();

    for (let stepIndex = 1; stepIndex < total; stepIndex++) {
      if (signal?.aborted) break;
      const i = startFrame + stepIndex;
      const t = safeStart + stepIndex * dt;
      ctx = await this.seekDraw(t);

      const up = await tracker.update(ctx);
      health.trend.update(up.confidence);
      health.framesSinceReid += 1;

      // Adaptive Re-ID
      let sim = health.lastReid;
      let measured = false;
      if (health.shouldMeasureReid()) {
        const e = await reid.embed(ctx, up.box);
        const s = e ? Math.max(...anchors.embeddings.map((a) => cosine(a, e) ?? -1)) : null;
        if (s !== null) { sim = s; health.lastReid = s; measured = true; reidCalls += 1; }
        health.framesSinceReid = 0;
      }

      const occluded = up.confidence < CONFIG.OCCLUSION_ENTER_CONFIDENCE;
      const sig = {
        frameIndex: i, timestamp: t, box: up.box, prevBox,
        trackerConfidence: up.confidence,
        reidSimilarity: sim, reidMeasured: measured,
        trackerDropped: health.trend.dropped,
        frameWidth: m.width, frameHeight: m.height,
        occluded, predicted: false,
      };

      let res = health.evaluate(sig);
      let step = health.push(res, nLevel);
      let finalBox = up.box;
      let stateOut = step.state;

      // --- Lv1 : 가림이면 모션 예측으로 버틴다 --------------------------
      if (occluded) {
        const pred = occl.predict();
        if (pred) {
          finalBox = pred;
          tracker.reposition(pred);
          sig.box = pred; sig.predicted = true;
          res = health.evaluate(sig);
          stateOut = State.OCCLUDED;
        } else {
          stateOut = State.LOST;      // 30프레임 초과 -> 포기
        }
      } else {
        occl.observe(up.box);
      }

      // --- Lv2 : LOST 면 검출 + Re-ID 로 재획득 -------------------------
      if (stateOut === State.LOST) {
        const cause = classifyFailure(res, sig, 0);
        causes[cause] = (causes[cause] || 0) + 1;

        reacquireTried += 1;
        detectorCalls += 1;
        const raw = await detector.detect(ctx);
        for (const c of raw) c.embedding = await reid.embed(ctx, c.box);
        const rank = rankCandidates(raw, ctx, anchors, occl.predict(), prevBox, diag);

        if (rank.accepted) {
          finalBox = rank.accepted.box;
          tracker.reposition(finalBox);
          health.lastReid = rank.accepted.reid;
          health.window.length = 0;            // 창을 비워 재출발
          health.state = State.OK;
          stateOut = State.OK;
          reacquireOk += 1;
          events.push({ frame: i, t, level: 2, ok: true, cause,
                        reid: rank.accepted.reid, score: rank.accepted.score });
        } else {
          // --- Lv3 가 없다. 서버 Cutie 를 브라우저에 올릴 수 없다.
          //     그래서 바로 Lv4(사용자 확인)로 간다.
          stateOut = State.ASK_USER;
          reviews.push({
            frame: i, t, cause,
            reason: rank.ambiguous ? 'ambiguous_candidates' : 'mobile_reacquire_failed',
            candidates: rank.scored.slice(0, 5).map((c) => ({
              box: c.box, reid: c.reid, score: c.score })),
            lastBox: { ...prevBox },
          });
          events.push({ frame: i, t, level: 4, ok: false, cause,
                        candidates: rank.scored.length });
        }
      }

      trajectory.push({
        frame: i, t, box: finalBox, state: stateOut,
        health: res.health, reid: sim, confidence: up.confidence,
        badRatio: step.badRatio, measured,
      });
      prevBox = finalBox;

      if (stepIndex % 5 === 0 || stepIndex === total - 1) {
        this.onProgress({
          phase: 'track', frame: stepIndex, total,
          percent: Math.round((stepIndex / total) * 100),
          state: stateOut, health: res.health, reid: sim,
          fps: stepIndex / ((performance.now() - t0) / 1000),
        });
      }
    }

    const elapsed = (performance.now() - t0) / 1000;
    const reidVals = trajectory.filter((p) => p.reid !== null && p.reid !== undefined)
                               .map((p) => p.reid);
    return {
      meta: m,
      trajectory, events, reviews, causes,
      metrics: {
        frames: trajectory.length,
        analysisSeconds: elapsed,
        analysisFps: trajectory.length / Math.max(elapsed, 1e-6),
        reidCalls, detectorCalls,
        reacquireTried, reacquireOk,
        askUser: reviews.length,
        serverCalls: 0,          // 브라우저 단독 — 서버를 부르지 않는다
        gpuCostKrw: 0,
        reidMean: reidVals.length ? reidVals.reduce((a, b) => a + b, 0) / reidVals.length : null,
        reidMin: reidVals.length ? Math.min(...reidVals) : null,
        // ?? 는 NaN 을 잡지 못한다. 유한한 값만 평균에 넣고, 버린 개수를
        // 따로 남겨서 조용히 틀리지 않게 한다.
        healthMean: (() => {
          const v = trajectory.map((p) => p.health).filter(Number.isFinite);
          return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
        })(),
        nonFiniteHealthFrames:
          trajectory.filter((p) => !Number.isFinite(p.health)).length,
        lostFrames: trajectory.filter((p) => p.state === State.LOST
                                         || p.state === State.ASK_USER).length,
        nLevel, reidThreshold,
      },
      limits: {
        cutieRecovery: false,          // Lv3 없음
        cameraMotionCompensation: false, // 미이식
      },
    };
  }

  /** 사용자가 Lv4 구간을 확인해 주면 그 프레임을 앵커로 삼고 이어서 간다. */
  async confirm(result, frameIndex, box, anchors, reidModel) {
    const t = frameIndex / this.meta.analysisFps;
    const ctx = await this.seekDraw(t);
    const e = await reidModel.embed(ctx, box);
    anchors.add(e, jerseyColor(ctx, box), { confirmedByUser: true });
    return { ok: true, frame: frameIndex, box };
  }

  dispose() {
    if (this.url) URL.revokeObjectURL(this.url);
    this.video = null; this.ctx = null;
  }
}

export { State, Cause };
