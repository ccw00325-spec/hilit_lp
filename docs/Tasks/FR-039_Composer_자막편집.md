---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Command] FR-039: 자막 편집 — 텍스트 · 타이밍 · OFL 폰트 5종"
labels: 'frontend, command, composer, priority:high, step-2'
assignees: ''
---

> ### 🆕 SRS v3.0에서 신설 *(2026-09-01)*
> PRD v0.2 F18b. 🔴 **REQ-FUNC-026이 `Won't Have(P3)` → `Must Have`로 승격**됐다(SRS §9-10).
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0 §4.3 · §5.1 ③** · `PRD/HILiT_PRD_v0_2.md` F18b · AC7-2

## 🎯 Summary
- 기능명: **[FR-039] 앱을 옮기지 않고 자막까지 끝낸다**
- 목적: **Core Job의 "앱을 옮기지 않고 완성"을 자막에 대해서도 지킨다.**

> 🔴 **무료 티어에 있다.** 자막은 유료 구분선이 아니다 — 무료 사용자도 완성까지 가야 하고(AC7-1), 자막 없이 끝내면 결과물이 미완으로 느껴진다.

> 🔴 **OFL은 "무료"가 아니라 "표기 의무가 있는 무료"다.** 5종 전부를 앱 내 라이선스 고지 화면에 명시해야 한다(AC7-2). 표기를 빠뜨리면 **라이선스 위반**이다.

> 🔴 **자막을 브라우저에서 굽는다.** 서버 렌더가 불가하므로(A-T1) 폰트가 **렌더 파이프라인에 들어온다.** `document.fonts.ready` 를 기다리지 않으면 **대체 폰트로 구워진다** — 미리보기와 결과가 달라진다.

## 🔗 References (Spec & Context)
- **요구사항**: `SRS/[SRS]hilit-SRSv1.8.md` **REQ-FUNC-026** *(v3.0 승격 · §9-10)*
- **폰트**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **§4.3** — `OflFont` 5종 · 서브셋 `woff2`
- **Action**: 같은 문서 **§5.1 ③** — `saveSubtitles(recordId, lines[])`
- **스키마**: `tasks_2/CT-001_DB_스키마-제약-인덱스.md` — `Subtitle`
- **렌더**: `tasks_2/FR-016_Composer_클라이언트렌더-이탈대응.md` — 🔴 **폰트 로딩 대기**
- **화면**: `tasks_2/UX-013_Subtitle_자막편집화면.md`

## ✅ Task Breakdown (실행 계획)
- [ ] Server Action **`saveSubtitles(recordId, lines[])`** — 벌크 UPSERT
- [ ] 검증 — `end_ms > start_ms` · 결과물 길이 내 · 텍스트 ≤ 200자
- [ ] 🔴 **겹침 처리** — 같은 시각에 두 줄이 겹치면 거부 또는 병합 `[TBD]`
- [ ] 폰트 5종 **서브셋 `woff2`** 생성 — 한글 상용 2350자 + 라틴
- [ ] 🔴 **라이선스 고지 화면** — 5종 전부 명시(AC7-2)
- [ ] 🔴 **`document.fonts.ready` 대기 후 렌더** — FR-016과 연계
- [ ] 스타일 — 크기 · 위치 · 외곽선/그림자 (프리셋 소수)
- [ ] 계측 — `subtitle_saved`(줄 수 · 폰트 · 편집 시간)

## 🧪 Acceptance Criteria (BDD/GWT)

**Scenario 1: 무료 사용자도 자막을 쓴다**
- **Given**: 무료 플랜
- **When**: 자막을 편집하고 저장함
- **Then**: **제한 없이 저장된다.** 자막은 유료 구분선이 아니다

**Scenario 2: OFL 5종이 고지된다** *(AC7-2)*
- **Given**: 라이선스 고지 화면
- **When**: 내용을 확인함
- **Then**: 🔴 **Pretendard · Noto Sans KR · Source Han · 나눔글꼴 · Freesentation 전부가 명시**되어 있다

**Scenario 3: 결과가 미리보기와 같은 폰트로 구워진다**
- **Given**: Pretendard로 설정한 자막
- **When**: 렌더 결과를 확인함
- **Then**: 🔴 **Pretendard로 구워져 있다.** `document.fonts.ready` 를 기다리지 않으면 시스템 대체 폰트가 들어간다

**Scenario 4: 타이밍이 결과물 길이를 벗어나지 않는다**
- **Given**: 15초 결과물에 `end_ms = 20000` 인 자막
- **When**: 저장함
- **Then**: **거부되거나 잘린다.** 보이지 않는 자막을 저장하지 않는다

**Scenario 5: 폰트 다운로드가 편집을 막지 않는다**
- **Given**: 서브셋 `woff2` 5종
- **When**: 자막 화면에 진입함
- **Then**: **선택한 폰트만 로딩**된다. 5종을 전부 받지 않는다

**Scenario 6 (실패): 폰트를 CDN에서 직접 링크하지 않는다**
- **Given**: 편의를 위한 외부 폰트 CDN
- **When**: 설계를 검토함
- **Then**: 🔴 **자체 호스팅한다.** 렌더 시점에 외부 의존이 있으면 **오프라인·차단 환경에서 결과물이 달라진다**

## ⚙️ Technical & Non-Functional Constraints
- 🔴 **OFL 표기 의무** — 고지 누락은 라이선스 위반
- 🔴 **폰트 자체 호스팅** — 렌더 결정성 확보
- 🔴 **`document.fonts.ready` 대기** — FR-016 렌더 파이프라인의 선행 조건
- 🔺 **겹침 정책 `[TBD]`** — 거부 vs 병합. UX-013에서 결정
- 🔺 **서브셋 범위** — 한글 상용 2350자로 시작 · 누락 글자 폴백 확인 필요
- 자막은 결과물(`Record`)에 종속 — 클립이 아니라 **완성 영상 타임라인** 기준

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **OFL 5종 고지 화면이 있는가?**
- [ ] 🔴 **`document.fonts.ready` 대기 후 렌더하는가?**
- [ ] 🔴 **폰트가 자체 호스팅되는가?**
- [ ] 타이밍 검증(`end_ms > start_ms` · 길이 내)이 있는가?
- [ ] 선택한 폰트만 로딩되는가?
- [ ] 무료 플랜에서 제한 없이 동작하는가?

## 🚧 Dependencies & Blockers
- **Depends on**: **CT-001**(`Subtitle`·`OflFont`) · **FR-019**(기록 저장)
- **Blocks**: **FR-016**(렌더) · **UX-013**(화면)
- **연관**: **FR-042** — 자막은 사용량을 차감하지 않는다
