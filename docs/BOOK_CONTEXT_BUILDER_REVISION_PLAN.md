# Book Context Pack 생성·검수 개편안

> Status: Accepted and implemented  
> Product source of truth: `PRODUCT_SPEC.md`  
> Based on product-owner feedback: 2026-09-03  
> Affected documents: `PRODUCT_SPEC.md`, `docs/BOOK_CONTEXT_SPEC.md`, `docs/BOOK_CONTEXT_BUILDER_UX.md`, `docs/DECISIONS.md`, `docs/API_REFERENCE.md`

## 0. 개편 목표

이번 개편은 두 가지 문제를 해결한다.

1. 운영자가 제목과 저자를 직접 입력하는 대신 외부 도서 검색 결과에서 정확한 책과 판본을 선택한다.
2. 항목마다 검수 상태를 부여하는 복잡한 흐름을 없애고, 운영자가 Pack 전체를 읽고 수정·삭제한 뒤 Pack 단위로 `전체 검수 완료`를 선언한다.

출처 등급, 근거 관계와 자동 validation은 품질과 안전을 위한 내부 정보로 유지할 수 있지만 운영자가 등급 체계를 학습해야만 검수를 끝낼 수 있는 UX는 제공하지 않는다.

## 1. 개편 후 핵심 시나리오

```text
새 Pack 만들기
  → 외부 도서 검색
  → 정확한 책·판본 선택
  → 선택 내용 확인
  → Pack 자동 생성
  → 전체 내용 검토·수정·삭제
  → 표시된 확인 필요 항목 점검
  → 전체 검수 완료
  → Publish
```

Pack 생성과 검수는 계속 `ADMIN`만 수행한다. 일반 사용자는 Published Pack이 있는 책만 토론방에서 선택할 수 있다.

## 2. 도서 검색·등록

### 2.1 운영자 흐름

1. 운영자가 `새 Pack 만들기`를 누른다.
2. 제목, 저자 또는 ISBN으로 책을 검색한다.
3. 검색 결과에서 표지, 제목, 저자, 번역자, 출판사, 출간일과 ISBN을 비교한다.
4. 하나의 판본을 선택한다.
5. 확인 화면에서 선택한 책 정보를 다시 확인한다.
6. `이 책으로 Pack 만들기`를 실행한다.
7. 시스템이 선택한 외부 도서 식별자를 기준으로 책과 Pack Draft를 만들고 Builder를 시작한다.

자유 입력한 제목·저자를 그대로 저장하는 방식은 기본 흐름에서 제거한다. 검색 결과가 없을 때 임의의 책을 수동 등록하는 기능은 이번 MVP 개편 범위에 넣지 않고 별도 결정으로 남긴다.

### 2.2 중복 처리

- ISBN-13이 같으면 같은 판본 후보로 본다.
- ISBN이 없으면 `provider + externalBookId`를 식별 기준으로 사용한다.
- 이미 같은 판본의 Pack이 있으면 새 Pack을 중복 생성하지 않고 기존 Pack과 version history를 안내한다.
- 기존 Published Pack을 수정하려는 경우 `새 Draft version 만들기` 흐름으로 보낸다.
- 제목과 저자가 같아도 번역자, 출판사, ISBN이 다르면 다른 판본일 수 있으므로 자동 병합하지 않는다.

### 2.3 외부 도서 정보의 역할

외부 도서 API 결과는 다음 용도로만 사용한다.

- 책·판본 식별
- 표지와 기본 서지정보 입력
- Builder 조사 질의의 기준 정보

외부 API의 책 소개를 Pack 전체 내용이나 검수 완료된 사실로 취급하지 않는다. Pack의 주제, 장면, 해석과 토론 쟁점은 기존 Builder 조사·생성 흐름에서 별도로 만든다.

## 3. 도서 검색 Provider 권고안

### 3.1 MVP 권고

- 1차 Provider: Kakao 책 검색 API
- application boundary: `BookCatalogSearchProvider`
- 후속 fallback 후보: Google Books 또는 Naver 책 검색
- Amazon Creators API: MVP 후보에서 제외

