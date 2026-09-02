# 책은양념 MVP Book Context 명세

> Status: Accepted product-to-technical specification  
> Product source of truth: `PRODUCT_SPEC.md` §18~§20  
> Shared technical baseline: `docs/TECHNICAL_PLAN.md`  
> Backend implementation: `docs/BACKEND_PLAN.md`  
> Related decisions: `docs/DECISIONS.md` PRODUCT-025, PRODUCT-027, PRODUCT-028, PRODUCT-033, TECH-024, TECH-027, TECH-029
> Last updated: 2026-09-03

## 0. 목적과 현재 구현 상태

Book Context Pack은 책 선택 카탈로그의 짧은 설명이 아니라 AI 호스트가 참가자의 발언을 책의 구조·장면·주장·쟁점과 연결하기 위한 재사용 가능한 지식 지도다.

현재 Slice 2 서버 구현은 `supabase/migrations/20260901020000_book_catalog.sql`과 `20260901040000_book_context_foundation.sql`, `/v1/books`, `apps/server/src/modules/book-context`를 통해 다음 범위를 구현한다.

- Published Pack이 있는 책의 검색·정렬·표시
- Pack version/status와 책별 활성 Published version 하나
- 방 생성 시 exact `packVersionId`를 선택할 수 있는 기반
- 7개 section/item/link/source/item-source evidence relational model
- Published·Retired content 불변성과 Retired exact-version Provider 조회
- `BookContextDocumentV1` strict internal contract와 구조화 fixture
- `BookContextProvider` application interface, item budget/filter와 Supabase adapter

Slice 2A content/provider foundation과 Slice 7 Builder 서버 범위가 완료되었다. `20260902120000_book_context_builder.sql`, `20260903010000_book_catalog_search_review.sql`, `apps/server/src/modules/book-builder`, `book-builder-admin`이 Kakao 도서 검색·판본 선택, 7단계 durable run, 공개 자료 web search, Pack 단위 전체 검수, Publish Gate, 새 version Publish/Retire, 전체·항목 재생성 proposal과 감사 workflow를 구현한다. 실제 서비스용 Pack은 Builder가 생성했더라도 운영자 검수 완료와 Publish Gate를 명시적으로 통과해야 한다.

## 1. 제품 불변조건

1. Pack은 책을 대신 읽게 만드는 참가자용 요약본이 아니다.
2. 책 자체 지식만 저장하며 사전 입력·세션 메시지·Living Wiki를 Pack에 병합하지 않는다.
3. 사실, 저자 직접 발언, 해석과 토론 신호를 구분한다.
4. 확인되지 않은 내용을 그럴듯하게 채우지 않고 정보 부족으로 남긴다.
5. 출처가 충돌하면 하나를 임의로 사실화하지 않고 충돌과 각 근거를 보존한다.
6. 복수 해석을 하나의 작품 정답으로 평탄화하지 않는다.
7. 자동 Builder 결과는 운영자가 명시적으로 Publish하기 전 실제 토론에 사용할 수 없다.
8. Published version은 불변이며 수정은 새 Draft version으로 진행한다.
9. 방은 생성 시 exact Pack version을 고정하고 이후 Publish/Retire로 자동 변경되지 않는다.
10. Full-text book ingestion, embedding index와 RAG는 MVP 필수 범위가 아니다.

## 2. Book Context Provider

Evaluator, Host와 다른 소비 모듈은 DB table이나 Builder job schema를 직접 조회하지 않고 provider-neutral application interface를 사용한다.

```ts
interface BookContextProvider {
  getPackVersion(input: {
    packVersionId: string;
    consumer: "EVALUATOR" | "HOST" | "OPENING" | "FINAL_RECORD";
    sectionAllowList?: BookContextSection[];
    itemIds?: string[];
    query?: string;
    maxItems: number;
  }): Promise<BookContextDocumentV1>;
}
```

규칙:

