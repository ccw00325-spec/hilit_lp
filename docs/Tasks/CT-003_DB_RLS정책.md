---
name: Contract Task
about: 다른 태스크가 의존하는 계약을 먼저 확정하는 태스크
title: "[DB] CT-003: RLS 정책 — 공개범위 2단(Public/Private) 서버 강제"
labels: 'database, security, contract, priority:critical, step-1'
assignees: ''
---

> ### 🔄 SRS v3.0 반영 — 이 태스크에서 바뀐 것 *(2026-09-01)*
> **RLS 정책이 한 줄로 줄었다** — `group_members` 중첩 `exists` 삭제 · `scope = 'public'` 단일 판정. 검증 표면이 작아진 만큼 **우회 테스트도 재작성**한다. **전면 재작성**.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0 §4.2** · `PRD/HILiT_PRD_v0_2.md` F8

## 🎯 Summary
- 기능명: **[CT-003] 공개 범위를 애플리케이션이 아니라 DB가 강제한다**
- 목적: **REQ-NF-009(우회 성공 0건 · 건수·존재 유추 금지)를 개발자 실수와 무관하게 성립시킨다.**

> 🔴 **정책이 짧아진 것은 이득이지 손해가 아니다.** v2.2의 정책은 `group_members` 조인과 `left_at is null` 조건을 안고 있었다. **조건이 하나 줄면 틀릴 자리도 하나 준다** — 보안 요구사항에서 검증 표면 축소는 그 자체로 성과다.
>
> ```sql
> -- v3.0
> create policy record_read on records for select using (
>   owner_id = auth.uid()
>   or exists (select 1 from visibility_settings v
>              where v.record_id = records.id and v.scope = 'public')
> );
> ```

> 🔴 **그래도 검증은 줄이지 않는다.** 정책이 단순해졌다는 이유로 우회 테스트를 줄이면, **줄어든 것은 위험이 아니라 관측**이다. 시나리오 수는 유지하고 대상만 바꾼다.

> 🔴 **RLS는 로그를 남기지 않는다.** REQ-NF-009의 *"감사 로그 100%"* 는 이 정책이 만족시키지 못한다 — SRS §9-4의 미해결 항목이며 **이 태스크의 범위 밖임을 명시**한다.

