# AGENTS.md

## Project

AI 독서토론 서비스 MVP.

이 저장소에서 Codex 및 기타 coding agent가 작업할 때는 **`PRODUCT_SPEC.md`를 제품 요구사항의 Source of Truth**로 사용한다.

---

## 1. 작업 시작 전 필수

새로운 설계 또는 구현 작업을 시작하기 전에:

1. `PRODUCT_SPEC.md`를 읽는다.
2. 관련된 기존 기술 문서와 `docs/DECISIONS.md`를 확인한다.
3. AI Evaluator·Policy·Host·Living Wiki·Raw Data retrieval 작업이면 `docs/AI_ENGINE_SPEC.md`를 읽는다.
4. 책 catalog·Book Context Pack·Provider·Builder 작업이면 `docs/BOOK_CONTEXT_SPEC.md`를 읽는다.
5. 현재 작업이 제품 결정인지 기술 결정인지 구분한다.
6. MVP 범위 밖 기능을 임의로 추가하지 않는다.

---

## 2. 제품 요구사항 우선

`PRODUCT_SPEC.md`를 제품 요구사항의 **Source of Truth**로 사용한다.

제품 요구사항의 의도, 배경, 예시 또는 세부 맥락이 부족해 판단하기 어려운 경우에는 `docs/reference/product-planning-v1.0.docx`를 보조 자료로 참고할 수 있다.

문서 우선순위와 사용 규칙은 다음과 같다.

1. `PRODUCT_SPEC.md`와 DOCX가 충돌하면 항상 `PRODUCT_SPEC.md`를 우선한다.
2. DOCX는 제품 의도, 배경, 논의 맥락, 예시를 이해하기 위한 reference다.
3. DOCX에 포함된 기술 아키텍처나 구현 아이디어는 확정된 기술 요구사항으로 간주하지 않는다.
4. DOCX의 내용을 근거로 `PRODUCT_SPEC.md`에 없는 새로운 제품 요구사항을 임의로 추가하지 않는다.
5. DOCX를 참고한 결과 제품 행동을 변경할 필요가 있다고 판단되면 이를 Product Decision으로 취급하고, 사용자와 명시적으로 합의한 뒤 반영한다.

기술 편의를 이유로 `PRODUCT_SPEC.md`에 정의된 제품 행동을 임의로 축소하거나 변경하지 않는다.

특히 다음 원칙은 구현 과정에서도 유지한다.

- AI의 기본 철학은 **최소 필요 개입**이다.
- 좋은 인간 대화가 진행 중이면 `WAIT`가 올바른 행동일 수 있다.
- Discussion Metrics를 하나의 단순 총점으로 환산해 제품 의미를 대체하지 않는다.
- AI는 한 판단 주기에서 원칙적으로 가장 필요한 **한 가지 개입 목표**를 선택한다.
- Book Grounding이 LOW라는 이유만으로 토론을 책으로 강제 복귀시키지 않는다.
- `AI_PRIVATE` 원문은 참가자에게 노출되는 AI Host 출력에 사용하지 않는다.
- AI는 작품의 단일한 정답이나 최종 해석을 선언하지 않는다.
- 방장은 세션 운영 권한을 가지지만 토론 진행 로직은 기본적으로 AI가 담당한다.
- MVP의 최상위 성공 기준은 내부 AI 점수가 아니라 **사용자의 사고 확장 Outcome**이다.
- Full-text RAG는 MVP의 필수 기능이 아니다.

제품 행동을 변경해야 한다면 먼저 Decision으로 기록하고, 사용자와 제품 변경을 명시적으로 합의한 뒤 `PRODUCT_SPEC.md`에 반영한다.

---

## 3. 기술 설계 원칙

기술 아키텍처는 아직 이 문서에서 정하지 않는다.

Codex는 기술 기획 과정에서 다음을 자유롭게 비교·제안할 수 있다.

- 애플리케이션 구조
- 프레임워크와 라이브러리
- 데이터 모델
- API
- 실시간 통신
- LLM orchestration
- concurrency / race-condition 처리
- 저장/검색/색인
- background job
- logging / observability
- 배포와 인프라
- 테스트 구조

단, 선택한 기술은 `PRODUCT_SPEC.md`의 제품 요구사항을 만족해야 한다.

