import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function useGenerateVideo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      scriptId,
      format,
    }: {
      scriptId: number;
      format: "short" | "slideshow" | "montage";
    }) => {
      const res = await fetch(`/api/scripts/${scriptId}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to generate video");
      }

      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Video Rendering Started",
        description: "Your video is being assembled.",
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
