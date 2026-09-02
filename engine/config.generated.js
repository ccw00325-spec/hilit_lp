/* 자동 생성 파일 — 직접 고치지 마세요.
 *
 * 원천: shared/config.py
 * 생성: python scripts/export_browser_config.py
 *
 * 브라우저 경로와 파이썬 경로가 같은 판정을 하도록 상수를 한 곳에서
 * 가져옵니다. 손으로 두 번 적으면 반드시 어긋납니다.
 */
export const CONFIG = {
  "REID_THRESHOLD": 0.6,
  "CRITICAL_ID_THRESHOLD": 0.35,
  "REID_INTERVAL_NORMAL": 20,
  "REID_INTERVAL_WARNING": 5,
  "ADAPTIVE_REID": true,
  "REID_RISKY_MARGIN": 0.1,
  "REID_MIN_GAP_ON_DROP": 3,
  "REID_CROP_PADDING": 0.08,
  "REID_MIN_CROP_PIXELS": 24,
  "BAD_FRAME_HEALTH": 0.55,
  "PREDICTED_HEALTH_CAP": 0.62,
  "TRACKER_DROP_RATIO": 0.12,
  "TRACKER_TREND_WARMUP": 8,
  "TRACKER_BASELINE_ALPHA_UP": 0.15,
  "TRACKER_BASELINE_ALPHA_DOWN": 0.01,
  "BOX_CHANGE_LOW": 0.5,
  "BOX_CHANGE_HIGH": 2.0,
  "CENTROID_JUMP_RATIO": 0.12,
  "MIN_BOX_AREA_RATIO": 0.0005,
  "TRACKING_WINDOW": 20,
  "WARNING_LOST_RATIO": 0.3,
  "N_LEVEL": 2,
  "RECOVERY_COOLDOWN_SECONDS": 5.0,
  "MAX_RECOVERIES_PER_VIDEO": 40,
  "OCCLUSION_MAX_FRAMES": 30,
  "OCCLUSION_ENTER_CONFIDENCE": 0.35,
  "VELOCITY_WINDOW": 5,
  "PREDICTION_DECAY": 0.92,
  "DETECTOR_PROB_THRESHOLD": 0.35,
  "DETECTOR_IOU_THRESHOLD": 0.6,
  "DETECTOR_MAX_CANDIDATES": 12,
  "DETECTOR_MIN_GAP_FRAMES": 5,
  "CANDIDATE_MERGE_IOU": 0.55,
  "CANDIDATE_CONTAIN_RATIO": 0.8,
  "CANDIDATE_AMBIGUOUS_MARGIN": 0.06,
  "REACQUIRE_ACCEPT_SCORE": 0.62,
  "REACQUIRE_MIN_REID": 0.45,
  "USE_JERSEY_COLOR": true,
  "SWITCH_CONFIRM_FRAMES": 3,
  "REID_SWITCH_MARGIN": 0.12,
  "AUTO_ANCHOR_UPDATE": false,
  "AUTO_ANCHOR_MIN_TRACKER_CONF": 0.9,
  "AUTO_ANCHOR_MIN_REID": 0.85,
  "AUTO_ANCHOR_STABLE_FRAMES": 40,
  "AUTO_ANCHOR_MAX_NEIGHBOR_IOU": 0.05,
  "AUTO_ANCHOR_MAX_COUNT": 5,
  "CAMERA_MOTION_COMPENSATION": true,
  "CAMERA_FLOW_MAX_POINTS": 120,
  "CAMERA_FLOW_DOWNSCALE": 0.35,
  "PROXY_RESOLUTION": 720,
  "PROXY_FPS": 20.0,
  "PRESERVE_ORIENTATION": true,
  "EXPORT_ASPECT": "source",
  "HEALTH_WEIGHTS": {
    "reid": 0.4,
    "tracker": 0.25,
    "motion": 0.15,
    "box": 0.1,
    "visibility": 0.1,
    "occlusion": 0.12,
    "ambiguity": 0.08
  },
  "CANDIDATE_WEIGHTS": {
    "reid": 0.5,
    "jersey": 0.1
  },
  "N_LEVEL_THRESHOLDS": {
    "2": 0.5,
    "3": 0.667,
    "4": 0.75
  },
  "OSNET_INPUT_H": 256,
  "OSNET_INPUT_W": 128,
  "MODEL_FILES": {
    "nanotrackBackbone": "nanotrack_backbone_sim.onnx",
    "nanotrackBackboneDyn": "nanotrack_backbone_dyn.onnx",
    "nanotrackHead": "nanotrack_head_sim.onnx",
    "osnet": "osnet_ain_x1_0_msmt17.onnx",
    "nanodet": "nanodet_2022nov.onnx"
  }
};

// 20프레임 창에서 몇 프레임이 나빠야 LOST 인가 (config.py 의
// bad_frames_required 와 동일 — ceil 을 쓰는 이유는 N=3 을 명세대로
// 14프레임으로 맞추기 위해서다).
export function badFramesRequired(nLevel = CONFIG.N_LEVEL,
                                  window = CONFIG.TRACKING_WINDOW) {
  const t = CONFIG.N_LEVEL_THRESHOLDS[String(nLevel)]
         ?? CONFIG.N_LEVEL_THRESHOLDS['2'];
  return Math.max(1, Math.ceil(t * window));
}

export function lostThreshold(nLevel = CONFIG.N_LEVEL) {
  return CONFIG.N_LEVEL_THRESHOLDS[String(nLevel)]
      ?? CONFIG.N_LEVEL_THRESHOLDS['2'];
}