---

## 4. 기술 결정 기록

중요한 기술 선택은 `docs/DECISIONS.md`에 기록한다.

기록해야 하는 예:

- 주요 프레임워크 선택
- 데이터 저장소 선택
- 실시간 통신 방식
- AI 호출/오케스트레이션 방식
- Living Wiki consistency 전략
- session concurrency 처리
- 검색 전략
- 중요한 외부 서비스 선택
- 비용/지연/정확도 사이의 큰 trade-off

사소한 구현 세부사항까지 모두 Decision으로 만들 필요는 없다.

---

## 5. 제품 결정과 기술 결정을 구분

### Product Decision

사용자가 무엇을 경험하는지 또는 AI가 어떻게 행동해야 하는지를 바꾸는 결정.

예:

- AI가 언제 토론에 개입할지
- 연장을 누가 결정할지
- 결과물에 이름을 표시할지
- 비공개 사전 입력을 Host가 사용할 수 있는지
- 새로운 세션에서도 이전 토론 기억을 사용할지

→ 임의 결정하지 말고 사용자와 합의한 뒤 `PRODUCT_SPEC.md`에 반영한다.

### Technical Decision

제품 행동은 유지하면서 구현 방식을 선택하는 결정.

예:

- WebSocket vs 다른 실시간 전송 방식
- 특정 DB 선택
- optimistic locking vs 다른 consistency 방식
- 특정 LLM SDK 사용
- embedding 저장 방식

→ 비교 후 합리적으로 결정하고 `docs/DECISIONS.md`에 기록할 수 있다.

---

## 6. 불확실성 처리

요구사항이 애매하다고 해서 즉시 질문부터 하지 않는다.

먼저:

1. `PRODUCT_SPEC.md`
2. 기존 코드
3. 기존 기술 문서
4. `docs/DECISIONS.md`

에서 답을 찾는다.

그래도 제품 행동이 달라질 정도로 중요한 모호성이 남을 때만 사용자에게 확인한다.

순수한 기술 선택은 가능한 경우 장단점과 추천안을 제시하고 진행할 수 있다.

---

## 7. MVP Scope Discipline

현재 목표는 **제품 가설을 빠르게 검증할 수 있는 MVP**다.

다음 이유만으로 기능을 추가하지 않는다.

- 나중에 필요할 것 같아서
- 일반적인 SaaS라면 있어야 할 것 같아서
- 구조적으로 예뻐 보여서
- 미래 확장성을 위해 미리 만들고 싶어서

특히 Full-text RAG, 음성 토론, 세션 간 장기 기억, 참가자별 AI 성향 분석은 제품 요구가 생기기 전까지 MVP 기본 범위로 올리지 않는다.

---

## 8. AI/LLM 기능 구현 시

LLM 기능은 가능한 한 입력과 출력을 명확한 contract로 정의한다.

다음 구분을 보존한다.

- **Evaluator:** 관찰/평가
- **Policy:** 행동 결정
- **Host:** 사용자에게 보여줄 자연어 생성
- **Living Wiki:** 세션 사고 구조의 가변적 해석
- **Raw Data:** 변경되지 않는 사실 원본
- **Book Context:** 책 자체의 재사용 가능한 지식
- **Session Context:** 참가자 사전 입력 및 현재 세션 정보

한 모듈에 모든 책임을 몰아넣는 구현을 선택하려면 그 이유와 trade-off를 명확히 설명한다.

---

## 9. Privacy / Safety Invariants

다음은 절대 규칙이다.

- `AI_PRIVATE` 원문을 다른 참가자에게 노출하지 않는다.
- 비공개 정보의 작성자를 추론 가능하게 노출하지 않는다.
- 비공개 정보가 사용자-facing prompt/context로 넘어가는 경로를 검증한다.
- Raw Data의 사실을 AI가 임의로 수정한 것으로 취급하지 않는다.
- AI가 참가자의 내적 생각 변화를 근거 없이 단정하지 않는다.
- AI가 특정 작품 해석을 유일한 정답처럼 선언하지 않는다.

프라이버시 규칙은 weight나 threshold로 완화할 수 없다.

---

## 10. Testing

