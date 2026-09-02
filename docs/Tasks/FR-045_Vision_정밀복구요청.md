---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Command] FR-045: 정밀 복구 — 어댑터 · 요청 · 결과 수신 (Lv3 · 쿨다운 · 40회 상한 · N-Level)"
labels: 'backend, command, vision, priority:critical, step-2, blocked-by-spike'
assignees: ''
---

> ### 🆕 SRS v3.0에서 신설 *(2026-09-01)*
> v2.2의 FR-005가 갖고 있던 "탐지 요청 · webhook 수신" 이 **불확실 구간 복구**로 성격이 바뀌어 분리됐다. 🔴 **원가가 발생하는 유일한 추적 경로**다.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0 §7.4** · `HILIT_추적PoC_기술기획서.md` §3.4 · §3.5

> 🔀 **FR-008(복구 어댑터 구현)을 흡수했다** *(축약 2026-09-01)* — **어댑터는 단독 산출물이 없고**, `submit()` → `parseWebhook()` 이 이 태스크의 **한 왕복**이다. v0.1이 FR-006·007을 FR-005에 흡수한 것과 같은 패턴이다. `FR-008` 은 폐번이며 이 문서를 가리킨다.

## 🎯 Summary
- 기능명: **[FR-045] 추적이 흔들린 ±4초만 서버에서 다시 본다**
- 목적: **정상 구간은 서버를 부르지 않는다는 원가 구조를 코드로 강제한다.**

> 🔴 **이 태스크가 원가를 만든다.** 복구 1회 = **10~17원**(PoC §5.5 · MX250). 편당 상한 40회면 **400~680원**이다. 구독가 9,900원 대비 무시할 수 없다.
>
> **그래서 이 태스크의 본체는 호출이 아니라 억제다** — 쿨다운 · 상한 · N-Level.

> 🔴 **크롭 경로가 같은 왕복에서 온다.** PRD v0.2는 리프레이밍을 Cutie 단계로 확정했다. 복구 응답에 `cropPath` 가 포함되므로 **두 번 부르지 않는다**(FR-010).

> 🔴 **±4초가 가장 민감한 파라미터다.** PoC §3.5: ±4초 → ±10초면 **원가 2.5배**. 설정값으로 분리한다.

## 🔗 References (Spec & Context)
- **시퀀스**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **§7.4**
- **계약**: `tasks_2/CT-006_APISpec_RecoveryProvider.md` — 🔴 **어댑터 구현이 이 태스크로 흡수됐다**(FR-008 폐번)
- **안전판**: `HILIT_추적PoC_기술기획서.md` **§3.5** — `RECOVERY_COOLDOWN 5s` · `MAX_RECOVERIES_PER_VIDEO 40`
- **N-Level**: 같은 문서 **§3.4** — 2 품질 / 3 균형 / 4 비용 방어 · 🔴 **Critical 우회 `0.35`**
- **원가**: `PRD/HILiT_PRD_v0_2.md` §5.5 — 🔴 **Q3 실측점**
- **입력**: `tasks_2/FR-005_Vision_대상지정-추적결과등록.md`(`healthTimeline`)
- **소비자**: `tasks_2/FR-010_Vision_리프레이밍적용.md`(`cropPath`) · `tasks_2/FR-012_Composer_후보산출-조회.md`(`trackStatus`)

## ✅ Task Breakdown (실행 계획)

### A. 어댑터 *(← FR-008)*
- [ ] `RecoveryProvider` 구현체 골격 — **CT-006 계약 100% 준수**
- [ ] `submit()` — `clipUrl` · `anchorBbox` · `nLevel` · `callbackUrl` · `idempotencyKey`
- [ ] `parseWebhook()` — 서명 검증 → Zod 파싱 → 정규화
- [ ] 🔴 **시간 정규화** — 프레임 인덱스 → `ms`
- [ ] 🔴 **좌표 정규화** — 픽셀 → 0~1 (클립 기준)
- [ ] 🔴 **`cropPath` 유무를 `capabilities()` 로 노출** — 없으면 FR-010이 궤적에서 자체 산출
- [ ] `gpuSeconds` → `cost_krw` 환산 — `GPU_COST_PER_HOUR_KRW` 설정값
- [ ] 오류 분류 — 공급자 장애(`INFRA`) vs 복구 실패(`CAPTURE`)
- [ ] 🔴 **어댑터 안에 재시도 루프를 두지 않는다** — 재시도는 아래 C의 정책이다