- `packVersionId`는 room에 고정된 exact version이어야 한다.
- 신규 방 catalog는 활성 Published version만 반환한다.
- 기존 방의 Provider 조회는 그 방이 고정한 Retired version도 허용한다.
- Draft/Review version은 실제 session consumer에 반환하지 않는다.
- live Evaluator/Host는 web search를 호출하지 않고 Provider가 반환한 검수된 Pack만 사용한다.
- Provider 결과에는 참가자 데이터, Builder 내부 prompt, 운영자 메모와 감사 로그를 포함하지 않는다.
- 향후 RAG를 도입해도 consumer contract와 item reference 의미를 유지한다.

## 3. Pack 기본 구조

### 3.1 Book identity

- 제목, 저자
- 출판사, 출간연도
- 장르
- 판본·에디션 표시
- 번역자
- ISBN
- 표지 URL
- 같은 제목·저자의 다른 판본을 구분하기 위한 식별 메모

ISBN이나 판본 정보를 확인하지 못한 경우 빈 문자열로 위장하지 않고 명시적인 미확인 상태를 유지한다.

### 3.1.1 운영자 도서 검색과 identity 선택

- 운영자는 제목, 저자 또는 ISBN으로 외부 도서 카탈로그를 검색한다.
- MVP 검색 Provider는 Kakao이며 외부 응답은 서버에서 공통 selection contract로 정규화한다.
- 표지, 저자, 번역자, 출판사, 출간일과 ISBN을 보여 주어 정확한 판본을 선택하게 한다.
- 검색 결과가 없으면 수동 등록하지 않고 다른 검색어나 ISBN 검색을 안내한다.
- 생성 command는 서버가 발급한 10분 만료 서명 `selectionProof`만 받는다.
- `provider + externalBookId`와 ISBN-13을 private identity mapping으로 보존하며 동일 판본의 기존 Pack을 중복 생성하지 않는다.
- 외부 API 설명은 identity snapshot과 조사 질의 기준일 뿐 Pack의 검수 완료된 지식으로 간주하지 않는다.

### 3.2 7개 section

| code | 내용 | 주 소비 목적 |
| --- | --- | --- |
| `METADATA` | 책 식별·판본·짧은 소개 | catalog, 판본 혼동 방지 |
| `STRUCTURE` | 전체 개요와 장·부별 흐름 | 발언을 책 전체 흐름에 위치시킴 |
| `THEMES` | 핵심 주제, 문제의식, 반복되는 긴장·가치 충돌 | 큰 토론 축과 보완 의제 |
| `ENTITIES` | 인물·관계·사건 또는 개념·사례·주장 | 고유명사와 개념 연결 |
| `SCENES_AND_CLAIMS` | 주요 장면·주장, 위치, 관련 주제·쟁점 | 구체적인 Book Grounding |
| `DISCUSSION_ISSUES` | 복수 해석이 가능한 충돌 지점과 관련 근거 | 실제 대화에 맞춘 질문 생성 |
| `INTERPRETATION_CAUTIONS` | 논쟁적 해석, 저자 발언과 비평 구분, 복수 해석 | 단일 정답 단정 방지 |

모든 section에 억지로 동일한 수의 항목을 채우지 않는다. section coverage와 정보 부족을 별도 상태로 표현한다.

## 4. 지식 항목과 근거 모델

### 4.1 Item

각 item은 최소한 다음을 가진다.

- Pack version 안에서 안정적인 `itemId`
- section code와 표시 순서
- `FACT | AUTHOR_STATEMENT | INTERPRETATION | DISCUSSION_SIGNAL`
- 짧은 제목과 구조화된 내용
- 책 안의 위치가 확인되는 경우 장·부·페이지가 아닌 판본 독립적 locator 설명
- 관련 theme/entity/issue item id
- evidence state
- 내부 item 검수 상태와 마지막 수정자/시각. 이는 호환성과 감사용이며 운영자가 item마다 상태를 지정하는 UI는 제공하지 않는다.

페이지 번호는 판본에 따라 달라질 수 있으므로 판본 정보와 분리된 절대 사실처럼 사용하지 않는다.

