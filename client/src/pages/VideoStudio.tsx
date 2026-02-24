import { useRoute } from "wouter";
import { useScript } from "@/hooks/use-scripts";
import { useGenerateVideo } from "@/hooks/use-video";
import { Film, Smartphone, Image, PlayCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function VideoStudio() {
  // ✅ Correct way to read params in wouter
  const [match, params] = useRoute("/video/:id");
  const scriptId = match && params?.id ? Number(params.id) : null;

  // ✅ Only fetch when scriptId exists
  const { data: script, isLoading } = useScript(scriptId ?? 0, {
    enabled: !!scriptId,
  } as any);

  const { mutate: generateVideo, isPending } = useGenerateVideo();

  // If no script selected (like /video-studio)
  if (!scriptId) {
    return (
      <div className="min-h-screen bg-background p-8 md:pl-72">
        <h1 className="text-2xl font-bold">
          Select a script to create video
        </h1>
        <p className="text-muted-foreground mt-2">
          Go to a script and click “Create Video”.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Film className="w-6 h-6 text-primary" />
            Video Studio
          </h1>
          <p className="text-muted-foreground mt-1">
            Create short-form or long-form video from your script.
          </p>
        </div>

        {/* Script Info */}
        {isLoading ? (
          <div className="h-40 rounded-xl bg-card/50 animate-pulse border border-white/5" />
        ) : script ? (
          <div className="bg-card border border-border/50 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-2">
              {script.topic}
            </h2>
            <p className="text-muted-foreground text-sm">
              Tone: {script.tone} • Voice: {script.voice}
            </p>
          </div>
        ) : (
          <div className="text-red-500">
            Script not found.
          </div>
        )}

        {/* Video Format Options */}
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              label: "Shorts / Reels",
              value: "short",
              icon: Smartphone,
              desc: "Vertical 9:16 optimized for TikTok, Shorts, Reels.",
            },
            {
              label: "Slideshow",
              value: "slideshow",
              icon: Image,
              desc: "Ken Burns style slideshow with narration.",
            },
            {
              label: "Stock Montage",
              value: "montage",
              icon: PlayCircle,
              desc: "Full cinematic stock footage edit with transitions.",
            },
          ].map((option) => (
            <motion.div
              key={option.value}
              whileHover={{ y: -4 }}
              className="bg-card border border-border/50 rounded-xl p-6 hover:border-primary/50 transition-all cursor-pointer"
              onClick={() =>
                generateVideo({
                  scriptId,
                  format: option.value,
                })
              }
            >
              <option.icon className="w-8 h-8 text-primary mb-4" />
              <h3 className="font-semibold mb-2">
                {option.label}
              </h3>
              <p className="text-sm text-muted-foreground">
                {option.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Loading State */}
        {isPending && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 text-primary">
            Rendering video... this may take a minute.
          </div>
        )}
      </div>
    </div>
  );
}
