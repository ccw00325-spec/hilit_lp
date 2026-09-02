---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Command] FR-037: 프롬프트 하이라이트 컷 — Gemini 판독 → Claude Haiku 4.5 판정 (2단 비동기)"
labels: 'backend, command, ai, cut, priority:critical, step-2'
assignees: ''
---

> ### 🆕 SRS v3.0에서 신설 *(2026-09-01)*
> PRD v0.2가 **파이프라인 1단계**로 확정한 F25. **REQ-FUNC-028** 신설.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0 §7.3 · §5.1 ①** · `PRD/HILiT_PRD_v0_2.md` F25 · AC1-1 · AC7-3

## 🎯 Summary
- 기능명: **[FR-037] 사용자가 "~한 구간만 뽑아줘" 라고 말하면 영상이 잘린다**
- 목적: **파이프라인의 입구를 만든다. 여기서 자른 클립이 트래킹의 입력이 된다.**

> 🔴 **이것이 파이프라인의 첫 단계다.** 자르지 않으면 추적할 클립이 없다. **여기가 틀리면 뒤의 추적·복구·렌더 원가가 통째로 버려진다**(PRD R12).

> 🔴 **2단으로 나누는 이유.** Gemini에게 *"이 프롬프트에 맞는 구간을 찾아줘"* 를 한 번에 시키지 않는다.
> ```
> 1단 Gemini        : 영상을 읽어 구간 메타데이터를 만든다 (프롬프트를 모른 채)
> 2단 Claude Haiku  : 텍스트 위에서 프롬프트와 대조해 판정한다
> ```
> **메타데이터를 캐시하면 같은 영상에 다른 프롬프트를 넣을 때 1단을 건너뛴다** — F27(7일 보관)이 재편집을 허용하므로 이 절약이 실제로 발생한다.

> 🔴 **A-T1·A-T3 때문에 비동기다.** 20분 영상 판독을 Serverless Function 안에서 끝낼 수 없다. **큐 등록 후 즉시 반환**하고 결과는 webhook으로 받는다.

> 🔴 **`matchScore` 는 재식별 신뢰도가 아니다.** *"이 구간이 그 행동인가"* 이지 *"이 사람이 당신인가"* 가 아니다. 컬럼을 분리해 강제한다(CT-001).

## 🔗 References (Spec & Context)
- **설계**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **§7.3** — 2단 스키마 · 시퀀스
- **Action**: 같은 문서 **§5.1 ①** — `requestCut(videoId, prompt)` · `POST /api/webhooks/cut`
- **모델 추상화**: 같은 문서 **§7.1** — `videoModel` · `judgeModel` · 🔺 **C-TEC-006 완화(T6)**
- **요구사항**: `PRD/HILiT_PRD_v0_2.md` **AC1-1 · AC7-3 · Gate C**
- **실패 경로**: 같은 문서 **AF-3**(0건 · 미차감) · **AF-11**(제공자 실패 · 미차감)
- **원가**: 같은 문서 **§5.5 · Q14** — 🔴 **편당 고정비**
- **게이트**: `tasks_2/NF-017_Legal_얼굴정보처리.md` — 🔴 **`FACE_CONSENT` 가 이 기능을 차단한다**
- **스키마**: `tasks_2/CT-001_DB_스키마-제약-인덱스.md` — `CutRequest` · `VideoSegment`

## ✅ Task Breakdown (실행 계획)

### A. 요청
- [ ] Server Action **`requestCut({ videoId, prompt })` → `{ cutRequestId }`**
- [ ] 입력 검증 — 프롬프트 길이 ≤ 500 · 소유권 · `status = UPLOADED`
- [ ] 🔴 **사용량 사전 확인**(차감 아님) — 잔여 0이면 `QUOTA_EXCEEDED` + 무료 경로 안내
- [ ] `cut_requests` INSERT (`QUEUED`) · 🔴 **즉시 반환**
- [ ] 멱등 — 같은 `videoId` + 같은 프롬프트 진행 중이면 기존 `cutRequestId` 반환

### B. 1단 — Gemini 영상 판독
- [ ] Storage **읽기용 Signed URL** 발급 — 만료가 판독 상한보다 길게
- [ ] `generateObject(videoModel, MetaSchema)` — `segments[{startMs,endMs,description,actors}]`
- [ ] 🔴 **메타데이터를 캐시** — 같은 `videoId` 재요청 시 1단 생략
- [ ] `status = READING → JUDGING`
- [ ] 계측 — `cut_reading_done`(소요 · 토큰 · **원가**)

### C. 2단 — Claude Haiku 4.5 판정
- [ ] `generateObject(judgeModel, JudgeSchema)` — `matches[{segmentIndex,matchScore,reason}]`
- [ ] 🔴 **입력은 텍스트뿐** — 영상을 다시 보내지 않는다
- [ ] `video_segments` INSERT — `match_score` 저장
- [ ] `status = DONE` · Realtime 통지(FR-036)
- [ ] 🔴 **`cut_requests.cost_krw` 기록** — 1단 + 2단 합산

### D. 실패·경계
- [ ] 🔴 **0건(AF-3)** — `CUT_NO_MATCH` · **사용량 미차감** · 프롬프트 수정 경로 안내
- [ ] 🔴 **제공자 실패(AF-11)** — 3회 재시도 후 실패 · **미차감** · 수동 컷(FR-038) 경로 안내
- [ ] 🔴 **성공 시에만 후차감**(FR-042)
- [ ] 계측 — `cut_requested` · `cut_completed`(클립 수 · 총 길이 · 원가) · `cut_retry`

## 🧪 Acceptance Criteria (BDD/GWT)