### 4.2 Evidence state

초기 canonical 값:

- `SUPPORTED`: 공식·고신뢰 직접 근거 또는 독립적인 복수 근거가 있음
- `LIMITED`: 단일·간접 근거만 있어 제한을 표시해야 함
- `CONFLICT`: 출처 또는 해석이 충돌함
- `INSUFFICIENT`: 확인 가능한 정보가 부족함

이는 모델 confidence나 일반 정확도 점수가 아니다. 해석 항목은 여러 출처가 지지하더라도 `INTERPRETATION`으로 유지하고 FACT로 승격하지 않는다.

### 4.3 Source

source metadata:

- source id와 Tier `A | B | C | D | E`
- source 유형, 제목, 작성자/발행 주체
- URL 또는 서지 locator
- 발행일과 조사 시각
- 접근 실패·삭제 여부
- 사용 목적과 권리/이용 메모

전체 웹 페이지나 책 본문을 무제한 복제하지 않는다. item 검수에 필요한 최소 citation metadata와 짧은 근거 locator를 보존하고, 원문 저장이 필요해질 경우 콘텐츠 권리 정책을 먼저 확인한다.

### 4.4 Item-source evidence

item과 source는 다대다로 연결한다.

- 관계: `SUPPORTS | CONTRADICTS | CONTEXT_ONLY`
- source 안의 근거 위치 또는 짧은 설명
- Builder가 추출한 근거와 운영자 수정본 구분
- 교차검증 그룹

Tier A~E는 사용 목적을 나타낸다.

- Tier A: 공식 서지·저자 직접 발언·공식 사실
- Tier B: 학술·전문 비평·전문 매체
- Tier C: 주요 언론 서평·대형 서점 편집 정보
- Tier D: 개인 리뷰·독자 관점; FACT 단독 근거 금지
- Tier E: 커뮤니티·SNS; Discussion Signal 용도, FACT 근거 금지

## 5. 권장 relational model

| 테이블 | 책임 |
| --- | --- |
| `books` | 작품/판본 identity와 catalog 표시 정보 |
| `book_context_pack_versions` | 책별 version, schema version, 상태, checksum, 생성·Publish·Retire metadata |
| `book_context_sections` | version별 7개 section, coverage와 review 상태 |
| `book_context_items` | section 안의 stable item과 분류·내용·evidence state |
| `book_context_item_links` | theme/entity/issue 등 item 간 typed relation |
| `book_context_sources` | version에서 사용하는 출처 metadata와 Tier |
| `book_context_item_sources` | item-source evidence 관계와 locator |
| `private.book_builder_runs` | 단계, progress, attempt, 오류 class와 retry 상태 |
| `private.book_builder_artifacts` | 자동 조사 단계의 중간 산출물 reference; live consumer 접근 금지 |
| `private.book_catalog_external_identifiers` | Provider 외부 ID·ISBN과 생성 시점의 정규화 selection snapshot |
| `book_context_admin_audit` | actor, 시각, 대상, action, before/after metadata와 사유 |

Draft authoring은 normalized row를 사용하고 Provider가 canonical `BookContextDocumentV1`으로 조립한다. Published version의 item/source/section row는 update/delete를 금지한다. 필요하면 content checksum으로 Provider cache와 감사 일관성을 확인한다.

## 6. 상태와 version 전이

```text
DRAFT → REVIEW → PUBLISHED → RETIRED
  ↑        │
  └────────┘ 수정 필요 시 Draft로 복귀
```

### Draft

- 자동 저장과 운영자 편집 가능
- 운영자 화면에는 `작성 중`으로 표시하며 Builder run 진행 중에는 `생성 중`으로 표시
- 7개 section과 출처를 한 화면에서 연속해서 읽고 필요한 내용을 수정·삭제
- 제목과 내용이 모두 빈 신규 item은 저장에서 제외하고, 일부만 작성한 item은 두 필수값이 완성될 때까지 저장을 보류
- item·section별 검수 완료 control을 제공하지 않음
- Builder 재실행은 기존 운영자 수정본을 바로 덮어쓰지 않음
- 전체·항목별 재생성 결과를 반영하기 전 diff/영향 확인

