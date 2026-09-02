---
name: Contract Task
about: 다른 태스크가 의존하는 계약을 먼저 확정하는 태스크
title: "[API Spec] CT-009: 브라우저 추적 런타임 계약 — Worker 메시지 · 결과 형태 · 폴백 판정"
labels: 'api-spec, contract, ai, frontend, priority:critical, step-1, wave-1'
assignees: ''
---

> ### 🆕 SRS v3.0에서 신설 *(2026-09-01)*
> v2.2의 단일 `TrackingProvider` 가 둘로 갈리면서 생긴 계약. **브라우저에서 도는 쪽**을 이 문서가 담당한다(복구는 CT-006).
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0 §2.2 ① · §6.5.4**

## 🎯 Summary
- 기능명: **[CT-009] 브라우저 추적 결과의 형태를 서버와 같게 못 박는다**
- 목적: **자동(FR-044)·수동(FR-038)·복구(FR-045) 세 출처의 결과가 하나의 형태로 모이게 한다.**

> 🔴 **세 출처가 같은 형태여야 한다.** 자동 추적 · 수동 트래킹 · 서버 복구가 각각 다른 형태를 내면 **FR-010·FR-012가 출처별로 분기**한다. 계약이 이를 막는다.

> 🔴 **Worker 경계가 계약의 실체다.** 메인 스레드와 Worker 사이의 메시지 형태가 곧 이 계약이다 — 여기가 흐리면 진행률·취소·오류가 전부 임시방편이 된다.

## 🔗 References (Spec & Context)
- **실행 위치**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **§3.2 · §6.5.4**
- **판정**: `tasks_2/SP-003_Spike_브라우저추적실측.md` — 🔺 **백엔드·임계는 여기서 확정**
- **모델·신호**: `HILIT_추적PoC_기술기획서.md` §3.1 · **§3.2**(7신호) · §3.3(상태 머신)
- **소비자**: `tasks_2/FR-044_Vision_브라우저추적런타임.md` · `tasks_2/FR-005_Vision_대상지정-추적결과등록.md` · `tasks_2/FR-038_Editing_기본편집도구.md`
- **대칭 계약**: `tasks_2/CT-006_APISpec_RecoveryProvider.md`
- 🔴 **대기 중 자원** *(v3.2)*: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **§6.5.5** · **T7** · 소비처 `Tasks/FR-046_Waiting_대기중소비-복귀.md`

## ✅ Task Breakdown (실행 계획)
- [ ] `TrackerRuntime` 인터페이스 — `init()` · `track(clip, anchor)` · `cancel()` · `capabilities()`
- [ ] 🔴 **Worker 메시지 타입** — `start` / `progress` / `clipDone` / `error` / `cancelled`
- [ ] 🔴 **`clipDone` 페이로드가 `submitTrack` 입력과 동일** — 변환 계층을 두지 않는다
- [ ] 결과 타입 — `{ bboxTimeline, healthTimeline, reidScore, uncertainRanges[] }`
- [ ] 🔴 **좌표 0~1 · 시간 `ms`** — CT-006과 같은 규약
- [ ] `healthTimeline` 스키마 — 7신호 + 종합 판정
- [ ] 🔴 **`uncertainRanges` 를 런타임이 산출** — FR-045의 입력. 서버가 다시 계산하지 않는다
- [ ] `capabilities()` — 백엔드(wasm/webgpu) · 멀티스레드 · 예상 fps
- [ ] 🔴 **폴백 판정 함수** — `canRunTracking(): { ok, reason }` · SP-003 임계를 상수로
- [ ] 수동 트래킹(FR-038) 결과를 **같은 타입으로** 만드는 어댑터
- [ ] 🔴 **`setResourceMode(mode)` 메시지** *(v3.2 · T7)* — 피드 재생 여부를 런타임에 알린다. 🔴 **런타임은 이 값으로 fps를 바꾸지 않는다** — 계측 태그와 보고 주기에만 쓴다(P2 기각)
- [ ] 🔴 **`progress` 페이로드에 `clipsDone` / `clipsTotal`** *(v3.2)* — 미니바 퍼센트의 근거. 🔴 **런타임이 퍼센트를 계산하지 않는다** — 분자·분모만 낸다(Q22)
- [ ] 🔴 **`capabilities()` 에 `concurrentPlaybackSafe: boolean`** *(v3.2)* — 이 단말에서 재생과 겹쳐도 되는가 · SP-003 임계를 상수로

