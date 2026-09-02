---
name: Contract Task
about: 다른 태스크가 의존하는 계약을 먼저 확정하는 태스크
title: "[API Spec] CT-006: RecoveryProvider 인터페이스 — Cutie 정밀 복구 · 크롭 경로 반환"
labels: 'api-spec, contract, ai, priority:critical, step-1, wave-1'
assignees: ''
---

> ### 🔄 SRS v3.0 반영 — 이 태스크에서 바뀐 것 *(2026-09-01)*
> 🔴 **계약이 둘로 갈렸다** — v2.2의 단일 `TrackingProvider`(외부 추론 API가 원본 전체를 추적)가 ① **브라우저 추적 런타임**(→ `CT-009`) ② **정밀 복구 서비스**(이 문서)로 분리된다. 파일명도 `CT-006_APISpec_TrackingProvider.md` → **`CT-006_APISpec_RecoveryProvider.md`** 로 바뀐다. **전면 재작성**.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0 §7.4 · §2.2 ②** · `HILIT_추적PoC_기술기획서.md` §3.5

## 🎯 Summary
- 기능명: **[CT-006] 불확실 구간만 서버로 보내는 계약을 확정한다**
- 목적: **공급자가 바뀌어도 파이프라인이 흔들리지 않는 하나의 인터페이스를 먼저 못 박는다.**

> 🔴 **이 계약이 다루는 것은 "추적"이 아니라 "복구"다.** 정상 구간은 브라우저에서 끝나고 서버를 부르지 않는다. 서버가 받는 것은 **±4초 클립 하나**이며, 돌려주는 것은 **복구 궤적 + 크롭 경로**다.
>
> **원본 전체를 보내는 경로를 계약에 두지 않는다** — 그 경로가 존재하면 언젠가 누군가 쓰고, 원가 구조(PRD §5.5)가 조용히 무너진다.

> 🔴 **`cropPath` 를 이 계약에 넣는 이유.** PRD v0.2는 **리프레이밍이 Cutie 단계**임을 확정했다. 정밀 마스크가 있어야 인물 중심 경로가 나오므로, **복구 응답과 크롭 경로는 같은 왕복에서 온다.** 나누면 마스크를 두 번 만들게 된다.

> 🔺 **공급자가 아직 정해지지 않았다.** SRS T5(§2.2 ②)가 미결이다 — `SP-004` 가 이를 푼다. **계약을 먼저 확정해 두면 공급자 선정이 늦어도 FR-045·CT-007이 병렬로 간다.**

## 🔗 References (Spec & Context)
> 💡 AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- **시퀀스**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **§7.4**
- **제약 결정**: 같은 문서 **§2.2 ②** · **§2.4 T5** — 🔴 **미결**
- **복구 사다리**: `HILIT_추적PoC_기술기획서.md` **§3.5** — Lv1~Lv4 · `RECOVERY_COOLDOWN` · `MAX_RECOVERIES_PER_VIDEO`
- **N-Level**: 같은 문서 **§3.4** — 원가 손잡이 2/3/4
- **원가**: 같은 문서 **§5.5** — **10~17원/회** 실측(MX250 · RTX 4090 재측정 필요)
- **선정**: `tasks_2/SP-004_Spike_추론서비스선정.md`
- **소비자**: `tasks_2/FR-045_Vision_정밀복구요청.md` — 🔴 **어댑터 구현이 여기로 흡수됐다**(FR-008 폐번)

## ✅ Task Breakdown (실행 계획)

### A. 인터페이스 정의
- [ ] `RecoveryProvider` 인터페이스 — `submit()` · `parseWebhook()` · `capabilities()`
- [ ] 🔴 **`submit(input)` 입력에 `clipUrl` 만 받는다** — `videoUrl`(원본 전체) 필드를 **두지 않는다**
- [ ] 입력 필드 — `clipUrl` · `anchorBbox` · `clipStartMs` · `clipEndMs` · `nLevel` · `callbackUrl` · `idempotencyKey`
- [ ] 🔴 **응답은 즉시 `{ inferenceId }`** — 동기 대기 금지(A-T1)

### B. 결과 정규화
- [ ] `parseWebhook(raw)` → `{ bboxTimeline, cropPath, reidConfidence, gpuSeconds }`
- [ ] 🔴 **시간 단위를 밀리초로 통일** — 프레임 인덱스로 주는 공급자를 어댑터가 흡수한다
- [ ] 🔴 **좌표를 0~1 정규화로 통일** — 클립 해상도와 무관하게 유효해야 한다
- [ ] 🔴 **`reidConfidence` 미제공 시 `null` 을 보존** — 0으로 채우면 FR-012의 ConfidenceGate가 전부 제외한다
- [ ] 🔴 **`cropPath` 미제공 공급자 처리** — `capabilities().cropPath === false` 면 **FR-010이 궤적에서 자체 산출**한다

### C. 타입 가드·팩토리
- [ ] `createRecoveryProvider(env)` 팩토리 — 환경 변수로 공급자 교체
- [ ] Zod 스키마로 webhook 페이로드 검증 — 🔴 **서명 검증이 먼저**
- [ ] 타입 가드 — 부분 응답·필드 누락을 컴파일 타임이 아니라 **런타임에서 잡는다**