## 🔗 References (Spec & Context)
> 💡 AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- **정책 원본**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **§4.2**
- **요구사항**: `SRS/[SRS]hilit-SRSv1.8.md` **REQ-NF-009** — 우회 0건 · **건수·존재 유추 정보 반환 금지**
- **스키마**: `tasks_2/CT-001_DB_스키마-제약-인덱스.md` — 🔴 **같은 마이그레이션**
- **이중 뷰**: `tasks_2/FR-032_Query_마이페이지기록목록.md` — SC-4.4(개수에도 미포함)
- **미해결**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` §9-4 — 감사 로그

## ✅ Task Breakdown (실행 계획)
- [ ] `alter table records enable row level security;`
- [ ] 🔴 **`record_read` 정책 재작성** — `owner_id = auth.uid()` **or** `scope = 'public'`
- [ ] 🔴 **`group_members` 참조 전면 삭제** — 정책·뷰·함수 어디에도 남기지 않는다
- [ ] `reactions` · `subtitles` 등 **파생 테이블 정책**을 `records` 가시성에 종속시킴
- [ ] 🔴 **RLS 우회 경로 목록 작성** — `service_role` 을 쓰는 곳(Webhook Route Handler · Cron)을 **명시적으로 등재**하고 각각 사유를 적는다
- [ ] 우회 테스트 스위트 — 아래 시나리오 전부
- [ ] 🔺 **감사 로그는 범위 밖임을 문서에 명시** (§9-4)

## 🧪 Acceptance Criteria (BDD/GWT)

**Scenario 1: 타인의 Private 기록이 조회되지 않는다**
- **Given**: 사용자 B의 `scope = 'private'` 기록
- **When**: 사용자 A가 조작된 요청으로 직접 조회함
- **Then**: 🔴 **빈 결과.** 애플리케이션이 `404` 로 처리한다 — `403` 은 존재를 알려주므로 쓰지 않는다

**Scenario 2: 개수에도 포함되지 않는다** *(SC-4.4)*
- **Given**: 사용자 B의 기록 10건 중 3건만 `public`
- **When**: 사용자 A가 B의 프로필에서 `count(*)` 를 수행함
- **Then**: 🔴 **3이 나온다.** 정책 미통과 행은 결과 집합에 없으므로 집계도 자동으로 걸러진다 — **개발자가 실수할 여지가 없다**

**Scenario 3: 그룹 조건이 남아 있지 않다**
- **Given**: 정책 정의 전체
- **When**: `group` 문자열을 검색함
- **Then**: 🔴 **0건.** 죽은 조건이 남으면 다음 사람이 그룹이 살아 있다고 오해한다

**Scenario 4: Public → Private 되돌림이 즉시 반영된다** *(AF-7)*
- **Given**: `public` 이던 기록을 `private` 으로 변경
- **When**: 이전에 조회 가능했던 사용자가 다시 조회함
- **Then**: 🔴 **즉시 빈 결과.** 캐시 계층이 있다면 **무효화가 같은 트랜잭션에 묶여야 한다**

**Scenario 5: 소유자는 항상 본다**
- **Given**: 자신의 `private` 기록
- **When**: 소유자가 조회함
- **Then**: 정상 반환된다. **기록은 공개와 무관하게 존재한다**(D4)

**Scenario 6: 새 조회 경로가 자동으로 보호된다**
- **Given**: 정책 적용 후 추가된 새로운 쿼리 경로 하나
- **When**: 그 경로로 타인의 `private` 기록을 조회함
- **Then**: 🔴 **정책이 걸러낸다.** **이것이 애플리케이션 필터링 대신 RLS를 쓰는 유일한 이유다**

**Scenario 7: 우회 경로가 문서화되어 있다**
- **Given**: `service_role` 키를 쓰는 Route Handler·Cron
- **When**: 우회 목록을 확인함
- **Then**: 🔴 **전부 등재되어 있고 각각 사유가 있다.** 등재되지 않은 우회는 리뷰에서 차단한다

**Scenario 8 (실패): 정책이 단순해졌다고 테스트를 줄이지 않는다**
- **Given**: 조건이 하나로 줄어든 정책
- **When**: 테스트 범위를 검토함
- **Then**: 🔴 **시나리오 수를 유지한다.** 줄어든 것은 위험이 아니라 코드이며, **관측을 줄이면 위험은 그대로 남고 보이지만 않는다**

## ⚙️ Technical & Non-Functional Constraints
- 🔴 **CT-001과 같은 마이그레이션** — `group_ids` 컬럼 삭제와 정책 변경 사이에 틈이 생기면 안 된다
- 🔴 **Server Action 계층 필터링을 병행하지 않는다** — 두 곳에 두면 어느 쪽이 진짜인지 흐려진다. **DB가 유일한 강제 지점**
- 🔴 **`403` 금지 · `404` 사용** — 자원의 존재를 노출하지 않는다(DS §3.1.1)
- 🔺 **감사 로그는 이 태스크가 만족시키지 못한다** — SRS §9-4 별도 설계
- 🔺 성능 — `visibility_settings` 조인이 매 조회에 붙는다. `(record_id, scope)` 인덱스 필요

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **정책에 `group` 문자열이 0건인가?**
- [ ] 🔴 **개수 유추 테스트(Scenario 2)가 통과하는가?**
- [ ] 🔴 **우회 경로 목록이 작성되고 각각 사유가 있는가?**
- [ ] CT-001과 같은 마이그레이션에 들어갔는가?
- [ ] 애플리케이션 계층에 중복 필터링이 없는가?
- [ ] 감사 로그 미충족이 문서에 명시되었는가?

## 🚧 Dependencies & Blockers
- **Depends on**: **CT-001**(스키마) — 🔴 **동일 마이그레이션**
- **Blocks**: **FR-019** · **FR-020** · **FR-026** · **FR-027** · **FR-028** · **FR-032**(소유자·타인 두 뷰)
- **게이트**: `FACE_CONSENT` · `MINOR_SUBJECT` 가 공개 발행을 차단한다 — 정책은 있어도 기능이 빌드에 없을 수 있다