**Scenario 1: 말한 대로 잘린다** *(AC1-1 · Gate C)*
- **Given**: 20분 농구 원본
- **When**: *"내가 슛 쏘는 장면만 뽑아줘"* 를 입력함
- **Then**: 해당 구간이 `VideoSegment` 로 저장되고 클립 목록이 표시된다 · **판정 정확도는 Gate C(E5)가 판정한다**

**Scenario 2: 즉시 반환한다** *(A-T1)*
- **Given**: 20분 원본
- **When**: `requestCut` 을 호출함
- **Then**: 🔴 **초 단위로 `cutRequestId` 가 돌아온다.** 함수가 판독 시간(p95 ≤ 5분)만큼 살아 있지 않는다

**Scenario 3: 같은 영상의 두 번째 프롬프트가 싸다**
- **Given**: 이미 1단 메타데이터가 캐시된 영상
- **When**: 다른 프롬프트로 다시 요청함
- **Then**: 🔴 **Gemini를 다시 부르지 않고 2단만 돈다.** F27(7일 보관)이 재편집을 허용하므로 이 절약이 실제로 발생한다

**Scenario 4: 0건이 차감되지 않는다** *(AF-3)*
- **Given**: 프롬프트에 맞는 구간이 없는 영상
- **When**: 컷을 실행함
- **Then**: 🔴 **`CUT_NO_MATCH` 이고 사용량이 줄지 않는다.** 결과를 못 받았는데 차감하면 사용자는 두 번 손해다

**Scenario 5: 제공자 장애가 차감되지 않는다** *(AF-11)*
- **Given**: Gemini 5xx
- **When**: 3회 재시도 후 실패함
- **Then**: 🔴 **미차감** · 수동 컷(FR-038) 경로가 제시된다

**Scenario 6: 영상을 두 번 보내지 않는다**
- **Given**: 2단 판정
- **When**: Claude 호출 입력을 확인함
- **Then**: 🔴 **텍스트 메타데이터만 있다.** 영상을 다시 보내면 원가가 배가되고 **외부 전송이 한 번 더 일어난다**(NF-017)

**Scenario 7: 원가가 편당으로 기록된다** *(Q14)*
- **Given**: 완료된 컷 요청
- **When**: `cut_requests.cost_krw` 를 확인함
- **Then**: 🔴 **1단+2단 합산 원가가 있다.** **PRD Q14를 푸는 유일한 계측점**이다

**Scenario 8: 두 점수가 섞이지 않는다**
- **Given**: `matchScore`(F25)와 `reidScore`(추적)
- **When**: 스키마를 확인함
- **Then**: 🔴 **다른 테이블의 다른 컬럼이다**

**Scenario 9: 게이트 미승인 시 기능이 빌드에 없다**
- **Given**: `FACE_CONSENT` 가 `PENDING`
- **When**: 빌드를 수행함
- **Then**: 🔴 **`PROMPT_CUT` 상수가 `false` 이고 라우트가 번들에서 제거된다.** 켤 수 있는 플래그가 아니라 **없는 코드**다

**Scenario 10 (실패): Gemini에게 프롬프트를 함께 주지 않는다**
- **Given**: "한 번에 시키면 더 싸지 않나" 라는 검토
- **When**: 설계를 판단함
- **Then**: 🔴 **1단 캐시가 불가능해진다.** 프롬프트가 섞이면 메타데이터가 프롬프트에 종속되어 재사용할 수 없다

## ⚙️ Technical & Non-Functional Constraints
- 🔴 **A-T1·A-T3 → 비동기 필수** · 큐는 Supabase 테이블 + Cron 또는 제공자 비동기 API
- 🔴 **후차감** — 외부 호출 성공 후에만 사용량을 줄인다
- 🔴 **원본이 외부로 나간다** — NF-017 5번째 산출물의 대상. 게이트 미승인 시 기능 자체가 빌드에 없어야 한다
- 🔴 **C-TEC-006 완화(T6) 전제** — Gemini 단일이 아니라 **두 프로바이더 직렬**
- 🔺 **1단 캐시 보존 기간** — F27의 7일과 맞춘다 `[TBD]`
- 🔺 **Signed URL 만료** — 판독 상한보다 길되 필요 이상으로 길지 않게
- 🔺 **Gate C 임계 미정** — 정확도 판정은 E5 소관, 이 태스크는 **파이프라인만** 책임진다

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **`requestCut` 이 즉시 반환하는가?**
- [ ] 🔴 **1단 메타데이터가 캐시되고 재사용되는가?**
- [ ] 🔴 **0건·제공자 실패가 미차감인가?**
- [ ] 🔴 **2단 입력에 영상이 없는가?**
- [ ] 🔴 **`cost_krw` 가 1단+2단 합산으로 기록되는가?**
- [ ] `matchScore` 가 `reidScore` 와 다른 컬럼인가?
- [ ] `FACE_CONSENT` 게이트가 이 기능을 차단하는가?
- [ ] 멱등 · 서명 검증 · 순서 역전 방어가 있는가?
- [ ] TypeScript strict · ESLint 경고 0건인가?

## 🚧 Dependencies & Blockers
- **Depends on**: **CT-001**(`CutRequest`·`VideoSegment`) · **CT-004**(Action·Webhook 계약) · **FR-001**(업로드 완료) · **FR-042**(사용량)
- **Blocks**: 🔴 **FR-005**(추적 입력) · **FR-012**(후보) · **UX-011**(화면) · **Gate C(E5)**
- **게이트**: 🔴 **`FACE_CONSENT`**(NF-017) — 미승인 시 배포 산출물에서 제외
- **결정 대기**: 🔺 **T6**(C-TEC-006 완화 승인)