Kakao는 한국어 도서 검색과 판본 선택에 필요한 제목, 저자, 번역자, 출판사, 출간일, ISBN과 표지를 제공한다. Amazon Creators API는 상품·제휴 프로그램 중심이며 API 접근 전제도 단순 도서 검색보다 무겁다.

Provider 이름과 응답 구조가 Pack domain이나 frontend contract로 직접 새지 않게 한다. 서버가 외부 응답을 공통 `BookSearchResult`로 정규화한다.

```ts
interface BookCatalogSearchProvider {
  search(input: {
    query: string;
    page: number;
    size: number;
  }): Promise<BookSearchPage>;

  getByExternalId(input: {
    externalBookId: string;
  }): Promise<BookSearchResult>;
}
```

### 3.2 공통 검색 결과

```text
provider
externalBookId
title
authors[]
translators[]
publisher
publishedDate
isbn10
isbn13
thumbnailUrl
description
detailUrl
```

클라이언트가 보낸 메타정보를 그대로 신뢰하지 않는다. Pack 생성 시 서버가 `provider + externalBookId`로 도서를 다시 조회하거나 서명된 짧은 수명의 선택 토큰을 검증한다.

## 4. 검수 모델 단순화

### 4.1 운영자에게 보여줄 Pack 상태

| 화면 표시 | 내부 상태 | 의미 |
| --- | --- | --- |
| 생성 중 | Builder run 진행 중인 `DRAFT` | 자동 조사와 초안 생성 중 |
| 작성 중 | `DRAFT` | 전체 내용을 읽고 수정·삭제할 수 있음 |
| 검수 완료 | `REVIEW` | 운영자가 Pack 전체 검토를 완료했으며 직접 편집은 잠김 |
| 게시됨 | `PUBLISHED` | 신규 토론방에서 사용 가능하고 내용은 불변 |
| 게시 중단 | `RETIRED` | 신규 방에서는 숨기되 기존 방의 고정 version은 유지 |

`Draft`, `Review`, `Retired` 같은 내부 영문 용어를 운영자 화면의 주된 설명으로 사용하지 않는다.

### 4.2 제거할 항목별 검수 UX

- 각 item에 `검수됨/미검수`를 지정하는 control
- 각 section을 운영자가 `미확인/일부 확인/검수 준비`로 바꾸는 작업
- 출처 Tier 코드를 알아야 해결할 수 있는 안내
- 모든 item을 하나씩 확인 처리해야 다음 단계로 갈 수 있는 checklist

운영자는 7개 section을 위에서 아래로 연속해서 읽고 필요한 내용을 직접 수정하거나 삭제한다. section navigation은 이동을 돕는 목차로만 사용한다.

### 4.3 유지할 자동 근거 정보

다음 정보는 AI 품질과 Publish 안전을 위해 내부 데이터로 유지한다.

- 사실, 저자 발언, 해석, 토론 신호의 구분
- 출처와 근거 위치
- 출처 간 지지·충돌 관계
- 근거 부족 여부
- schema/reference 오류

Tier A~E는 Builder와 validation의 내부 분류로만 사용하고 기본 UI에는 노출하지 않는다. 출처 상세를 펼치면 실제 출처명, 발행 주체와 링크를 보여주되 Tier 문자를 학습하도록 요구하지 않는다.

## 5. 직관적인 확인 필요 표시

자동 검사 결과는 기술 코드 대신 다음처럼 표시한다.

