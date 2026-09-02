---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Command] FR-020: 공개 범위 변경 (Public/Private 2단 · 기본값 private · 링크 회수)"
labels: 'backend, command, record, priority:critical, step-2, blocked-by-legal'
assignees: ''
---

> ### 🔄 SRS v3.0 반영 — 이 태스크에서 바뀐 것 *(2026-09-01)*
> **2단 전환** — `setVisibility(recordId, scope)` — 🔴 **`groupIds` 인자 삭제**. 전환 테스트가 3×2에서 **2×1**로 줄고, 🔴 **Public → Private 되돌림 시 공유 링크 즉시 회수**(PRD AF-7)가 이 태스크의 새 책임이다.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0** · `PRD/HILiT_PRD_v0_2.md`

## 🎯 Summary
- 기능명: **[FR-020] 기록마다 누구에게 보일지 정한다**
- 목적: **공개를 선택지로 만든다. 기본이 아니라.**

> 🔴 **이 태스크는 두 개의 법무 게이트가 막고 있다.**
>
> | 게이트 | 차단 대상 | 근거 |
> | --- | --- | --- |
> | **NF-017** 얼굴 정보 4종 | `PUBLIC_PUBLISH` · `GROUP_PUBLISH` | REQ-NF-010 |
> | **NF-018** 영상 내 미성년자 3종 | 동일 | REQ-NF-017 |
>
> 🟢 **그러나 `private` 유지는 막히지 않는다.** 게이트 미승인 상태에서도 **기록을 만들고 나만 보는 것은 가능**하다 — **D4가 법무 게이트와 독립적으로 성립하도록 설계된 결과다.**

## 🔗 References (Spec & Context)
> 💡 AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- **요구사항**: `SRS/[SRS]hilit-SRSv1.8.md` **REQ-FUNC-010** — 3단 · 🔴 **기본값 나만 보기** · **글자 배지** · 사후 변경 가능
- **ADR-4**: `SRS/[SRS]hilit-SRSv1.8.md` §1.5.2 — 🔴 **확정** *(프로토타입 v0.6이 확정한 사항)*
- **보안**: `SRS/[SRS]hilit-SRSv1.8.md` **REQ-NF-009** — 🔴 **서버 강제 · 우회 0건 · 건수 유추 금지**
- **시나리오**: **SC-4.2**(월말 비공개 비율) · **SC-4.3**(배지) · **SC-4.4**(타인 프로필) · **SC-4.F1**(우회 차단)
- **RLS**: `tasks/CT-003_DB_RLS정책.md` · `SRS/[SRS]hilit-SRSv2.0-nextjs.md` §4.2
- **게이트**: `tasks/NF-017_Legal_얼굴정보처리.md` · `tasks/NF-018_Legal_영상내미성년자.md`
- **미성년 이용자 추가 확인**: `SRS/[SRS]hilit-SRSv1.8.md` **REQ-NF-016 ②**
- 검증: `SRS/[SRS]hilit-SRSv1.8.md` §5.3 **TC-ADR-04**

## ✅ Task Breakdown (실행 계획)
- [ ] Server Action **`setVisibility({ recordId, visibility })`** — 3단 열거형
- [ ] 🔴 **기본값을 바꾸지 않는다** — 미선택은 `private` 유지
- [ ] 소유권 검증 — RLS + 애플리케이션 이중
- [ ] 🔴 **미성년 이용자의 전체공개 전환 시 추가 확인** — REQ-NF-016 ②
- [ ] 🔴 **게이트 연동** — 미승인 시 공개 전환 경로가 빌드에 없다
- [ ] 사후 변경 지원 — 마이페이지에서 언제든
- [ ] **공개 → 비공개 전환 시 파생 상태 정리** — 공유 링크 · 반응
- [ ] 계측 — `visibility_changed`(**이전 값 · 이후 값**)

## 🧪 Acceptance Criteria (BDD/GWT)

**Scenario 1: 미선택은 나만 보기다** *(ADR-4 · SC-4.1)*
- **Given**: 공개 범위를 정하지 않은 기록
- **When**: 상태를 확인함
- **Then**: 🔴 **`private` 이다.** 편의를 위해 *"마지막에 고른 범위를 기억"* 하는 구현은 **ADR-4 위반**이다

