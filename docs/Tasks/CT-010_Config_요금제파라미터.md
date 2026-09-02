---
name: Contract Task
about: 다른 태스크가 의존하는 계약을 먼저 확정하는 태스크
title: "[Config] CT-010: 요금제 파라미터 단일 출처 (PLANS 상수 · 한도 · 소멸)"
labels: 'contract, billing, priority:critical, step-1, wave-1'
assignees: ''
---

> ### 🆕 SRS v3.0에서 신설 *(2026-09-01)*
> PRD v0.2 §4.6의 확정값을 구현 상수로 옮긴다. 🔴 **금액·한도의 *결정*은 PRD 소관이고, 이 태스크는 *어디에 어떻게 저장하는가*만 정한다.**
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.0 §4.3** · `PRD/HILiT_PRD_v0_2.md` §4.6

> ### 🔴 SRS v3.3 — 무료 한도가 두 층이 되고, 수동 트래킹이 과금 대상이 됐다 *(2026-09-02)*
> PRD **v0.4**가 무료 티어의 경계를 다시 그었다. 🔴 **이 태스크의 상수 모양이 바뀐다 — 값만 바뀐 것이 아니다.**
>
> | | v0.3까지 | 🔴 **v0.4** |
> | --- | --- | --- |
> | 무료 편집 편수 | `edits: 2` (고정) | 🔴 **첫 주기 5 · 이후 2** — 플랜당 값이 **하나가 아니다** |
> | 수동 트래킹 | 한도 없음 (전 요금제 ●) | 🔴 **무료 월 1회 · 구독·충전 무제한** |
> | `UsageKind` | EDIT · AI_MUSIC · RECOVERY | 🔴 **+ `MANUAL_TRACK`** |
>
> 🔴 **`edits` 를 직접 읽는 코드가 첫 달 혜택을 통째로 누락시킨다.** 상수 노출이 아니라 **함수(`editQuota`)로 감싸는 것**이 이 판의 핵심 변경이다.
>
> 🔴 **`manualTracks: null`(무제한)과 `aiMusic: 0`(제공 안 함)이 같은 필드 모양을 갖는다** — 의미는 정반대인데 둘 다 falsy다. **`if (!limit)` 한 줄이 무제한을 "제공 안 함"으로 뒤집는다.**
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.3 §4.3** · `PRD/HILiT_PRD_v0_2.md` **v0.4** §4.6 · AF-16 · Q23·Q24

> ### 🔴 SRS v3.4 — 플랜이 3값에서 2값이 되고, 충전이 상수 밖으로 나간다 *(2026-09-02)*
> PRD **v0.5**: 🔴 **`PREPAID` 요금제 폐지.** 충전은 플랜이 아니라 **`UsageLedger.settlement`** 다.
>
> | | v0.4까지 | 🔴 **v0.5** |
> | --- | --- | --- |
> | `PLANS` 키 | FREE · SUBSCRIPTION · **PREPAID** | 🔴 **FREE · SUBSCRIPTION 2개** |
> | 추가 사용분 | 플랜 전환으로 표현 | 🔴 **`ADDON_PRICES` 별도 상수** — 단가는 전부 `null`(Q18·Q25) |
> | 만료 | `expiresInDays: 30`(PREPAID 플랜) | 🔴 **`PREPAID_EXPIRES_IN_DAYS = 30`** — **선불 구매분에만** 적용 |
> | 후불 상한 | 개념 없음 | 🔴 **`POSTPAID_CAP = null`** — **[TBD Q26] · 미설정 출시 금지** |
>
> 🔴 **`can(plan, feature)` 가 순수 함수가 아니게 된다.** *"무료면 AI 음악 없음"* 이 더는 참이 아니다 — **크레딧을 가진 무료 사용자는 쓸 수 있다.** `canUse(plan, feature, remaining)` 를 새로 둔다.
>
> 🔴 **그 예외는 F26 하나뿐이다.** `remaining > 0` 분기를 일반화하면 **무료 사용자에게 AI 컷(F25)·자동 추적(F2a·F2b)·리프레이밍(F5a)이 열린다** — 크레딧으로 열리지 않는 넷이다.
>
> 🔺 **`POSTPAID_CAP = null` 은 다른 `null` 과 의미가 또 다르다.** 이 파일에서 `null` 은 이미 **"무제한"**(`manualTracks`)으로 쓰이는데, 여기서는 **"미정"** 이다. 🔴 **상한이 "무제한"으로 읽히면 R15가 그대로 실현된다** — 타입이나 이름으로 구분한다.
>
> **기준 문서**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **v3.4 §4.3** · `PRD/HILiT_PRD_v0_2.md` **v0.5** §4.6 · AC7-7·AC7-8 · R15 · Q25·Q26

