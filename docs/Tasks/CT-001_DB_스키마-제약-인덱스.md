---
name: Contract Task
about: 다른 태스크가 의존하는 계약을 먼저 확정하는 태스크
title: "[DB] CT-001: Prisma 스키마 21 엔티티 · 열거형 10종 · SQL 제약 · 인덱스 (v3.0 재편)"
labels: 'database, contract, priority:critical, step-1, wave-1'
assignees: ''
---

> ### 🔄 SRS v3.0 반영 — 이 태스크에서 바뀐 것 *(2026-09-01)*
> **엔티티 재편** — `Group` 삭제 · `CutRequest`·`VideoSegment`·`RecoveryJob`·`Subtitle`·`UsageLedger` 5종 신설 · 🔴 **`PersonTrack`을 video → segment(클립) 단위로 변경** · `VisibilityScope` 2값 · `SourceVideo.retainUntil` · 열거형 재산정. **전면 재작성**.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0 §4.1** · `PRD/HILiT_PRD_v0_2.md` §6.1

> 🔀 **CT-002를 흡수했다** *(축약 2026-08-30)* — 같은 마이그레이션 파일을 만진다. `CT-002` 는 폐번이며 이 문서를 가리킨다.

## 🎯 Summary
- 기능명: **[CT-001] 파이프라인이 바뀌었으므로 데이터 모델도 바뀐다**
- 목적: **컷 → 추적 → 선택 → 완성 순서를 스키마가 그대로 표현하게 만든다.** 다른 모든 태스크가 이 스키마 위에서 돈다.

> 🔴 **이번 판의 핵심 변경은 `PersonTrack`의 소속이다.** v2.2는 `video_id`를 들고 있었다 — **원본 전체를 추적한다는 전제**였기 때문이다. v3.0에서 추적 대상은 **F25가 자른 클립**이므로 `segment_id`를 든다.
>
> **이 한 줄이 바뀌지 않으면 나머지가 전부 어긋난다** — 복구 작업의 귀속, 후보 목록의 단위, 원가 계량의 분모가 모두 클립이다.

> 🔴 **`Group`을 지우는 것은 컬럼 삭제가 아니라 정책 삭제다.** `visibility_settings.group_ids` 가 사라지면 CT-003의 RLS 정책에서 중첩 `exists` 가 통째로 빠진다. **두 태스크는 같은 마이그레이션에서 처리한다.**

> 🔴 **원가를 셀 수 있는 자리를 스키마에 만든다.** `cut_requests.cost_krw` 와 `recovery_jobs.cost_krw` 가 **PRD Q14·Q3를 푸는 유일한 계측점**이다. 나중에 붙이면 그때까지의 데이터가 없다.

> ### 🔴 SRS v3.2 추가 — `ProcessingJob` 이 F29의 유일한 원천이 된다 *(2026-09-02)*
> v3.0까지 `ProcessingJob` 은 **관계 필드로만** 존재했고 스키마 발췌에도 없었다. PRD v0.3 **F29**가 이 테이블에 두 가지를 요구한다.
>
> | 무엇 | 왜 스키마여야 하는가 |
> | --- | --- |
> | **`resume_route`** | 🔴 **복귀 지점을 클라이언트가 기억하면 안 된다.** 사용자가 피드를 보는 사이 단계가 넘어가면 옛 경로는 **한 단계 뒤로 떨어뜨린다**(SRS §5.2 정확도 100%) |
> | **`progress_num` / `progress_den`** | 🔴 **퍼센트가 아니라 분자·분모로 남긴다.** 미니바가 근거와 함께 말할 수 있고, 통합 가중치(Q22)가 정해질 때 소급 계산이 가능하다 |
>
> 🔴 **단계 전이와 `resume_route` 는 같은 트랜잭션에서 쓴다**(FR-011). 따로 쓰면 그 사이에 복귀한 사용자가 엇나간 화면으로 간다.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.2 §4.1** · `PRD/HILiT_PRD_v0_2.md` **v0.3** §6.1 · **ST-5**

