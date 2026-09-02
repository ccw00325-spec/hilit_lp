# Hilit 사용자 추적 PoC — 기술 기획서

| 항목 | 값 |
| --- | --- |
| 문서 성격 | **사후 기획서.** 이미 만든 것을 근거와 함께 정리한 문서입니다 |
| 기준 시점 | 2026-09-01 |
| 기준 커밋 | `eecb1ce` (12번째 커밋) |
| 대상 저장소 | `github.com/ccw00325-spec/HIlittracking` |
| 화면 | `https://hilit-tracking-poc.vercel.app` (데모) · `http://localhost:8000` (실사용) |
| 산출물 규모 | Python 12,357줄 · 프런트 1,784줄 · 문서 1,730줄 · 스크립트 575줄 |

---

## 0. 이 문서를 읽는 법

일반적인 기획서는 만들기 전에 씁니다. 이 문서는 반대입니다. 이미 돌아가는
코드가 있고, 실측 수치가 있고, 개발 중에 뒤집힌 판단들이 있습니다.
그것들을 사후에 정리했습니다.

그래서 두 가지를 지켰습니다.

**첫째, 안 된 것을 안 됐다고 적었습니다.** V3에서 추가한 기능의 절반이
아직 검증되지 않았습니다. 그 사실을 §7에 따로 모았습니다. 기획서가 잘 된
것만 적으면 다음 사람이 같은 함정에 다시 빠집니다.

**둘째, 숫자에는 측정 조건을 붙였습니다.** "131 fps"는 이 개발 PC의
CPU에서 720p 프록시를 돌린 값입니다. 조건이 빠진 숫자는 다음 회의에서
근거 없이 인용됩니다.

읽는 순서를 추천하면 §1 → §2 → §5 → §7입니다. §3과 부록은 필요할 때
찾아보는 용도입니다.

---

## 1. 무엇을 검증하려 했나

### 1.1 원래 질문

> 사용자가 첫 화면에서 자기를 한 번 지정하면, 시스템이 그 사람을 영상
> 끝까지 따라갈 수 있는가. 그리고 확신이 없을 때 사용자에게 물어볼 수
> 있는가.

이 질문에는 함정이 하나 있습니다. **"따라간다"와 "그 사람이다"는 다른
문제입니다.**

추적기는 프레임마다 "여기 있다"고 답합니다. 그런데 농구에서 두 선수가
스크린을 서며 겹쳤다 떨어지면, 추적기가 엉뚱한 선수로 갈아타도 그 사실을
스스로 모릅니다. 계속 자신 있게 틀린 사람을 가리킵니다.

```
추적 모델   따라간다        →  누구인지는 모른다
Re-ID 모델  누구인지 안다   →  따라가지는 못한다
```

그래서 처음부터 두 모델을 붙이는 구조로 갔습니다. Cutie가 따라가고,
OSNet이 "지금 이 사람, 처음 그 사람 맞나"를 주기적으로 확인합니다.

### 1.2 그 다음에 생긴 질문

만들다 보니 원래 질문 뒤에 더 무거운 질문이 붙었습니다.

> 강력한 모델을 영상 전체에 쓰지 않고, **정말 어려운 순간에만** 쓸 수
> 있는가. 그러면 비용이 얼마나 줄고 정확도는 얼마나 떨어지는가.

20분 영상 전체를 GPU 모델로 돌리면 원가가 서비스를 못 하게 만듭니다.
이 교환비를 재는 것이 V2 이후 PoC의 실질적인 목표가 됐습니다.

### 1.3 검증 대상이 아닌 것

- 완성된 서비스. 인증도 없고 동시 사용자 처리도 없습니다.
- 모바일 앱. 모바일 쪽 로직은 파이썬으로 구현해 CPU에서 재는 단계까지입니다.
- 최적 파라미터. threshold 0.60은 실험용 초기값이고, 정답이 아닙니다(§7.1).

---

## 2. 아키텍처 — 세 번 바뀐 이유

구조가 세 번 바뀌었습니다. 바뀔 때마다 이유가 있었고, 그 이유가 이
프로젝트의 기술적 핵심입니다.

### 2.1 V1 — 서버 Cutie 단일 추적

```
사용자 지정 → [서버] Cutie 전 프레임 추적 + OSNet 주기 검증 → 결과
```

가장 단순합니다. 그리고 **원가에서 무너집니다.** Cutie는 프레임마다
메모리 뱅크를 갱신하는 모델이라 20분 영상이면 GPU를 20분 넘게 점유합니다.

한 가지는 여기서 확실히 얻었습니다. Cutie는 마스크 품질이 좋습니다.
사각형 박스가 아니라 사람 실루엣을 따냅니다. 이 강점은 버릴 이유가
없었습니다 — 쓰는 **위치**를 바꿨을 뿐입니다.

### 2.2 V2 — Mobile-First Hybrid

발상을 뒤집었습니다. **Cutie를 주 추적기에서 내리고, 복구 전문 모델로
격하합니다.**

```
             MOBILE                                    GPU SERVER

  사용자 최초 지정
        ↓
  NanoTrack  ← 매 프레임 (1.8MB, 131fps)
        ↓
  Tracking Health  ← 20프레임 창
        ↓
  Adaptive OSNet  ← 정상 20프레임 / 위험 5프레임
        ↓
  ┌─ 정상 ─→ 계속
  │
  └─ 위험 ─→ Lv1  모션 예측 (가림 대응)
                ↓ 실패
             Lv2  NanoDet + OSNet 재획득
                ↓ 실패
             Lv3  ───────────────────→   Cutie 정밀 복구
                                          문제 구간 ±4초만
                ↓ 애매                   ←───────────────
             Lv4  사용자 확인
```

**Cutie는 정상 구간에서 아예 실행되지 않습니다.** 문제가 생긴 ±4초
클립만 처리합니다.

여기에 N-Level 정책을 붙였습니다. 서버를 부르는 기준선을 조절하는
손잡이입니다(§3.4). 초대 코드 등급별로 원가를 다르게 가져가는 것이
목적이었습니다.

### 2.3 V3 — 농구 강건화 + Orientation

실제로 쓸 영상이 농구라는 전제가 확정되면서, 농구에서 실제로 깨지는
지점들을 하나씩 막았습니다.

| 추가한 것 | 막으려는 상황 |
| --- | --- |
| OCCLUDED 상태 + 모션 예측 | 스크린 플레이로 2~3초 가림 |
| NanoDet Detector-on-Demand | 화면 밖으로 나갔다 다시 들어옴 |
| Candidate Ranking | 후보 여러 명 중 우리 대상 고르기 |
| Jersey Color | 유니폼 색으로 상대 팀 배제 |
| Camera Motion Compensation | 카메라 Pan을 사람 이동으로 오판 |
| ID Switch Hysteresis | 한 프레임 실수로 대상을 갈아타는 것 |
| Adaptive Re-ID (20/5) | 위험할 때 확인 간격 좁히기 |

동시에 **강제 9:16 코드를 전부 걷어냈습니다.**

```
Landscape input  →  Landscape output
Portrait input   →  Portrait output
```

가로 영상을 세로로 억지로 자르지 않습니다. 16:9 / 9:16 / 1:1 / 4:5는
사용자가 명시적으로 고르는 export 옵션일 때만 적용됩니다.

### 2.4 모델 파일 크기와 실행 메모리는 다른 개념입니다

한 번 잘못 판단했던 지점이라 못박아 둡니다.

| 모델 | 어디서 도는가 | 파일 크기 |
| --- | --- | --- |
| NanoTrack | 모바일 (매 프레임) | 1.8 MB |
| OSNet (ONNX) | 모바일 (20/5프레임) | 0.9 MB |
| NanoDet | 모바일 (필요할 때만) | 3.8 MB |
| Cutie | **GPU 서버** (문제 구간만) | 350 MB + 백본 143 MB |

개발 중에 "2GB VRAM으로는 Cutie base를 못 돌린다"고 판단한 적이 있습니다.
**틀렸습니다.** MX250(2GB)에서 정상 동작하고 peak VRAM은 423MB였습니다.
당시 `cuda_available=False`가 나온 진짜 이유는 CPU 전용 torch를 설치한
것이었습니다.

체크포인트 크기로 실행 메모리를 추정하면 이런 식으로 틀립니다.
필요량은 입력 해상도와 memory bank 설정이 정하므로 **쓰려는 GPU에서 직접
재는 것이 유일한 방법입니다.** `scripts/check_env.py`가 그걸 합니다.

---

## 3. 기술 구성요소

### 3.1 모델 4종

| 모델 | 역할 | 출처 | 라이선스 |
| --- | --- | --- | --- |
| **Cutie** | 서버측 정밀 복구 (VOS) | `hkchengrex/Cutie` | MIT |
| **OSNet-AIN** | 사람 재식별 (Re-ID) | `KaiyangZhou/deep-person-reid` | MIT |
| **NanoTrack v2** | 모바일 매 프레임 추적 | `HonglinChu/SiamTrackers` | Apache-2.0 |
| **NanoDet** | 모바일 사람 검출 | `opencv/opencv_zoo` | Apache-2.0 |

네 개 모두 **실제 소스를 읽고 API를 확인**했습니다. 이름을 추측해서 쓴
곳은 없습니다. 그 과정에서 공식 문서/데모가 틀린 곳을 두 군데 찾았습니다
(§6.1, §6.5).

가중치는 `weights/` 한 폴더에 모읍니다. 합쳐서 약 510MB이고 `~/.cache/torch`를
쓰지 않습니다 — 인터넷이 막힌 GPU 서버에서 첫 추론이 실패하는 것을 막기
위해서입니다.

### 3.2 Tracking Health — 7신호

프레임마다 7개 신호를 모아 하나의 값으로 만듭니다.

| 신호 | 원시 가중치 | 정규화 후 | 무엇을 보는가 |
| --- | --- | --- | --- |
| `reid` | 0.40 | 0.333 | OSNet 코사인 유사도 |
| `tracker` | 0.25 | 0.208 | NanoTrack confidence |
| `motion` | 0.15 | 0.125 | 중심점 이동량 |
| `box` | 0.10 | 0.083 | 박스 면적 변화율 |
| `visibility` | 0.10 | 0.083 | 박스가 화면 안에 있는가 |
| `occlusion` | 0.12 | 0.100 | 가림 상태 지속 |
| `ambiguity` | 0.08 | 0.067 | 후보 간 점수 차 |

합이 1.20이라 정규화해서 씁니다. `HealthWeights.normalized()`가 처리합니다.

