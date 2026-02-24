import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface TrendingTopic {
  title: string;
  summary: string;
  category: string;
}

export interface ResearchResult {
  research: string;
  sources?: { title?: string; url: string }[];
}

export function useTrends() {
  return useQuery<TrendingTopic[]>({
    queryKey: ["/api/trends"],
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
}

export function useResearch() {
  return useMutation<ResearchResult, Error, { topic: string }>({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", "/api/research", data);
      return res.json();
    },
  });
}