## 🎯 Summary
- 기능명: **[CT-010] 요금·한도가 코드 여기저기 흩어지지 않게 한다**
- 목적: **아직 확정되지 않은 값(Q14~Q19)이 자주 바뀌어도 한 파일만 고치면 되게 만든다.**

> 🔴 **이 값들은 확정 전이다.** PRD Q14(F25 원가) · Q15(충전 차등) · Q17(음악 한도) · Q18(음악 단가) · Q19(후보 개수)가 전부 열려 있다. **하드코딩하면 결정될 때마다 코드를 뒤져야 한다.**

> 🔴 **DB에도 중복 정의하지 않는다.** `User.plan` 은 어떤 플랜인지만 갖고, **그 플랜이 무엇을 주는지는 이 상수만** 안다. 두 곳에 두면 반드시 어긋난다.

## 🔗 References (Spec & Context)
- **값 원본**: `SRS/[SRS]hilit-SRSv2.0-nextjs.md` **§4.3** — 요금제 3종 · 기능 × 요금제 · OFL 5종
- **결정 소관**: `PRD/HILiT_PRD_v0_2.md` **§4.6 · Q14~Q19**
- **소비자**: `tasks_2/FR-042_Billing_요금제사용량.md` · `tasks_2/FR-043_Billing_결제연동.md` · `tasks_2/FR-040_Composer_AI음악생성.md` · `tasks_2/FR-041_Record_원본임시보관.md` · `tasks_2/FR-001_Ingest_업로드파이프라인.md`
- **스키마**: `tasks_2/CT-001_DB_스키마-제약-인덱스.md` — `Plan` · `UsageKind`

## ✅ Task Breakdown (실행 계획)
- [ ] `lib/billing/plans.ts` — `PLANS` 상수 🔴 **(FREE · SUBSCRIPTION 2개 · v0.5)**
- [ ] 필드 — `edits` · 🔴 **`firstMonthEdits`** · 🔴 **`manualTracks`** · `maxDurationSec` · `aiMusic` · `retainDays` · `expiresInDays`
- [ ] 🔴 **`maxDurationSec = 1200`** — 20분 · **CT-001의 CHECK와 같은 값**
- [ ] 🔴 **`editQuota(plan, isFirstCycle): number`** — 첫 주기면 `firstMonthEdits`, 아니면 `edits`. **`PLANS[plan].edits` 를 소비자 코드에서 직접 읽지 못하게 하는 것이 목적이다**
- [ ] 🔴 **`isUnlimited(plan, 'manualTracks'): boolean`** — `null` 판정 전용. **`Infinity`·`9999` 로 치환 금지**(잔여 표시가 "9998회 남음"이 된다)
- [ ] 🔴 **`null`(무제한) vs `0`(제공 안 함) 규약을 주석과 타입으로 명시** — 둘 다 falsy라 `if (!limit)` 이 무제한을 뒤집는다
- [ ] 🔺 **첫 주기 판정 기준은 이 파일이 정하지 않는다** — `isFirstCycle` 은 인자로 받는다(앵커 규칙은 **FR-042** · Q23)
- [ ] 기능 × 요금제 매핑 — `can(plan, feature): boolean`
- [ ] 🔴 **`canUse(plan, feature, remaining): boolean`**(v0.5) — **F26만 `remaining > 0` 으로 판정**하고 나머지는 `can()` 에 위임. 🔴 **일반화 금지** — 무료에 AI 컷이 열린다
- [ ] 🔴 **`ADDON_PRICES`** — `EXTRA_EDIT` · `AI_MUSIC` × `FREE`/`SUBSCRIPTION` · 🔴 **전부 `null`**(Q18·Q25)
- [ ] 🔴 **`PREPAID_EXPIRES_IN_DAYS = 30`** — **선불 구매분에만** 적용(후불에는 만료 개념이 없다)
- [ ] 🔴 **`POSTPAID_CAP = null`**([TBD Q26]) — 🔴 **이 `null` 은 "무제한"이 아니라 "미정"이다.** `manualTracks: null`(무제한)과 **의미가 반대**이므로 이름·타입·주석으로 구분한다
- [ ] 🔴 **`settlement` 필드** — `FREE: 'PREPAID'` · `SUBSCRIPTION: 'POSTPAID'`(이 플랜이 추가분을 **어떻게 사는가**)
- [ ] 결제 상품 ID 매핑 — `PRODUCT_IDS` (FR-043)
- [ ] OFL 폰트 5종 목록 — `OFL_FONTS` (FR-039 고지 화면이 이 배열을 쓴다)
- [ ] 🔺 **미확정 값을 `[TBD]` 로 명시** — 충전 AI 음악 단가(Q18) 등
- [ ] 타입 안전 — `as const` · `keyof typeof`
- [ ] 🔴 **테스트** — CT-001의 CHECK 값과 `maxDurationSec` 가 일치하는지 검증