Health가 `0.55`(`BAD_FRAME_HEALTH`) 미만이면 그 프레임을 **bad frame**으로
셉니다.

#### 가중 합산을 우회하는 거부권 두 개

가중 합산만 쓰면 결정적인 신호가 묻힙니다. 실제로 그 일이 일어났습니다
(§6.3). 그래서 합산을 건너뛰는 거부권을 두 개 뒀습니다.

```python
is_bad = health < config.BAD_FRAME_HEALTH

if sig.reid_similarity is not None and sig.reid_similarity < self.reid_threshold:
    is_bad = True          # reid_veto — 신원 증거는 합산에 묻히지 않는다
    notes.append("reid_veto")

if tracker_dropped:
    is_bad = True          # 기준선 대비 급락 (§3.2.1)
```

**중요한 설계 판단**: threshold를 낮춰서 감지율을 올리는 대응을 하지
않았습니다. 신호의 성격 자체를 반영하도록 고쳤습니다. Re-ID가 기준 미만이면
그건 "조금 의심스럽다"가 아니라 "다른 사람일 수 있다"이고, 다른 신호가
아무리 좋아도 상쇄되면 안 됩니다.

#### 3.2.1 절대값이 아니라 기준선 대비 하락률

실제 영상에서 tracker confidence가 `0.917 → 0.757`로 급락했는데 아무
신호도 되지 못했습니다. 0.757은 여전히 높은 값이기 때문입니다.
**문제는 값이 아니라 떨어졌다는 사실입니다.**

`mobile/confidence/confidence_trend.py`를 만들어 기준선 대비 하락률을
봅니다. 기준선은 **비대칭 EMA**로 갱신합니다.

```python
alpha = (config.TRACKER_BASELINE_ALPHA_UP if confidence >= self.baseline
         else config.TRACKER_BASELINE_ALPHA_DOWN)
self.baseline = alpha * confidence + (1.0 - alpha) * self.baseline
drop = max(0.0, 1.0 - confidence / base)
```

올라갈 때 `α=0.15`, 내려갈 때 `α=0.01`입니다. **대칭으로 두면 하락이
기준선에 흡수되어 아무것도 감지하지 못합니다.** 하락률이 12%를 넘으면
그 프레임을 무조건 bad로 세고 Re-ID를 즉시 다시 잽니다.

### 3.3 상태 머신과 20프레임 창

```
        ┌──────────┐
        │  ACTIVE  │
        └────┬─────┘
             │ bad 비율 ≥ 0.30
        ┌────▼─────┐
        │ WARNING  │  ← Re-ID 간격 20 → 5
        └────┬─────┘
             │ bad 비율 ≥ N-Level 기준
     ┌───────▼────────┐
     │ LOST / RECOVERY│
     └────────────────┘

     OCCLUDED — 별도 상태. 모션 예측으로 버팀 (최대 30프레임)
```

단일 프레임으로 판정하지 않습니다. **최근 20프레임 창**에서 bad frame
비율을 봅니다. 한 프레임 흔들림으로 서버를 부르면 원가가 폭주합니다.

가려진 동안 계산한 Health에는 상한 `0.62`(`PREDICTED_HEALTH_CAP`)를
씁니다. 이 상한이 없으면 예측 박스가 Health를 높게 유지해서 재획득이
늦어집니다.

### 3.4 N-Level 정책 — 원가 손잡이

`N`이 커질수록 서버를 덜 부릅니다. 원가가 줄고, 정확도는 떨어질 수
있습니다. **이 교환비를 재는 것이 PoC의 핵심 목표였습니다.**

| N | LOST 기준 | 20프레임 중 | 성격 |
| --- | --- | --- | --- |
| 2 | 0.50 | 10프레임 | 품질 우선 |
| 3 | 0.667 | 14프레임 | 균형 |
| 4 | 0.75 | 15프레임 | 비용 방어 |

```python
def bad_frames_required(n_level=None, window=None) -> int:
    w = TRACKING_WINDOW if window is None else window
    return max(1, math.ceil(lost_threshold(n_level) * w))
```

`ceil`을 쓴 이유가 있습니다. N=3은 `20 × 0.667 = 13.34`인데 명세가
14프레임으로 못박았습니다. 올림하면 맞습니다. N=4는 `20 × 0.75 = 15`로
정확히 떨어집니다.

**Critical 우회**: Re-ID가 `0.35`(`CRITICAL_ID_THRESHOLD`) 아래로 떨어지면
N-Level과 무관하게 즉시 서버를 부릅니다. 명백히 다른 사람을 잡고 있는데
원가를 아끼는 것은 의미가 없습니다.

이 우회 조항이 벤치마크에서 예상 못 한 결과를 냈습니다(§5.2).

### 3.5 4단계 복구 우선순위

| 단계 | 방법 | 비용 | 어디서 |
| --- | --- | --- | --- |
| Lv1 | 모션 예측으로 버티기 | 0 | 모바일 |
| Lv2 | NanoDet 검출 + OSNet 재획득 | 0 | 모바일 |
| Lv3 | Cutie 정밀 복구 (±4초 클립) | GPU 초당 과금 | 서버 |
| Lv4 | 사용자에게 확인 요청 | 사용자 시간 | UI |

싼 것부터 씁니다. 서버는 세 번째입니다.

Lv3에서 **전체 영상을 절대 보내지 않습니다.** 문제 구간 ±4초 클립만
보냅니다(`FAST_SPORT_MODE=True`). 클립 길이가 원가를 직접 결정하므로
이 값이 가장 민감한 파라미터입니다 — ±4초를 ±10초로 늘리면 원가가
2.5배가 됩니다.

서버 호출에는 안전판 두 개를 뒀습니다.

- `RECOVERY_COOLDOWN_SECONDS = 5.0` — 부른 직후 또 부르지 않습니다
- `MAX_RECOVERIES_PER_VIDEO = 40` — 한 영상 상한

없으면 어려운 장면에서 호출이 폭주합니다.

### 3.6 Occlusion 처리 + 모션 예측

가려졌다고 바로 LOST로 보내지 않습니다. `OCCLUDED` 상태로 두고 최대
30프레임 동안 예측 위치로 버팁니다.

속도는 최근 5프레임 이동 평균이고, 프레임마다 `0.92`씩 감쇠시킵니다.

**칼만 필터를 의도적으로 쓰지 않았습니다.** 칼만은 등속·선형 가정에서
잘 듣습니다. 농구는 점프하고 급정지하고 방향을 꺾습니다. 가정이 깨진
칼만은 자신 있게 틀린 위치를 내놓는데, 그게 단순 이동 평균보다 나쁩니다.
불확실성을 감쇠로 표현하는 쪽이 정직합니다.

### 3.7 Camera Motion Compensation

카메라가 Pan하면 화면상 모든 것이 움직입니다. 이걸 보정하지 않으면
"사람이 갑자기 크게 이동했다"로 오판해서 서버를 부릅니다.

sparse Lucas-Kanade 광류로 배경 특징점 최대 120개를 추적하고, 이동량의
**중앙값**을 카메라 이동으로 봅니다. 평균이 아니라 중앙값인 이유는
움직이는 사람 위의 특징점이 섞여도 버티기 위해서입니다.

계산량을 줄이려고 0.35배로 축소해서 돌립니다. 실측 **4.4 ms/frame**입니다.

효과는 벤치마크에서 확인됐습니다. `I_pan` 케이스에서 **서버 호출 0회**로
Coverage 100%를 냈습니다. 보정이 없으면 Pan을 이상 이동으로 읽어 서버를
불렀을 상황입니다.

### 3.8 Candidate Ranking

재획득할 때 후보가 여러 명 나옵니다. 그중에서 우리 대상을 골라야 합니다.
Re-ID 점수만 쓰지 않고 여러 근거를 합칩니다.

- Re-ID 유사도 (주 신호)
- 예측 위치와의 거리
- 박스 크기의 연속성
- 유니폼 색 유사도 (`USE_JERSEY_COLOR=True`)

수락 기준은 두 개를 동시에 넘어야 합니다.

```
REACQUIRE_MIN_REID     = 0.45   # Re-ID 최소선
REACQUIRE_ACCEPT_SCORE = 0.62   # 종합 점수
```

1등과 2등의 점수 차가 `0.06`(`CANDIDATE_AMBIGUOUS_MARGIN`) 미만이면
**애매하다고 판정하고 Lv4로 넘깁니다.** 찍지 않습니다.

#### ID Switch Hysteresis

한 프레임 신호로 대상을 갈아타지 않습니다. 새 후보가 `3`프레임
(`SWITCH_CONFIRM_FRAMES`) 연속으로 현재 대상보다 `0.12`
(`REID_SWITCH_MARGIN`) 이상 높아야 전환합니다.

### 3.9 Orientation-Aware Reframing

`mobile/video/reframe.py`가 담당합니다. 검증한 변환:

| 입력 | 출력 | 판정 |
| --- | --- | --- |
| 1920×1080 | 1280×720 | Landscape 유지 |
| 1080×1920 | 720×1280 | Portrait 유지 |
| 720×334 | 1280×594 | Landscape 유지 |

카메라 이동은 `AdaptiveSmoother`가 다룹니다. 대상이 빠르게 움직이면
반응을 빠르게, 느리면 부드럽게 합니다. 고정 스무딩은 둘 중 하나를
반드시 망칩니다.

여기에 두 가지를 더 붙였습니다.

- **Directional Look-Ahead** — 진행 방향 쪽에 여유 공간을 더 둡니다
- **Crop Safety Margin** — 대상이 프레임 경계에 닿지 않게 합니다

### 3.10 Identity Poisoning 방지

가장 위험한 실패 모드입니다. **틀린 대상을 앵커로 저장하면 그때부터
시스템이 틀린 사람을 "본인"으로 확신합니다.** 그 뒤로는 정상 동작이
전부 오작동이 됩니다.

그래서 코드 수준에서 막았습니다.

```
사용자가 확인한 프레임만 앵커가 될 수 있다  (confirmed_by_user=True 필수)
AUTO_ANCHOR_UPDATE = False   ← 기본값
```

자동 앵커 갱신은 **기본으로 꺼져 있습니다.** 켜더라도 조건이 넷 다
충족돼야 합니다.

```
AUTO_ANCHOR_MIN_TRACKER_CONF  = 0.90
AUTO_ANCHOR_MIN_REID          = 0.85
AUTO_ANCHOR_STABLE_FRAMES     = 40
AUTO_ANCHOR_MAX_NEIGHBOR_IOU  = 0.05   ← 근처에 다른 사람이 없어야 한다
AUTO_ANCHOR_MAX_COUNT         = 5
```

