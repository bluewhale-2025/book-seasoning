# 책은양념 Book Context Builder UX v0.1

> Status: Implemented Builder UX baseline
> Product source of truth: `PRODUCT_SPEC.md` §18~§20  
> Detailed contract: `docs/BOOK_CONTEXT_SPEC.md`  
> Shared UX baseline: `docs/UX_PLAN.md`, `docs/DESIGN_SYSTEM.md`  
> Related decisions: `PRODUCT-025`, `PRODUCT-027`, `PRODUCT-028`, `PRODUCT-033`, `TECH-024`, `TECH-027`, `TECH-029`
> Last updated: 2026-09-03

## 0. 목적과 범위

운영자가 외부 카탈로그에서 정확한 책·판본을 선택하고, 공개 자료로 생성된 Book Context Pack 전체를 읽어 수정·삭제한 뒤 검수 완료하고 실제 토론에 사용할 version을 명시적으로 Publish하는 흐름을 정의한다.

이 화면은 다음 기능을 제공하지 않는다.

- 운영자 가입·초대·역할 관리
- 회원 관리, 신고 처리, 메시지 삭제와 세션 개입
- 참가하지 않은 토론의 채팅·사전 입력·결과 열람
- 전체 책 본문 업로드, embedding index와 Full-text RAG

## 1. UX 원칙

1. 정보 부족과 충돌을 숨기지 않는다.
2. 자동 생성과 운영자 수정의 경계를 보존한다.
3. 검수는 item 상태를 하나씩 바꾸는 작업이 아니라 Pack 전체 내용과 근거를 읽고 필요한 부분을 수정·삭제하는 일이다.
4. 자동 저장은 조용히 표시하고 실패할 때만 행동을 요구한다.
5. Publish와 Retire는 영향과 version 전이를 문장으로 확인한다.
6. `Published`는 불변이며 편집 control을 제공하지 않는다.
7. 정상 stage와 검수 완료를 긴 설명으로 반복하지 않는다.

## 2. 정보 구조

```text
Book Context 관리
├── Pack 목록
├── 새 Pack: 외부 도서 검색 → 판본 선택 → 확인
├── Builder run
└── Pack version
    ├── 연속해서 읽는 7개 section
    ├── item 편집과 source evidence
    ├── 재생성 diff
    ├── 수정 필요 / 확인 필요
    ├── 전체 검수 완료
    └── version history / Publish / Retire
```

ADMIN 계정의 app shell에만 `Book Context 관리` 진입점을 추가한다. 일반 `내 토론 / 토론 찾기 / 토론 만들기`와 구분선을 두고, Builder 안에서 토론 데이터로 이동하는 navigation은 만들지 않는다.

## 3. BC-01 Pack 목록

목록은 최근 변경 순으로 보여주며 row마다 다음만 표시한다.

1. 표지 또는 표지 미확인 placeholder
2. 책 제목·저자·판본
3. 현재 작업 version
4. `생성 중 / 작성 중 / 검수 완료 / 게시됨 / 게시 중단`
5. 마지막 변경 시각
6. Builder 실행 중·실패 상태가 있을 때만 짧은 상태

row 전체로 해당 version에 진입한다. `편집 / 보기` 버튼을 반복하지 않는다. 첫 화면에는 `새 Pack` text action 하나만 강조한다.

## 4. BC-02 새 Pack과 조사 진행

`새 Pack`은 자유 입력 form이 아니라 외부 도서 검색 dialog다.

1. 제목, 저자 또는 ISBN을 검색한다.
2. 결과의 표지, 제목, 저자, 번역자, 출판사, 출간일과 ISBN을 비교한다.
3. 판본 하나를 선택하고 확인 화면에서 다시 확인한다.
4. `이 책으로 Pack 만들기`를 실행하고 Builder run으로 이동한다.

검색 결과가 없으면 다른 검색어나 ISBN을 안내하고 수동 등록 control은 제공하지 않는다. 동일 판본의 Pack이 이미 있으면 새 Pack을 만들지 않고 기존 Pack으로 이동한다.

Builder stage:

1. 책 식별
2. 공개 자료 탐색
3. 출처 정보 저장
4. 후보 지식 분류
5. 출처 교차검증
6. 7개 section 구성
7. Draft 검증

- 완료 stage는 check icon, 실행 중 stage는 progress icon, 실패 stage는 error icon과 icon-only retry를 사용한다.
- 자동 retry와 수동 retry 횟수를 진행률처럼 과장하지 않는다.
- 실패해도 현재 Draft와 운영자 수정이 유지된다는 사실은 실패 상태에 한 번만 표시한다.
- 원본 provider 오류와 내부 job id를 노출하지 않는다.
- 자동 완료 후에도 Review나 Published로 전환하지 않고 Draft로 진입한다.

