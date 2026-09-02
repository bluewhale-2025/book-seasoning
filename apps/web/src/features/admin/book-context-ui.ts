import type { AdminBookContextPackSummary } from "@bookseasoning/contracts/admin";

import { HttpClientError } from "../../data/http-client";

export const sectionLabels = {
  METADATA: "책 정보",
  STRUCTURE: "구조",
  THEMES: "주제",
  ENTITIES: "인물·대상",
  SCENES_AND_CLAIMS: "장면·주장",
  DISCUSSION_ISSUES: "토론 쟁점",
  INTERPRETATION_CAUTIONS: "해석 주의",
} as const;

export const statusLabels: Record<AdminBookContextPackSummary["status"], string> = {
  DRAFT: "작성 중",
  REVIEW: "검수 완료",
  PUBLISHED: "게시됨",
  RETIRED: "게시 중단",
};

export const itemKindLabels = {
  FACT: "사실",
  AUTHOR_STATEMENT: "작가 발언",
  INTERPRETATION: "해석",
  DISCUSSION_SIGNAL: "토론 단서",
} as const;
export const evidenceLabels = { SUPPORTED: "근거 있음", LIMITED: "근거 부족", CONFLICT: "출처 내용이 다름", INSUFFICIENT: "근거 부족" } as const;

export function adminErrorMessage(error: unknown) {
  if (!(error instanceof HttpClientError)) return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  const messages: Record<string, string> = {
    ADMIN_REQUIRED: "관리자만 사용할 수 있습니다.",
    BOOK_CONTEXT_PACK_NOT_FOUND: "이 Pack을 찾을 수 없습니다.",
    BOOK_SEARCH_NOT_CONFIGURED: "도서 검색 설정이 필요합니다.",
    BOOK_SEARCH_UNAVAILABLE: "도서 검색을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    BOOK_SEARCH_RESPONSE_INVALID: "도서 검색 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    BOOK_SEARCH_RATE_LIMITED: "도서 검색 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    BOOK_SELECTION_INVALID: "선택한 책 정보를 확인할 수 없습니다. 다시 검색해 주세요.",
    BOOK_SELECTION_EXPIRED: "책 선택 시간이 지났습니다. 다시 검색해 주세요.",
    BOOK_CONTEXT_REVIEW_BLOCKED: "수정이 필요한 내용을 해결한 뒤 전체 검수를 완료할 수 있습니다.",
    BOOK_BUILDER_REVISION_CONFLICT: "다른 변경이 먼저 저장되었습니다. 최신 내용을 불러온 뒤 다시 시도해 주세요.",
    BOOK_BUILDER_DRAFT_LOCKED: "작성 중 상태에서만 내용을 바꿀 수 있습니다.",
    BOOK_BUILDER_RUN_INCOMPLETE: "Builder 실행이 끝난 뒤 전체 검수를 완료할 수 있습니다.",
    BOOK_BUILDER_RETRY_UNAVAILABLE: "지금은 이 실행을 다시 시도할 수 없습니다.",
    BOOK_BUILDER_PROPOSAL_PENDING: "먼저 대기 중인 변경 제안을 검토해 주세요.",
    BOOK_CONTEXT_PUBLISH_BLOCKED: "수정이 필요한 내용을 해결한 뒤 게시할 수 있습니다.",
    BOOK_CONTEXT_WARNINGS_UNACKNOWLEDGED: "확인이 필요한 내용을 검토해 주세요.",
    NETWORK_UNAVAILABLE: "네트워크 연결을 확인해 주세요.",
  };
  return messages[error.code] ?? error.message;
}

export function runLabel(status: "PENDING" | "RUNNING" | "RETRYING" | "SUCCEEDED" | "FAILED") {
  return status === "FAILED" ? "실행 실패" : status === "SUCCEEDED" ? "실행 완료" : "Builder 실행 중";
}

export function formatAdminDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
