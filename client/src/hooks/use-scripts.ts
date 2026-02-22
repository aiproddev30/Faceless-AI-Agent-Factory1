import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type ScriptInput } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useScripts() {
  return useQuery({
    queryKey: [api.scripts.list.path],
    queryFn: async () => {
      const res = await fetch(api.scripts.list.path);
      if (!res.ok) throw new Error("Failed to fetch scripts");
      return api.scripts.list.responses[200].parse(await res.json());
    },
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
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return (
        data.status === 'pending' || data.status === 'processing' ||
        data.audioStatus === 'pending' || data.audioStatus === 'processing'
      ) ? 2000 : false;
    }
  });
}

export function useCreateScript() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: ScriptInput) => {
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
      queryClient.invalidateQueries({ queryKey: ["/api/series"] });
      toast({
        title: "Script Queued",
        description: "Your script and voiceover are being generated.",
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

export function useRegenerateAudio() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, voice }: { id: number; voice: string }) => {
      const url = buildUrl(api.scripts.regenerateAudio.path, { id });
      const res = await fetch(url, {
        method: api.scripts.regenerateAudio.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to regenerate audio");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [api.scripts.get.path, vars.id] });
      queryClient.invalidateQueries({ queryKey: [api.scripts.list.path] });
      toast({
        title: "Regenerating Audio",
        description: "Voiceover is being regenerated with the new voice.",
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
      queryClient.invalidateQueries({ queryKey: ["/api/series"] });
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