## 5. BC-03 Draft 편집

### 5.1 상단 context

- 책·판본 identity
- version과 `Draft`
- 자동 저장 상태
- `전체 검수 완료`
- version history 진입

Builder run이 `PENDING / RUNNING / RETRYING`인 동안에는 입력과 lifecycle action을 잠근다. 실행이 완료된 뒤 반환된 최신 revision을 기준으로 편집을 시작하며, stale revision 저장 충돌이 발생하면 자동 재시도하지 않고 로컬 입력을 보존한 채 운영자에게 최신본 재로딩을 요구한다.

### 5.2 section navigation과 연속 검토

7개 section은 한 페이지에 위에서 아래로 모두 표시한다. navigation은 다음 section으로 이동하는 목차이며 section 상태를 바꾸는 control이 아니다.

- 기본 메타정보
- 전체 구조와 흐름
- 핵심 주제
- 인물·개념·사건
- 주요 장면·주장
- 토론 가능 쟁점
- 해석상 주의사항

section coverage는 내부 자동 검사의 참고값으로 유지할 수 있지만 운영자 기본 화면에는 표시하거나 직접 선택하게 하지 않는다.

### 5.3 item row

각 item은 제목, 내용, `사실 / 저자 발언 / 해석 / 토론 신호`, 직관적인 근거 상태, 책 위치와 source 개수를 표시한다. 운영자는 inline으로 수정·삭제하고 item별 `검수됨/미검수`를 지정하지 않는다.

`항목 추가` 직후에는 제목과 내용을 빈 입력으로 제공한다. 두 값이 모두 비어 있으면 자동 저장 payload에서 제외하고, 어느 한쪽만 작성한 경우에는 `제목과 내용을 모두 입력해야 저장됩니다`라고 표시하며 저장과 전체 검수 완료를 보류한다. 두 값을 모두 입력한 뒤에만 일반 Draft item으로 저장한다.

## 6. BC-04 항목과 출처 검수

Draft에서만 내용을 수정한다.

1. item 제목과 구조화 내용
2. 항목 성격
3. evidence state
4. 책 안 locator
5. 관련 item
6. source evidence 목록

source row는 source 유형, 제목·발행 주체, `뒷받침 / 반박 / 맥락`, locator와 접근 상태를 보여준다. Tier A~E는 내부 품질 판정에 유지하지만 기본 UI에서는 문자 등급과 선택 control을 숨긴다. 근거가 약하면 `근거 부족`, 접근할 수 없으면 `출처 확인 불가`로 설명한다.

`항목 재생성`과 `항목 삭제`는 icon-only로 실행하지 않는다. 재생성은 현재본을 보존한 채 새 후보를 만들고 diff 확인으로 이동한다. 삭제는 대상과 source relation 영향을 확인한다.

## 7. BC-05 재생성 diff

desktop에서는 `현재 Draft / 새 생성본`을 나란히, mobile에서는 순서대로 쌓는다. 변경된 내용, 유형, evidence state와 source relation을 비교한다.

- `현재본 유지`: 후보를 버리고 Draft 유지
- `변경사항 반영`: expected revision을 포함해 현재 Draft에 적용

server 성공 전에는 새 생성본을 Draft로 표시하지 않는다. 다른 운영자 변경이나 stale revision이 확인되면 자동 병합하지 않고 최신 Draft를 다시 불러온다.

## 8. BC-06 전체 검수 완료와 Publish Gate

작성 화면은 다음 순서를 따른다.

1. 책·version identity와 상태
2. `수정 필요 N건 · 확인 필요 N건` 요약
3. 7개 section과 출처의 연속 본문
4. 전체 검수 완료 action

`수정 필요` 예:

- 책·저자·판본 식별 실패
- 숨겨진 핵심 FACT 충돌
- 유효하지 않은 item/source reference
- schema 오류
- 핵심 사실을 뒷받침할 신뢰 가능한 출처가 없음

`확인 필요` 예:

- 일부 section이 `일부 확인`
- `제한된 근거 / 정보 부족` item
- 공개 자료 접근 실패

`수정 필요`가 하나라도 있으면 전체 검수 완료 action을 실행할 수 없다. `확인 필요`가 남아 있으면 dialog에서 목록을 읽고 `표시된 확인 필요 항목을 모두 확인했습니다`를 한 번 확인한다. 성공하면 상태가 `검수 완료`가 되고 편집이 잠긴다. `게시하기`는 검수 완료 상태에서 별도의 확인 dialog로 실행한다. 수정이 더 필요하면 `다시 수정하기`로 작성 중 상태에 돌아간다.

## 9. BC-07 Publish 확인

Publish 확인에는 다음 영향을 명시한다.