### D. 제약 상수
- [ ] `RECOVERY_COOLDOWN_SECONDS = 5` · `MAX_RECOVERIES_PER_VIDEO = 40` · `CLIP_PADDING_SECONDS = 4`
- [ ] 🔴 **`CLIP_PADDING_SECONDS` 를 설정으로 분리** — PoC: ±4초 → ±10초면 **원가 2.5배**. 코드 변경 없이 조정 가능해야 한다

## 🧪 Acceptance Criteria (BDD/GWT)

**Scenario 1: 원본을 보낼 수 있는 경로가 없다**
- **Given**: `RecoveryProvider.submit()` 타입 정의
- **When**: 원본 전체 URL을 넘기려 시도함
- **Then**: 🔴 **타입이 거부한다.** 입력에 `clipUrl` 만 있고 원본을 가리킬 필드가 없다 — **원가 구조가 계약으로 보호된다**

**Scenario 2: 즉시 반환한다** *(A-T1)*
- **Given**: ±4초 클립
- **When**: `submit()` 을 호출함
- **Then**: 🔴 **초 단위로 `inferenceId` 가 돌아온다.** 함수가 복구 시간(35~60초)만큼 살아 있지 않는다

**Scenario 3: 크롭 경로가 같은 왕복에서 온다**
- **Given**: 복구가 완료된 클립
- **When**: webhook을 파싱함
- **Then**: 🔴 **`bboxTimeline` 과 `cropPath` 가 함께 온다.** 두 번 호출하면 마스크를 두 번 만드는 것이고 원가가 두 배다

**Scenario 4: 크롭 경로를 못 주는 공급자도 붙는다**
- **Given**: `capabilities().cropPath === false` 인 공급자
- **When**: 파이프라인을 실행함
- **Then**: **FR-010이 궤적에서 경로를 산출한다.** 공급자 선정(SP-004)이 이 능력에 묶이지 않는다

**Scenario 5: 신뢰도 미제공이 0으로 바뀌지 않는다**
- **Given**: `reidConfidence` 를 주지 않는 공급자
- **When**: 정규화함
- **Then**: 🔴 **`null` 이 그대로 보존된다.** 0으로 채우면 FR-012의 ConfidenceGate가 **모든 후보를 제외**한다

**Scenario 6: 클립 길이를 코드 변경 없이 바꾼다**
- **Given**: `CLIP_PADDING_SECONDS` 설정
- **When**: 4 → 6 으로 변경함
- **Then**: 🔴 **전송 바이트와 GPU 초가 늘고 코드는 그대로다.** 원가·정확도 교환비 실험이 배포 없이 반복된다

**Scenario 7: 멱등하다**
- **Given**: 같은 `idempotencyKey` 로 두 번 `submit()`
- **When**: 두 번째 호출을 수행함
- **Then**: **새 추론이 발생하지 않고 최초 `inferenceId` 가 반환된다.** 비용이 발생하는 호출이므로 중복은 원가를 두 배로 만든다

**Scenario 8 (실패): 공급자 선정을 기다리며 계약을 미루지 않는다**
- **Given**: SP-004 미결
- **When**: 착수 여부를 검토함
- **Then**: 🔴 **계약은 지금 확정한다.** 계약이 있으면 CT-007 Mock으로 FR-045·FR-010이 **공급자 없이 완성**된다

## ⚙️ Technical & Non-Functional Constraints
- 🔴 **원본 전송 경로를 계약에 두지 않는다** — 존재하면 쓰이고, 쓰이면 PRD §5.5의 원가 전제가 무너진다
- 🔴 **파싱을 Route Handler에 하드코딩하지 않는다** — `parseWebhook()` 위임이 공급자 교체를 가능하게 하는 지점
- 🔴 **`cropPath` 좌표계는 클립 기준 0~1** — 원본 좌표로 주면 클립 오프셋 계산이 사방에 퍼진다
- 🔺 **공급자 미정**(T5·SP-004) — 계약은 **가장 좁은 공통 분모**로 잡고, 공급자 고유 기능은 `capabilities()` 뒤에 둔다
- 🔺 **RTX 4090 원가 재측정 필요** — PoC의 10~17원은 MX250 실측이라 규모 감만 준다
- Webhook은 RLS 우회 경로 — CT-003의 우회 목록에 등재

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **입력 타입에 원본 전체를 가리키는 필드가 없는가?**
- [ ] 🔴 **`cropPath` 가 복구 응답에 포함되는가?**
- [ ] 🔴 **`reidConfidence` 의 `null` 이 보존되는가?**
- [ ] 🔴 **`CLIP_PADDING_SECONDS` 가 설정값으로 분리되었는가?**
- [ ] `capabilities()` 로 공급자 능력 차이를 흡수하는가?
- [ ] 멱등 · 서명 검증 · 순서 역전 방어가 모두 있는가?
- [ ] TypeScript strict · 런타임 타입 가드가 있는가?

## 🚧 Dependencies & Blockers
- **Depends on**: **CT-004**(오류 코드·Webhook 규약)
- **Blocks**: **FR-045**(복구 어댑터·요청) · **FR-010**(리프레이밍) · **CT-007**(Mock)
- **결정 대기**: 🔺 **SP-004(T5)** — 공급자 선정. **계약은 선행 가능**
- **폐번**: `CT-006_APISpec_TrackingProvider` — 같은 번호를 이 문서가 승계한다