마지막 조건이 핵심입니다. 다른 사람과 겹친 상태에서는 confidence가
아무리 높아도 앵커로 삼지 않습니다.

### 3.11 분석 fps와 출력 fps 분리

GPU 부하가 클 때 분석 프레임률을 낮춥니다. 그런데 **사용자가 받는 영상은
원래 프레임률입니다.**

```
원본 60fps  →  분석 20fps (프록시 720p, CRF 24)  →  출력 60fps
                     ↓
              빠진 프레임은 궤적 선형 보간
```

`backend/tracking/throttle.py`가 부하를 보고 분석 fps를 조절하고,
`backend/video/renderer.py`가 원래 프레임률로 되돌립니다.

마스크는 RLE로 압축해서 보관합니다(`backend/utils/rle.py`). 프레임마다
전체 비트맵을 들고 있으면 메모리가 버티지 못합니다.

---

## 4. 시스템 구성

### 4.1 모듈 배치

Python 파일 66개, 12,357줄입니다.

```
shared/          공통 (3 파일)
  config.py      464줄 — 모든 튜너블 상수. 전체의 중심
  schemas.py     525줄 — 요청/응답 스키마

mobile/          모바일에서 돌 로직 (23 파일)
  session.py     839줄 — 전체 오케스트레이션
  tracker/       nanotrack, occlusion_memory, tracker_state
  confidence/    tracking_health, confidence_trend, n_level_policy
  detector/      nanodet_person  (337줄)
  reid/          osnet_mobile, candidate_ranking, identity_memory
  recovery/      recovery_clip, server_recovery_client
  vision/        camera_motion
  video/         reframe  (332줄)

server/          GPU 서버 전용 (5 파일)
  cutie/         recovery_tracker  (283줄)

backend/         FastAPI 앱 (21 파일)
  app.py         569줄 — 23개 라우트
  pipeline.py    596줄 — 처리 파이프라인
  storage.py     376줄 — 로컬 / Supabase
  video/         decoder(349), renderer(197), reframe
  tracking/      cutie_tracker, reid, confidence, throttle, initial_mask

benchmarks/      측정 (5 파일)
tests/           테스트 (5 파일 + 브라우저 2)
scripts/         유틸 (4 py + 2 ps1)
```

`shared/config.py`가 구조적으로 가장 중요합니다. 모든 상수가 환경변수로
덮어쓰기 가능하고(`_f`, `_i`, `_s`, `_b` 헬퍼), 주석에 **그 값을 그렇게
정한 이유**가 붙어 있습니다.

### 4.2 API

라우트 23개 — 정적 3개, `/api/*` 20개입니다.

| 분류 | 엔드포인트 |
| --- | --- |
| 정적 | `GET /` · `/app.js` · `/styles.css` |
| 환경 | `GET /api/health` · `POST /api/warmup` |
| 저장소 | `GET /api/storage` · `POST .../test` `.../connect` `.../disconnect` · `GET .../schema.sql` |
| 업로드 | `POST /api/video/upload` · `GET /api/video/{id}/frame` |
| 추적 | `POST .../target` `.../track` `.../cancel` · `GET .../progress` |
| 결과 | `GET .../result` `.../result.json` `.../output` `.../reframe` |
| 수정 | `POST .../threshold` `.../correct` · `GET .../review/{n}/thumbnail` |

`/api/health`가 GPU 유무, torch 버전, ffmpeg, 가중치, 저장소 상태를 한
번에 답합니다. 화면이 이걸 보고 붙을지 판단합니다.

`POST .../threshold`는 **다시 추적하지 않고** threshold만 바꿔 재판정합니다.
Re-ID 유사도를 프레임마다 저장해 두었기 때문에 가능합니다. threshold가
실험값이라는 전제에서 나온 설계입니다.

### 4.3 데이터 흐름

```
업로드
  ↓ ffmpeg → 프록시 720p / 20fps / CRF 24
첫 프레임 → NanoDet 후보 검출 → 중복 병합 → 사용자에게 제시
  ↓ 사용자가 한 명 고름
초기 마스크 생성 → 앵커 임베딩 저장 (confirmed_by_user=True)
  ↓
프레임 루프
  NanoTrack 추적 → 카메라 보정 → Health 7신호 → (필요시) OSNet
  ↓ 위험 판정
  Lv1 예측 → Lv2 재획득 → Lv3 서버 클립 → Lv4 사용자 확인
  ↓
궤적 선형 보간 → 원래 fps로 렌더 → Orientation 유지 리프레임
  ↓
결과 영상 + result.json + 확인 필요 구간 목록
```

좌표는 프록시 기준으로 계산하고 **원본 해상도로 역매핑**합니다.
`tests/test_proxy.py`가 이 역매핑을 검증합니다.

### 4.4 저장소

Supabase(PostgreSQL)를 선택적으로 씁니다. 없으면 로컬 JSONL로 떨어집니다.

실험 결과(파라미터, 지표, 실패 원인)를 쌓는 용도입니다. threshold를
calibration하려면 영상 여러 개의 결과가 한곳에 있어야 합니다.

연결은 화면의 설정 창에서 합니다. `scripts/apply_supabase_schema.py`가
Management API로 스키마를 적용합니다.

**키 종류를 미리 검사합니다.** `classify_key()`가 `sb_publishable_`나
anon JWT를 감지하면 네트워크 요청 전에 막고 어떤 키가 필요한지 알려줍니다.
개발 중 실제로 publishable 키를 넣어 실패한 일이 있었습니다.

### 4.5 자료구조 명세

출처는 `shared/schemas.py`(525줄)입니다. 모바일과 서버가 이 정의를 공유합니다.

#### 4.5.1 `TrackState` — 추적 상태 (8종)

```python
OK          = "TRACKING_OK"          # 정상
WARNING     = "TRACKING_WARNING"     # bad 비율 0.30 초과 → Re-ID 간격 20→5
OCCLUDED    = "OCCLUDED"             # 가림. 모션 예측으로 버팀 (최대 30프레임)
REACQUIRING = "REACQUIRING_MOBILE"   # Lv2 재획득 시도 중
LOST        = "TRACKING_LOST"        # N-Level 임계 초과
RECOVERY    = "SERVER_RECOVERY"      # Lv3 서버 클립 처리 중
ASK_USER    = "USER_CONFIRMATION"    # Lv4 사용자 확인 대기
FINISHED    = "FINISHED"
```

`WARNING`은 서버를 부르지 않습니다. **확인 간격만 좁힙니다.** 이게 원가를
가장 크게 좌우하는 상태입니다 — 위험을 조기에 좁혀서 보면 서버까지 갈
일이 줄어듭니다.

#### 4.5.2 `RecoveryLevel` — 복구 단계

```python
MOTION_PREDICTION = 1   # 모바일, 비용 0
MOBILE_REACQUIRE  = 2   # 모바일, 비용 0
SERVER_CUTIE      = 3   # 서버, GPU 초당 과금
USER_CONFIRM      = 4   # 사용자 시간
```

`int` Enum입니다. 숫자 순서가 곧 시도 순서이자 비용 순서입니다.

#### 4.5.3 `FailureCause` — 실패 원인 (8종)

```python
OCCLUSION          = "occlusion"            # 가림
FAST_MOTION        = "fast_motion"          # 급격한 이동
CAMERA_MOTION      = "camera_motion"        # 카메라 이동 오판
REID_FAILURE       = "reid_failure"         # 유사도 붕괴
TARGET_EXIT        = "target_exit"          # 화면 밖으로
SIMILAR_APPEARANCE = "similar_appearance"   # 비슷한 사람 혼동
DETECTOR_FAILURE   = "detector_failure"     # 검출 실패
UNKNOWN            = "unknown"
```

**이 분류가 설계에서 중요합니다.** 추적이 실패했을 때 threshold를 내려서
넘기는 대응을 하지 않겠다는 원칙이 이 enum으로 강제됩니다. 실패하면
원인을 분류해서 기록해야 합니다.

실제로 이 분류가 진단을 만들어냈습니다.

```
합성 세트   detector_failure=42, fast_motion=3
            → 검출기가 도형을 사람으로 못 본다. 테스트 데이터 문제 (§5.2)

실제 영상   fast_motion=12, similar_appearance=8
            → 급격한 이동과 유사 인물 혼동. 실제 알고리즘 문제
```

원인 분류가 없으면 두 상황이 같은 "실패 3회"로 보입니다.

#### 4.5.4 `RecoveryReason` — 서버 호출 사유 (8종)

`FailureCause`와 별개입니다. 이쪽은 **N-Level을 우회하는지 여부**를 결정합니다.

| 사유 | N-Level 우회 |
| --- | --- |
| `lost_ratio` | 아니오 (정상 경로) |
| `critical_reid` | **예** |
| `target_lost` | **예** |
| `id_switch_suspected` | **예** |
| `long_undetected` | **예** |
| `long_occlusion` | **예** (V3 추가) |
| `mobile_reacquire_failed` | **예** (V3 추가) |
| `ambiguous_candidates` | **예** (V3 추가) |

우회 사유가 7개고 정상 경로가 1개입니다. **여기가 §5.2에서 N-Level 효과를
측정하지 못한 구조적 이유입니다.** 어려운 장면에서는 우회 사유가 먼저
걸리므로 N을 올려도 호출 횟수가 줄지 않습니다.

설계 의도 자체는 맞습니다 — 명백히 틀린 사람을 잡고 있는데 원가를 아끼는
것은 의미가 없습니다. 다만 **N-Level의 효과를 측정하려면 우회가 덜 걸리는
영상이 필요합니다.**

#### 4.5.5 `FrameSignals` — 판정 입력

```python
frame_index: int
timestamp: float
box: Optional[BBox]
tracker_confidence: float          # NanoTrack getTrackingScore()
reid_similarity: Optional[float]   # OSNet. None = 이 프레임은 안 잼
reid_measured: bool                # ← 측정값인지 재사용값인지 구분
prev_box: Optional[BBox]
frame_width: int
frame_height: int
```

`reid_measured`가 중요합니다. Re-ID는 20프레임마다 재므로 그 사이
프레임은 **옛 값을 재사용**합니다. 이 플래그가 없으면 19프레임 전 값을
현재 측정값으로 착각합니다.

§6.4의 감지 지연이 정확히 이 문제였습니다 — `f140~158`에서 `reid 0.608`이
19프레임 동안 유지됐는데, 그게 옛 값이라는 사실이 판정에 반영되지
않았습니다.