### Review

- 직접 수정 금지
- 운영자가 현재 Pack revision 전체의 검수를 완료한 상태이며 화면에는 `검수 완료`로 표시
- Pack-level `reviewedBy`, `reviewedAt`, `reviewedRevision`을 보존
- 수정 필요 시 Draft로 되돌림

### Published

- 신규 방 catalog와 live Provider에서 사용 가능
- 모든 content row 불변
- 책별 활성 Published version 하나
- 새 version Publish는 기존 활성 version Retire와 같은 transaction에서 처리

### Retired

- 신규 방 catalog에서 즉시 숨김
- Retire 사유 필수, 삭제하지 않고 이력 보존
- 이미 exact version을 고정한 방·세션·결과의 Provider 조회는 계속 허용

## 7. Builder durable workflow

Builder는 하나의 긴 LLM 호출이 아니라 재시도 가능한 stage로 나눈다.

1. `IDENTIFY_BOOK`: 제목·저자·판본 후보 확인
2. `DISCOVER_SOURCES`: 공개 자료 자동 탐색
3. `CAPTURE_SOURCE_METADATA`: 출처 Tier·locator·접근 상태 저장
4. `EXTRACT_CLAIMS`: 사실·저자 발언·해석·토론 신호 후보 분류
5. `CROSS_VALIDATE`: 독립 출처 일치·충돌·부족 상태 계산
6. `BUILD_SECTIONS`: 7개 section Draft item 생성
7. `VALIDATE_DRAFT`: schema, reference, coverage와 Publish blocker 계산

실패 시 현재 Draft와 운영자 수정은 유지한다. 자동 retry가 성공해도 Review나 Published로 자동 전환하지 않는다. queue에는 원문 대신 run/stage/version id와 expected revision을 넣고, 긴 stage는 lease를 갱신한다.

## 8. 전체 검수와 Publish Gate

운영자가 전체 검수 완료 전에 확인할 수 있어야 하는 항목:

- 책·저자·판본 식별 일치
- 7개 section별 `MISSING | PARTIAL | READY` coverage
- 핵심 FACT의 source와 conflict
- AUTHOR_STATEMENT의 직접 발언 원출처
- INTERPRETATION의 복수성 및 출처
- DISCUSSION_SIGNAL이 FACT처럼 사용되지 않았는지
- 출처 Tier와 접근 가능 여부
- `LIMITED | CONFLICT | INSUFFICIENT` item 목록
- schema/reference validation 결과

내부 Tier와 evidence validation은 유지하지만 기본 운영자 UI에는 code나 Tier 문자를 노출하지 않는다. hard blocker는 `수정 필요`, warning은 `확인 필요`로 묶고 `근거 부족`, `검수 필요`, `출처 확인 불가` 같은 문장으로 설명한다.

모든 section이 `READY`여야만 검수 완료할 수 있다고 기계적으로 강제하지 않는다. 확인 가능한 자료가 부족한 책을 거짓 내용으로 채우는 결과가 되기 때문이다. 대신 책 식별 실패, 숨겨진 핵심 FACT 충돌, 유효하지 않은 reference와 schema 오류는 `수정 필요`로 두고 해결 전 전체 검수 완료를 막는다. 허용된 부족 상태는 `확인 필요`로 표시하고 운영자가 Pack 단위로 한 번 확인한 사실을 감사 로그에 남긴다.

전체 검수 완료 command는 현재 revision을 잠그고 내부 section/item 상태를 일괄 검수 완료로 기록한다. Publish command는 검수 완료와 별개이며 `reviewedRevision`이 현재 검수본과 일치할 때만 실행한다. 다시 수정하려면 Draft로 복귀해 검수 기록을 무효화하고 새 revision을 검수한다.

## 9. 권한과 노출

