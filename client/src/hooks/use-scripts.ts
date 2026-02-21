import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type ScriptInput } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

// ============================================
// HOOKS FOR SCRIPTS
// ============================================

export function useScripts() {
  return useQuery({
    queryKey: [api.scripts.list.path],
    queryFn: async () => {
      const res = await fetch(api.scripts.list.path);
      if (!res.ok) throw new Error("Failed to fetch scripts");
      return api.scripts.list.responses[200].parse(await res.json());
    },
    // Poll every 2 seconds to update status if we have pending items
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasPending = data.some(s => s.status === 'pending' || s.status === 'processing');
      return hasPending ? 2000 : false;
    }
  });
}

export function useScript(id: number) {
  return useQuery({
    queryKey: [api.scripts.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.scripts.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch script");
      return api.scripts.get.responses[200].parse(await res.json());
    },
    // Poll if specific script is pending
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return (data.status === 'pending' || data.status === 'processing') ? 2000 : false;
    }
  });
}

export function useCreateScript() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: ScriptInput) => {
      // Ensure length is a number
      const payload = { ...data, length: Number(data.length) };
      const validated = api.scripts.create.input.parse(payload);
      
      const res = await fetch(api.scripts.create.path, {
        method: api.scripts.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.scripts.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create script");
      }
      return api.scripts.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.scripts.list.path] });
      toast({
        title: "Script Queued",
        description: "Your script has been added to the generation queue.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });
}

export function useDeleteScript() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.scripts.delete.path, { id });
      const res = await fetch(url, { method: api.scripts.delete.method });
      if (res.status === 404) throw new Error("Script not found");
      if (!res.ok) throw new Error("Failed to delete script");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.scripts.list.path] });
      toast({
        title: "Script Deleted",
        description: "The script has been permanently removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });
}
