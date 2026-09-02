---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Mock] CT-007: Mock 픽스처 — 추론 결과 · 후보 목록"
labels: 'mock, contract, priority:critical, step-1'
assignees: ''
---

> ### 🔄 SRS v3.0 반영 — 이 태스크에서 바뀐 것 *(2026-09-01)*
> **픽스처 3종 추가** — ① 컷 결과(`VideoSegment[]`, 프롬프트별 개수 상이 · 0건 케이스 포함) ② 클립별 추적 결과(`bboxTimeline` + `healthTimeline`, 정상/불확실 혼재) ③ Cutie 복구 결과(`cropPath` 포함). **20분 원본 기준으로 재생성**한다.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0** · `PRD/HILiT_PRD_v0_2.md`

> ### 🔴 SRS v3.2 반영 — 픽스처 1종 추가 *(2026-09-02)*
> PRD v0.3 **F29**의 미니바·복귀를 **추적 없이 개발**하려면 진행 상태 픽스처가 필요하다. 🔴 **미니바는 앱 전역에 있으므로, 이것이 없으면 모든 화면 작업이 "진행 중 상태"를 못 본다.**
>
> **④ 활성 작업(`ActiveJob`) 픽스처** — 아래 상태를 전부 포함한다.
>
> | 케이스 | 값 |
> | --- | --- |
> | 컷 진행 중 | `stage=CUTTING` · `1/2` |
> | 추적 진행 중 | `stage=TRACKING` · `4/6` · `resumeRoute` 있음 |
> | 복구 왕복 중 | `stage=RECOVERING` — 🔴 **미니바는 "추적 중"으로 묶어 그린다**(ST-5) |
> | 렌더 중 | `stage=RENDERING` — 🔴 **피드 진입점이 없어야 하는 케이스**(R4) |
> | 완료 | `stage=SELECTING` · `status=SUCCEEDED` |
> | 실패 | `status=FAILED` · `failureClass=CAPTURE` / `INFRA` 각각 |
> | 🔴 **활성 없음** | **`null`** — 미니바가 완전히 사라지는 케이스. **빈 껍데기가 남는 버그는 이 픽스처로만 잡힌다** |
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.2 §4.1 · §5.1** · `PRD/HILiT_PRD_v0_2.md` **v0.3** F29 · **ST-5**

> 🔀 **CT-008(후보 목록 Mock)을 흡수했다** *(축약 2026-08-30)* — 같은 픽스처 묶음이고 목적이 동일하다(FE 병렬화). `CT-008` 은 폐번이며 이 문서를 가리킨다.

## 🎯 Summary
- 기능명: **[CT-007] 추론 API 없이 개발을 진행시키는 가짜 데이터**
- 목적: **프론트엔드와 후속 로직이 SP-1 완료를 기다리지 않게 한다.**

> 🔴 **이 태스크가 없으면 사슬 전체가 멈춘다.**
>
> ```
> Mock 없음 → 프론트가 SP-1 완료를 기다림
>          → SP-1은 정답셋 10~15편 구축이 선행
>          → 정답셋은 실제 농구 영상 수급이 선행
> ```
>
> **형태만 정하면 사슬이 끊어진다.** 이 제품의 핵심 데이터가 외부에서 오고, **그 외부가 아직 무엇인지도 모르기 때문에** Mock의 가치가 특히 크다.

> **계층이 둘이다.** 🔴 **추론 API 경계**(M 픽스처)와 **조회 API 경계**(C 픽스처)는 다르다 — 프론트엔드는 추론 결과를 직접 보지 않고 **후보 목록만** 본다. 두 계층을 한 태스크로 만들되 **픽스처는 분리해 유지**한다.