#### 4.5.6 `FrameHealth` — 판정 출력

```python
frame_index: int
timestamp: float
health: float                 # 7신호 가중 합산. 확률이 아니다 (§7.5)
reid_score: float
tracker_score: float
motion_score: float
box_score: float
visibility_score: float
occlusion_score: float = 1.0  # V3
ambiguity_score: float = 1.0  # V3. 1.0 = 애매하지 않음
is_bad: bool                  # health 기준 + 거부권 (§3.2)
state: TrackState
notes: List[str]              # "reid_veto", "tracker_dropped" 등
```

**7개 신호를 개별로 다 보관합니다.** 합산값만 남기면 나중에 왜 그렇게
판정됐는지 재구성할 수 없습니다. §6.3의 원인 규명이 이 개별 값 덕분에
가능했습니다.

```
0.333 × 0.475 + 0.667 × 1.0 ≈ 0.83
```

`notes`는 거부권이 발동했을 때 그 사실을 남깁니다. 디버깅 경로입니다.

#### 4.5.7 `RecoveryRequest` / `RecoveryResponse` — 모바일↔서버 계약

```python
# 모바일 → 서버
session_id: str
problem_timestamp: float      # 원본 영상에서의 문제 시각
clip_start: float             # 클립이 원본 몇 초부터인지
clip_end: float
clip_path: str                # ← 클립만. 전체 영상 아님
last_known_box: Optional[BBox]  # proxy 좌표계
reason: RecoveryReason
n_level: int
proxy_scale_x: float = 1.0    # proxy → 원본 배율
proxy_scale_y: float = 1.0
anchor_count: int = 1
```

```python
# 서버 → 모바일
ok: bool
recovery_timestamp: float
target_bbox: Optional[List[int]]     # [x1,y1,x2,y2] 원본 좌표계
identity_similarity: float
needs_user_confirmation: bool        # ← 서버도 "모르겠다"고 답할 수 있다
candidates: List[RecoveryCandidate]
gpu_seconds: float                   # 원가 계산 입력
gpu_name: str
clip_seconds: float
message: str
```

세 가지가 설계 판단입니다.

**① `clip_path`만 보냅니다.** 전체 영상을 서버에 올리지 않습니다.
프라이버시와 원가 양쪽 이유입니다.

**② 좌표계가 요청과 응답에서 다릅니다.** 요청의 `last_known_box`는
proxy 좌표, 응답의 `target_bbox`는 원본 좌표입니다. 배율을 요청에
같이 실어 보내 서버가 변환합니다(§4.8).

**③ 서버도 "모르겠다"고 답합니다.** `needs_user_confirmation=True`면
Lv4로 넘깁니다. 서버가 억지로 하나를 고르는 것이 Identity Poisoning의
직접 경로입니다(§3.10).

**④ `gpu_seconds`를 응답에 실습니다.** 원가를 추정이 아니라 실측으로
계산하기 위해서입니다.

#### 4.5.8 `LostEvent` — 실패 기록

```python
timestamp: float
frame_index: int
state: str
cause: FailureCause
tracker_confidence: float
reid_similarity: Optional[float]
candidate_count: int
recovery_method: str    # motion_prediction | nanodet_osnet | server_cutie | user
recovery_success: bool
recovery_seconds: float
```

**실패할 때의 신호값을 함께 남깁니다.** 이게 있어야 threshold
calibration이 가능합니다. "실패 8회"만으로는 threshold를 어느 쪽으로
얼마나 옮겨야 하는지 알 수 없습니다.

`candidate_count`도 같은 이유입니다. 후보가 0개라서 실패한 것과 후보가
5개인데 못 고른 것은 완전히 다른 문제입니다 — 전자는 검출기, 후자는
Re-ID입니다(§7.3).

#### 4.5.9 `MobileMetrics` — 모바일 실측

```python
device: str
frames_tracked: int
tracker_total_seconds: float
reid_calls: int              # ← Adaptive Re-ID 효과 측정
reid_total_seconds: float
peak_rss_mb: float
avg_rss_mb: float
```

`reid_calls`가 Adaptive Re-ID(20/5)의 실효를 재는 값입니다. 위험 구간에서
간격을 좁히면 호출이 늘어나므로, 이 값과 감지 지연이 교환 관계입니다.

---

### 4.6 알고리즘 명세

#### 4.6.1 프레임 루프

```
for each frame:
    # 1. 추적
    box, conf = nanotrack.update(frame)

    # 2. 카메라 이동 보정 (§3.7)
    if CAMERA_MOTION_COMPENSATION:
        dx, dy = median(sparse_LK_flow(prev, frame, max_points=120, scale=0.35))
        motion_delta = (box.center - prev_box.center) - (dx, dy)
    else:
        motion_delta = box.center - prev_box.center

    # 3. tracker confidence 추세 (§3.2.1)
    trend.update(conf)          # 비대칭 EMA
    dropped = trend.dropped     # 기준선 대비 12% 초과 하락

    # 4. Re-ID 를 잴지 결정 (Adaptive)
    interval = reid_interval(state, trend)
    if frames_since_reid >= interval or dropped:
        reid = osnet.similarity(crop(frame, box), anchor_embeddings)
        reid_measured = True
    else:
        reid = last_reid         # 재사용. reid_measured=False

    # 5. Health 7신호 (§3.2)
    health, is_bad = compute_health(signals)
    if reid < REID_THRESHOLD:  is_bad = True   # reid_veto
    if dropped:                is_bad = True

    # 6. 20프레임 창 판정 (§3.3)
    window.push(is_bad)
    state = transition(state, window.bad_ratio(), n_level)

    # 7. 상태별 처리
    if state == OCCLUDED:     box = predict(velocity, decay=0.92)
    if state == REACQUIRING:  box = reacquire()       # Lv2
    if state == LOST:         request_server_clip()   # Lv3
```

#### 4.6.2 Adaptive Re-ID 간격 결정

```python
def _reid_interval(state, trend) -> int:
    risky = (
        state in (WARNING, OCCLUDED, REACQUIRING)
        or _last_reid < REID_THRESHOLD + REID_RISKY_MARGIN   # 경계값 대응
        or occlusion_frozen
        or trend.dropped
    )
    if trend.dropped:
        return REID_MIN_GAP_ON_DROP        # 3
    return REID_INTERVAL_WARNING if risky else REID_INTERVAL_NORMAL
```

두 번째 조건이 §6.4에서 추가한 것입니다. `_last_reid = 0.608`,
`REID_THRESHOLD = 0.60`이면 첫 조건만으로는 위험이 아닙니다. 여유
`0.10`을 두면 `0.608 < 0.70`이라 위험으로 잡힙니다.

#### 4.6.3 비대칭 EMA 기준선

```python
def update(self, confidence: float):
    if self.baseline is None:
        self.baseline = confidence
        return

    alpha = (TRACKER_BASELINE_ALPHA_UP   if confidence >= self.baseline   # 0.15
             else TRACKER_BASELINE_ALPHA_DOWN)                            # 0.01
    self.baseline = alpha * confidence + (1.0 - alpha) * self.baseline

    self.drop = max(0.0, 1.0 - confidence / max(self.baseline, 1e-6))
    self.dropped = (self.n >= TRACKER_TREND_WARMUP          # 8
                    and self.drop >= TRACKER_DROP_RATIO)    # 0.12
```

`α_up = 0.15`, `α_down = 0.01`입니다. 15배 차이입니다.

**대칭으로 두면 작동하지 않습니다.** `0.917 → 0.757` 하락 시 대칭 EMA는
기준선을 같이 끌어내려서 `drop`이 곧 0에 수렴합니다. 감지할 것이 없어집니다.

`TRACKER_TREND_WARMUP = 8`은 추적 시작 직후 값이 흔들리는 구간을
판정에서 빼기 위한 것입니다.

#### 4.6.4 상태 전이

```
bad_ratio = window.count(is_bad) / 20

OK       →  WARNING   : bad_ratio >= 0.30
WARNING  →  OK        : bad_ratio <  0.30
WARNING  →  LOST      : bad_ratio >= lost_threshold(N)     # 0.50/0.667/0.75
any      →  OCCLUDED  : conf < 0.35 and 예측 가능
OCCLUDED →  LOST      : 30프레임 초과
any      →  RECOVERY  : RecoveryReason 이 우회 사유          # N 무시

RECOVERY 진입 전 게이트:
    now - last_recovery >= 5.0                 # 냉각
    recovery_count      <  40                  # 상한
```

가려진 동안 Health에는 상한 `0.62`를 씁니다. 없으면 예측 박스가 Health를
높게 유지해서 재획득이 늦어집니다.

#### 4.6.5 후보 중복 병합 (§6.6)

```python
def merge_duplicates(boxes):
    for a, b in pairs(boxes):
        inter = intersection_area(a, b)
        iou     = inter / union_area(a, b)
        contain = inter / min(area(a), area(b))    # ← 포함률

        if iou >= CANDIDATE_MERGE_IOU or contain >= CANDIDATE_CONTAIN_RATIO:
            drop(smaller_of(a, b))
```

IoU 하나로는 부족합니다. 크기가 크게 다른 포함 관계에서 IoU가 낮게
나옵니다.

```
P1  x=233 w=59 h=85      P3  x=245 w=42 h=63   ← P1 안에 완전 포함

IoU      2646 / 5015           = 0.528   ← 임계 0.55 를 통과해버림
포함률   2646 / min(5015,2646) = 1.00    ← 확실히 걸림
```

#### 4.6.6 후보 랭킹 (§3.8)

```python
score = ( w_reid       * reid_similarity
        + w_distance   * (1 - normalized_distance_to_prediction)
        + w_size       * size_continuity
        + w_jersey     * jersey_color_similarity )

accept = (score >= REACQUIRE_ACCEPT_SCORE       # 0.62
          and reid_similarity >= REACQUIRE_MIN_REID)   # 0.45

if top1.score - top2.score < CANDIDATE_AMBIGUOUS_MARGIN:   # 0.06
    → ASK_USER      # 찍지 않는다
```

수락 조건이 **AND**입니다. 종합 점수가 높아도 Re-ID가 `0.45` 미만이면
거부합니다. 다른 근거로 Re-ID를 상쇄하지 못하게 한 것입니다 — §3.2의
`reid_veto`와 같은 원칙입니다.

#### 4.6.7 ID Switch Hysteresis

```python
if candidate.reid > current.reid + REID_SWITCH_MARGIN:      # 0.12
    switch_streak += 1
else:
    switch_streak = 0

if switch_streak >= SWITCH_CONFIRM_FRAMES:                  # 3
    switch_to(candidate)
```