## 🔗 References (Spec & Context)
> 💡 AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- **스키마 원본**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **§4.1** — Prisma 발췌 전문
- **엔티티 정의**: `PRD/HILiT_PRD_v0_2.md` **§6.1**
- **RLS**: `tasks_2/CT-003_DB_RLS정책.md` — 🔴 **같은 마이그레이션**
- **요금제 파라미터**: `tasks_2/CT-010_Config_요금제파라미터.md` — `UsageLedger` 의 소비자 · 🔴 **v0.4에서 `MANUAL_TRACK` 추가**
- **원가**: `PRD/HILiT_PRD_v0_2.md` §5.5 · **Q14**
- **DS 설계**: `[DS]hilit-DSv1.1.md` §4.2 — 속성·제약·인덱스 원천

## ✅ Task Breakdown (실행 계획)

### A. 삭제 — 그룹
- [ ] 🔴 `Group` 모델 · `GroupMember` 삭제
- [ ] 🔴 `visibility_settings.group_ids` 컬럼 삭제
- [ ] 🔴 `enum VisibilityScope` 를 **`{ public private }`** 로 축소 — PG enum 값 삭제는 재생성이 필요하다
- [ ] 마이그레이션에 **데이터 이행 규칙** 명시 — 기존 `group` 값 행은 **`private` 로 강등**한다(공개 확대 금지)

### B. 신설 — 컷 파이프라인
- [ ] `CutRequest` — `prompt` · `video_model` · `judge_model` · `status` · **`cost_krw`**
- [ ] `VideoSegment` — `cut_request_id` · `start_ms` · `end_ms` · `match_score`
- [ ] 🔴 `CHECK (end_ms > start_ms)` — 마이그레이션 SQL
- [ ] 인덱스 `(video_id, start_ms)` · `(video_id, created_at DESC)`

### C. 변경 — 추적 단위
- [ ] 🔴 `PersonTrack.video_id` → **`segment_id` (`@unique`)**
- [ ] `health_timeline` (Json) 추가 — Tracking Health 7신호 시계열
- [ ] `crop_path` (Json, nullable) 추가 — 🔴 **F5a 크롭 경로 · Cutie 단계 산출**
- [ ] `reid_score` 유지 — 🔴 **`match_score` 와 절대 같은 컬럼에 두지 않는다**
- [ ] `RecoveryJob` 신설 — `clip_start_ms` · `clip_end_ms` · `n_level` · `gpu_seconds` · **`cost_krw`**
- [ ] `HighlightCandidate.track_status` 추가 — `NORMAL` / `RECOVERED` / `LOW_CONFIDENCE`

### 🔴 C-2. 변경 — 처리 작업 *(v3.2 · F29)*
- [ ] 🔴 `ProcessingJob` 에 **`resume_route`**(VarChar 200, nullable) — 복귀 지점 · 서버가 쓴다
- [ ] 🔴 **`progress_num` · `progress_den`**(Int, nullable) — 🔴 **퍼센트를 저장하지 않는다.** 분자·분모를 남겨야 *"4/6 클립"* 처럼 근거와 함께 말할 수 있고, 통합 가중치(Q22)가 정해질 때 원자료가 남아 있다
- [ ] `notified_at`(DateTime, nullable) — 완료 알림 **도달** 시각
- [ ] `updated_at`(@updatedAt) · `failure_class`(VarChar 20) 정리
- [ ] 🔴 `enum JobStage { CUTTING TRACKING RECOVERING SELECTING RENDERING DONE }` · `enum JobStatus { RUNNING SUCCEEDED FAILED }` 신설 — v2.2의 `DETECTING` 잔재 제거(DS D-1)
- [ ] 🔴 **인덱스 `(status, updated_at DESC)`** — `getActiveJob()` 이 매 앱 진입마다 돈다. 없으면 전역 미니바가 전체 스캔을 부른다
- [ ] 🔺 **활성 작업이 사용자당 1건이라는 보장이 없다** — 🔴 **부분 UNIQUE**(`WHERE status='RUNNING'`)로 강제할지, 애플리케이션이 최신 1건만 고를지 결정. 미니바는 1건만 그린다

