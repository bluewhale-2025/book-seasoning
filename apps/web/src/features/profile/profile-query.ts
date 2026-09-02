import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateProfileRequest } from "@bookseasoning/contracts/public";

import { useAppRuntime } from "../../app/app-runtime";

export const profileQueryKey = ["profile"] as const;

export function useProfileQuery() {
  const { profile } = useAppRuntime();
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: () => profile.getProfile(),
  });
}

export function useUpdateProfileMutation() {
  const { profile } = useAppRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateProfileRequest) => profile.updateProfile(request),
    onSuccess: (updated) => queryClient.setQueryData(profileQueryKey, updated),
  });
}