한 프레임 신호로 대상을 갈아타지 않습니다. 3프레임 연속 + 마진 0.12를
동시에 요구합니다.

#### 4.6.8 NanoDet 출력 판별 (§6.5)

```python
def _pair_outputs(outputs):
    # getUnconnectedOutLayersNames() 의 순서를 믿지 않는다.
    # shape 으로 cls / bbox 를 판별한다.
    cls_outs, box_outs = [], []
    for o in outputs:
        last = o.shape[-1]
        if last == num_classes:            cls_outs.append(o)
        elif last == 4 * (reg_max + 1):    box_outs.append(o)   # DFL
    # stride 는 grid 크기에서 역산 (3레벨: 8/16/32)
    return zip(sorted_by_grid(cls_outs), sorted_by_grid(box_outs))
```

bbox 회귀는 Distribution Focal Loss 형식이라 `4 × (reg_max+1)` 채널이
나옵니다. 이 값이 클래스 수와 겹치지 않는다는 점을 이용해 판별합니다.

공식 데모의 가정 두 개가 실제와 달랐습니다.

| 데모 가정 | 실제 |
| --- | --- |
| `(cls, bbox, cls, bbox, …)` 인터리브 | `(cls,cls,cls, bbox,bbox,bbox)` 블록 |
| stride 4레벨 (8/16/32/64) | **3레벨 (8/16/32)** |

#### 4.6.9 Orientation-Aware 출력 크기 결정 (§3.9)

```python
def resolve_output_aspect(src_w, src_h, export_aspect="source"):
    if export_aspect == "source" and PRESERVE_ORIENTATION:
        return src_w / src_h          # 원본 비율 유지. 강제 변환 없음
    return ASPECT_TABLE[export_aspect]

def output_size(src_w, src_h, target_aspect, long_edge=1280):
    landscape = src_w >= src_h
    if landscape: w, h = long_edge, round(long_edge / target_aspect)
    else:         h, w = long_edge, round(long_edge * target_aspect)
    return even(w), even(h)      # 인코더가 짝수를 요구한다
```

검증한 변환:

```
1920×1080  →  1280×720    Landscape 유지
1080×1920  →   720×1280   Portrait 유지
 720×334   →  1280×594    Landscape 유지
```

`even()`이 필요한 이유는 H.264 yuv420p가 짝수 해상도를 요구하기
때문입니다. 홀수면 인코딩이 실패합니다.

#### 4.6.10 궤적 보간과 출력 fps 복원 (§3.11)

```
분석: 20fps 로 프레임 t0, t1, ... 에서 box 계산
출력: 원본 fps (예: 60fps)

for 출력 프레임 t (t0 < t < t1):
    ratio = (t - t0) / (t1 - t0)
    box   = lerp(box[t0], box[t1], ratio)
```

선형 보간입니다. 곡선 보간을 쓰지 않았습니다 — 20fps 간격(50ms)에서
사람의 이동은 선형에 가깝고, 곡선은 오버슈트를 만들어 박스가 대상을
앞질러 갑니다.

---

### 4.7 인터페이스 계약

#### 4.7.1 `GET /api/health`

화면이 서버에 붙을지 판단하는 근거입니다.

```json
{
  "ok": true,
  "cuda_available": true,
  "gpu_name": "NVIDIA GeForce MX250",
  "gpu_memory_mb": 2048,
  "torch_version": "2.13.0+cu124",
  "ffmpeg": true,
  "ffmpeg_major": 7,
  "weights": { "cutie": true, "osnet": true, "nanotrack": true, "nanodet": true },
  "storage": "supabase"
}
```

`torch_version` 존재 여부를 서버 판별에 씁니다. 자동 탐색이 포트
8000~8005를 훑을 때 응답 본문에 이 키가 있는지로 우리 서버를 식별합니다
(§8.3).

#### 4.7.2 추적 요청 흐름

```
POST /api/video/upload          multipart. → job_id
GET  /api/video/{id}/frame      첫 프레임 + NanoDet 후보 (중복 병합 후)
POST /api/video/{id}/target     { "box": [x,y,w,h], "confirmed_by_user": true }
POST /api/video/{id}/track      { "n_level": 2, "reid_threshold": 0.60 }
GET  /api/video/{id}/progress   폴링. { state, frame, total, health, recoveries }
GET  /api/video/{id}/result     최종 지표 + 확인 필요 구간 목록
```

`POST .../target`의 `confirmed_by_user`는 **필수**입니다. 이 플래그 없이는
앵커가 만들어지지 않습니다. Identity Poisoning 방지를 코드 수준에서
강제한 지점입니다(§3.10).

#### 4.7.3 재판정 — 다시 추적하지 않습니다

```
POST /api/video/{id}/threshold   { "reid_threshold": 0.55 }
```

**추적을 다시 돌리지 않고** 판정만 다시 합니다. Re-ID 유사도를 프레임마다
`FrameHealth`에 저장해 두었기 때문에 가능합니다.

threshold가 실험값이라는 전제(§7.1)에서 나온 설계입니다. 값을 바꿀 때마다
GPU를 다시 태우면 calibration을 할 수 없습니다.

#### 4.7.4 사용자 수정

```
POST /api/video/{id}/correct
{
  "frame_index": 142,
  "box": [x, y, w, h],
  "confirmed_by_user": true
}
```

사용자가 고친 프레임은 앵커가 될 수 있습니다. 이게 앵커가 되는 **유일한**
경로입니다.

---

### 4.8 좌표계 규약

좌표계가 세 개 있습니다. 섞이면 박스가 어긋납니다.

| 좌표계 | 어디서 | 예 |
| --- | --- | --- |
| 원본 | 업로드된 영상 | 1920×1080 |
| 프록시 | 분석용 축소본 | 720p / 20fps / CRF 24 |
| 출력 | 리프레임 결과 | 1280×720 |

규약:

```
계산    프록시 좌표계에서 한다        (모든 추적·Re-ID·Health)
저장    프록시 좌표계로 저장한다      (재판정을 위해)
응답    원본 좌표계로 변환해 준다     (target_bbox)
표시    화면이 CSS 비율로 스케일한다
```

프록시 → 원본 변환은 `RecoveryRequest`의 `proxy_scale_x/y`를 씁니다.
`tests/test_proxy.py`가 이 역매핑을 검증합니다.

**회전 메타데이터 취급.** OpenCV가 rotation을 올바르게 적용합니다(§6.7).
`cv2.VideoCapture`가 보고하는 크기를 그대로 신뢰하고, ffprobe의
회전 전 크기는 쓰지 않습니다.

```
ffprobe:  334 × 720   rotation=90    ← 회전 전 저장 크기. 쓰지 않는다
OpenCV:   720 × 334                  ← 이걸 쓴다
```

---

## 5. 검증

### 5.1 채점 방법론 — 자기보고를 버린 이유

처음에는 추적기가 보고하는 성공률을 썼습니다. **항상 100%가 나왔습니다.**

NanoTrack은 Siamese tracker입니다. 입력 영역에서 template과 가장 비슷한
곳을 찾아 **항상** 박스를 반환하고 `ok=True`를 줍니다. 엉뚱한 것을 잡고
있어도 그렇습니다.

```
E_occ_long: 대상이 165/270 프레임만 보이는데 자기보고 coverage 100%
            정답 궤적 기준으로는 53.9%
```

그래서 정답 궤적을 프레임 단위로 저장하고 **IoU ≥ 0.30**으로 채점하도록
바꿨습니다(`benchmarks/evaluate.py`).

이게 이 프로젝트에서 방법론적으로 가장 중요한 수정입니다. 이걸 안 고쳤으면
모든 후속 측정이 무의미했습니다.

### 5.2 합성 세트 결과 — V3의 핵심 개선은 검증되지 않았습니다

농구 테스트 케이스 7종 × N=2/3/4 × OLD(V2)/NEW(V3) = 42회 실행입니다.

```
              Coverage  IDsw  오추적률  Lost  모바일복구  서버  GPU초    원   개입
  NEW_V3_N2     88.9%    10    2.0%     2     0/42        3   192.9  54.26   3
  OLD_V2_N2     88.9%    10    2.0%     2      -          3   175.3  49.31   3
  NEW_V3_N3     88.9%    10    2.0%     2     0/35        3   204.4  57.47   3
  OLD_V2_N3     88.9%    10    2.0%     2      -          3   195.2  54.89   3
  NEW_V3_N4     88.9%    10    2.0%     2     0/35        3   203.7  57.28   3
  OLD_V2_N4     88.9%    10    2.0%     2      -          3   198.4  55.80   3
```

**여섯 구성이 사실상 동일합니다.** 이유가 명확합니다.

```
NEW_V3_N2  실패원인: detector_failure=42, fast_motion=3
```

`detector_failure=42` — **모바일 재획득(Lv2)이 42회 시도해서 42회 전부
실패**했습니다. NanoDet이 합성 영상에서 사람을 하나도 못 찾았습니다.

#### 왜 못 찾았는가

합성 테스트의 "선수"는 사각형 + 원입니다. COCO로 학습된 사람 검출기가
그걸 사람으로 볼 이유가 없습니다. **검출 0명이 정상입니다.**

NanoDet 자체는 정상입니다. 실제 농구 사진으로 따로 확인했습니다.

```
OpenCV samples/data/basketball1.png (사람 2명)
  → conf=0.826  x=27  y=88   w=137  h=385
  → conf=0.667  x=449 y=24   w=191  h=371
```

**문제는 코드가 아니라 테스트 데이터입니다.**

#### 무엇이 검증됐고 무엇이 안 됐는가

| 구성요소 | 합성으로 검증 가능? | 결과 |
| --- | --- | --- |
| NanoTrack | 가능 | 131 fps, 오차 1픽셀 이내 |
| Tracking Health 7신호 | 가능 | 동작 |
| 20프레임 창 + N-Level | 가능 | 동작 |
| Occlusion + 속도 예측 | 가능 | 동작 |
| Orientation 리프레임 | 가능 | 가로→가로, 세로→세로 확인 |
| Camera Motion Compensation | 가능 | 4.4 ms/frame, Pan 케이스 서버 0회 |
| 서버 Cutie Recovery | 가능 | 3회 호출, 정상 복구 |
| **NanoDet 재획득 (Lv2)** | **불가능** | **미검증** |
| **Candidate Ranking** | **불가능** | **미검증** (후보 0개) |
| **Jersey Color** | **불가능** | **미검증** |
| **ID Switch Hysteresis** | **불가능** | **미검증** |

