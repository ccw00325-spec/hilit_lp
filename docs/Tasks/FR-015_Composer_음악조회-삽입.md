---
name: Feature Task
about: SRS 기반의 구체적인 개발 태스크 명세
title: "[Command] FR-015: 무료 음악 라이브러리 조회·삽입 (AI 음악은 FR-040)"
labels: 'backend, command, composer, priority:medium, step-2, blocked-by-legal'
assignees: ''
---

> ### 🔄 SRS v3.0 반영 — 이 태스크에서 바뀐 것 *(2026-09-01)*
> **F26 분리 명시** — 이 태스크는 **무료 라이브러리(F18a)** 만 담당하고, **AI 음악 생성(F26/Suno)은 FR-040**이다. 🔴 **AF-12**: AI 음악 한도 소진 시 **이 라이브러리로 넘어오는 경로**를 이 태스크가 받는다.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0** · `PRD/HILiT_PRD_v0_2.md`

## 🎯 Summary
- 기능명: **[FR-015] 저작권이 정리된 곡만 담긴 라이브러리에서 곡을 고르고 넣는다**
- 목적: **앱 밖으로 나가지 않고 완성한다(SC-3.4 외부 앱 전환 0건)는 조건을 음악에 대해서도 지킨다.**

> 🔴 **이 태스크는 개발이 끝나도 배포되지 않을 수 있다.**
>
> **NF-016(음원 라이선스 증빙 3종)이 미승인이면 빌드에서 이 경로가 제거**된다(v2.2 §8.1.6 `MUSIC_LICENSE`). 그리고 그 게이트는 **계약 상대가 있어 개발 일정으로 당길 수 없다**(제약 C6).
>
> 🟢 **다행히 음악은 건너뛸 수 있는 단계다**(v1.8 §12 5단계 *"곡 선택 또는 건너뛰기"*). **이 태스크가 막혀도 MVP 완주는 성립한다.**

## 🔗 References (Spec & Context)
> 💡 AI Agent & Dev Note: 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- **요구사항**: `SRS/[SRS]hilit-SRSv1.8.md` **REQ-FUNC-007** — 5갈래 500곡 · 🔴 **15초 자동 맞춤** · 삽입 성공률 ≥ 99%
- **제약**: `SRS/[SRS]hilit-SRSv1.8.md` §1.5.1 **C3** — 🔴 **외부 음원 반입 경로 제공 금지**
- **게이트**: `tasks/NF-016_Legal_음원라이선스.md` — 🔴 **이 태스크의 배포 차단자**
- **구성요소**: `SRS/[SRS]hilit-SRSv1.8.md` §5.1 **MusicLibrary** · **LicenseRegistry**
- **API**: `SRS/[SRS]hilit-SRSv1.8.md` §5.4 — `GET /music`
- **엔티티**: `SRS/[SRS]hilit-SRSv1.8.md` §6.2 `MusicTrack` — 🔴 **라이선스가 확보된 곡만**
- **미해결**: `SRS/[SRS]hilit-SRSv1.8.md` §6.8 **Q16** — 카테고리 배분(초안)
- 화면: `SRS/[SRS]hilit-SRSv1.8.md` REF-13 화면 10

## ✅ Task Breakdown (실행 계획)
- [ ] Query **`listMusicTracks({ category })`** 구현 — 5갈래 카테고리
- [ ] 🔴 **`LicenseRegistry` 확인 필터** — 문서가 없거나 만료된 곡은 목록에 나오지 않는다
- [ ] 곡 선택 상태 저장 — `record_draft` 에 연결
- [ ] 🔴 **15초 자동 맞춤 규칙 구현** — 곡의 어느 구간을 쓸 것인가(§제약)
- [ ] 결과물 길이가 15초와 다를 때의 처리
- [ ] **건너뛰기 경로** — 곡 없이 확정 가능
- [ ] 삽입 성공률 계측 — `music_applied` · `music_skipped`
- [ ] 🔴 **외부 반입 경로가 없음을 확인** — 업로드 필드·URL 입력 없음(C3)

## 🧪 Acceptance Criteria (BDD/GWT)

