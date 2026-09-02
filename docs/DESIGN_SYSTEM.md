# 책은양념 Design System v0.2.1

> Status: Accepted typography revision  
> Product source of truth: `PRODUCT_SPEC.md`  
> Technical decisions: `docs/DECISIONS.md` `[TECH-001]`, `[TECH-025]`

## 1. Purpose

책은양념의 Design System은 개별 화면을 장식하는 규칙 모음이 아니다. 사람들이 한 권의 책을 가운데 두고 서로의 생각을 읽고 확장하는 경험을 일관되게 만드는 공통 언어다.

핵심 판단 기준은 다음 순서를 따른다.

1. 사람들의 대화가 가장 잘 보이는가?
2. 현재 어떤 이야기를 하는지 잃지 않는가?
3. AI가 필요 이상으로 존재감을 차지하지 않는가?
4. 긴 텍스트를 읽어도 피곤하지 않은가?
5. 책이라는 맥락이 살아 있는가?
6. 기능이 많아져도 화면이 조용하게 유지되는가?

## 2. Brand personality

### We are

- 밝고 명료하다.
- 지적이지만 어렵지 않다.
- 기능보다 사람의 생각과 대화를 앞세운다.
- 잘 정리된 모바일 독서 서비스처럼 익숙하고 가볍게 느껴진다.
- 많은 상태를 조용하고 정교하게 표현한다.

### We are not

- AI 기능을 전면에 내세우는 SaaS
- ChatGPT clone 또는 기능 밀도가 높은 커뮤니티 도구
- 지나치게 귀엽거나 아동적인 도서관 서비스
- 고상함과 권위를 강조하는 전통적 독서 서비스
- 데이터와 내부 점수를 전면에 노출하는 dashboard

## 2.1 Logo system

공식 로고 방향은 `ㅊ의 한 꼬집`이다. `책`의 첫소리인 한글 자음 `ㅊ` 위에 노란 한 점을 얹어, 책이 생각과 대화에 더해지는 작은 양념이라는 의미를 표현한다.

### Lockup

- 기본 lockup은 심볼 왼쪽, `책은양념` wordmark 오른쪽의 가로형이다.
- wordmark는 Pretendard Variable 700, `-0.05em` 수준의 조밀한 자간을 기준으로 한다.
- 서비스 header에서는 symbol 32px과 wordmark를 함께 사용한다.
- 24px 이하, favicon, profile fallback과 app icon에서는 symbol만 사용한다.
- app icon에 한해 `#FFC004` rounded-square 배경과 `#242424` 단색 symbol 조합을 사용한다.

### Color variants

- 기본형: `#242424` symbol과 wordmark + `#FFC004` 한 점
- 단색형: symbol과 한 점을 모두 black 또는 white 한 색으로 통일
- dark surface: white symbol과 wordmark + `#FFC004` 한 점
- 노란 배경: symbol을 `#242424` 단색으로 사용

### Clear space and minimum size

- clear space는 symbol 상단 점의 지름을 `1x`로 볼 때 lockup 사방에 최소 `2x`를 확보한다.
- digital symbol 최소 크기는 20×20px, 가로 lockup 최소 너비는 96px이다.
- 작은 크기에서는 선 두께를 임의로 줄이지 않는다.
- wordmark는 글자 사이에서 줄바꿈하지 않는다. 공간이 부족하면 가로 lockup 전체 크기를 줄이거나 symbol-only variant로 전환한다.

### Don't

- 점의 위치·크기·색을 임의로 바꾸지 않는다.
- symbol을 회전하거나 `ㅊ`의 획 비율을 변경하지 않는다.
- wordmark를 다른 font, 장평 또는 outline 효과로 장식하지 않는다.
- 기본 UI container까지 로고를 노란 사각형으로 감싸지 않는다. 노란 배경은 app icon에만 사용한다.
- AI 전용 sparkle, 말풍선 또는 책 이미지를 symbol에 추가하지 않는다.

원본 asset은 다음 위치에서 관리한다.

- `packages/design-system/src/assets/logo-mark.svg`
- `packages/design-system/src/assets/logo-mark-monochrome.svg`
- `packages/design-system/src/assets/logo-app-icon.svg`
- `packages/design-system/src/assets/logo-horizontal.svg`

## 3. Reference interpretation