**V3에서 추가한 것의 절반이 실제 사람 영상 없이는 측정할 수 없습니다.**

#### 가장 심각한 케이스 — H_similar

비슷한 유니폼 여러 명(210프레임, 전부 보임):

```
  Coverage 87.6%   ID Switch 10회   Lost 26프레임   서버 호출 0회
```

Coverage는 나쁘지 않아 보입니다. 그런데 **26프레임 동안 다른 사람을
추적하면서 서버를 한 번도 부르지 않았습니다.** 잘못 추적하고 있다는 걸
감지조차 못 했습니다.

Coverage 수치보다 이게 급한 문제입니다.

#### N-Level 효과를 측정하지 못한 이유

`E_occ_long`에서 N을 올려도 서버 호출이 2회로 동일했습니다. Critical
사유(`target_lost`)로 발동해서 **N-Level을 우회**했기 때문입니다.

명세대로 동작한 것입니다. 다만 그 결과 **N-Level의 원가 절감 효과를
이 세트에서는 측정할 수 없었습니다.** Critical이 덜 걸리는 영상에서
다시 재야 합니다.

### 5.3 실제 영상 결과

`KakaoTalk_20260901_161845635.mp4` — 720×334 landscape, 23.72fps,
168프레임, 7.08초. 체육관, 사람 5~6명, 카메라 고정.

농구 구간만(0~6.2초, 149프레임):

```
  대상   coverage  IDsw  허공  reid(평균/최저)  health  서버   비용
  P0      77.2%     0     34   0.800 / 0.734   0.904   0회    0원
  P1      62.4%     1     34   0.628 / 0.547   0.844   1회  6.97원
  P2      64.4%     0     53   0.551 / 0.467   0.823   1회  7.12원
  P3      75.2%     0     37   0.782 / 0.719   0.886   0회    0원
  P4      81.9%     0     27   0.839 / 0.814   0.906   0회    0원

  평균 72.2%   최저 62.4%   최고 81.9%
  ID Switch 1회   서버 2회   GPU 50.1초   14.09원
  실패 원인: fast_motion=12, similar_appearance=8
```

**실용 가능한 수준이지만 완성은 아닙니다.** 잘 되는 대상과 안 되는 대상의
차이가 20%p입니다.

#### 숫자로 안 잡히는 것 — 디버그 영상을 봐야 합니다

| 프레임 | 상태 |
| --- | --- |
| f20 (0.8s) | 박스 5개가 각자 다른 사람에 정확히 붙음 |
| f60 (2.5s) | 사람들이 모였는데도 각자 유지 |
| f100 (4.2s) | **P0과 P1이 같은 사람으로 수렴** |
| f140 (5.8s) | 사람 4명이 보이는데 박스가 3곳에 몰림 |

Coverage는 f100의 수렴을 못 잡습니다. 둘 다 "사람 위에 있다"로 세기
때문입니다.

> 단 이 문제는 **검증 방식의 산물**입니다. 실제 제품은 사용자가 한 명만
> 고르므로 추적기 여러 개가 같은 사람으로 수렴하는 상황이 없습니다.
> 5명 동시 추적은 제가 만든 최악 조건입니다.

### 5.4 모바일 성능 실측

이 개발 PC의 CPU 기준입니다.

| 항목 | 빈도 | 실측 |
| --- | --- | --- |
| NanoTrack | 매 프레임 | **131 fps**, 7.6 ms/frame |
| OSNet (ONNX, onnxruntime) | 20/5프레임 | 96 ms/call |
| NanoDet | 필요할 때만 | 40 ms/call |
| 카메라 보정 | 매 프레임 | 4.4 ms/frame |
| peak working memory | | **161 MB** |

**온도와 배터리는 측정하지 않았습니다.** 실제 안드로이드 단말에서만
가능합니다.

### 5.5 GPU 원가

```python
GPU_COST_PER_HOUR_KRW = 1012.45   # RTX 4090 기준
def gpu_cost_krw(gpu_seconds):
    return gpu_seconds / 3600.0 * GPU_COST_PER_HOUR_KRW
```

서버 복구 1회당 실측(MX250):

| 항목 | 값 |
| --- | --- |
| 클립 길이 | ±4초 = 8초 |
| 클립 프레임 | 8초 × 20fps = 160프레임 |
| GPU 시간 | 약 35~60초/회 |
| 비용 | 약 **10~17원/회** |

합성 7케이스(1.5분 분량) 서버 3회 → 약 50~57원. 실제 영상 7초 서버 2회
→ 14.09원.

**클립 길이가 원가를 직접 결정합니다.** MX250 수치는 규모 감만 줍니다 —
RTX 4090에서 다시 재야 합니다.

---

## 6. 개발 중 규명한 오류 6건

기획서에 오류를 적는 이유는, 이것들이 다음 사람이 다시 밟을 함정이기
때문입니다.

### 6.1 `torchreid.build_model(pretrained=True)`는 Re-ID 가중치가 아닙니다

`osnet.py:476`을 읽어 확인했습니다. ImageNet 분류 가중치를 로드합니다.
**에러 없이** 사람 재식별 성능이 나오지 않는 임베딩을 만듭니다.

→ 항상 `model_path`로 MSMT17 체크포인트를 명시합니다. 저자의 HuggingFace
미러에서 받습니다.

침묵하는 오류라 가장 위험한 종류입니다.

### 6.2 Cutie의 `get_default_model()`은 쓸 수 없습니다

두 가지 이유입니다.

- `hydra.initialize()`는 프로세스 전역 1회성입니다. 서버에서 두 번째
  요청이 실패합니다.
- `.cuda()`가 하드코딩돼 있어 device를 고를 수 없습니다.

→ `initialize_config_dir` + device 인자로 재구현했습니다.

### 6.3 신원 증거가 가중 합산에 묻혔습니다

Re-ID가 0.52로 떨어졌는데 bad frame이 되지 않았습니다. 나머지 신호가
만점이라 합산이 유지된 것입니다.

```
0.333 × 0.475 + 0.667 × 1.0 ≈ 0.83   > BAD_FRAME_HEALTH 0.55
```

NanoTrack의 confidence는 "template과 비슷한 걸 찾았다"는 뜻이고 "맞는
사람이다"가 아닙니다. **가림 중에 앞사람을 붙잡고도 0.9를 줍니다.**

→ threshold를 낮추지 않고 `reid_veto`를 넣었습니다(§3.2).

### 6.4 감지가 9프레임 늦었습니다

실제 영상 마지막 ~18프레임이 다른 화면(휴대폰 제어센터)으로 바뀝니다.
사람이 아예 없는데 감지하지 못했습니다.

```
f139  reid 0.608 측정
f140~158  reid 0.608 유지          ← 19프레임 동안 옛 값
f150  tracker 0.917 → 0.757 급락   ← 가장 빠른 신호였는데 안 씀
f159  reid 0.373 측정 → bad frame  ← 여기서야 감지
      lost_ratio 0.45 < 0.50       ← 영상이 끝나 recovery 발동 못 함
```

원인 두 개가 겹쳤습니다.

**① Adaptive Re-ID가 경계값에서 무력했습니다.** `_last_reid = 0.608`,
threshold `0.60`. 간신히 통과해서 위험으로 판정되지 않았고 20프레임을
더 기다렸습니다. → `REID_RISKY_MARGIN = 0.10`

**② tracker 급락을 절대값으로만 봤습니다.** → `confidence_trend.py`
(§3.2.1)

수정 효과:

```
              수정 전   수정 후
  서버 호출     0회      5회      ← 실패를 감지하기 시작
  모바일 재획득  0회      1~17회   ← Lv2가 실제로 발동
```

### 6.5 NanoDet 후처리가 틀렸습니다

공식 데모를 그대로 옮겼더니 `conf=1.015`(확률이 1 초과)와 `x=0`에 몰린
박스가 나왔습니다. 실제 출력을 찍어보니 가정 두 개가 달랐습니다.

| 공식 데모의 가정 | 실제 |
| --- | --- |
| `(cls, bbox, cls, bbox, …)` 인터리브 | `(cls,cls,cls, bbox,bbox,bbox)` 블록 |
| stride 4레벨 (8/16/32/64) | **3레벨 (8/16/32)** |

→ `getUnconnectedOutLayersNames()`의 순서를 믿지 않고 **출력 shape으로
판별**합니다(`_pair_outputs()`).

### 6.6 첫 프레임 후보에 중복이 있었습니다

6명이 검출됐는데 실제로는 5명이었습니다. NanoDet이 나란히 선 두 사람을
서로 다르게 분할해 중복으로 내놓았습니다.

```
P1  x=233 w=59 h=85
P3  x=245 w=42 h=63   ← P1 안에 완전히 포함

교집합 2646 / 합집합 5015      = 0.528   ← IoU. 임계 0.55를 간신히 통과
교집합 2646 / min(5015, 2646)  = 1.00    ← 포함률
```

크기 차이 때문에 IoU가 낮게 나온 것입니다.

→ IoU와 **포함률**을 둘 다 봅니다(`CANDIDATE_CONTAIN_RATIO = 0.80`).
결과 6명 → 5명.

사용자에게 같은 사람을 두 번 제시하면 체험이 어긋납니다.

### 6.7 (참고) 틀렸다고 판단했다가 아니었던 것 — rotation 메타데이터

```
ffprobe:  334 x 720  rotation=90
OpenCV:   720 x 334  ORIENTATION_META=270, AUTO=1.0
```

처음엔 "OpenCV가 회전을 무시한다"고 봤습니다. **확인 결과 OpenCV가
올바르게 적용하고 있었습니다.** ffprobe의 334×720은 회전 전 저장
크기입니다.

스마트폰 영상은 거의 다 rotation 메타데이터를 갖고 있어서 확인할
가치가 있었습니다.

---

## 7. 미검증 항목과 알려진 한계

### 7.1 Re-ID threshold 0.60은 정답이 아닙니다

같은 영상 안에서 대상마다 0.55~0.84로 갈립니다.

```
  P4  0.839 / 0.814     ← 오른쪽에 혼자 있는 사람
  P0  0.800 / 0.734
  P3  0.782 / 0.719
  P1  0.628 / 0.547     ← 붐비는 가운데
  P2  0.551 / 0.467     ← 가장 낮음
```

threshold 0.60을 그대로 두면 P1·P2는 상시 "의심" 상태가 되어 서버를 자주
부릅니다.

