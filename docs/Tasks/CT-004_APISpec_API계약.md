---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[API Spec] CT-004: API 계약 — Server Action 시그니처 · Zod 스키마 · 오류 코드 · Webhook 2종"
labels: 'api-spec, contract, priority:critical, step-1, wave-1'
assignees: ''
---

> ### 🔄 SRS v3.0 반영 — 이 태스크에서 바뀐 것 *(2026-09-01)*
> **Action·Webhook 계약 확장** — 신규 Action `requestCut` · `submitTrack` · `requestRecovery` · `generateMusic` · `saveSubtitles` · `getUsage` · `startCheckout` / 신규 Webhook `cut` · `suno` · `payment` / **`setVisibility`에서 `groupIds` 인자 삭제** / 신규 오류 코드 `DURATION_EXCEEDED` · `CUT_NO_MATCH` · `QUOTA_EXCEEDED`.

> ### 🔴 SRS v3.3 — `QUOTA_EXCEEDED` 가 한 코드로 두 상황을 가리키게 됐다 *(2026-09-02)*
> PRD **v0.4**가 수동 트래킹에 한도(무료 월 1회)를 두면서 **`QUOTA_EXCEEDED` 의 발생 지점이 둘**이 됐다. 🔴 **되돌릴 곳이 서로 반대라서, 코드 하나로는 화면을 만들 수 없다.**
>
> | `kind` | 누가 | 되돌릴 곳 | `freePathAvailable` |
> | --- | --- | --- | :--: |
> | `EDIT` | 전 요금제 | **무료 편집 도구**(FR-038) | `true` |
> | 🔴 `MANUAL_TRACK` | **무료만** | 🔴 **리프레이밍 없이 합치기**(AF-16) | 🔴 `false` |
>
> 🔴 **`MANUAL_TRACK` 소진에 `freePathAvailable: true` 를 실으면 화면이 "무료 도구로 계속하기"를 띄우고, 눌러도 같은 벽으로 돌아온다** — 소진된 것이 바로 그 무료 도구이기 때문이다.
>
> **계약 변경**: `QUOTA_EXCEEDED` 응답에 🔴 **`kind`(필수)** · 🔴 **`resetAt`(갱신 시각 · `MANUAL_TRACK` 에서 필수)** 추가 · 신규 Action **`canConsume(kind)`** 노출.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.3 §5.2** · `PRD/HILiT_PRD_v0_2.md` **v0.4** AF-16
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0** · `PRD/HILiT_PRD_v0_2.md`

> ### 🔴 SRS v3.2 반영 — Action 2건 추가 *(2026-09-02)*
> PRD v0.3 **F29**가 전역 미니바와 복귀를 요구한다.
>
> | 신규 | 방식 | 시그니처 |
> | --- | --- | --- |
> | **활성 작업 조회** | **RSC 직접 조회** | `getActiveJob() → {stage, progressNum, progressDen, resumeRoute, status} \| null` |
> | **편집 복귀** | Server Action | `resumeEditing(jobId) → {route}` |
>
> 🔴 **`getActiveJob()` 이 `null` 을 정상 반환값으로 갖는다** — 활성 작업이 없으면 미니바가 **완전히 사라져야** 한다. `null` 을 오류로 다루면 빈 껍데기가 상시 표시된다.
>
> 🔴 **`resumeEditing` 은 인자로 받은 경로를 믿지 않는다** — `jobId` 만 받고 **현재 stage를 서버에서 다시 읽어** 경로를 계산한다. 클라이언트가 route를 넘기는 시그니처로 만들면 SRS §5.2의 "복귀 지점 정확도 100%"가 클라이언트 책임이 된다.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.2 §5.1** · `PRD/HILiT_PRD_v0_2.md` **v0.3** F29 · **SD-9**

> 🔀 **CT-005(Webhook 계약)를 흡수했다** *(축약 2026-08-30)* — 같은 타입 정의 파일이고 CT-005가 CT-004의 오류 코드 규약에 종속돼 있었다. `CT-005` 는 폐번이며 이 문서를 가리킨다.