**Scenario 1: 라이선스가 확보된 곡만 보인다** *(REQ-FUNC-007 · MusicTrack)*
- **Given**: `LicenseRegistry` 에 문서가 없거나 만료된 곡이 섞여 있음
- **When**: 목록을 조회함
- **Then**: 🔴 **그 곡들이 목록에 없다.** 문서 확보율 **100%** 는 등재 곡 전부에 대해 성립한다

**Scenario 2: 곡 단위 회수가 즉시 반영된다** *(NF-016 Scenario 4)*
- **Given**: 특정 곡의 라이선스가 만료됨
- **When**: 목록을 다시 조회함
- **Then**: 🔴 **그 곡만 사라지고 나머지는 그대로다.** 라이브러리 전체가 닫히지 않는다

**Scenario 3: 15초에 맞춰 자동 삽입된다** *(REQ-FUNC-007)*
- **Given**: 3분짜리 곡과 15초 결과물
- **When**: 삽입함
- **Then**: **곡이 15초 길이에 맞춰 자동 배치**된다. 사용자가 시작점을 직접 지정하지 않는다

**Scenario 4: 곡 없이도 완성된다**
- **Given**: 사용자가 건너뛰기를 선택함
- **When**: 확정을 진행함
- **Then**: 🟢 **렌더와 기록 생성이 정상 진행**된다. `music_skipped` 가 계측된다

**Scenario 5: 외부 음원을 넣을 수 없다** *(C3)*
- **Given**: 음악 선택 화면
- **When**: 인터페이스를 확인함
- **Then**: 🔴 **파일 업로드·URL 입력 경로가 없다.** 저작권 리스크가 사용자 경유로 들어오지 않는다

**Scenario 6: 게이트 미승인 시 이 경로가 존재하지 않는다** *(NF-016)*
- **Given**: `MUSIC_LICENSE` 가 `PENDING`
- **When**: 배포된 앱을 확인함
- **Then**: 🔴 **음악 단계가 라우트째 없다.** 런타임 플래그가 아니라 **빌드에서 제거**되므로 켤 수 없다

**Scenario 7 (실패): 삽입 실패가 완성을 막지 않는다**
- **Given**: 곡 삽입 중 오류
- **When**: 렌더를 진행함
- **Then**: 🔺 **곡 없이 완주하거나 재시도 경로가 있다.** 삽입 성공률 ≥ 99% 는 목표이며, **나머지 1%가 기록 생성을 막으면 D4가 무너진다**

## ⚙️ Technical & Non-Functional Constraints
- 🔴 **NF-016이 배포를 차단한다** — 개발 완료와 배포 가능은 별개다
- 🔴 **15초 자동 맞춤의 규칙이 `[TBD]`** — 곡의 앞 15초인지 · 하이라이트 구간인지 · 페이드 처리는 어떻게 할지. **"자동"이라고만 쓰여 있고 방식이 정해지지 않았다**
- 🔺 **결과물 길이가 15초가 아닐 때가 `[TBD]`** — FR-014의 선택 상한이 정해지지 않아 결과물 길이가 가변이다. **두 태스크가 같은 미결을 공유한다**
- 🔺 **500곡 · 카테고리 배분은 초안** — Q16은 NF-016의 조달 결과 이후
- 곡 파일은 객체 스토리지 · 목록은 DB

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **`LicenseRegistry` 미확보 곡이 목록에 나오지 않는가?**
- [ ] 🔴 **곡 단위 회수가 라이브러리 전체를 닫지 않는가?**
- [ ] 🔴 **외부 음원 반입 경로가 없는가?** *(C3)*
- [ ] 건너뛰기로 완주가 되는가?
- [ ] `music_applied` · `music_skipped` 가 계측되는가?
- [ ] 🔺 **15초 자동 맞춤 규칙이 결정되어 문서에 반영되었는가?**
- [ ] 게이트 미승인 시 빌드에서 제외되는가?
- [ ] TypeScript strict · ESLint 경고 0건인가?

## 🚧 Dependencies & Blockers
- 🔴 **Blocked by**: **NF-016**(음원 라이선스 증빙) — **배포 차단** · 개발은 진행 가능
- **Depends on**: **CT-001**(`MusicTrack`) · **FR-014**(선택 확정)
- **Blocks**: **FE-004**(음악 선택 UI)
- 🟢 **임계 경로 아님** — 건너뛰기 경로가 있어 MVP 완주를 막지 않는다