| 운영자 표시 | 의미 | 게시 영향 |
| --- | --- | --- |
| 책 정보 확인 필요 | 선택한 판본과 조사 결과가 일치하지 않음 | 수정 전 게시 불가 |
| 내용 수정 필요 | 깨진 연결이나 구조 오류가 있음 | 수정 전 게시 불가 |
| 근거 부족 | 단일·간접·낮은 신뢰도의 근거만 있음 | 확인 후 게시 가능 |
| 출처 내용이 다름 | 출처 사이에 충돌이 있음 | 핵심 사실이면 수정 전 게시 불가, 그 외에는 확인 후 가능 |
| 출처 확인 불가 | 링크 접근 실패 또는 출처가 사라짐 | 확인 후 게시 가능 |
| 검수 필요 | 위 항목에 포함되지 않는 운영자 판단 필요 사항 | 확인 후 게시 가능 |

심각도는 두 단계만 사용한다.

- `수정 필요`: 해결하기 전에는 전체 검수 완료 또는 Publish 불가
- `확인 필요`: 운영자가 전체적으로 확인했음을 한 번 승인하면 진행 가능

`hard blocker`, `warning`, `Tier D/E`, `SUPPORTED/LIMITED/CONFLICT/INSUFFICIENT` 같은 용어는 운영자-facing 문구에서 사용하지 않는다.

## 6. 전체 검수 완료 흐름

1. Pack 상단에 `수정 필요 N건 · 확인 필요 N건` 요약을 표시한다.
2. 각 표시는 해당 내용으로 바로 이동할 수 있게 한다.
3. 운영자는 전체 Pack을 읽으며 inline 수정 또는 삭제한다.
4. 항목별 확인 버튼은 누르지 않는다.
5. `수정 필요`가 0건이면 `전체 검수 완료`를 실행할 수 있다.
6. `확인 필요`가 남아 있으면 `표시된 확인 필요 항목을 확인했습니다`를 Pack 단위로 한 번 확인한다.
7. 성공하면 Pack 상태가 `검수 완료`가 되고 편집이 잠긴다.
8. 수정이 더 필요하면 `다시 수정하기`로 `작성 중` 상태로 돌아간다.
9. `검수 완료` 상태에서 별도의 Publish 확인을 거쳐 게시한다.

전체 검수 완료와 Publish는 분리한다. 검수 완료는 내용 확인에 대한 선언이고 Publish는 실제 신규 토론방 노출에 대한 운영 결정이기 때문이다.

## 7. 개편된 화면 구조

```text
Book Context 관리
├── Pack 목록
│   └── 생성 중 / 작성 중 / 검수 완료 / 게시됨 / 게시 중단
├── 새 Pack 만들기
│   ├── 외부 도서 검색
│   ├── 판본 선택
│   └── 선택 확인
├── Pack 작성
│   ├── 전체 내용 연속 보기
│   ├── 수정 필요 / 확인 필요 요약
│   ├── inline 수정·삭제
│   └── 전체·부분 재생성 diff
├── 전체 검수 완료
└── Publish / version history / 게시 중단
```

## 8. Builder 변경

도서가 외부 검색 결과에서 먼저 확정되므로 첫 단계 의미를 바꾼다.

```text
기존: 제목+저자 입력 → IDENTIFY_BOOK
개편: 선택한 도서 identity 저장 → VERIFY_BOOK_IDENTITY
```

나머지 공개 자료 조사, claim 추출, 교차검증, section 생성과 Draft validation은 유지한다. 내부 stage 이름을 즉시 migration할 필요가 없다면 기존 `IDENTIFY_BOOK`을 유지하되 입력으로 선택된 도서 identity를 받고 “새 책 찾기”가 아니라 “선택한 책 검증”만 수행하게 할 수 있다.

## 9. API·데이터 변경 범위

### 9.1 신규 API 초안

```text
GET  /v1/admin/book-context/books/search?q=&page=
POST /v1/admin/book-context/packs
```

Pack 생성 request는 `title + author` 대신 다음을 받는다.

```text
commandId
signedSelectionProof
```

### 9.2 저장할 식별 정보

- provider
- provider의 외부 도서 ID
- 조회 시점
- 정규화한 ISBN-10/ISBN-13
- 제목, 저자, 번역자, 출판사, 출간일과 표지
- 검색 결과 원문 전체가 아닌 생성 시점의 필요한 정규화 snapshot

