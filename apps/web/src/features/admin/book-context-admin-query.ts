import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BuilderPackCommandRequest,
  CompleteBookContextReviewRequest,
  CreateBookContextPackRequest,
  ProposalCommandRequest,
  PublishBookContextPackRequest,
  RegenerateBookContextRequest,
  RetireBookContextPackRequest,
  RetryBookBuilderRunRequest,
  UpdateBookContextDraftRequest,
} from "@bookseasoning/contracts/admin";

import { useAppRuntime } from "../../app/app-runtime";

export const bookContextPackListKey = ["admin", "book-context", "packs"] as const;
export const bookContextPackKey = (packVersionId: string) => ["admin", "book-context", "packs", packVersionId] as const;

export function useBookContextPackListQuery() {
  const { bookBuilder } = useAppRuntime();
  return useQuery({ queryKey: bookContextPackListKey, queryFn: () => bookBuilder.listPacks() });
}

export function useAdminBookSearchQuery(query: string, page = 1, enabled = true) {
  const { bookBuilder } = useAppRuntime();
  return useQuery({
    queryKey: ["admin", "book-context", "book-search", query, page],
    queryFn: () => bookBuilder.searchBooks(query, page),
    enabled: enabled && query.trim().length > 0,
    retry: false,
  });
}

export function useBookContextPackQuery(packVersionId: string) {
  const { bookBuilder } = useAppRuntime();
  return useQuery({
    queryKey: bookContextPackKey(packVersionId),
    queryFn: () => bookBuilder.getPack(packVersionId),
    enabled: packVersionId.length > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.pack.builderRun?.status;
      return status === "PENDING" || status === "RUNNING" || status === "RETRYING" ? 2_000 : false;
    },
  });
}

function useRefreshPack(packVersionId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: bookContextPackKey(packVersionId) }),
      queryClient.invalidateQueries({ queryKey: bookContextPackListKey }),
    ]);
  };
}

export function useCreateBookContextPackMutation() {
  const { bookBuilder } = useAppRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateBookContextPackRequest) => bookBuilder.createPack(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bookContextPackListKey }),
  });
}

export function useUpdateBookContextDraftMutation(packVersionId: string) {
  const { bookBuilder } = useAppRuntime();
  const refresh = useRefreshPack(packVersionId);
  return useMutation({
    mutationFn: (request: UpdateBookContextDraftRequest) => bookBuilder.updateDraft(packVersionId, request),
    onSuccess: refresh,
  });
}

export function usePackLifecycleMutation(packVersionId: string) {
  const { bookBuilder } = useAppRuntime();
  const refresh = useRefreshPack(packVersionId);
  return useMutation({
    mutationFn: (operation:
      | { kind: "review"; request: CompleteBookContextReviewRequest }
      | { kind: "draft"; request: BuilderPackCommandRequest }
      | { kind: "publish"; request: PublishBookContextPackRequest }
      | { kind: "retire"; request: RetireBookContextPackRequest }) => {
      if (operation.kind === "review") return bookBuilder.requestReview(packVersionId, operation.request);
      if (operation.kind === "draft") return bookBuilder.returnToDraft(packVersionId, operation.request);
      if (operation.kind === "publish") return bookBuilder.publish(packVersionId, operation.request);
      return bookBuilder.retire(packVersionId, operation.request);
    },
    onSuccess: refresh,
  });
}

export function useRetryBuilderRunMutation(packVersionId: string) {
  const { bookBuilder } = useAppRuntime();
  const refresh = useRefreshPack(packVersionId);
  return useMutation({
    mutationFn: ({ runId, request }: { runId: string; request: RetryBookBuilderRunRequest }) => bookBuilder.retryRun(runId, request),
    onSuccess: refresh,
  });
}

export function useRegenerateBookContextMutation(packVersionId: string) {
  const { bookBuilder } = useAppRuntime();
  const refresh = useRefreshPack(packVersionId);
  return useMutation({
    mutationFn: (request: RegenerateBookContextRequest) => bookBuilder.regenerate(packVersionId, request),
    onSuccess: refresh,
  });
}

export function useProposalMutation(packVersionId: string) {
  const { bookBuilder } = useAppRuntime();
  const refresh = useRefreshPack(packVersionId);
  return useMutation({
    mutationFn: ({ proposalId, action, request }: { proposalId: string; action: "apply" | "discard"; request: ProposalCommandRequest }) => action === "apply" ? bookBuilder.applyProposal(proposalId, request) : bookBuilder.discardProposal(proposalId, request),
    onSuccess: refresh,
  });
}
