---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Command] FR-001: 업로드 파이프라인 — 20분 상한 · 코덱 사전 검증 · 직접 업로드 · 완료 수신"
labels: 'backend, command, media-ingest, priority:critical, step-2'
assignees: ''
---

> ### 🔄 SRS v3.0 반영 — 이 태스크에서 바뀐 것 *(2026-09-01)*
> **20분 상한 도입** — `CHECK (duration_sec <= 1200)` · 🔴 **AF-10**: 20분 초과 원본은 **업로드 전에 거부하고 분할 지점을 제안**한다(`DURATION_EXCEEDED` + `suggestSplitAt`) · `retainUntil = 업로드 + 7일` 설정(F27) 추가.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0** · `PRD/HILiT_PRD_v0_2.md`

> ### 🔴 SRS v3.3 — 무료 편집 편수가 주기에 따라 달라진다 *(2026-09-02)*
> PRD **v0.4**: 무료 편집 한도가 **가입 첫 달 5회 · 이후 월 2회**로 바뀌었다(회당 20분은 그대로). 🔴 **이 태스크는 값이 아니라 *읽는 법*이 바뀐다.**
>
> 🔴 **`PLANS.FREE.edits`(=2)를 직접 읽으면 첫 달 혜택이 통째로 사라진다.** 편수는 반드시 **`editQuota(plan, isFirstCycle)`**(CT-010) 또는 **`canConsume('EDIT')`**(FR-042)를 거쳐 얻는다.
>
> 🔺 **`maxDurationSec = 1200`(20분)은 변하지 않는다** — AF-10·`DURATION_EXCEEDED` 경로는 그대로다.
>
> 🔺 **업로드 화면에서 수동 트래킹 잔여도 함께 보여야 한다**(UX-012) — *"5편 올렸는데 트래킹은 1편뿐"* 을 업로드가 끝난 뒤에 알게 하지 않는다.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.3 §4.3** · `PRD/HILiT_PRD_v0_2.md` **v0.4** AC7-1

> 🔀 **FR-002(직접 업로드 세션) · FR-003(완료 Webhook)을 흡수했다** *(축약 2026-08-30)* — **개시 → 전송 → 완료 수신이 하나의 왕복**이고 FR-003은 상태 전이만 하는 L이었다. 두 ID는 폐번이며 이 문서를 가리킨다.

## 🎯 Summary
- 기능명: **[FR-001] 4GB 원본을 서버를 거치지 않고 안전하게 올린다**
- 목적: **처리할 수 없는 원본에 전송·GPU 비용을 쓰지 않고, 올린 것은 유실 없이 확정한다.**

> 🔴 **이 태스크의 가치는 앞부분에서 "시작하지 않는 것"에 있다.**
>
> 웹 스택 전환(v2.2 §5.3)으로 코덱 판정이 **Signed URL 발급 전**으로 앞당겨졌다. 그 결과 미지원 코덱일 때 **바이트가 단 한 번도 전송되지 않는다** — 원래 요구(SC-1.F1)의 *"GPU 작업 0건"* 보다 강한 상태다.
>
> 🔴 **그리고 뒷부분의 절반은 "만들지 않는 것"이다.** v2.2 §5.3은 *"중단 시 같은 URL로 재개 · **서버 재개 로직 없음**"* 이라고 명시했다. 이어올리기는 **Storage의 resumable 프로토콜이 수행**한다. 서버가 청크 오프셋을 추적하면 **A-T1에 걸리고 Storage와 상태가 갈라진다.**

### 🔴 왜 클라이언트의 "다 올렸어요"를 믿지 않는가

업로드는 클라이언트가 Storage로 **직접** 하므로, 클라이언트의 완료 보고는 **서버가 검증할 수 없는 주장**이다. 브라우저 탭이 닫히면 보고 자체가 오지 않는다. **Storage가 보내는 통지만이 실제로 바이트가 도착했다는 증거다.**

