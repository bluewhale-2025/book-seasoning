import { useQuery } from "@tanstack/react-query";

import { useAppRuntime } from "../../app/app-runtime";

export const accountDeletionPreviewKey = ["account", "deletion-preview"] as const;

export function useAccountDeletionPreviewQuery(enabled: boolean) {
  const { account } = useAppRuntime();
  return useQuery({
    queryKey: accountDeletionPreviewKey,
    queryFn: () => account.getDeletionPreview(),
    enabled,
    staleTime: 0,
  });
}
