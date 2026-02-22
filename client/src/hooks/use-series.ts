import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type SeriesInput } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useSeries() {
  return useQuery({
    queryKey: [api.series.list.path],
    queryFn: async () => {
      const res = await fetch(api.series.list.path);
      if (!res.ok) throw new Error("Failed to fetch series");
      return api.series.list.responses[200].parse(await res.json());
    },
  });
}

export function useSeriesById(id: number) {
  return useQuery({
    queryKey: [api.series.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.series.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch series");
      return api.series.get.responses[200].parse(await res.json());
    },
  });
}

export function useSeriesScripts(id: number) {
  return useQuery({
    queryKey: [api.series.scripts.path, id],
    queryFn: async () => {
      const url = buildUrl(api.series.scripts.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch series scripts");
      return api.series.scripts.responses[200].parse(await res.json());
    },
    enabled: id > 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasPending = data.some(s =>
        s.status === 'pending' || s.status === 'processing' ||
        s.audioStatus === 'pending' || s.audioStatus === 'processing'
      );
      return hasPending ? 2000 : false;
    }
  });
}

export function useCreateSeries() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: SeriesInput) => {
      const res = await fetch(api.series.create.path, {
        method: api.series.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create series");
      }
      return api.series.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.series.list.path] });
      toast({
        title: "Series Created",
        description: "Your new series has been created.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteSeries() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.series.delete.path, { id });
      const res = await fetch(url, { method: api.series.delete.method });
      if (res.status === 404) throw new Error("Series not found");
      if (!res.ok) throw new Error("Failed to delete series");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.series.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.scripts.list.path] });
      toast({
        title: "Series Deleted",
        description: "The series has been removed. Scripts are now standalone.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