## 🔗 References (Spec & Context)
> 💡 AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- **결과 타입**: `tasks/CT-006_APISpec_TrackingProvider.md` — 🔴 **`TrackingResult` 가 계약이다**
- **응답 규격**: `DS/[DS]hilit-DSv1.1.md` §3.2 A-08 — 🔴 **`excludedCount` 포함** · `tasks/CT-004_APISpec_API계약.md`
- **신뢰도 구분**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` §7.3 — 재식별 신뢰도 ≠ 구간 점수
- **제외 로직**: `SRS/[SRS]hilit-SRSv1.8.md` REQ-FUNC-027 · SC-1.F5·F6
- **탐지 0건**: `SRS/[SRS]hilit-SRSv1.8.md` SC-1.F2
- **후보 개수**: `SRS/[SRS]hilit-SRSv1.8.md` REQ-FUNC-004 · 가정 A3 · Q7
- 촬영 조건 다양성: `실행 계획/03_스파이크_실행계획.md` §1.4

## ✅ Task Breakdown (실행 계획)

### A. 추론 결과 Mock (M 픽스처)
- [ ] `TrackingProvider` 를 구현하는 **`MockTrackingProvider`** 작성
- [ ] 🔴 **저신뢰 혼재 픽스처** — REQ-FUNC-027 제외 로직을 개발 단계에서 검증
- [ ] 🔴 **`reidConfidence: null` 픽스처** — **B3 실패 케이스**
- [ ] 지연 시뮬레이션 — `submit()` 후 N초 뒤 webhook 발사
- [ ] 실패 시뮬레이션 — 타임아웃 · 오류 응답
- [ ] 환경 변수 `INFERENCE_PROVIDER=mock` 으로 활성화

### B. 후보 목록 Mock (C 픽스처)
- [ ] `getCandidates()` 의 **Mock 구현** — CT-004의 타입 준수
- [ ] 🔴 **`excludedCount` 포함** — SC-1.F6(제외로 후보 부족 안내)의 입력
- [ ] 개수 변형 픽스처 — **15 / 30 / 50** *(가정 A3 · Q7의 A/B/n 실측 대비)*
- [ ] 썸네일 플레이스홀더 이미지
- [ ] MSW 또는 동등 수단으로 **네트워크 계층에서 가로채기**

### 픽스처 목록

| # | 픽스처 | 검증 대상 |
| :--: | --- | --- |
| **M1** | 정상 — 구간 12개 · 신뢰도 전부 정상 | 기본 흐름 |
| **M2** | 저신뢰 혼재 — 12개 중 4개가 임계 미만 | **REQ-FUNC-027 제외 · 제외율 계측** |
| **M3** | 🔴 `reidConfidence: null` | **B3 실패 시 경로** — 제외 로직 불성립 처리 |
| **M4** | 등장 구간 0건 | **SC-1.F2** 재지정 경로 |
| **M5** | 제외 후 구간 1개 | **SC-1.F6** 후보 부족 안내 |
| **M6** | 타임아웃 · 오류 | REQ-NF-008 재시도 |
| **C1** | 후보 30개 정상 | 기본 목록·가상 스크롤 |
| **C2** | 후보 15개 / 50개 | **가정 A3 · Q7** 개수 적정성 |
| **C3** | 🔴 후보 2개 · `excludedCount: 28` | **SC-1.F6** 사유 안내 |
| **C4** | 후보 0개 | **SC-1.F2** 재지정 경로 |
| **C5** | 긴 타임코드 (40분 후반부) | 표시 포맷 |

## 🧪 Acceptance Criteria (BDD/GWT)

> **Mock의 인수 기준은 *"올바른 값을 반환한다"* 가 아니라 *"계약과 형태가 같다"* 다.**

**Scenario 1: 실제 구현과 타입이 동일하다**
- **Given**: `MockTrackingProvider` 와 `TrackingProvider` 인터페이스, Mock 응답과 CT-004의 조회 타입
- **When**: 타입 검사를 수행함
- **Then**: **완전히 일치한다.** 호출부·프론트엔드에 **Mock 전용 분기가 없다**

**Scenario 2: 저신뢰 제외가 개발 단계에서 검증된다** *(M2)*
- **Given**: 픽스처 M2
- **When**: ConfidenceGate를 통과시킴
- **Then**: 임계 미만 4건이 **제외되고 `excluded_reason` 이 기록**되며 **제외 건수가 응답에 포함**된다

**Scenario 3: 신뢰도 미제공이 처리된다** *(M3 · B3)*
- **Given**: `reidConfidence: null` 픽스처
- **When**: 제외 로직을 실행함
- **Then**: 🔴 **제외를 수행하지 않고 그 사실이 명시적으로 드러난다.** 조용히 통과시키지 않는다

**Scenario 4: 탐지 0건이 실패 화면으로 이어진다** *(M4 · C4 · SC-1.F2)*
- **Given**: 픽스처 M4 / C4
- **When**: 후보 화면에 진입함
- **Then**: 빈 화면이 아니라 **원인 후보와 재지정 경로**가 표시된다

**Scenario 5: 제외 건수가 사유 안내로 이어진다** *(C3 · SC-1.F6)*
- **Given**: 픽스처 C3(후보 2 · 제외 28)
- **When**: 후보 화면을 엶
- **Then**: 목록과 함께 **"왜 후보가 적은지"** 가 안내된다. 🔴 **빈 목록만 보여주지 않는다**

**Scenario 6: 저신뢰 후보는 목록에 없다** *(REQ-FUNC-027)*
- **Given**: 어떤 C 픽스처든
- **When**: 응답의 `confidenceFlag` 를 조회함
- **Then**: **`NORMAL` 만 존재한다.** `LOW`·`EXCLUDED` 는 목록에 오르지 않는다

**Scenario 7: 비동기 흐름이 실제와 같다**
- **Given**: Mock이 활성화됨
- **When**: `submit()` 을 호출함
- **Then**: 즉시 `inferenceId` 만 반환하고, **N초 뒤 webhook이 도착**한다. 동기 반환하지 않는다

**Scenario 8: 개수 변형으로 A/B/n 준비가 된다** *(C2 · 가정 A3)*
- **Given**: 픽스처 C2(15 / 30 / 50)
- **When**: 각각을 렌더함
- **Then**: 세 경우 모두 **스크롤·선택 동작이 정상**이다. 실측 시 코드 변경이 필요 없다

**Scenario 9 (실패): 실제 API로 교체 시 코드가 바뀌지 않는다**
- **Given**: `INFERENCE_PROVIDER` 를 실제 값으로 바꾸고 Mock 조회를 끔
- **When**: 애플리케이션을 재기동함
- **Then**: 🔴 **프론트·서버 코드 변경 0건**으로 동작한다

## ⚙️ Technical & Non-Functional Constraints
- **좌표는 정규화 0~1** — 실제 구현과 동일 규약
- **네트워크 계층에서 가로챈다** — 컴포넌트에 Mock 분기를 넣지 않는다
- **프로덕션 번들에 포함되지 않게** — 환경 변수 분기 + 빌드 시 제외
- 🔺 **Mock 값은 실측치가 아니다** — 픽스처의 신뢰도·구간 수는 **형태 검증용**이며 O9 판정에 쓰지 않는다
- **bbox 시계열은 실제 궤적처럼 연속적**이어야 한다 — 리프레이밍(FR-010) 개발에 쓰이므로 무작위 값이면 안 된다
- 썸네일은 **플레이스홀더**로 충분 — 실제 프레임 추출은 FR-012의 몫
- 🔺 **후보 개수 30은 초안값**(가정 A3) — Mock이 그 숫자를 고정 사실로 만들지 않도록 C2를 함께 둔다

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **픽스처 11종이 전부 있는가?** *(특히 M3 `null` · M4 0건 · C3 `excludedCount`)*
- [ ] 🔴 **실제 API 교체 시 프론트·서버 코드 변경 0건인가?**
- [ ] 프로덕션 빌드에 Mock이 포함되지 않는가?
- [ ] 타입이 CT-006 인터페이스와 CT-004 조회 타입을 완전히 구현하는가?
- [ ] 🔺 `DS/[DS]hilit-DSv1.1.md` §3.2 A-08과 응답 형태가 일치하는가?
- [ ] ESLint · TypeScript strict 경고가 없는가?

## 🚧 Dependencies & Blockers
- **Depends on**: **CT-006**(TrackingProvider 인터페이스) · **CT-004**(조회 응답 타입)
- **Blocks**: **FR-012**(후보 산출 · ConfidenceGate) · **FR-045**(복구 어댑터) · **FE-003·004·010** · TS-007
- **참고**: 🟢 **SP-1 결과를 기다리지 않는다.** 오히려 SP-1과 **병렬**로 개발을 진행시키는 것이 이 태스크의 목적이다