Provider 교체와 여러 Provider의 동일 판본 연결을 고려해 `books`에 Kakao 전용 컬럼을 직접 추가하기보다 별도 external identifier mapping을 권장한다.

### 9.3 검수 contract

- item별 `reviewStatus`는 저장 호환성과 감사 목적으로 내부 contract에 유지하되 frontend control에서 제거한다.
- section별 coverage는 자동 생성 참고 정보로 남길 수 있지만 운영자의 단계 완료 조건으로 사용하지 않는다.
- validation code는 서버 내부에서 유지하고 frontend adapter가 `수정 필요/확인 필요 + 사용자 문구`로 매핑한다.
- Pack-level `reviewedAt`, `reviewedBy`와 검수 시점 revision을 보존한다.
- 검수 완료 뒤 내용이 바뀌면 반드시 다시 `작성 중`으로 돌아가며 기존 검수 완료 기록을 현재 revision에 재사용하지 않는다.

## 10. 구현 순서

1. Product Decision 확정 및 `PRODUCT_SPEC.md` 수정
2. Kakao 기반 `BookCatalogSearchProvider` 기술 결정 기록
3. 검색·선택·중복 판별 contract와 DB migration
4. Admin 도서 검색/선택 UI
5. Pack 생성 command를 외부 도서 ID 기반으로 변경
6. Builder identity 검증 입력 변경
7. item/section 검수 UI 제거와 전체 검토 화면 개편
8. validation 메시지의 직관적 표현 mapping
9. Pack-level 전체 검수 완료 command와 감사 로그
10. API·frontend fixture·DB·E2E·문서 동시 갱신

## 11. 필수 검증 시나리오

1. 제목, 저자와 ISBN 검색으로 동일한 판본을 찾을 수 있다.
2. 동명 도서와 다른 번역본을 표지·출판사·번역자·ISBN으로 구분할 수 있다.
3. 같은 ISBN으로 Pack을 중복 생성하지 않는다.
4. 외부 Provider 장애가 빈 책이나 잘못된 Draft 생성으로 이어지지 않는다.
5. 운영자는 item별 검수 상태를 지정하지 않고 전체 Pack 검토를 완료할 수 있다.
6. Tier나 내부 validation code를 몰라도 문제 이유와 필요한 행동을 이해할 수 있다.
7. `수정 필요`가 있으면 전체 검수 완료와 Publish가 차단된다.
8. `확인 필요`는 Pack 단위 확인 후 검수 완료할 수 있다.
9. 검수 완료 뒤 다시 수정하면 해당 revision의 검수 완료가 무효화된다.
10. Published Pack 불변성, 새 version Publish와 기존 방의 exact version pin은 유지된다.

## 12. 이번 개편에서 유지하는 불변조건

- 자동 생성 결과를 운영자 승인 없이 토론에 사용하지 않는다.
- 확인되지 않은 내용을 그럴듯하게 채우지 않는다.
- 출처 충돌과 정보 부족을 숨기지 않는다.
- 사실과 해석을 구분한다.
- Published version은 직접 수정하지 않는다.
- 기존 방은 생성 시점에 고정한 Pack version을 계속 사용한다.
- 참가자 데이터와 AI_PRIVATE를 Pack에 넣지 않는다.
- Full-text RAG는 이번 개편 범위에 포함하지 않는다.

## 13. 확정된 선택

2026-09-03 제품 합의로 다음 값을 확정하고 구현했다.

1. MVP 검색 Provider는 Kakao 하나로 시작하고 Provider interface만 확장 가능하게 둔다.
2. 검색 결과가 없으면 수동 등록을 허용하지 않고 다른 검색어와 ISBN 검색을 안내한다.
3. `전체 검수 완료`와 `Publish`는 별도 단계로 유지한다.
4. Tier와 세부 evidence 상태는 내부에 유지하되 운영자 기본 화면에서는 숨긴다.

관련 Source of Truth, 상세 명세, API reference와 구현을 이 결정에 맞춰 동기화했다.