기능 구현 시 가능한 범위에서 테스트를 같이 추가한다.

특히 중요하게 테스트할 것:

- 제품 규칙 기반 Policy 행동
- AI_PRIVATE 정보 누출 방지
- 세션 종료 후 공식 결과의 안정성
- 연장 승인/거절 권한
- 좋은 흐름에서 불필요한 AI 개입 방지
- Relevance/Activity/Saturation 조합에 따른 행동
- Living Wiki의 evidence reference, stale-write 방지, Topic Checkpoint와 Final Wiki 정합성
- Book Context의 FACT/INTERPRETATION 구분, 출처·불확실성 보존과 exact version pin
- 참가자 이름 익명화 정책
- 제품 핵심 flow의 회귀(regression)

LLM의 의미론적 품질은 deterministic unit test만으로 충분하지 않으므로 fixture, eval case, 로그 기반 평가 등을 별도로 설계할 수 있다.

---

## 11. Observability

MVP에서도 제품 학습에 필요한 기록을 잃지 않는다.

최소한 아래 관계를 나중에 분석할 수 있어야 한다.

**상태/평가 → Policy Action → AI 개입 → 이후 대화 변화 → 사용자 Outcome**

구체 logging 기술과 schema는 기술 기획에서 결정한다.

---

## 12. Documentation

기술 기획을 시작하면 적어도 다음 문서를 관리한다.

- `PRODUCT_SPEC.md` — 제품 Source of Truth
- `AGENTS.md` — agent 작업 규칙
- `docs/DECISIONS.md` — 중요 결정 기록
- `docs/TECHNICAL_PLAN.md` — frontend/backend 공통 아키텍처·contract·통합 기준
- `docs/FRONTEND_PLAN.md` — `apps/web`과 design system의 프론트엔드 구현 계획
- `docs/FRONTEND_INTEGRATION_GUIDE.md` — 구현된 서버와 프론트 adapter를 연결하는 handoff 시작점
- `docs/API_REFERENCE.md` — HTTP route·공개 contract·오류·멱등성 reference
- `docs/REALTIME_INTEGRATION.md` — session snapshot·event·reconnect protocol
- `docs/FRONTEND_LOCAL_SETUP.md` — local 통합 환경과 smoke 절차
- `docs/BACKEND_PLAN.md` — API·DB·worker·AI의 서버 구현 계획
- `docs/AI_ENGINE_SPEC.md` — Evaluator·Policy·Host·Living Wiki·Raw Data retrieval의 상세 계약
- `docs/BOOK_CONTEXT_SPEC.md` — Pack 콘텐츠·출처·Provider·Builder·Publish의 상세 계약

프론트엔드 또는 서버 작업을 시작할 때는 `docs/TECHNICAL_PLAN.md`와 해당 구현 계획을 함께 읽는다. 프론트엔드의 실제 서버 연동 작업은 `docs/FRONTEND_INTEGRATION_GUIDE.md`에서 시작해 API·Realtime·local setup 문서를 함께 확인한다. AI 또는 Book Context 작업은 위 상세 명세까지 함께 읽는다. 하위 구현 계획이 공통 기술 계획이나 제품 요구사항과 충돌하면 상위 문서를 우선하고, contract 변경은 `packages/contracts`와 양쪽 fixture에 함께 반영한다.

필요해질 때 추가 가능:

- `docs/TEST_PLAN.md`

문서와 실제 구현이 달라지면 구현을 숨겨서 진행하지 말고 어느 쪽을 수정해야 하는지 확인한다.

---

## 13. 권장 첫 Codex 작업

첫 기술 기획 세션에서는 바로 코딩하지 않는다.

1. `PRODUCT_SPEC.md`를 읽고 핵심 제품 invariant를 요약한다.
2. 구현에 필요한 기술 영역을 나눈다.
3. 선택지가 중요한 부분만 대안을 비교한다.
4. 추천 기술 설계를 `docs/TECHNICAL_PLAN.md`에 작성한다.
5. 주요 trade-off를 `docs/DECISIONS.md`에 기록한다.
6. 사용자와 기술 설계를 합의한 뒤 첫 vertical slice 구현을 시작한다.

제품 요구사항 자체를 다시 설계하는 작업으로 되돌아가지 않는다.