## 🧪 Acceptance Criteria (BDD/GWT)

**Scenario 1: 한도 변경이 한 파일에서 끝난다**
- **Given**: 구독 편수를 3 → 4로 변경
- **When**: `PLANS.SUBSCRIPTION.edits` 만 수정함
- **Then**: 🔴 **잔여 계산·화면·검증이 전부 따라온다.** 다른 파일을 고칠 필요가 없다

**Scenario 2: DB CHECK와 상수가 어긋나지 않는다**
- **Given**: `maxDurationSec = 1200` 과 `CHECK (duration_sec <= 1200)`
- **When**: 테스트를 실행함
- **Then**: 🔴 **일치가 검증된다.** 한쪽만 바꾸면 테스트가 실패한다

**Scenario 3: 기능 접근이 상수로 판정된다**
- **Given**: 무료 사용자가 F25를 시도
- **When**: `can('FREE', 'PROMPT_CUT')` 를 호출함
- **Then**: `false`. **판정 로직이 기능마다 흩어지지 않는다**

**Scenario 3-b: 첫 달 혜택이 상수 하나만 읽고 누락되지 않는다** *(v0.4)*
- **Given**: 가입 3일차 무료 사용자
- **When**: `editQuota('FREE', true)` 를 호출함
- **Then**: 🔴 **`5` 가 나온다.** `PLANS.FREE.edits`(=2)를 직접 읽는 경로가 **없어야** 한다 — 있으면 첫 달 혜택이 조용히 사라진다

**Scenario 3-c: 무제한이 "제공 안 함"으로 뒤집히지 않는다** *(v0.4)*
- **Given**: `PLANS.SUBSCRIPTION.manualTracks = null`(무제한) · `PLANS.SUBSCRIPTION.aiMusic = 0` 은 존재하지 않지만 `PLANS.FREE.aiMusic = 0`(제공 안 함)
- **When**: 접근 판정을 수행함
- **Then**: 🔴 **`null` 은 무제한, `0` 은 차단으로 갈린다.** `if (!limit)` 로 판정하면 **구독의 무제한 수동 트래킹이 차단된다**

**Scenario 3-d: 무제한이 숫자로 표시되지 않는다** *(v0.4)*
- **Given**: 구독 사용자의 수동 트래킹 잔여
- **When**: 화면 데이터를 만듦
- **Then**: 🔴 **`isUnlimited()` 가 `true` 를 반환하고 "무제한"으로 렌더된다.** 큰 수로 치환하면 **"9998회 남음"** 이 뜬다

**Scenario 3-e: 크레딧이 AI 음악만 연다** *(v0.5 · AC7-7)*
- **Given**: 무료 사용자 · AI 음악 크레딧 2회 보유
- **When**: `canUse('FREE','AI_MUSIC',2)` 와 `canUse('FREE','PROMPT_CUT',2)` 를 호출함
- **Then**: 🔴 **각각 `true` 와 `false`.** 🔴 **`remaining > 0` 을 모든 기능에 일반화하면 무료 사용자에게 AI 컷이 열린다** — F26만 예외임을 코드가 못 박아야 한다

**Scenario 3-f: 후불 상한의 `null` 이 무제한으로 읽히지 않는다** *(v0.5 · R15)*
- **Given**: `POSTPAID_CAP = null`([TBD Q26]) · `PLANS.SUBSCRIPTION.manualTracks = null`(무제한)
- **When**: 두 값을 소비하는 코드를 확인함
- **Then**: 🔴 **같은 `null` 이 다르게 처리된다** — 트래킹은 **무제한 허용**, 상한은 🔴 **"미정이므로 후불 기능을 켜지 않는다"**. 🔴 **상한을 무제한으로 읽으면 R15(청구 충격)가 그대로 실현된다**

**Scenario 4: 미확정 값이 드러난다**
- **Given**: 충전 AI 음악 단가(Q18)
- **When**: 상수를 확인함
- **Then**: 🔴 **`[TBD]` 로 명시되어 있다.** 임의 숫자를 채우면 확정된 값처럼 읽힌다

**Scenario 5: OFL 목록이 고지 화면과 같다**
- **Given**: `OFL_FONTS` 5종
- **When**: FR-039의 라이선스 고지 화면을 확인함
- **Then**: 🔴 **같은 배열을 렌더한다.** 목록이 둘이면 하나가 누락되고 **라이선스 위반**이 된다