## 🔗 References (Spec & Context)
> 💡 AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- **요구사항**: `SRS/[SRS]hilit-SRSv1.8.md` **REQ-FUNC-001** — 20분
- **성능**: **REQ-NF-002** — p95 ≤ 6분 · 실패율 < 0.5% · **재개 성공률 ≥ 99%** `[PROPOSED]`
- **실패 시나리오**: **SC-1.F1**(미지원 코덱 · 🔴 **GPU 작업 0건**) · **SC-1.F3**(네트워크 중단)
- **시퀀스**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` §5.3 — 🔴 **Route Handler를 우회하는 이유(A-T2) · 서버 재개 로직 없음**
- **원본 시퀀스**: `SRS/[SRS]hilit-SRSv1.8.md` §6.3.1
- **API 계약**: `tasks/CT-004_APISpec_API계약.md` — `createUpload` · webhook 2종 · 판별 유니온
- **RLS 우회**: `tasks/CT-003_DB_RLS정책.md` — 🔴 **webhook은 서비스 롤 경로**
- **데이터**: `SRS/[SRS]hilit-SRSv1.8.md` §6.2 `SourceVideo` · 상태 `UPLOADING`
- 계측: §6.4.3 — `upload_rejected` · `upload_started` · `upload_failed` · `upload_resumed` · `upload_completed`
- 🔴 **편수 한도**: `tasks_2/FR-042_Billing_요금제사용량.md` · `tasks_2/CT-010_Config_요금제파라미터.md` — 🔴 **`editQuota()` 경유**

## ✅ Task Breakdown (실행 계획)

### A. 개시 및 코덱 검증
- [ ] Server Action **`createUpload({ codec, sizeBytes, durationSec })`** — CT-004 시그니처 준수
- [ ] **코덱 허용 목록 검증** — 🔺 목록 자체는 SP-3 결과에 종속(§제약)
- [ ] 🔴 **미지원 시 즉시 반환** — `{ ok:false, code:'CODEC_UNSUPPORTED' }` + **변환 방법 안내 문구**
- [ ] 지원 시 `source_videos` INSERT — `status = UPLOADING`
- [ ] **Supabase Storage Signed Upload URL 발급** (resumable)
- [ ] 속도 제한 적용 — **업로드 개시 분당 3회** (DS §3.1.3)
- [ ] 🔴 **편수 한도 사전 확인 `canConsume('EDIT')`**(FR-042) — 🔴 **Signed URL 발급 전에** 판정한다. 4GB를 다 올린 뒤 막으면 이 태스크의 설계 의도("시작하지 않는 것")가 무너진다
- [ ] 🔴 **한도는 `editQuota(plan, isFirstCycle)` 경유** — `PLANS.FREE.edits` 직접 읽기 금지(**첫 달 5회가 조용히 2회가 된다**)
- [ ] 🔴 **초과 시 `QUOTA_EXCEEDED` + `freePathAvailable:true`** — 코덱 거부(`CODEC_UNSUPPORTED`)와 **같은 자리에서** 반환한다

### B. 직접 업로드 세션 *(← FR-002)*
- [ ] **resumable 업로드 프로토콜 채택 확인** — Storage가 제공하는 방식을 그대로 쓴다
- [ ] **세션 상태 조회** Query — 재진입 시 진행 상태 반환
- [ ] **Signed URL 재발급** 경로 — 만료 시 같은 `videoId` 에 대해
- [ ] 🔴 **동일 `videoId` 재업로드 방지** — 이미 `UPLOADED` 인 대상에 새 세션을 열지 않는다
- [ ] **중단 세션 정리** — 미완료 세션과 부분 객체 회수 *(FR-028의 Cron에 합류 검토)*
- [ ] 🔺 **재개 성공률 산식 정의** — 분모·분자를 문서로 고정(§제약)

### C. 완료 Webhook 수신 *(← FR-003)*
- [ ] Route Handler **`POST /api/webhooks/storage`**
- [ ] 🔴 **서명 검증** — 처리 전에 거부
- [ ] **실제 객체 존재·크기 확인** — 통지만 믿지 않고 대조
- [ ] 상태 전이 `UPLOADING → UPLOADED`
- [ ] 🔴 **멱등 처리 · 순서 역전 방어**
- [ ] 재시도 유발 응답 규약 — 5xx 재전송 유도 · 4xx 재전송 금지

## 🧪 Acceptance Criteria (BDD/GWT)

**Scenario 1: 미지원 코덱은 바이트 전송 없이 거부된다** *(SC-1.F1)*
- **Given**: 허용 목록에 없는 코덱의 원본
- **When**: `createUpload` 를 호출함
- **Then**: 🔴 **Signed URL이 발급되지 않는다.** 수신 바이트 **0** · 추론 호출 **0** · `upload_rejected` 1건

**Scenario 2: 거부가 막다른 길로 끝나지 않는다** *(SC-1.F1)*
- **Given**: 코덱 거부 응답
- **When**: 응답 본문을 확인함
- **Then**: **변환 방법 안내**가 포함된다. 🔴 *"지원하지 않습니다"* 만 반환하면 사용자가 다음에 할 일이 없다

**Scenario 3: 요청 본문이 A-T2 상한을 넘지 않는다**
- **Given**: 4GB 원본
- **When**: `createUpload` 요청 본문 크기를 측정함
- **Then**: 🔴 **메타데이터만 전송**된다. 파일 자체는 이 경로로 흐르지 않는다

**Scenario 4: 중단 후 같은 URL로 재개된다** *(SC-1.F3)*
- **Given**: 2GB 전송 중 네트워크가 끊김
- **When**: 앱을 재실행하고 재개함
- **Then**: 🔴 **처음부터 다시 올리지 않는다.** 중단 지점부터 이어지고 `upload_resumed` 가 발행된다

**Scenario 5: 서버에 재개 로직이 없다** *(v2.2 §5.3)*
- **Given**: 구현 코드 전체
- **When**: 청크 오프셋을 서버가 추적하는 코드를 찾음
- **Then**: 🔴 **존재하지 않는다.** 오프셋의 진실 원천은 Storage 하나뿐이다

**Scenario 6: 재개 성공률과 p95가 측정 가능하다** *(REQ-NF-002)*
- **Given**: `upload_started` · `upload_failed` · `upload_resumed` · `upload_completed`
- **When**: 집계함
- **Then**: **분모·분자가 이벤트만으로 산출**된다. 🔺 **6분·99%는 `[PROPOSED]` 이므로 이 태스크는 달성이 아니라 측정 가능성까지 책임진다**

**Scenario 7: 완료 통지가 상태를 전이시킨다**
- **Given**: `status = UPLOADING` 인 원본
- **When**: Storage가 완료 webhook을 보냄
- **Then**: `status = UPLOADED` 로 전이되고 다음 단계 진입이 가능해진다

**Scenario 8: 서명이 없거나 틀리면 처리하지 않는다**
- **Given**: 서명이 위조된 요청
- **When**: 엔드포인트를 호출함
- **Then**: 🔴 **상태가 바뀌지 않는다.** 이 경로는 인증된 사용자 세션이 없으므로 **서명이 유일한 방어선이다**

**Scenario 9: 재전송·순서 역전이 상태를 훼손하지 않는다**
- **Given**: 이미 처리된 이벤트의 재전송 / 이미 `DETECTING` 인 원본에 지연된 `UPLOADED` 통지
- **When**: 수신함
- **Then**: 🔴 **전자는 상태 변화 없이 성공 응답**(실패로 응답하면 무한 재전송) · **후자는 되돌아가지 않는다**(되돌아가면 탐지가 다시 걸린다)

**Scenario 10: 통지와 실제 객체가 다르면 완료로 보지 않는다**
- **Given**: 통지의 `sizeBytes` 와 실제 객체 크기가 불일치
- **When**: 검증을 수행함
- **Then**: `UPLOADED` 로 전이하지 않고 **실패로 기록**한다

**Scenario 11: 이미 완료된 대상에 새 세션이 열리지 않는다**
- **Given**: `status = UPLOADED` 인 `videoId`
- **When**: 세션 발급을 재요청함
- **Then**: 🔴 **거부된다.** 완료된 원본을 덮어쓰면 이미 생성된 기록의 근거가 바뀐다

**Scenario 12 (실패): 브라우저를 닫아도 업로드가 완료된다**
- **Given**: 전송이 Storage에 완료된 직후 탭을 닫음
- **When**: 사용자가 나중에 앱을 다시 엶
- **Then**: 🔴 **`UPLOADED` 상태로 이어진다.** 클라이언트 보고에 의존했다면 유실됐을 사례다

## ⚙️ Technical & Non-Functional Constraints
- 🔴 **A-T1 · A-T2가 이 설계의 원인** — 서버를 경유하면 4GB가 함수를 통과할 수 없고, 실행 시간 상한 안에 끝나지도 않는다
- 🔴 **Webhook은 RLS 우회 경로** — 서비스 롤로 동작한다. **CT-003의 우회 목록에 반드시 등재**
- 🔴 **Handler 안에서 무거운 작업을 하지 않는다** — 상태 전이만 하고 **탐지 요청(FR-005)은 분리**
- 🔺 **지원 코덱 목록은 `[TBD]`** — **SP-3이 디코딩 가능 범위를 확정한 뒤** 채운다. 그 전에는 **검증 지점만 만들고 목록은 설정값으로 분리**
- 🔺 **재개 성공률 산식을 먼저 정한다** — *"중단 건 중 최종 완료 비율"* 인지 *"재개 시도 중 성공 비율"* 인지에 따라 값이 달라진다. **정의 없이 99%를 판정할 수 없다**
- **`durationSec` 은 클라이언트 추출값** — 신뢰할 수 없으므로 이후 단계에서 실제 값과 대조
- 계측: `upload_rejected` 에 **거부 코덱명**, `upload_failed` 에 **전송 바이트**를 담는다
- 정리 배치 주기 `[TBD]` — 보관 정책(§6.2.3)과 함께 정한다

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **거부 경로에서 수신 바이트가 0인가?** *(측정으로 확인)*
- [ ] 🔴 **거부 응답에 변환 안내가 있는가?**
- [ ] 🔴 **서버에 청크 오프셋 추적 코드가 없는가?**
- [ ] 🔴 **재개 성공률 산식이 문서로 고정되었는가?**
- [ ] 🔴 **서명 검증이 처리보다 먼저 일어나는가?**
- [ ] 🔴 **멱등성과 순서 역전 방어가 둘 다 있는가?**
- [ ] 코덱 목록이 **설정값으로 분리**되어 SP-3 후 코드 변경 없이 갱신되는가?
- [ ] 계측 5종이 발행되는가?
- [ ] CT-003의 **서비스 롤 우회 경로 목록에 등재**되었는가?
- [ ] 미완료 세션 정리가 동작하는가?
- [ ] TypeScript strict · ESLint 경고 0건인가?

## 🚧 Dependencies & Blockers
- **Depends on**: **CT-001**(스키마) · **CT-004**(Action·Webhook 계약)
- **Blocks**: **FR-005**(탐지 요청) · **FE-002** · **TS-007**
- 🔺 **부분 차단**: **SP-3** — 코덱 목록 확정. **구현은 지금 가능**하고 목록만 나중에 채운다
- **연관**: **NF-001**(응답시간 계측 하니스)이 REQ-NF-002의 최종 판정자다