### B. 요청
- [ ] Server Action **`requestRecovery({ segmentId, clipRange, nLevel }) → { recoveryJobId }`**
- [ ] 🔴 **±4초 클립 URL만 생성해 넘긴다** — 원본 전체를 보내지 않는다
- [ ] 🔴 **`RECOVERY_COOLDOWN_SECONDS = 5` 검사** — 같은 `personTrackId` 직전 요청 시각
- [ ] 🔴 **`MAX_RECOVERIES_PER_VIDEO = 40` 검사** — 초과 시 **Lv4(사용자 확인)로 전환**
- [ ] 🔴 **N-Level 적용** — 기본 3 · 🔺 요금제별 차등 `[TBD Q15]`
- [ ] 🔴 **Critical 우회** — `reidScore < 0.35` 면 N-Level과 무관하게 즉시 호출
- [ ] `recovery_jobs` INSERT(`QUEUED`) · 즉시 반환
- [ ] 🔴 **사용량 사전 확인** — 복구도 과금 대상(`UsageKind.RECOVERY`)

### C. 수신
- [ ] Route Handler `POST /api/webhooks/inference` — 🔴 **서명 검증 우선**
- [ ] `RecoveryProvider.parseWebhook()` 위임 — 위 A의 어댑터
- [ ] `person_tracks` 궤적 병합 — 🔴 **정상 구간과 이음매가 생기지 않게**
- [ ] `crop_path` 저장 — FR-010의 입력
- [ ] `trackStatus = RECOVERED` 표시
- [ ] 🔴 **`cost_krw` 기록** — `gpuSeconds` 환산
- [ ] 🔴 **성공 후 차감**(FR-042) · 실패 시 미차감
- [ ] 멱등 · 순서 역전 방어
- [ ] 계측 — `recovery_requested` · `recovery_completed`(gpu초 · 원가 · N-Level)

## 🧪 Acceptance Criteria (BDD/GWT)

**Scenario 1: 정상 구간은 서버를 부르지 않는다**
- **Given**: 전 구간 정상인 클립
- **When**: 추적 완료 후 처리를 확인함
- **Then**: 🔴 **복구 호출이 0건이다.** 이것이 PRD §5.5 원가 구조의 전제다

**Scenario 2: 원본 전체가 나가지 않는다**
- **Given**: 20분 원본의 한 구간이 불확실
- **When**: 복구를 요청함
- **Then**: 🔴 **±4초 클립만 전송된다.** 전송 바이트가 계측된다

**Scenario 3: 쿨다운이 폭주를 막는다**
- **Given**: 어려운 장면에서 연속 불확실 판정
- **When**: 5초 안에 두 번째 요청
- **Then**: 🔴 **거부된다.** 없으면 한 영상에서 호출이 폭주한다

**Scenario 4: 40회 상한에서 사용자 확인으로 전환된다**
- **Given**: 이미 40회 복구한 영상
- **When**: 41번째를 요청함
- **Then**: 🔴 **거부되고 Lv4(사용자 확인) 경로로 간다.** 무한 호출이 불가능하다

**Scenario 5: 명백한 오인식은 N-Level을 무시한다**
- **Given**: `reidScore = 0.30` (Critical 임계 0.35 미만)
- **When**: N=4(비용 방어) 설정에서 판정함
- **Then**: 🔴 **즉시 복구를 호출한다.** 다른 사람을 잡고 있는데 원가를 아끼는 것은 의미가 없다

**Scenario 6: 크롭 경로가 함께 온다**
- **Given**: 복구 완료
- **When**: webhook을 파싱함
- **Then**: 🔴 **`bboxTimeline` 과 `cropPath` 가 함께 저장된다.** 두 번 부르면 원가가 두 배다

**Scenario 7: 궤적 이음매가 생기지 않는다**
- **Given**: 정상 구간 + 복구 구간이 한 클립에 공존
- **When**: 병합 결과를 확인함
- **Then**: **연속된 하나의 궤적이다.** 이음매에서 화면이 튀면 O3가 깨진다

**Scenario 8: 원가가 기록된다** *(Q3)*
- **Given**: `gpuSeconds = 45`
- **When**: `recovery_jobs.cost_krw` 를 확인함
- **Then**: 🔴 **환산 원가가 있다.** 편당 합산이 PRD §5.5를 갱신한다

**Scenario 9: 실패가 차감되지 않는다** *(AF-11)*
- **Given**: 복구 서비스 장애
- **When**: 재시도 후 실패함
- **Then**: 🔴 **사용량 미차감** · `trackStatus` 는 `LOW_CONFIDENCE` 로 남는다

**Scenario 10: 공급자 형식이 밖으로 새지 않는다** *(← FR-008)*
- **Given**: 프레임 인덱스·픽셀 좌표로 응답하는 공급자
- **When**: `parseWebhook()` 를 거침
- **Then**: 🔴 **밀리초·0~1 좌표만 나온다.** 어댑터 밖의 어떤 코드도 프레임률을 알 필요가 없다

**Scenario 11: 크롭 경로 미제공을 파이프라인이 안다** *(← FR-008)*
- **Given**: `cropPath` 를 주지 않는 공급자
- **When**: `capabilities()` 를 조회함
- **Then**: `cropPath === false` 가 나오고 **FR-010이 궤적에서 자체 산출**한다