- 일반 authenticated 사용자: 활성 Published catalog만 조회
- room participant/query: 자신이 접근 가능한 room에 고정된 exact Published/Retired Provider 결과 중 필요한 public subset
- Admin Builder: Pack workflow에 한정된 command와 Draft/Review 조회
- Worker: Builder stage와 live AI task별 최소 repository
- 운영자 권한만으로 참가하지 않은 방의 메시지·prep·결과나 AI_PRIVATE를 조회할 수 없음

일반 catalog response에는 전체 Pack, source 조사 자료, 운영자 메모와 Builder 상태를 넣지 않는다. 짧은 설명과 판본 식별 정보만 제공한다.

## 10. Contract

`packages/contracts`는 public catalog와 internal Pack contract를 분리한다.

- Public: `BookCatalogItem`, query/sort, room에 고정할 `packVersionId`
- Internal: `BookContextDocumentV1`, section/item/source/evidence schema
- Admin: 외부 도서 검색·서명 selection, Draft/Review snapshot, Builder run/progress, validation issue, Pack-level 검수와 version transition command

DB row를 contract로 직접 반환하지 않고 Provider/mapper에서 strict schema를 통과시킨다. `schemaVersion`이 다른 Pack은 명시적 adapter나 migration 없이 live consumer에 전달하지 않는다.

## 11. 필수 테스트

### DB/command

- 신규 catalog에는 활성 Published version만 노출
- Draft/Review/Retired는 신규 catalog에서 숨김
- Published content update/delete 거절
- 새 version Publish와 이전 version Retire가 atomic
- 기존 room은 Retired exact version을 계속 참조
- hard blocker가 있는 Publish 거절
- item-source reference와 같은 version 소속 검증
- Tier D/E를 FACT 단독 근거로 Publish하는 규칙 검증
- admin command 권한·idempotency·감사 로그
- 동일 Provider ID/ISBN의 중복 Pack 생성 방지
- warning 정확 집합의 Pack 단위 확인과 reviewed revision pin

### Provider/AI fixture

- 7개 section과 item/source/evidence contract parse
- session data가 Pack document에 섞이지 않음
- consumer가 exact room-pinned version만 받음
- 부족·충돌 상태가 사라지지 않음
- 복수 INTERPRETATION이 하나의 정답으로 합쳐지지 않음
- Host/Evaluator가 source 없는 FACT를 생성하지 않음
- live consumer가 web search 또는 Builder artifact repository를 import하지 않음

## 12. Vertical slice 반영

### Slice 2A — Pack foundation

- 기존 Published catalog 유지
- books 판본 identity 보강
- 7개 section/item/source/evidence relational schema
- Published immutability와 Retired exact-version access
- `BookContextProvider` interface와 DB adapter
- 실제 구조를 가진 최소 Published fixture 한 권

이 단계에서는 자동 조사와 Admin Builder UI를 만들지 않는다. 검수된 fixture를 migration/test fixture로 넣어 Slice 5 AI가 실제 Pack contract를 사용할 수 있게 한다.

### Slice 7 — Builder 운영

- ADMIN 권한과 Builder durable stages
- Draft 편집·자동 저장·항목별 재생성 diff
- Review와 Publish Gate
- 새 version Publish/Retire와 사유
- 조사 진행률·실패·재시도
- 전체 감사 로그와 운영자 UI

구현 상태(2026-09-03): 위 항목의 contract, DB command/RLS, worker orchestration, Admin HTTP API와 운영자 UI가 완료되었다. Admin UI는 외부 도서 검색·판본 선택, 전체 내용 연속 편집, Pack 단위 검수 완료와 별도 Publish를 제공한다. 실제 OpenAI 고정 eval은 7개 출처·22개 claim을 조사해 7개 section·22개 item·28개 evidence link 초안을 생성했고 canonical schema 검증을 통과했다. eval report에는 원문 대신 model, latency, token count와 구조 개수만 남겼다.

Slice 5보다 Slice 7이 뒤에 있더라도 AI가 `short_description`에 임시 결합하지 않도록 Slice 2A의 content model과 Provider는 먼저 완료한다.