**값을 바꾸지 않았습니다.** 영상 한 개로 정하면 그 영상에만 맞는 값이
됩니다. 영상 10~20개가 쌓인 뒤 정해야 합니다.

이 값은 UI 슬라이더로 노출돼 있고, 화면에 "실험적 초기값이며 정답이
아니다"라고 명시합니다.

### 7.2 사람이 작으면 Re-ID가 무력합니다

검증 영상에서 사람 높이가 69~85px — 프레임 높이의 21~25%입니다.
OSNet 입력이 256×128이므로 **3배 이상 업스케일**됩니다. 임베딩 품질이
그만큼 떨어집니다.

`REACQUIRE_MIN_REID`를 낮추면 재획득이 발동은 하겠지만 엉뚱한 사람을
집을 위험이 커집니다. **임베딩 품질을 올리는 쪽이 맞습니다** — crop
업스케일 방식 개선, 또는 더 큰 입력을 쓰는 OSNet 변형 검토.

### 7.3 모바일 재획득(Lv2)이 한 번도 성공하지 못했습니다

| 환경 | 결과 | 이유 |
| --- | --- | --- |
| 합성 영상 | 0/42 | NanoDet이 도형을 사람으로 인식하지 못함 |
| 실제 영상 | 0/17 | 검출은 되는데 Re-ID로 우리 대상을 못 골라냄 |

**이유가 서로 다릅니다.** 합성 쪽은 테스트 데이터 문제이고, 실제 쪽은
§7.2의 임베딩 품질 문제입니다.

### 7.4 채점기 자체의 한계

정답 궤적이 없어 NanoDet 검출을 참조로 씁니다. 그런데 참조 검출이
**평균 3.6명만 잡습니다**(실제 5명). 사람이 작고 겹쳐서 놓칩니다.

추적이 정확해도 그 프레임에 참조 검출이 없으면 "허공"으로 셉니다.
**허공 27~53프레임 중 상당 부분은 채점기의 실패입니다.**

정확한 측정에는 사람이 프레임 단위로 라벨링한 정답이 필요합니다.

### 7.5 Tracking Health는 확률이 아닙니다

7개 신호의 가중 합산입니다. **"이 사람일 확률 90%"가 아닙니다.**
0.904는 "감시 신호들이 대체로 정상 범위"라는 뜻이고, 통계적 신뢰도가
아닙니다.

화면과 문서 어디에도 확률로 표기하지 않았습니다. 이 구분이 흐려지면
정확도 논의 전체가 왜곡됩니다.

### 7.6 N-Level 원가 절감 효과 — 미측정

§5.2에서 설명한 Critical 우회 때문입니다.

### 7.7 측정하지 않은 것

- 안드로이드 단말 온도·배터리
- RTX 4090 실제 GPU 원가
- 클립 길이 ±3/±4/±6/±10초 비교
- 1명 추적 시나리오 (= 실제 제품 조건)

---

## 8. 운영

### 8.1 배포 파이프라인

```
git push → GitHub Actions
             ├─ ci.yml            문법 검사 + 로직 테스트   (~18초)
             └─ deploy-vercel.yml 정적 화면 배포            (~34초)
```

Vercel은 화면(HTML/JS/CSS)만 배포합니다. `vercel.json`에
`"framework": null`을 넣었습니다 — `requirements.txt`를 보고 FastAPI로
자동 감지해서 "No FastAPI entrypoint found"로 실패했기 때문입니다.
`.vercelignore`로는 해결되지 않습니다. **감지가 업로드보다 먼저**
일어납니다.

### 8.2 자동 시작

Windows Task Scheduler에 사용자 수준 작업을 등록합니다.

```
자동시작-켜기.bat  → scripts/autostart.ps1 install
                      LogonType Interactive, RunLevel Limited
                      로그온 후 PT20S 지연, Hidden
```

관리자 권한을 요구하지 않습니다.

백그라운드 실행에서 문제가 하나 있었습니다. uvicorn이 3~4초 만에 로그
없이 죽었습니다. `*>>`와 파이프 둘 다 외부 프로그램에는 듣지 않았습니다.

→ `Start-Process` + `-RedirectStandardOutput/-RedirectStandardError`로
바꾸고, `/api/health`를 폴링해 응답을 확인한 뒤에 "준비 완료"를
선언하도록 했습니다. 프로세스가 떴다는 사실만으로 성공을 보고하면
안 됩니다.

`.bat` 파일은 전부 ASCII만 씁니다. cmd.exe가 OEM cp949로 읽어서 한글이
들어가면 `'Expansion'`, `'?'` 같은 파서 오류를 냅니다. 한글은 UTF-8
BOM으로 저장한 `.ps1`에 둡니다.

### 8.3 브라우저 정책 제약 — 남에게 그대로 쓰게 할 수 없습니다

**Vercel 화면에서 사용자의 로컬 분석 서버로 붙는 것은 불가능합니다.**

```
blocked by CORS policy: Permission was denied for this request
to access the `loopback` address space.
```

Chrome/Edge의 Local Network Access 정책이 공용 HTTPS 사이트 → loopback
요청을 막습니다. `starlette/middleware/cors.py:24`에서
`allow_private_network` 기본값이 `False`인 것을 찾아 `True`로 켰고,
curl로 preflight가 `200 OK` + `access-control-allow-private-network: true`를
돌려주는 것까지 확인했습니다.

**그래도 브라우저가 통과시키지 않습니다.** 헤더 외에 사용자의 권한 승인이
필요하고, 그건 신뢰할 수 있는 경로가 아닙니다.

그래서 접근을 바꿨습니다. 로컬 서버가 이미 화면을 직접 서빙하므로
`http://localhost:8000`을 열면 same-origin입니다. CORS도 PNA도 없습니다.

| 주소 | 용도 | 확인 |
| --- | --- | --- |
| `http://localhost:8000` | **실사용** | 배너 없음, GPU 인식 정상 |
| `https://hilit-tracking-poc.vercel.app` | 화면 공유·데모 | localhost로 가라는 버튼 |

**남이 실제로 분석까지 쓰게 하려면** 분석 서버에 공개 HTTPS 주소가
필요합니다(터널 또는 GPU 인스턴스). 이건 원가가 붙는 인프라 결정이라
PoC 범위 밖으로 두고 `DEPLOY.md`에 방법만 적었습니다.

### 8.4 보안 상태 — 그대로 공개하면 안 됩니다

- **인증이 없습니다.** 누구나 영상을 올리고 GPU를 쓸 수 있습니다
- 동시 사용자 처리가 없습니다
- 업로드 용량·길이 상한이 느슨합니다

`README.md`와 `DEPLOY.md`에 공개 인터넷에 노출하지 말라고 적었습니다.
`.env`와 `.vercel/`은 gitignore돼 있고 추적되지 않는 것을 확인했습니다.

---

## 9. 라이선스

`THIRD_PARTY_LICENSES.md`(251줄)에 전량 정리했습니다.

| 대상 | 라이선스 |
| --- | --- |
| Cutie | MIT |
| deep-person-reid (OSNet) | MIT |
| NanoTrack v2 (SiamTrackers) | Apache-2.0 |
| NanoDet (opencv_zoo) | Apache-2.0 |
| PyTorch / torchvision | BSD-3-Clause |
| OpenCV | Apache-2.0 |
| FastAPI / Starlette | MIT |

**GPL·AGPL·Non-Commercial 의존성은 없습니다.**

Cutie와 deep-person-reid는 `pip install` 하지 않고 **소스만 씁니다.**
이유가 있습니다.

- Cutie는 GUI(RITM) 의존성을 끌고 옵니다. 추론에 불필요합니다
- deep-person-reid는 Cython 빌드를 요구합니다

쓰는 파일을 경로 단위로 명시했습니다.

```
Cutie              cutie/model/cutie.py, cutie/inference/inference_core.py
                   cutie/config/eval_config.yaml, config/model/base.yaml
deep-person-reid   torchreid/utils/feature_extractor.py
                   torchreid/models/osnet.py, osnet_ain.py
```

ONNX 가중치는 sha1을 기록했습니다.

```
nanotrack_backbone_sim.onnx  6e773a364457b78574f9f63a23b0659ee8646f8f
nanotrack_head_sim.onnx      39f168489671700cf739e402dfc67d41ce648aef
```

**GUI/RITM 코드와 가중치는 포함하지 않습니다.**

---

## 10. 다음 단계 — 우선순위

우선순위 근거는 "이걸 안 하면 다음 측정이 무의미해지는가"입니다.

### 1순위 — 데이터

**① 실제 농구 영상 10~20개.** threshold를 영상 한 개로 정하면
과적합입니다. §7.1이 그 구체적 사례입니다.

**② 프레임 단위 정답 라벨 최소 1~2개.** 지금 채점기는 참조 검출이
평균 3.6/5명만 잡습니다(§7.4). 라벨 없이는 측정 오차와 실제 실패를
구분할 수 없습니다.

### 2순위 — 감지 실패

**③ H_similar 유형.** ID Switch 10회 동안 아무 신호도 울리지
않았습니다(§5.2). Coverage보다 급합니다.

**④ 작은 대상 대응.** 프레임 높이의 21~25%에서 OSNet 임베딩이 구분력을
잃습니다(§7.2). crop 전처리 개선 또는 입력 해상도 검토.

### 3순위 — 원가

**⑤ N-Level 효과 재측정.** Critical이 덜 걸리는 영상에서.

**⑥ RTX 4090 GPU 원가 재측정.** MX250 수치는 규모 감만 줍니다.

**⑦ 클립 길이 ±3/±4/±6/±10초 비교.** 원가가 여기에 정비례합니다.

### 4순위 — 조건 정합

**⑧ 1명 추적 시나리오로 재측정.** 실제 제품 조건입니다. 5명 동시는
제가 만든 최악 조건이고, 추적기 간 수렴 문제는 제품에 없습니다.

**⑨ 안드로이드 실측.** 온도와 배터리는 실기에서만 가능합니다.

### 서비스로 가려면 별도 결정이 필요한 것

- 인증·과금 (§8.4)
- 공개 HTTPS 분석 서버 (§8.3) — 원가가 붙는 인프라 결정
- 동시 사용자 큐

---

## 부록 A. 파라미터 전량

전부 환경변수로 덮어쓸 수 있습니다. 출처는 `shared/config.py`(464줄)입니다.

### Re-ID