- **밀리의 서재:** v0.2의 최우선 시각 reference다. 2026-09-02 웹 화면에서 확인한 `#242424` 중심의 강한 흑백 대비, `#FFFFFF / #F7F7F7 / #F2F2F2 / #ECECEC`의 중립 surface, Pretendard 계열의 굵고 명료한 hierarchy, 짧고 직관적인 icon navigation, 넓은 여백과 큰 콘텐츠 면을 참고한다. `#FFC004` 노랑은 브랜드 장식이 아니라 선택·현재 위치·짧은 강조에 제한한다.
- 밀리의 서재 로고, 일러스트, 책 큐레이션 모듈, 마케팅 배너와 고유 명칭은 복제하지 않는다. 토론 제품의 정보 구조와 책은양념의 정체성은 유지한다.
- **shadcn/ui:** primitive, composition, variant, form control과 overlay의 구현 기반만 참고한다. 기본 visual theme는 복제하지 않는다.
- **Readwise Reader:** 긴 텍스트의 가독성, 콘텐츠 우선 hierarchy, 넉넉한 여백을 참고한다.
- **Linear:** hover, focus, selected, disabled, loading 상태의 절제와 정밀도를 참고한다.
- **Fable:** 책 표지가 사람과 토론을 연결하는 구조와 club 탐색 방식만 참고한다. 색·서체·컴포넌트 톤은 밀리의 서재 reference가 우선한다.
- **Circle:** session context와 conversation을 분리하되 한 화면 안에서 함께 인지하는 구조를 참고한다.
- **Slack:** 이름, timestamp, 연속 메시지 grouping, unread divider를 참고한다. Thread와 reaction은 사용하지 않고 inline quoted reply를 사용한다.
- **Discord / Geneva:** typing과 presence가 만드는 동시성 감각만 참고한다.

## 4. Visual direction

`Bright Reading`을 기본 방향으로 사용한다. 화면 대부분은 흑백과 회색으로 구성하고 노랑은 필요한 순간에만 보인다.

- page와 핵심 읽기 영역은 pure white를 사용한다.
- 기본 텍스트와 대표 행동은 `#242424`를 사용한다. 노랑을 긴 텍스트나 큰 버튼의 기본색으로 남용하지 않는다.
- 노랑은 현재 navigation, 선택된 control, unread marker, 짧은 강조와 topic marker에 사용한다.
- 책 표지와 참가자 콘텐츠가 가장 높은 채도를 갖도록 주변 surface는 neutral gray로 유지한다.
- 큰 마케팅형 카드보다 내용 단위의 넓은 면, 충분한 section 간격과 단순한 divider를 우선한다.
- 메시지에는 기본 bubble을 사용하지 않는다.
- shadow보다 border, background hierarchy, whitespace를 우선한다.
- sans-serif 한 계열과 분명한 굵기 차이로 hierarchy를 만든다.

## 5. Color system

실제 source는 `packages/design-system/src/tokens.css`다.

| Semantic token | HEX | Usage |
|---|---:|---|
| `background` | `#FFFFFF` | page background |
| `foreground` | `#242424` | primary text and icon |
| `surface` | `#F7F7F7` | quiet panel and section background |
| `surface-elevated` | `#FFFFFF` | dialog, composer, popover |
| `surface-muted` | `#F2F2F2` | selected neutral and disabled region |
| `muted-foreground` | `#6F6F6F` | metadata and caption |
| `border` | `#ECECEC` | structural divider |
| `border-strong` | `#C1C1C1` | input and interactive boundary |
| `accent` | `#FFC004` | selected fill, current marker, unread |
| `accent-hover` | `#F2B600` | yellow fill hover |
| `accent-foreground` | `#242424` | text and icon on yellow |
| `accent-subtle` | `#FFF7D6` | selected/topic background |
| `accent-strong` | `#755900` | accessible accent text on white |
| `action-primary` | `#242424` | primary button |
| `action-primary-foreground` | `#FFFFFF` | primary button text |
| `ai-host-marker` | `#242424` | AI Host label and marker |
| `ai-host-background` | `#F7F7F7` | AI intervention surface |
| `ai-host-border` | `#ECECEC` | AI intervention divider |
| `topic-background` | `#FFF7D6` | current topic surface |
| `topic-foreground` | `#242424` | current topic text |
| `destructive` | `#D64545` | destructive or error action |
| `focus-ring` | `#242424` | visible keyboard focus |

`accent` 노랑은 흰 배경 위 text·icon 색으로 직접 사용하지 않는다. 그 경우 `accent-strong`을 사용한다. `border`는 구조 구분에만 사용하고 입력 경계처럼 component 식별에 필요한 선은 `border-strong`을 사용한다.

## 6. Typography

### Font family