**Scenario 12: 공급자 교체가 환경 변수로 끝난다** *(← FR-008)*
- **Given**: 두 번째 공급자 구현체
- **When**: `RECOVERY_PROVIDER` 를 변경함
- **Then**: 🔴 **호출부 코드가 그대로다.** 팩토리가 교체를 흡수한다

**Scenario 13: 장애와 실패가 다르게 분류된다** *(← FR-008)*
- **Given**: ① 공급자 5xx ② 복구했으나 대상 못 찾음
- **When**: 각각 파싱함
- **Then**: 🔴 **①은 `INFRA`(재시도 대상) ②는 `CAPTURE`(재시도 무의미).** 섞으면 인프라 실패율 지표가 오염되고 진짜 장애가 묻힌다

**Scenario 14: Mock으로 공급자 없이 완성된다** *(← FR-008)*
- **Given**: SP-004 미결
- **When**: CT-007 Mock을 주입해 테스트함
- **Then**: 🟢 **어댑터·정규화·오류 분류·억제 정책이 전부 검증된다.** 남는 것은 공급자별 파싱 한 겹뿐이다

**Scenario 15 (실패): 어려운 영상에서 상한을 늘리지 않는다**
- **Given**: 40회로 부족한 영상
- **When**: 상한 상향을 검토함
- **Then**: 🔴 **상한은 원가 방어선이다.** 대응은 N-Level 조정·클립 길이 축소·Lv4 안내이며, **상한 상향은 제품·사업 결정**이지 구현 결정이 아니다

## ⚙️ Technical & Non-Functional Constraints
- 🔴 **억제가 본체** — 쿨다운 · 상한 · N-Level · Critical 우회 4종이 전부 있어야 한다
- 🔴 **`CLIP_PADDING_SECONDS` 설정값 분리** — ±4 → ±10이면 원가 2.5배
- 🔴 **후차감**
- 🔴 **Webhook은 RLS 우회 경로** — CT-003 우회 목록에 등재 · **Handler 안에서 후보 생성까지 하지 않는다**(A-T1 · FR-012 분리)
- 🔺 **N-Level 조정 손잡이** — 🟢 **v0.5에서 Q15가 종결되면서 요금제 차등 용도에서 풀려났다.** 이제 순수하게 **원가 대 품질**의 손잡이다(PRD §5.5 · Q3)
- 🔺 **N-Level 원가 절감 효과 미측정**(PoC §7.6) — 손잡이는 있는데 눈금이 없다. E1에서 함께 잰다
- 🔴 **어댑터와 정책의 경계** *(← FR-008)* — `submit()`·`parseWebhook()` 은 **1회 발신·1회 파싱**만, 재시도·쿨다운·상한은 **이 태스크의 정책 계층**. 어댑터가 자체 재시도하면 억제 장치가 우회된다
- 🔴 **정규화가 어댑터의 본체** *(← FR-008)* — 호출은 얇게, 변환은 두껍게
- 🔺 `GPU_COST_PER_HOUR_KRW` 는 설정값 — PoC의 1012.45(RTX 4090 기준)는 재확인 필요

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **정상 구간에서 호출이 0건인가?**
- [ ] 🔴 **±4초 클립만 전송되는가?**
- [ ] 🔴 **쿨다운 · 40회 상한 · N-Level · Critical 우회가 전부 있는가?**
- [ ] 🔴 **`cropPath` 가 같은 왕복에서 저장되는가?**
- [ ] 🔴 **`cost_krw` 가 기록되는가?**
- [ ] 실패 시 미차감인가?
- [ ] 궤적 병합에 이음매가 없는가?
- [ ] 멱등 · 서명 검증 · 순서 역전 방어가 있는가?
- [ ] 🔴 **어댑터 밖에 프레임 인덱스·픽셀 좌표가 없는가?** *(← FR-008)*
- [ ] 🔴 **`capabilities()` 로 `cropPath` 유무를 노출하는가?** *(← FR-008)*
- [ ] 🔴 **어댑터 안에 재시도 루프가 없는가?** *(← FR-008)*
- [ ] `INFRA` / `CAPTURE` 분류가 있는가? *(← FR-008)*
- [ ] Mock 주입으로 공급자 없이 전 시나리오가 통과하는가? *(← FR-008)*

## 🚧 Dependencies & Blockers
- **Depends on**: **CT-006**(계약) · **CT-007**(Mock) · **FR-005**(`healthTimeline`) · **FR-042**(사용량)
- **Blocks**: **FR-010**(크롭 경로) · **FR-012**(`trackStatus`) · **FR-036**(Realtime)
- **결정 대기**: 🔴 **SP-004(T5)** — 공급자 선정 후 **파싱 한 겹만** 채운다. 🟢 **나머지는 Mock으로 선행 가능**
- **미결**: 🔺 **Q15**(N-Level 요금제 차등) · **Q3**(편당 원가 상한)