```
REID_THRESHOLD              0.60    실험용 초기값. UI 슬라이더로 노출
CRITICAL_ID_THRESHOLD       0.35    N-Level 우회 기준
REID_INTERVAL_NORMAL        20      정상 시 확인 간격(프레임)
REID_INTERVAL_WARNING        5      위험 시
ADAPTIVE_REID             True
REID_RISKY_MARGIN           0.10    경계값 대응 (§6.4)
REID_MIN_GAP_ON_DROP         3      급락 후 재측정 최소 간격
OSNET_INPUT_SIZE      (256,128)
REID_CROP_PADDING           0.08
REID_MIN_CROP_PIXELS        24
```

### Tracking Health

```
HEALTH_W_REID               0.40  ┐
HEALTH_W_TRACKER            0.25  │
HEALTH_W_MOTION             0.15  │ 합 1.20 → 정규화해서 사용
HEALTH_W_BOX                0.10  │
HEALTH_W_VISIBILITY         0.10  │
HEALTH_W_OCCLUSION          0.12  │ V3
HEALTH_W_AMBIGUITY          0.08  ┘ V3

BAD_FRAME_HEALTH            0.55    bad frame 기준
PREDICTED_HEALTH_CAP        0.62    예측 박스 Health 상한
TRACKER_DROP_RATIO          0.12    기준선 대비 하락률 (§3.2.1)
TRACKER_TREND_WARMUP           8
TRACKER_BASELINE_ALPHA_UP   0.15
TRACKER_BASELINE_ALPHA_DOWN 0.01    비대칭이 핵심
```

### 신호별 이상 판정

```
BOX_CHANGE_LOW              0.5     직전 대비 면적 배수 하한
BOX_CHANGE_HIGH             2.0     상한
CENTROID_JUMP_RATIO         0.12    프레임 대각선 대비
MIN_BOX_AREA_RATIO        0.0005    이보다 작으면 소실
```

### 상태 머신 / N-Level

```
TRACKING_WINDOW               20
WARNING_LOST_RATIO          0.30
N_LEVEL                        2
N2_LOST_THRESHOLD           0.50    20프레임 중 10
N3_LOST_THRESHOLD          0.667    20프레임 중 14
N4_LOST_THRESHOLD           0.75    20프레임 중 15
RECOVERY_COOLDOWN_SECONDS    5.0
MAX_RECOVERIES_PER_VIDEO      40    비용 폭주 안전판
```

### Occlusion / 예측

```
OCCLUSION_MAX_FRAMES          30    넘으면 LOST
OCCLUSION_ENTER_CONFIDENCE  0.35
VELOCITY_WINDOW                5    이동 평균 창
PREDICTION_DECAY            0.92    프레임당 감쇠
```

### 검출 / 후보

```
DETECTOR_PROB_THRESHOLD     0.35
DETECTOR_IOU_THRESHOLD       0.6
DETECTOR_MAX_CANDIDATES       12
DETECTOR_MIN_GAP_FRAMES        5
CANDIDATE_MERGE_IOU         0.55
CANDIDATE_CONTAIN_RATIO     0.80    IoU가 놓치는 포함 관계 (§6.6)
CANDIDATE_AMBIGUOUS_MARGIN  0.06    이하면 Lv4로
REACQUIRE_ACCEPT_SCORE      0.62
REACQUIRE_MIN_REID          0.45
USE_JERSEY_COLOR            True
SWITCH_CONFIRM_FRAMES          3    Hysteresis
REID_SWITCH_MARGIN          0.12
```

### 앵커 (Identity Poisoning 방지)

```
AUTO_ANCHOR_UPDATE                False   ← 기본 꺼짐
AUTO_ANCHOR_MIN_TRACKER_CONF       0.90
AUTO_ANCHOR_MIN_REID               0.85
AUTO_ANCHOR_STABLE_FRAMES            40
AUTO_ANCHOR_MAX_NEIGHBOR_IOU       0.05   ← 근처에 사람 없어야
AUTO_ANCHOR_MAX_COUNT                 5
```

### 카메라 / 복구 클립 / 영상

```
CAMERA_MOTION_COMPENSATION  True
CAMERA_FLOW_MAX_POINTS       120
CAMERA_FLOW_DOWNSCALE       0.35

FAST_SPORT_MODE             True
RECOVERY_PRE_SECONDS_FAST    4.0    ← 원가를 직접 결정
RECOVERY_POST_SECONDS_FAST   4.0
RECOVERY_PRE_SECONDS        10.0    일반 모드
RECOVERY_POST_SECONDS       10.0

PROXY_RESOLUTION             720    짧은 변
PROXY_FPS                   20.0    분석용. 출력은 원본 fps
PROXY_CRF                     24

PRESERVE_ORIENTATION        True
EXPORT_ASPECT           "source"
GPU_COST_PER_HOUR_KRW    1012.45
```

---

## 부록 B. 재현 명령

### 설치

```bash
bash scripts/setup_third_party.sh          # Cutie, deep-person-reid 소스
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt
python scripts/download_models.py          # 가중치 약 510MB
python scripts/check_env.py                # 실제 추론 1회까지 확인
```

### 실행

```bash
start.bat                    # 서버 + 브라우저
자동시작-켜기.bat            # 부팅 시 자동 (관리자 권한 불필요)
상태확인.bat
```

### 테스트

```bash
python tests/test_logic.py     # 모델 없이 판정 로직만
python tests/test_e2e.py       # 합성 영상 업로드→추적→수정→결과
python tests/test_proxy.py     # 프록시 + 원본 좌표 역매핑 + fps 분리

node tests/browser_test.js      # 파일 입력까지 (서버 켠 상태)
node tests/browser_full_flow.js # 업로드→추적→결과→수정 전 구간
```

GPU 없이 확인만 하려면 앞에 `HILIT_ALLOW_CPU=1`을 붙입니다.

### 측정

```bash
python benchmarks/make_basketball_cases.py            # 합성 7종 + 정답 궤적
python benchmarks/compare_architectures.py --n-levels 2,3,4
python benchmarks/verify_real_video.py <video> --config new
```

### 원자료

```
outputs/benchmarks/comparison_nlevels.json    N=2/3/4 × OLD/NEW 42회
outputs/basketball_cases/*.truth.json         프레임 단위 정답 궤적
outputs/real_basketball/debug_new.mp4          실제 영상 디버그 영상
```

---

## 부록 C. 산출물 규모

### 코드

| 구분 | 파일 | 줄 |
| --- | --- | --- |
| Python | 66 | 12,357 |
| 프런트 (`index.html`, `app.js`, `styles.css`) | 3 | 1,784 |
| 스크립트 (`.ps1`, `.bat`) | 7 | 575 |
| 문서 (`.md`) | 6 | 1,730 |
| **합계** | **82** | **16,446** |

### 큰 파일

```
839  mobile/session.py            전체 오케스트레이션
596  backend/pipeline.py
569  backend/app.py               23개 라우트
525  shared/schemas.py
464  shared/config.py             모든 튜너블 + 그렇게 정한 이유
424  benchmarks/verify_real_video.py
411  benchmarks/make_basketball_cases.py
390  benchmarks/compare_architectures.py
376  backend/storage.py
349  backend/video/decoder.py
337  mobile/detector/nanodet_person.py
332  mobile/video/reframe.py
307  mobile/confidence/tracking_health.py
```

### 문서

| 파일 | 줄 | 내용 |
| --- | --- | --- |
| `README.md` | 824 | 비전공자 기준 설명 |
| `THIRD_PARTY_LICENSES.md` | 251 | 라이선스 + 쓰는 파일 경로 |
| `BENCHMARK_RESULTS.md` | 218 | 합성 42회 결과 |
| `REAL_VIDEO_FINDINGS.md` | 198 | 실제 영상 검증 |
| `DEPLOY.md` | 179 | 배포 + 공개 HTTPS 방법 |
| `VERCEL_NOTES.md` | 60 | `framework: null` 이유 |

### 커밋 이력

```
3d481d1  Initial commit
b3bbb3e  feat: Hilit Tracking PoC — Cutie + OSNet 사용자 추적 검증 도구
d4a0445  feat(설정): Supabase 프로젝트 바로가기 링크 추가
3a48ccd  fix(supabase): publishable 키를 넣는 실수를 미리 잡는다
be85aca  feat(scripts): Supabase 스키마 자동 적용 스크립트
270bfea  feat: Mobile-First Hybrid Architecture 로 전환 (V2+V3)
ed94b4d  fix(vercel): 프레임워크 자동감지를 끄고 정적 배포로 고정
38966a5  ci: 푸시마다 자동 검사 + Vercel 배포
998fb2c  docs: 벤치마크 결과 - V3 개선의 절반이 미검증임을 정량 확인
582b696  fix: 실제 농구 영상 검증 - 감지 지연 9프레임과 후보 중복을 잡았다
7f31c38  feat: 자동 시작 + 로컬 서버 자동 탐색 - 아무것도 안 눌러도 되게
eecb1ce  fix: Vercel 화면에서 localhost 서버로 가는 경로를 명확히 안내
```

---

## 맺음 — 이 PoC가 답한 것과 답하지 못한 것

**답한 것.**

가벼운 모델로 대부분을 처리하고 어려운 순간에만 GPU를 부르는 구조가
**동작합니다.** 실제 농구 영상에서 평균 Coverage 72.2%, 7초에 서버
2회, 14.09원입니다. Camera Motion Compensation과 Orientation 정책은
의도대로 듣습니다.

**답하지 못한 것.**

N-Level의 원가 절감 효과를 재지 못했습니다. Critical 우회가 N을
건너뛰었기 때문입니다. 모바일 재획득은 한 번도 성공하지 못했고,
V3에서 추가한 기능의 절반이 미검증입니다.

**가장 중요한 발견은 측정 방법에 관한 것입니다.**

Siamese 추적기는 항상 답을 내놓습니다. 그래서 자기보고 성공률은 언제나
100%였습니다. 정답 궤적 기준으로 다시 재기 전까지, 우리가 보던 숫자는
전부 의미가 없었습니다. 그 다음에 나온 53.9%가 100%보다 훨씬 쓸모
있는 숫자입니다.

같은 함정이 다른 곳에도 있습니다. Coverage 87.6%인데 ID Switch가
10회이고 서버 호출이 0회인 케이스가 그렇습니다. 지표가 좋아 보이는데
시스템이 잘못하고 있다는 것을 모르는 상태입니다.

**다음 단계는 모델 개선이 아니라 데이터입니다.** 실제 영상 10~20개와
프레임 단위 정답 라벨이 없으면, 지금 미검증인 절반은 계속 미검증으로
남습니다. 파라미터를 지금 손대면 영상 한 개에 과적합됩니다.