```css
"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont,
system-ui, "Segoe UI", "Noto Sans KR", sans-serif
```

밀리의 서재 웹의 실제 기본 서체와 같은 Pretendard Variable을 앱에 self-host한다. 제목은 굵기만으로 위계를 만들고 자간을 과도하게 압축하지 않으며, 본문과 대화에는 기본 자간과 편안한 행간을 사용한다. 별도 book serif는 사용하지 않는다.

| Role | Size / line-height | Weight | Letter spacing |
|---|---|---:|---:|
| Display | `36 / 44px` | 700 | `-0.018em` |
| Page title | `24 / 34px` | 700 | `-0.012em` |
| Section title | `18 / 27px` | 600 | `-0.008em` |
| Current topic | `18 / 29px` | 600 | `-0.008em` |
| Body | `16 / 27px` | 400 | `0` |
| Chat message | `16 / 28px` | 400 | `0` |
| Metadata | `13 / 19px` | 500 | `0` |
| Label | `13 / 18px` | 600 | `0` |
| Caption | `12 / 18px` | 400 | `0` |

Timer와 숫자 상태에는 tabular numerals를 사용한다. Mobile에서도 chat message는 16px을 유지한다.

## 7. Spacing

Base unit은 4px이며 필요한 경우 2px 보정값을 허용한다.