**Scenario 6 (실패): 플랜 혜택을 DB에도 넣지 않는다**
- **Given**: "DB에서 관리하면 배포 없이 바꿀 수 있다" 는 검토
- **When**: 설계를 판단함
- **Then**: 🔴 **상수 단일 출처를 유지한다.** 두 곳에 두면 어긋나고, 어긋난 쪽이 **사용자에게 유리하면 원가 사고, 불리하면 신뢰 사고**다

## ⚙️ Technical & Non-Functional Constraints
- 🔴 **단일 출처** — 코드 상수만. DB·환경 변수에 중복 정의 금지
- 🔴 **`maxDurationSec` 는 CT-001 CHECK와 동기** — 테스트로 강제
- 🔴 **`[TBD]` 를 임의 숫자로 채우지 않는다**(PRD N3)
- 🔺 **결제 상품 ID는 대행사 선정 후**(NF-019) — 자리만 만든다
- 🔺 **플랜 변경 시 기존 사용자 처리 `[TBD]`** — 소급 적용 여부는 사업 결정
- 🔴 **`edits` 직접 읽기 금지** — `editQuota()` 경유. 린트 규칙 또는 `private` 네이밍으로 강제 검토
- 🔴 **`null` = 무제한 · `0` = 제공 안 함** — 규약을 어기면 판정이 **정반대로** 뒤집힌다
- 🔴 **`PLANS` 는 2키다** — `PREPAID` 를 되살리지 않는다. 추가 사용분은 `ADDON_PRICES` + `UsageLedger.settlement`
- 🔴 **`canUse()` 의 `AI_MUSIC` 분기를 일반화하지 않는다** — 크레딧으로 열리는 것은 F26과 추가 편수뿐
- 🔴 **`POSTPAID_CAP = null` 은 "미정"이지 "무제한"이 아니다** — 미설정 상태로 후불 기능을 켜지 않는다(Q26 · R15)
- 🔺 **`isFirstCycle` 판정은 FR-042 소관** — 앵커(가입일 vs 캘린더 월)가 **Q23에서 미확정**이므로 이 파일은 규칙을 갖지 않는다

## 🏁 Definition of Done (DoD)
- [ ] 모든 Acceptance Criteria를 충족하는가?
- [ ] 🔴 **금액·한도가 이 파일에만 있는가?**
- [ ] 🔴 **`maxDurationSec` 와 DB CHECK 일치가 테스트되는가?**
- [ ] 🔴 **미확정 값이 `[TBD]` 로 명시되었는가?**
- [ ] `can(plan, feature)` 로 접근 판정이 일원화되었는가?
- [ ] `OFL_FONTS` 를 고지 화면이 그대로 쓰는가?
- [ ] `as const` 타입 안전이 적용되었는가?
- [ ] 🔴 **`editQuota()` 없이 `edits` 를 읽는 소비자가 없는가?** *(첫 달 혜택 누락 방지)*
- [ ] 🔴 **`null`(무제한)과 `0`(제공 안 함)이 코드에서 구분되는가?**
- [ ] 🔴 **무제한이 화면에 숫자로 새지 않는가?**
- [ ] 🔴 **`PLANS` 에 `PREPAID` 가 없는가?** *(v0.5)*
- [ ] 🔴 **`canUse()` 의 크레딧 분기가 F26에만 걸리는가?**
- [ ] 🔴 **`POSTPAID_CAP` 미설정이 "무제한"으로 처리되지 않는가?**

## 🚧 Dependencies & Blockers
- **Depends on**: **CT-001**(`Plan`·`UsageKind` enum)
- **Blocks**: **FR-042** · **FR-043** · **FR-040** · **FR-041** · **FR-001** · **UX-012**
- **미결**: 🔺 **Q14~Q19** — 값은 미확정, **구조는 확정 가능**
- **미결**: 🔴 **Q25**(추가 업로드 1편 단가) · **Q18**(AI 음악 단가) — 🟢 **상수 자리만 만들면 되므로 구조는 확정 가능**
- **미결**: 🔴 **Q26**(후불 상한) — 🔴 **이것만 다르다.** 값이 비면 **기능을 켤 수 없다**(R15)
- **미결**: 🔴 **Q23**(무료 한도 리셋 앵커·이월·재가입 악용) · 🔴 **Q24**(수동 트래킹 1회의 계수 단위) — 🔺 **둘 다 이 파일이 아니라 FR-042의 판정 규칙에 걸린다.** 상수 구조는 답과 무관하게 확정 가능
