---
name: Gate Task
about: 산출물 승인으로 판정하는 배포 게이트 (개발 태스크 아님)
title: "[Legal] NF-015: 미성년 이용자 정책 산출물 4종 승인"
labels: 'legal, gate, blocker, priority:critical, step-4'
assignees: ''
---

> ### 🔄 SRS v3.0 반영 — 이 태스크에서 바뀐 것 *(2026-09-01)*
> **변경 없음.** `MINOR_POLICY` 게이트는 가입 플로우를 차단하며 산출물 3종·차단 대상 모두 v3.0에서 그대로다. 🔴 **이 게이트만은 베타 초대 경로에도 적용**된다 — 초대도 가입이다.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0** · `PRD/HILiT_PRD_v0_2.md`

> ### ⚠️ 이것은 개발 태스크가 아니다
> **코드가 아니라 승인**이다. Task Breakdown은 문서 작성 절차이고, DoD는 테스트 통과가 아니라 **산출물 승인 상태**다.
> 완료 판정은 `gates/minor-policy.gate.json` 의 `status` 가 `APPROVED` 가 되고 **빌드 검증(NF-011)이 통과**하는 것이다.

## 🎯 Summary
- 기능명: **[NF-015] 미성년 이용자 보호 정책 확정**
- 목적: **만 14세 미만 이용자의 가입을 법적 요건에 맞게 처리한다.**

> 🔴 **이 게이트는 가입 플로우 전체를 막는다.** 승인 전에는 **서비스 자체가 열리지 않는다** — 다른 세 게이트가 특정 기능만 막는 것과 다르다.
>
> 🔴 **베타 초대 경로에도 적용된다. 초대도 가입이다.**

## 🔗 References (Spec & Context)
> 💡 작업 시작 전 아래 문서를 반드시 먼저 Read/Evaluate 할 것.
- **요구사항**: `SRS/[SRS]hilit-SRSv1.8.md` **REQ-NF-016** — 산출물 4종과 차단 대상
- **시나리오**: `SRS/[SRS]hilit-SRSv1.8.md` **SC-0.1** — 만 14세 미만 가입 시도
- **규제 준수 표**: `SRS/[SRS]hilit-SRSv1.8.md` §4.4
- **게이트 운영**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` §8.1 — 빌드 타임 검증 방식
- **게이트 매핑**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` §8.1.6 — `MINOR_POLICY`
- 데이터: `SRS/[SRS]hilit-SRSv1.8.md` §6.2 — `User.birth_year` · `guardian_consent_at`
- 미해결: `SRS/[SRS]hilit-SRSv1.8.md` §6.8 **Q10**

## ✅ Task Breakdown (승인 절차)
- [ ] **① 최소 연령 정책** 문서 — 서비스 대상 연령 하한과 근거
- [ ] **② 연령 확인 방식** 명세 — 자기신고 / 본인확인 중 무엇을 쓰는가와 그 한계
- [ ] **③ 법정대리인 동의 경로** 명세 — 동의 획득·보관·확인 절차
- [ ] **④ 철회·삭제 절차** — 법정대리인의 열람·삭제·동의 철회 요구 처리
- [ ] 법무 검토 및 승인
- [ ] `gates/minor-policy.gate.json` 에 산출물 4건 등재 (`ref` · `sha256` · `approvedBy` · `approvedAt`)
- [ ] `status: APPROVED` 전환 — 🔴 **CODEOWNERS 승인 PR로만**(NF-011)

## 🧪 Acceptance Criteria (게이트 판정)

**Scenario 1: 산출물 4종이 전부 승인되어야 가입이 열린다**
- **Given**: 산출물 중 하나라도 미승인 상태
- **When**: 빌드를 실행함
- **Then**: `MINOR_POLICY` 가 차단 목록에 들어가고 **가입 플로우가 빌드 산출물에서 제외**된다

**Scenario 2: 만 14세 미만은 동의 없이 가입이 완료되지 않는다** *(SC-0.1)*
- **Given**: 생년이 만 14세 미만인 가입 시도
- **When**: 가입을 진행함
- **Then**: **법정대리인 동의 없이는 완료되지 않는다.** 동의 없는 계정 생성 **0건** · 연령 미수집 가입 **0건**

**Scenario 3: 미성년 이용자의 공개 범위 기본값이 유지된다** *(REQ-NF-016 ②)*
- **Given**: 미성년으로 확인된 이용자
- **When**: 기록을 저장함
- **Then**: 공개 범위가 **나만 보기**로 시작하고, **전체공개 전환 시 추가 확인**을 거친다

**Scenario 4: 법정대리인이 열람·삭제·철회를 할 수 있다** *(REQ-NF-016 ③)*
- **Given**: 동의를 제공한 법정대리인
- **When**: 열람·삭제·동의 철회를 요구함
- **Then**: 각 경로가 문서화된 절차대로 처리된다

**Scenario 5 (실패): 베타 초대가 게이트를 우회하지 못한다**
- **Given**: `MINOR_POLICY` 미승인 상태
- **When**: 베타 초대 링크로 가입을 시도함
- **Then**: 🔴 **동일하게 차단된다.** 초대는 가입의 예외가 아니다

## ⚙️ Technical & Non-Functional Constraints
- **차단 대상**: `SIGNUP_FLOW` — 가입 플로우 전체 · 베타 초대 포함
- **판정 방식**: 산출물 존재 + `sha256` 일치 + 만료 미도래 *(v2.2 §8.1.3)*
- 🔺 **적용 범위는 법무 확정 사항** — 만 14세 기준은 개인정보보호법 제22조의2를 근거로 한 제안이며 이 서비스에 대한 정확한 적용은 법무가 정한다 `[TBD]`
- 데이터: `User.birth_year` 는 🔴 **개인정보**이며 NULL 허용

## 🏁 Definition of Done (게이트 통과)
- [ ] 산출물 **4종이 전부 존재하고 승인**되었는가?
- [ ] `gates/minor-policy.gate.json` 의 `status` 가 `APPROVED` 인가?
- [ ] 🔴 **CODEOWNERS 승인을 거친 PR로 전환되었는가?** *(개발자 단독 변경 불가)*
- [ ] 빌드 검증(NF-011)이 `MINOR_POLICY` 를 차단하지 않는가?
- [ ] 만료일(`expiresAt`)이 설정되었는가?
- [ ] SC-0.1 테스트(TS-007)가 통과하는가?

## 🚧 Dependencies & Blockers
- **Depends on**: 없음 — 🟢 **지금 착수 가능** · 개발과 완전 병렬
- **Blocks**: 🔴 **가입 플로우 전체** · 서비스 오픈 · TS-007
- **관련**: NF-011(빌드 검증 · CODEOWNERS)이 이 게이트의 집행 수단이다
- 🔺 **리드타임이 길다** — 법무 검토는 개발이 앞당길 수 없으므로 **가장 먼저 띄운다**