### D. 신설 — 완성·과금
- [ ] `Subtitle` — `start_ms` · `end_ms` · `text` · `font_key`(OFL 5종) · `style_ref`
- [ ] `MusicTrack.origin` 추가 — `LIBRARY` / `AI`
- [ ] `UsageLedger` — `kind`(EDIT/AI_MUSIC/RECOVERY/🔴 **MANUAL_TRACK**) · `amount` · **`expires_at`**
- [ ] 🔴 **`UsageKind.MANUAL_TRACK` 신설**(PRD v0.4) — 수동 트래킹이 **계측 대상에서 과금 대상**으로 바뀐다. 🔺 **무료만 소비하지만 원장은 플랜과 무관하게 기록한다** — 무제한 플랜도 사용량을 세야 Q24(계수 단위)를 나중에 판정할 수 있다
- [ ] `User.plan` 추가 — 🔴 **`FREE` / `SUBSCRIPTION` 2값**(v0.5 · `PREPAID` 폐기)
- [ ] 🔴 **`UsageLedger.settlement` 신설** — `INCLUDED`(플랜 기본 제공) / `PREPAID`(선불 구매분) / `POSTPAID`(후불 청구 대상). 🔴 **충전이 플랜이 아니라 원장 속성이 된다**
- [ ] 🔴 **`UsageLedger.billedAt` 신설** — 후불 청구 완료 시각. 🔴 **`NULL` 인 `POSTPAID` 행이 곧 미수금이다**
- [ ] 🔴 **인덱스 `(user_id, settlement, billed_at)`** — 미청구 후불분 집계용
- [ ] `SourceVideo.retain_until` 추가 + 인덱스 — F27 만료 배치용

### E. 제약 — Prisma가 표현 못 하는 것
- [ ] 🔴 `CHECK (duration_sec <= 1200)` — **20분 상한**
- [ ] `CHECK (end_ms > start_ms)` — 클립·자막 양쪽
- [ ] 🔺 **영상 1편당 `recovery_jobs` 40건 상한은 CHECK로 표현할 수 없다** — 애플리케이션(FR-045)에서 강제하고 스키마에 주석으로 남긴다
- [ ] 🔴 **모든 CHECK를 스키마 파일 주석에 남긴다** — 없으면 다음 `prisma migrate` 때 유실된다

### F. 검증
- [ ] `prisma migrate dev` → `prisma migrate diff` 로 드리프트 0 확인
- [ ] 시드 데이터로 21개 모델 CRUD 왕복
- [ ] 🔴 **PG enum 값 삭제 마이그레이션을 롤백 포함으로 리허설**

## 🧪 Acceptance Criteria (BDD/GWT)

**Scenario 1: 추적이 클립에 속한다**
- **Given**: 컷으로 만들어진 `VideoSegment` 6건
- **When**: 각 클립을 추적해 `PersonTrack` 을 저장함
- **Then**: 🔴 **`person_tracks.segment_id` 로 저장되고 `video_id` 컬럼은 존재하지 않는다.** 원본 단위 추적 궤적을 만들 수 있는 경로가 스키마에 없다

**Scenario 2: 그룹 값이 공개로 새지 않는다**
- **Given**: `scope = 'group'` 인 기존 행
- **When**: 마이그레이션을 실행함
- **Then**: 🔴 **`private` 로 강등된다.** `public` 으로 올리면 **사용자가 의도하지 않은 공개**가 발생한다 — 되돌릴 수 없는 사고다

**Scenario 3: 20분을 넘는 원본이 DB에 들어가지 않는다**
- **Given**: `duration_sec = 2400` 인 INSERT
- **When**: 실행함
- **Then**: 🔴 **CHECK 위반으로 거부된다.** 애플리케이션 검증(FR-001)이 뚫려도 DB가 막는다

**Scenario 4: 두 신뢰도가 다른 컬럼이다**
- **Given**: F25의 `match_score` 와 추적의 `reid_score`
- **When**: 스키마를 확인함
- **Then**: 🔴 **서로 다른 테이블의 다른 컬럼이다.** *"이 구간이 그 행동인가"* 와 *"이 사람이 당신인가"* 는 다른 질문이며, 섞이면 FR-012의 ConfidenceGate 판정이 조용히 틀린다