**Scenario 2: 배지가 영상을 가리지 않는다** *(REQ-FUNC-010 · ADR-4)*
- **Given**: 기록 목록
- **When**: 공개 범위 표시를 확인함
- **Then**: 🔴 **글자 배지이며 영상을 가리지 않는다.** 프로토타입 v0.6이 확정한 형태다

**Scenario 3: 서버가 강제한다** *(REQ-NF-009 · SC-4.F1)*
- **Given**: 조작된 요청으로 타인의 비공개 기록에 접근
- **When**: 요청을 보냄
- **Then**: 🔴 **우회 성공 0건.** 클라이언트 필터링이 아니라 **RLS가 막는다**

**Scenario 4: 비공개는 개수에도 잡히지 않는다** *(SC-4.4 · REQ-NF-009)*
- **Given**: 타인의 프로필에 비공개 기록 5건이 있음
- **When**: 프로필을 조회함
- **Then**: 🔴 **기록 수에 포함되지 않는다.** **RLS는 `count(*)` 도 필터하므로 구조적으로 해결**된다 — 애플리케이션에서 세면 반드시 새어나간다

**Scenario 5: 사후에 바꿀 수 있다** *(REQ-FUNC-010)*
- **Given**: 이미 전체공개로 발행한 기록
- **When**: 마이페이지에서 나만 보기로 바꿈
- **Then**: 즉시 반영되고 **공유 링크 접근이 차단**된다

**Scenario 6: 미성년 이용자는 한 단계 더 거친다** *(REQ-NF-016 ②)*
- **Given**: 미성년으로 확인된 이용자
- **When**: 전체공개로 전환함
- **Then**: 🔴 **추가 확인을 거친다.** 성인과 같은 한 번의 탭으로 공개되지 않는다

**Scenario 7 (실패): 게이트 미승인 시 공개 경로가 없다** *(NF-017 · NF-018)*
- **Given**: `FACE_CONSENT` 또는 `MINOR_SUBJECT` 가 `PENDING`
- **When**: 배포된 앱에서 전체공개를 시도함
- **Then**: 🔴 **라우트가 존재하지 않는다.** 🟢 **그러나 `private` 기록 생성과 조회는 정상 동작한다**

## ⚙️ Technical & Non-Functional Constraints
- 🔴 **RLS가 진실 원천** — 애플리케이션 검증은 이중 방어일 뿐이며, **RLS 없이 애플리케이션만으로는 SC-4.4를 만족할 수 없다**
- 🔴 **ADR-4는 확정 사항** — 프로토타입 v0.6 · 팀 PRD · 팀 SRS 세 문서가 일치한다. **재논의 대상이 아니다**
- 🔺 **SC-4.2(월말 비공개 비율)의 기준값이 `[TBD]`** — Gate B의 판정 입력이며 이 태스크는 **계측 가능성**까지 책임진다
- 🔺 **공개 → 비공개 전환 시 이미 받은 좋아요·댓글의 처리가 `[TBD]`** — 삭제인가 보존 후 비노출인가
- 열거형 확장 패턴 준수 — REQ-NF-015

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **미선택이 `private` 로 유지되는가?** *(TC-ADR-04)*
- [ ] 🔴 **우회 성공 0건인가?** *(NF-007 우회 테스트로 확인)*
- [ ] 🔴 **비공개가 타인 프로필의 개수에서 제외되는가?**
- [ ] 미성년 이용자의 전체공개 전환에 추가 확인이 있는가?
- [ ] 게이트 미승인 시 공개 경로가 빌드에서 제외되는가?
- [ ] 🔴 **게이트 미승인 상태에서도 `private` 경로가 동작하는가?**
- [ ] `visibility_changed` 에 이전/이후 값이 담기는가?
- [ ] TypeScript strict · ESLint 경고 0건인가?

## 🚧 Dependencies & Blockers
- 🔴 **Blocked by (공개 경로만)**: **NF-017** · **NF-018** — 법무 승인
- **Depends on**: **CT-003**(RLS) · **FR-019**(기록 생성)
- **Blocks**: **FR-027**(좋아요) · **FR-028**(공유) · **FR-026**(피드) · **FE-006** · **TS-004** · **TS-007** · **TS-002**
- 🟢 **부분 진행 가능**: `private` 경로는 게이트와 무관하게 완성할 수 있다