- 게시할 책과 version
- 신규 토론방에서 새 version을 사용
- 기존 활성 Published version은 Retired
- 이미 생성된 방과 세션은 고정된 기존 version을 계속 사용

실행 label은 `게시`처럼 제품 언어를 사용한다. 성공 전에는 게시됨 badge나 catalog 노출을 먼저 변경하지 않는다.

## 10. BC-08 version history와 Publish 취소

version은 최신순으로 표시하고 각 row에 version, 상태, 생성·Publish·Retire 시각과 사유를 보여준다.

- Published 직접 편집 action 없음
- `새 Draft version 만들기`는 Published를 복제해 다음 version Draft 생성
- Retired version 삭제 action 없음
- Retired exact version을 사용하는 기존 방 수는 영향 확인에만 표시

Publish 취소는 실제로 `Retired` 전환이다. 확인 dialog에서 운영 사유를 필수로 받고 다음 영향을 표시한다.

- 신규 방 카탈로그에서 즉시 숨김
- 기존 방·세션·종료 결과는 고정 version을 계속 사용
- 취소를 되돌리기보다 새 Draft version을 만들어 다시 Publish

기존 방까지 중단하는 긴급 폐기 control은 제공하지 않는다.

## 11. 오류와 저장 상태

- 자동 저장 중: input 인접 spinner 없이 상단에 compact 상태
- 저장 완료: check icon과 `저장됨`
- 저장 실패: `저장하지 못했어요`와 icon-only retry, Draft 유지
- Builder 실패: 실패 stage에 오류와 retry, 운영자 수정 유지
- stale revision: 최신본 재조회 후 diff 다시 확인
- Publish conflict: current active version을 다시 확인하고 dialog를 닫지 않은 채 영향 갱신
- 권한 없음: Builder 내용을 잠깐 보여주지 않고 일반 app shell로 복귀

## 12. 반응형과 접근성

- desktop 736px 이상: 왼쪽 목차와 오른쪽 연속 본문을 2-column으로 사용한다.
- mobile 320px 이상: 목차, item, source와 diff를 한 열로 쌓는다.
- page 전체 horizontal scroll을 만들지 않는다.
- icon-only back, retry, close, source 추가에 accessible name과 tooltip을 제공한다.
- state, evidence와 coverage는 색만으로 구분하지 않는다.
- dialog open/close focus 이동·복귀와 native tab order를 유지한다.
- autosave와 stage progress를 반복 announcement하지 않고 실패·완료 경계만 polite하게 알린다.
- Publish·Retire confirmation은 keyboard만으로 영향 확인과 실행이 가능해야 한다.

## 13. 검증 시나리오

1. 제목, 저자 또는 ISBN 검색 결과에서 정확한 판본을 선택하고 Builder stage를 확인한다.
2. 실패 stage를 재시도해 Draft와 운영자 수정이 유지되는지 확인한다.
3. 7개 section을 연속해서 읽고 item을 수정·삭제하되 item·section별 검수 상태 control이 없는지 확인한다.
4. 항목 재생성 diff에서 현재본 유지와 변경 반영을 각각 확인한다.
5. `수정 필요`가 있으면 전체 검수를 완료할 수 없고 `확인 필요`는 Pack 단위 한 번의 확인 후 검수 완료할 수 있다.
6. 새 version Publish가 기존 활성 version만 Retired로 전환하고 기존 방 pin을 유지한다.
7. Published 직접 편집이 불가능하고 새 Draft version으로만 수정한다.
8. Publish 취소 사유 없이 실행할 수 없고 Retired version을 삭제하지 않는다.
9. ADMIN이 아닌 사용자가 Builder 화면과 command를 사용할 수 없다.
10. 320px와 keyboard-only에서 주요 흐름을 완료한다.

## 14. 구현 검증 결과

2026-09-03 기준 React 구현과 contract/server/DB 테스트에서 다음을 확인했다.

- Pack 필수 입력 검증과 durable stage retry가 동작하며 재시도 안내가 기존 작업 보존을 명시한다.
- 재생성은 현재본과 새 생성본을 비교한 뒤 `현재본 유지 / 변경사항 반영` 중 하나를 선택해야 종료된다.
- 내부 warning 목록은 Pack 단위로 한 번 확인해야 전체 검수를 완료할 수 있고 Publish는 별도 확인 dialog에서 실행된다.
- Publish 취소 사유가 비어 있으면 실행할 수 없고, dialog 닫기 후 focus가 실행 control로 복귀한다.
- 도서 검색 `selectionProof`, 동일 판본 중복 방지, Pack-level 검수 revision과 warning acknowledgement가 contract/DB 테스트로 고정된다.
- 기술 Tier 표시는 기본 UI에서 제거되고 사용자 문구는 `수정 필요`, `확인 필요`, `근거 부족`, `출처 확인 불가`로 매핑된다.