```text
0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

- 같은 참가자의 연속 메시지: 8px
- 서로 다른 참가자 message group: 24px
- section: 32–48px
- desktop page padding: 32px, wide viewport 40px
- mobile page padding: 16px
- section 간 기본 간격: mobile 40px, desktop 56px

## 8. Radius, border and shadow

```text
radius: 2, 4, 6, 12, 20, full
border: 1px default, 2px emphasis or focus marker
```

- Button / Input: 4–6px
- Composer / content card: 12px
- hero / large media card: 20px
- Dialog: 12px
- Avatar와 presence dot만 원형
- pill은 짧은 status badge에만 사용한다.
- 일반 card는 shadow를 사용하지 않는다.
- floating overlay에만 low shadow, modal dialog에만 medium shadow를 사용한다.

## 9. Motion

| Token | Duration | Usage |
|---|---:|---|
| Fast | 120ms | hover and press |
| Standard | 180ms | selection and disclosure |
| Deliberate | 240ms | dialog and session state |

기본 easing은 `cubic-bezier(0.2, 0, 0, 1)`이다.

- 새 메시지: opacity + translateY(4px), 160ms
- AI 개입: background와 divider가 220ms 동안 조용히 나타난다.
- session state change: 문구와 icon을 동반한 180–240ms transition
- glow, bounce, 반복 pulse는 사용하지 않는다.
- `prefers-reduced-motion`에서는 이동을 제거한다.

## 10. Component principles

- semantic token만 사용하고 component 안에 임의의 brand color를 추가하지 않는다.
- 대표 행동은 검정 button을 기본으로 하고 노랑은 선택·현재 위치·작은 강조에 제한한다.
- variant는 의미와 hierarchy에 따라 구성한다. 시각적 취향을 variant 이름으로 만들지 않는다.
- 모든 icon-only button은 accessible name을 가져야 한다.
- hover에서만 나타나는 기능은 keyboard focus와 touch에서도 접근 가능해야 한다.
- 상태는 color 하나로만 전달하지 않는다.
- loading은 layout shift를 만들지 않는다.
- disabled는 opacity만 낮추지 않고 interaction을 제거하고 cursor와 accessible state를 함께 제공한다.

### Icon-first disclosure

- 이미 널리 학습된 행동은 텍스트 버튼 대신 icon-only control을 우선한다: `뒤로`, `닫기`, `더보기`, `보내기`, `답장`, `재시도`, `참가자 목록`, `검색`, `추가`.
- icon-only control은 `aria-label`을 필수로 하고 desktop hover·keyboard focus에서는 짧은 tooltip을 제공한다.
- 정상 연결, 저장 완료, 입력 규칙처럼 사용자의 즉시 행동이 필요 없는 설명은 상시 노출하지 않는다. 상태가 비정상·변경·행동 필요일 때만 짧게 드러낸다.
- icon만으로 의미가 불명확하거나 결과가 큰 행동은 구체적인 text label을 유지한다: `토론 시작`, `15분 연장`, `마무리하기`, `AI 도움 요청 사유`, `방장 권한 이전`, `참가자 내보내기`, `토론 종료`, 공개 범위 선택.
- 파괴적·되돌릴 수 없는 행동을 색이나 기호만으로 표현하지 않는다. dialog에서 대상과 영향을 문장으로 확인한다.
- 같은 행동에 icon과 설명 문장을 중복해 상시 노출하지 않는다. 보조 설명은 tooltip, menu, dialog처럼 필요할 때 열리는 disclosure에 둔다.

### Foundation components

`Button`, `IconButton`, `Input`, `Textarea`, `Checkbox`, `RadioGroup`, `Select`, `Dialog`, `DropdownMenu`, `Tooltip`, `Badge`, `Avatar`, `Divider`, `Card`를 v0.2 foundation으로 둔다.

### Domain component groups

- **Book:** `BookCover`, `BookIdentity`, `BookContextHeader`, `PackSectionNav`, `PackItemEditor`, `EvidenceTypeBadge`, `SourceTierBadge`, `EvidenceState`, `SourceList`, `CoverageSummary`, `PublishGateSummary`, `VersionHistory`
- **Discussion:** `DiscussionHeader`, `CurrentTopic`, `ParticipantMessage`, `ConsecutiveMessageGroup`, `InlineReply`, `TypingIndicator`, `NewMessageDivider`, `AIHostIntervention`, `MessageComposer`, `ParticipantPresence`, `SessionTimer`
- **Session:** `ExtensionRecommendation`, `HostSessionControls`, `SessionClosing`, `ReflectionInput`
- **Result:** `DiscussionRecord`, `IssueSection`, `PerspectiveMap`, `ChangeAndExpansion`, `OpenQuestions`, `FinalReflection`

Session과 Result component는 제품 vertical slice에서 구현하되 이 문서의 token과 hierarchy를 따른다.

## 11. Discussion room UX

토론방은 chat application이 아니라 하나의 논점을 함께 읽고 탐색하는 실시간 공간이다.

### Desktop

- 전체 shell: max-width 1040px
- primary conversation column: max-width 720px
- app header: 56px
- `BookContextHeader`: 72px
- `CurrentTopic`: 64–88px
- participant avatar: 36px
- AI intervention: max-width 640px, centered
- Composer: conversation column 하단 sticky
- persistent 3-column dashboard를 만들지 않는다.

Book context는 초기 상태에서 표지, 제목, 저자, 남은 시간, 참가 인원을 보여준다. Scroll이 진행되면 compact state로 축소해 작은 표지, 제목, 현재 의제 한 줄, timer를 유지할 수 있다.

### Message timeline

- Participant message는 기본적으로 bubble 없는 문서형 layout이다.
- message body line length는 약 62ch를 넘지 않는다.
- 연속 메시지는 avatar와 이름을 반복하지 않는다.
- Reply는 왼쪽 2px marker와 한두 줄 인용을 사용하는 inline reply다.
- 별도 thread로 이동하지 않는다.
- inline reply action은 hover/focus/touch disclosure로 제공한다.
- emoji reaction은 MVP에서 제공하지 않는다.

## 12. AI Host presentation

- 일반 참가자 avatar를 사용하지 않는다.
- `책은양념 · AI Host`라는 작은 label로 출처를 명확히 한다.
- 배경, 짧은 marker, 상하 divider로 대화와 구분한다.
- participant message보다 같은 수준이거나 낮은 hierarchy를 유지한다.
- accent fill, gradient, glow, mascot, 큰 icon을 사용하지 않는다.
- AI 내부 판단, metrics, private source를 시각적으로 암시하거나 노출하지 않는다.
- Living Wiki 전체, evidence graph와 Participant State는 참가자 UI에 표시하지 않는다. `CurrentTopic`은 서버가 검증한 참가자용 projection만 렌더링한다.

## 12.1 Admin Book Context presentation

- Builder 화면은 참가자용 책 소개 화면과 분리된 운영 도구다.
- 7개 Pack section을 안정된 navigation으로 제공하고 section별 `MISSING / PARTIAL / READY` Coverage를 색과 문구로 함께 표시한다.
- `FACT / AUTHOR_STATEMENT / INTERPRETATION / DISCUSSION_SIGNAL`은 색만이 아니라 text badge로 구분한다.
- 출처 Tier와 evidence state는 서로 다른 개념으로 표시한다. 높은 Tier를 자동으로 높은 정확도 점수처럼 보이게 하지 않는다.
- `CONFLICT`와 `INSUFFICIENT`는 숨기거나 자동 해결된 것처럼 보이지 않게 하며 관련 출처를 나란히 검토할 수 있게 한다.
- 재생성은 현재 운영자 수정본을 즉시 덮어쓰지 않고 diff와 영향 항목 수를 먼저 보여준다.
- Publish Gate는 hard blocker와 확인 가능한 warning을 분리하고, warning 확인이 부족한 내용을 채우라는 압박으로 보이지 않게 한다.
- Published version은 읽기 전용으로 보이고 수정은 새 Draft 생성 흐름으로 안내한다. Retire는 사유 입력과 확인 단계를 거친다.
- 좋은 대화에서는 AI component가 등장하지 않는 상태가 정상이다.

## 13. Session state rules

- 각 기본·연장 토론 구간의 남은 시간이 7분이 되면 `session ending soon`을 timer 색뿐 아니라 icon과 “종료 임박” label로 표시한다. 방장이 연장하지 않으면 5분에 Synthesis로 전환한다.
- 토론 타이머가 0이 된 뒤 시작하는 최대 5분의 Closing은 별도 countdown과 `마무리 중` 상태로 표시하고 일반 토론의 “종료 임박” timer와 혼동하지 않는다.
- `extension decision`은 AI 의견과 방장의 최종 결정을 구분한다. `15분 연장 / 마무리하기` control은 방장에게만 제공하고, 방장은 AI 의견과 관계없이 선택할 수 있다.
- `session closed`에서는 Composer를 비활성화하는 대신 종료 상태와 결과 이동 action을 명확히 제공한다.
- `AI_PRIVATE`는 사전 입력 UI에서 공개 범위로 명확하게 설명하지만 토론 중 participant-facing output에 source를 표시하지 않는다.

## 14. Responsive principles

Mobile에서도 정보 hierarchy는 동일하다.

- compact header: 52–56px
- book cover: 32×44px
- timer와 current topic은 항상 접근 가능하게 유지한다.
- current topic은 sticky 상태에서 최대 두 줄로 줄이고 필요하면 펼칠 수 있게 한다.
- 저자 상세와 participant list는 compact 상태에서 접는다.
- timeline padding: 16px
- avatar: 32px
- AI intervention: 좌우 8px inset
- Composer는 safe area를 포함해 하단에 유지하고 textarea는 44–144px 사이에서 확장한다.

## 15. Accessibility

- WCAG AA text contrast를 기본 목표로 한다.
- form control 경계와 focus indicator는 3:1 이상 contrast를 확보한다.
- native keyboard order를 보존한다.
- focus ring은 2px, 2px offset으로 명확히 보이게 한다.
- icon button은 최소 40px, mobile touch target은 최소 44px을 확보한다.
- error, unread, session ending 상태는 text 또는 icon을 동반한다.
- Dialog, Select, Dropdown, Tooltip, Checkbox, Radio는 Radix primitive를 사용해 keyboard와 screen reader interaction을 보존한다.
- `prefers-reduced-motion`을 존중한다.

## 16. Do / Don't

### Do

- 메시지를 하나의 긴 읽기 흐름으로 유지한다.
- 현재 의제를 작지만 지속적으로 보이게 한다.
- 책 표지의 색이 살아날 수 있도록 주변 채도를 낮춘다.
- 노랑은 선택과 현재 위치를 빠르게 찾는 데만 사용한다.
- 대표 행동은 검정, 보조 행동은 흰색과 얇은 경계로 구분한다.
- AI Host를 대화 사이의 편집 표식처럼 표현한다.
- 상태를 색, icon, 문구를 조합해 표현한다.

### Don't

- 모든 메시지를 bubble로 감싸지 않는다.
- AI에 gradient, glow, 별 모양, mascot avatar를 사용하지 않는다.
- 참가자마다 강한 고유색을 부여하지 않는다.
- 내부 Discussion Metrics를 토론방 dashboard로 노출하지 않는다.
- 모든 control을 pill로 만들지 않는다.
- 넓은 영역을 노란색으로 채우거나 노란색 본문을 사용하지 않는다.
- BookCover를 큰 배경 이미지로 사용해 텍스트 가독성을 낮추지 않는다.

## 17. Implementation map

```text
src/
  styles/
    tokens.css
    globals.css
  components/
    ui/           Foundation primitives
    book/         Book context components
    discussion/   Discussion room components
  lib/
    utils.ts
```

현재 Design System showcase는 `npm run dev`로 실행하고 `npm run build`와 `npm run typecheck`로 검증한다. 실제 서비스는 `TECH-002`와 `docs/TECHNICAL_PLAN.md`에 따라 React + Vite SPA로 전환하며, showcase 코드는 제품 route가 아니라 재사용할 token·component의 입력 자산으로 취급한다.