## 🧪 Acceptance Criteria (BDD/GWT)

**Scenario 1: 세 출처가 같은 타입이다**
- **Given**: 자동 추적 · 수동 트래킹 · 복구 결과
- **When**: 타입을 확인함
- **Then**: 🔴 **`bboxTimeline` 형태가 동일하다.** FR-010·FR-012가 출처를 묻지 않는다

**Scenario 2: `clipDone` 이 그대로 서버로 간다**
- **Given**: Worker의 `clipDone` 메시지
- **When**: `submitTrack` 에 넘김
- **Then**: 🔴 **변환 없이 들어간다.** 변환 계층이 있으면 두 곳이 어긋날 수 있다

**Scenario 3: 불확실 구간을 런타임이 판정한다**
- **Given**: Tracking Health 시계열
- **When**: `clipDone` 을 확인함
- **Then**: 🔴 **`uncertainRanges` 가 이미 계산되어 있다.** 서버가 다시 계산하면 두 판정이 갈릴 수 있다

**Scenario 4: 폴백을 코드가 판정한다**
- **Given**: 미지원 브라우저
- **When**: `canRunTracking()` 을 호출함
- **Then**: 🔴 **`{ ok:false, reason }` 이 나온다.** UI가 사유를 그대로 안내한다(FR-038)

**Scenario 5: 취소가 동작한다**
- **Given**: 추적 진행 중 사용자가 나감
- **When**: `cancel()` 을 호출함
- **Then**: **Worker가 정리되고 부분 결과는 이미 서버에 있다**(R3)

**Scenario 6: 좌표계·시간 단위가 CT-006과 같다**
- **Given**: 브라우저 결과와 복구 결과
- **When**: 두 궤적을 병합함
- **Then**: 🔴 **변환 없이 이어진다.** 규약이 다르면 FR-045의 병합이 어긋난다

**Scenario 7 (실패): Worker 밖에서 도는 경로를 남기지 않는다**
- **Given**: "간단한 경우엔 메인 스레드에서" 라는 최적화
- **When**: 계약을 검토함
- **Then**: 🔴 **경로가 하나다.** 두 경로가 있으면 UI 멈춤이 재현되지 않는 버그로 남는다

## ⚙️ Technical & Non-Functional Constraints
- 🔴 **좌표 0~1 · 시간 `ms`** — CT-006과 동일 규약
- 🔴 **`clipDone` = `submitTrack` 입력** — 변환 계층 금지
- 🔴 **Worker 단일 경로**
- 🔺 **백엔드·임계값은 SP-003 결과에 종속** — 계약은 지금 확정하고 상수만 나중에 채운다
- 🔺 **`healthTimeline` 크기** — 7신호 × 프레임이면 커진다. 다운샘플 규칙 필요 `[TBD]`
- 수동 어댑터가 `healthTimeline = null` 을 내는 것은 정상 — 복구 대상이 아니라는 뜻

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **세 출처가 같은 결과 타입인가?**
- [ ] 🔴 **`clipDone` 이 변환 없이 서버로 가는가?**
- [ ] 🔴 **`uncertainRanges` 를 런타임이 산출하는가?**
- [ ] `canRunTracking()` 이 사유와 함께 판정하는가?
- [ ] 좌표·시간 규약이 CT-006과 같은가?
- [ ] Worker 밖 실행 경로가 없는가?

## 🚧 Dependencies & Blockers
- **Depends on**: **CT-001**(결과 저장 스키마)
- **Blocks**: **FR-044** · **FR-005** · **FR-038** · **FR-045**(병합 규약)
- **결정 대기**: 🔺 **SP-003(T4)** — 상수만 · **계약은 선행 확정**