## 🎯 Summary
- 기능명: **[CT-004] 서버 로직 계약 확정 — 안팎 양방향**
- 목적: **모든 상태 변경·조회·외부 수신의 이름·인자·반환·오류를 코드로 고정한다.**

> 🔴 **이 스택에는 API Controller도 OpenAPI 문서도 없다.** Server Action은 함수이므로 **타입 정의 자체가 계약**이다. 그래서 이 태스크의 산출물은 문서가 아니라 **타입 파일**이다.
>
> **경계가 둘이다** — 사용자가 일으키는 것은 **Server Action**, 외부가 일으키는 것은 **Route Handler**(v2.2 §5.1). 🔴 **두 webhook이 끊기면 파이프라인이 중간에 멈춘다** — 탐지가 끝나도 시스템이 모르고 사용자는 영원히 대기 화면을 본다.

## 🔗 References (Spec & Context)
> 💡 AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- **API 명세 23개**: `DS/[DS]hilit-DSv1.1.md` §3.2 — 요청·응답·오류·멱등성
- **공통 규약**: `DS/[DS]hilit-DSv1.1.md` §3.1 — 🔴 **인증·오류 형식·멱등성·속도 제한**
- **배분 원칙**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` §5.1 — Server Action / Route Handler
- **공통 규약(스택)**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` §5.2
- **업로드 시퀀스**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` §5.3 · **추론 시퀀스**: §7.4
- **엔드포인트 목록**: `SRS/[SRS]hilit-SRSv1.8.md` §6.1 · **비즈니스 규칙**: §6.3
- **결과 타입**: `tasks/CT-006_APISpec_TrackingProvider.md` — `TrackingResult`
- **상태 전이**: `SRS/[SRS]hilit-SRSv1.8.md` §7.2 (편집 파이프라인 6단계)
- 오류·재시도: `SRS/[SRS]hilit-SRSv1.8.md` REQ-NF-008

## ✅ Task Breakdown (실행 계획)

### A. Server Action 계약
- [ ] `lib/contracts/` 디렉터리 구성 — 도메인별 파일 분리
- [ ] **Zod 입력 스키마 작성** — 상태 변경 Action 전량
- [ ] **반환 타입 정의** — 🔴 예외를 던지지 않고 `{ok:true, data} | {ok:false, code, message}` 판별 유니온
- [ ] **오류 코드 열거형** — DS §3.1.2의 상태 코드 대응표를 코드로
- [ ] 🔴 **권한 없음은 `404` 계열로 통일** — `403`을 쓰지 않는다
- [ ] `Idempotency-Key` 를 받는 Action 식별 및 인자 추가
- [ ] 타입 전용 export barrel 구성 — 클라이언트에서 서버 코드가 딸려오지 않게
- [ ] 🔴 **`getActiveJob()` · `resumeEditing(jobId)` 계약 추가** *(v3.2 · F29)* — 🔴 `getActiveJob` 의 `null` 은 오류가 아니다
- [ ] 🔴 **`ActiveJob` 타입에 통합 퍼센트 필드를 두지 않는다** *(v3.2)* — 분자·분모만. 필드를 만들면 누군가 채운다(Q22)

### B. Webhook 계약 *(← CT-005)*
- [ ] `POST /api/webhooks/storage` — **업로드 완료 통지** 계약
- [ ] `POST /api/webhooks/inference` — **추론 결과 수신** 계약
- [ ] 🔴 **서명 검증 방식 정의** — 발신자 진위 확인
- [ ] **멱등 처리** — 같은 이벤트가 재전송돼도 상태가 중복 전이되지 않게
- [ ] `ProcessingJob.stage` 전이 규칙 매핑
- [ ] 실패·재시도 응답 규약 — 어떤 상태 코드가 재전송을 유발하는가
- [ ] 🔺 **RLS 우회가 필요한 경로임을 명시** — CT-003의 서비스 롤 목록에 등재
- [ ] 순서 역전 처리 — 늦게 온 이벤트가 앞선 상태를 덮지 않게

### 정의할 Server Action 목록 *(SRS v2.2 §5.1)*

| 도메인 | Action | 멱등 |
| --- | --- | :--: |
| 업로드 | `createUpload(meta)` | ✅ |
| 추적 | `anchorSubject(videoId, frameMs, bbox)` · `requestDetection(videoId)` | ✅ |
| 편집 | `confirmSelection(videoId, candidateIds, musicId?)` · `registerRendered(draftId, path)` | ✅ |
| 기록 | `setVisibility(recordId, scope, groupIds?)` | 자연 멱등 |
| ~~그룹~~ | 🔴 **v3.0에서 삭제** — `createGroup` · `inviteMember` · `leaveGroup` 폐기 | — |
| 관계 | `follow(followeeId)` · `unfollow(followeeId)` | ✅ |
| 반응 | `react(recordId, type, text?)` · `report(reactionId, reason)` | ✅ |
| 공유 | `issueShareLink(recordId)` | ✅ |

### Webhook 계약 초안

| 경로 | 발신 | 페이로드 | 상태 전이 |
| --- | --- | --- | --- |
| `/api/webhooks/storage` | Supabase Storage | `{videoId, objectPath, sizeBytes}` | `UPLOADING → UPLOADED` |
| `/api/webhooks/inference` | 추론 API | `TrackingResult` *(CT-006)* | `DETECTING → SELECTION_READY` 또는 `FAILED` |

### 조회는 RSC 직접 조회 *(Action 아님)*

`getCandidates` · `getRecords` · `getProfile` · `getGroupMembers` · `getFeed` — **타입만 정의하고 구현은 Wave 3**

## 🧪 Acceptance Criteria (BDD/GWT)

**Scenario 1: 권한 없는 자원 접근이 존재를 노출하지 않는다** *(REQ-NF-009)*
- **Given**: 타인의 비공개 기록 ID가 주어짐
- **When**: 해당 기록을 조회·변경하는 Action을 호출함
- **Then**: `403`이 아니라 **`404` 계열 코드**를 반환한다. 🔴 **`403`은 *"그 자원은 있는데 당신은 못 본다"* 를 알려주므로 REQ-NF-009 위반이다**

**Scenario 2: 오류가 예외가 아니라 값으로 전달된다**
- **Given**: 검증에 실패하는 입력이 주어짐
- **When**: Server Action을 호출함
- **Then**: 예외를 던지지 않고 `{ok:false, code, message}` 를 반환한다. 클라이언트가 `ok` 로 분기할 수 있다

**Scenario 3: 동일 멱등 키의 재요청이 최초 응답을 재생한다**
- **Given**: 이미 처리된 `Idempotency-Key` 가 주어짐
- **When**: 같은 키로 동일 Action을 재호출함
- **Then**: 새 자원을 만들지 않고 **최초 응답을 그대로 반환**한다 (24시간 이내)

**Scenario 4: 미지원 코덱이 업로드 개시 전에 걸러진다** *(SC-1.F1)*
- **Given**: 지원 목록에 없는 코덱 메타가 주어짐
- **When**: `createUpload(meta)` 를 호출함
- **Then**: `CODEC_UNSUPPORTED` 를 반환하고 **Signed URL을 발급하지 않는다.** 🔴 **바이트가 한 번도 전송되지 않아야 한다**

**Scenario 5: 입력 검증이 Action 첫 줄에서 일어난다**
- **Given**: 타입은 맞으나 범위를 벗어난 입력 (예: 정규화 bbox가 0~1 밖)
- **When**: Action을 호출함
- **Then**: Zod 파싱 단계에서 `VALIDATION_FAILED` 를 반환하고 **DB에 도달하지 않는다**

**Scenario 6: 등장 구간 0건이 촬영 실패로 분류된다** *(SC-1.F2)*
- **Given**: `intervals` 가 빈 배열인 추론 결과
- **When**: webhook 계약으로 수신함
- **Then**: `failure_class = CAPTURE` 로 규정된다. 🔴 **`INFRA` 로 분류하면 인프라 실패율 지표가 오염된다**

**Scenario 7: 서명이 없거나 틀린 요청이 거부된다**
- **Given**: 서명 헤더가 없거나 조작된 요청
- **When**: webhook 엔드포인트를 호출함
- **Then**: `401` 을 반환하고 **상태를 전이시키지 않는다**

**Scenario 8: 재전송과 순서 역전이 상태를 훼손하지 않는다**
- **Given**: 이미 처리된 이벤트의 재전송 / 이미 `RENDERING` 인 작업에 지연된 `SELECTION_READY`
- **When**: 수신함
- **Then**: 전자는 `200` 을 반환하되 중복 전이·중복 삽입이 없고, 후자는 **무시된다** — §7.2의 순서를 역행하지 않는다

**Scenario 9 (실패): 타입 정의가 클라이언트 번들에 서버 코드를 끌고 오지 않는다**
- **Given**: 클라이언트 컴포넌트가 계약 타입을 import 함
- **When**: 프로덕션 빌드를 수행함
- **Then**: 번들에 Prisma·서버 전용 모듈이 포함되지 않는다 — `import type` 경계가 지켜진다

## ⚙️ Technical & Non-Functional Constraints
- **검증**: Zod — Server Action **첫 줄에서 파싱**
- **오류 형식**: `{ error: { code, message, detail?, traceId } }` *(DS §3.1.2)*
- **상태 코드 대응**: `400` 검증 · `401` 미인증 · **`404` 없음 또는 권한 없음** · `409` 상태 충돌 · `413` 크기 초과 · `415` 코덱 · `429` 속도 제한 · `503` 큐 포화
- **인증**: Supabase Auth 세션 → `auth.uid()`
- **속도 제한**: 분당 60건 · **업로드 개시는 분당 3건** `[PROPOSED]`
- **Webhook 응답은 빠르게** — 수신 즉시 `202` 를 반환하고 무거운 처리는 하지 않는다 *(A-T1)*
- **재전송 유발 규약** — `5xx` 는 재전송 유도, `4xx` 는 재전송 금지
- 🔴 **Webhook은 서비스 롤 사용** — 사용자 세션이 없으므로 RLS를 우회한다. **CT-003의 목록에 반드시 등재**
- 🔺 **속도 제한 구현 방식 미확정** — 미들웨어 vs DB 카운터 *(DS §9-3)*

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **DS §3.2의 23개 엔드포인트가 전부 타입으로 존재하는가?** *(누락 0건)*
- [ ] 🔴 **서명 검증이 webhook 두 경로 모두에 규정되었는가?**
- [ ] 오류 코드가 열거형으로 정의되고 문자열 리터럴이 흩어져 있지 않은가?
- [ ] 멱등·순서 역전 규약이 webhook 계약에 있는가?
- [ ] 🔺 **RLS 우회 경로가 CT-003 목록에 등재되었는가?**
- [ ] webhook 타입이 CT-006의 `TrackingResult` 와 일치하는가?
- [ ] 타입 테스트가 추가되었는가? *(잘못된 인자가 컴파일 오류로 걸리는지)*
- [ ] 🔺 **`403`을 반환하는 경로가 하나도 없는가?**
- [ ] ESLint · TypeScript strict 경고가 없는가?

## 🚧 Dependencies & Blockers
- **Depends on**: **CT-001**(스키마) · **CT-006**(`TrackingResult` 형태)
- **Blocks**: **CT-007**(Mock) · **FR-001**(업로드) · **FR-005**(탐지 왕복) · Step 2 전량
- 🔺 **미결**: 속도 제한 구현 방식 *(DS §9-3)* — 여기서는 **인터페이스만** 정하고 구현은 NF-008