**Scenario 5: 원가를 편당으로 합산할 수 있다**
- **Given**: 영상 1편의 `cut_requests` 1건 + `recovery_jobs` N건
- **When**: 편당 원가를 조회함
- **Then**: 🔴 **한 번의 조인으로 합산된다.** PRD Q14·Q3의 실측이 이 쿼리로 나온다

**Scenario 6-b: 후불분이 만료로 사라지지 않는다** *(v0.5)*
- **Given**: `settlement = POSTPAID` · `billedAt = null` 인 행이 30일 넘게 존재
- **When**: 소멸 Cron이 돌음
- **Then**: 🔴 **만료되지 않는다.** 🔴 **만료는 `settlement = PREPAID` 인 행에만 적용한다** — 후불 행을 만료시키면 **청구 전에 채권이 사라진다**

**Scenario 6: 충전분이 만료된다**
- **Given**: `expires_at` 이 지난 `UsageLedger` 행
- **When**: 잔여량을 계산함
- **Then**: **집계에서 제외된다.** 인덱스 `(user_id, kind, expires_at)` 로 조회가 상수 시간에 가깝다

**Scenario 7: CHECK가 마이그레이션 후에도 남는다**
- **Given**: `prisma migrate dev` 재실행
- **When**: DB 제약을 조회함
- **Then**: 🔴 **CHECK 3종이 그대로 있다.** 스키마 주석 + 별도 SQL 파일이 없으면 여기서 유실된다

**Scenario 8 (실패): 그룹을 "나중에 되살릴 수 있게" 남겨두지 않는다**
- **Given**: F23이 언젠가 돌아올 가능성
- **When**: 설계를 검토함
- **Then**: 🔴 **컬럼을 주석 처리해 남기지 않는다.** 죽은 컬럼은 RLS 정책·쿼리·타입에 계속 나타나고, **되살릴 때는 어차피 새로 설계한다**

## ⚙️ Technical & Non-Functional Constraints
- 🔴 **CT-003과 같은 마이그레이션** — 컬럼 삭제와 정책 변경이 분리되면 그 사이에 정책이 없는 컬럼이 생긴다
- 🔴 **PG enum 값 삭제는 무중단이 아니다** — 새 타입 생성 → 컬럼 캐스팅 → 구 타입 삭제 3단계. 리허설 필수
- 🔴 `bbox_timeline` · `health_timeline` 은 Json — **행 수가 아니라 문서 크기가 커진다.** 클립 단위라 20분 통짜보다 작지만 상한 검토 필요 `[TBD]`
- `uuid` PK 확정 — `gen_random_uuid()` `[확정 2026-08-30]`
- 🔺 `uuid[]` 배열 컬럼이 v3.0에서 **완전히 사라졌다** — `group_ids` 가 유일한 사용처였다
- 논리/물리 삭제 분리 — `deletedAt` + `onDelete: Cascade` 병용

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **`person_tracks` 가 `segment_id` 를 들고 `video_id` 가 없는가?**
- [ ] 🔴 **`group` 관련 모델·컬럼·enum 값이 코드와 DB 어디에도 없는가?**
- [ ] 🔴 **기존 `group` 행이 `private` 로 강등되었는가?**
- [ ] 🔴 **CHECK 3종이 마이그레이션 SQL과 스키마 주석 양쪽에 있는가?**
- [ ] `cost_krw` 가 컷·복구 양쪽에 있는가?
- [ ] `crop_path` 가 `PersonTrack` 에 있는가? *(F5a가 Cutie 단계 산출물임을 스키마가 말하는가)*
- [ ] enum 10종이 SRS §4.1과 일치하는가?
- [ ] 롤백 마이그레이션이 리허설되었는가?

## 🚧 Dependencies & Blockers
- **Depends on**: 없음 — **Wave 1 최선두**
- **Blocks**: 🔴 **거의 전부** — CT-003 · CT-004 · CT-010 · FR-001 · FR-005 · FR-037 · FR-041 · FR-042 · FR-044 · FR-045
- **연관**: `[DS]hilit-DSv1.1.md` §4.2 갱신 필요 — 🔺 **DS도 그룹을 들고 있다**
