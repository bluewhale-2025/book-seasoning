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
  DRAFT: "초안",
  REVIEW: "검수 중",
  PUBLISHED: "발행됨",
  RETIRED: "사용 종료",
};

export const coverageLabels = { MISSING: "미확인", PARTIAL: "일부 확인", READY: "검수 준비" } as const;
export const reviewLabels = { UNREVIEWED: "미검수", REVIEWED: "검수함" } as const;
export const itemKindLabels = {
  FACT: "사실",
  AUTHOR_STATEMENT: "작가 발언",
  INTERPRETATION: "해석",
  DISCUSSION_SIGNAL: "토론 단서",
} as const;
export const evidenceLabels = { SUPPORTED: "근거 충분", LIMITED: "근거 제한", CONFLICT: "근거 충돌", INSUFFICIENT: "근거 부족" } as const;

export function adminErrorMessage(error: unknown) {
  if (!(error instanceof HttpClientError)) return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  const messages: Record<string, string> = {
    ADMIN_REQUIRED: "관리자만 사용할 수 있습니다.",
    BOOK_CONTEXT_PACK_NOT_FOUND: "이 Pack을 찾을 수 없습니다.",
    BOOK_CONTEXT_REVISION_CONFLICT: "다른 변경이 먼저 저장되었습니다. 최신 내용을 불러온 뒤 다시 시도해 주세요.",
    BOOK_CONTEXT_DRAFT_LOCKED: "초안 상태에서만 내용을 바꿀 수 있습니다.",
    BOOK_CONTEXT_RUN_INCOMPLETE: "Builder 실행이 끝난 뒤 검수를 시작할 수 있습니다.",
    BOOK_CONTEXT_RETRY_UNAVAILABLE: "지금은 이 실행을 다시 시도할 수 없습니다.",
    BOOK_CONTEXT_PROPOSAL_PENDING: "먼저 대기 중인 변경 제안을 검토해 주세요.",
    BOOK_CONTEXT_PUBLISH_BLOCKED: "필수 검수 항목을 해결한 뒤 발행할 수 있습니다.",
    BOOK_CONTEXT_WARNINGS_UNACKNOWLEDGED: "모든 주의 항목을 확인해 주세요.",
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
