import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateScript } from "@/hooks/use-scripts";
import { useSeries, useSeriesScripts } from "@/hooks/use-series";
import { insertScriptSchema, type InsertScript } from "@shared/schema";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Sparkles, AlertCircle, Volume2, Loader2, Square, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useCallback, useEffect } from "react";
import { buildUrl, api } from "@shared/routes";

const TONE_OPTIONS = [
  { value: "educational", label: "Educational", desc: "Informative and clear" },
  { value: "humorous", label: "Humorous", desc: "Funny and entertaining" },
  { value: "dramatic", label: "Dramatic", desc: "Emotional and storytelling" },
  { value: "professional", label: "Professional", desc: "Corporate and clean" },
  { value: "casual", label: "Casual", desc: "Relaxed and vlog-style" },
];

const VOICE_OPTIONS = [
  { value: "alloy", label: "Alloy", desc: "Neutral and balanced" },
  { value: "echo", label: "Echo", desc: "Warm and confident" },
  { value: "fable", label: "Fable", desc: "Expressive storyteller" },
  { value: "onyx", label: "Onyx", desc: "Deep and authoritative" },
  { value: "nova", label: "Nova", desc: "Friendly and upbeat" },
  { value: "shimmer", label: "Shimmer", desc: "Clear and polished" },
];

function useVoicePreview() {
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPlayingVoice(null);
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const playPreview = useCallback(async (voice: string) => {
    if (playingVoice === voice) {
      stopPlayback();
      return;
    }

    stopPlayback();
    setLoadingVoice(voice);

    try {
      const url = buildUrl(api.voices.preview.path, { voice });
      let res = await fetch(url);

      if (res.status === 202) {
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 2000));
          res = await fetch(url);
          if (res.ok && res.status !== 202) break;
        }
        if (!res.ok || res.status === 202) throw new Error("Preview is still generating, try again in a moment");
      }

      if (!res.ok) throw new Error("Failed to load preview");

      const blob = await res.blob();
      const newBlobUrl = URL.createObjectURL(blob);
      blobUrlRef.current = newBlobUrl;
      const audio = new Audio(newBlobUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingVoice(null);
        audioRef.current = null;
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
      };
      await audio.play();
      setPlayingVoice(voice);
    } catch (err) {
      console.error("Voice preview error:", err);
    } finally {
      setLoadingVoice(null);
    }
  }, [playingVoice, stopPlayback]);

  return { playPreview, playingVoice, loadingVoice };
}

export default function NewScript() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const presetSeriesId = searchParams.get("seriesId") ? Number(searchParams.get("seriesId")) : null;

  const { mutate: createScript, isPending } = useCreateScript();
  const { playPreview, playingVoice, loadingVoice } = useVoicePreview();
  const { data: allSeries } = useSeries();

  const form = useForm<InsertScript>({
    resolver: zodResolver(insertScriptSchema),
    defaultValues: {
      topic: "",
      tone: "educational",
      length: 500,
      voice: "alloy",
      seriesId: presetSeriesId || undefined,
      episodeNumber: undefined,
    },
  });

  const selectedSeriesId = form.watch("seriesId");
  const activeSeriesId = selectedSeriesId || presetSeriesId || 0;

  const { data: seriesEpisodes } = useSeriesScripts(activeSeriesId);
  const nextEpisodeNumber = activeSeriesId && seriesEpisodes
    ? Math.max(0, ...seriesEpisodes.map(s => s.episodeNumber || 0)) + 1
    : 1;

  useEffect(() => {
    if (activeSeriesId && nextEpisodeNumber) {
      form.setValue("episodeNumber", nextEpisodeNumber);
    }
  }, [activeSeriesId, nextEpisodeNumber, form]);

  const onSubmit = (data: InsertScript) => {
    const payload = {
      ...data,
      seriesId: data.seriesId || undefined,
      episodeNumber: data.seriesId ? (data.episodeNumber || nextEpisodeNumber) : undefined,
    };
    createScript(payload, {
      onSuccess: () => {
        if (presetSeriesId) {
          setLocation(`/series/${presetSeriesId}`);
        } else {
          setLocation("/");
        }
      },
    });
  };

  const currentSeries = allSeries?.find(s => s.id === activeSeriesId);

  return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => {
            if (presetSeriesId) {
              setLocation(`/series/${presetSeriesId}`);
            } else {
              setLocation("/");
            }
          }}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {presetSeriesId ? "Back to Series" : "Back to Dashboard"}
        </button>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative z-10">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <Sparkles className="w-8 h-8 text-primary" />
                {presetSeriesId ? "Add Episode" : "Generate New Script"}
              </h1>
              <p className="text-muted-foreground mt-2">
                {presetSeriesId
                  ? "Add a new episode to your series."
                  : "Configure your settings and let our AI agents craft the perfect script with voiceover."
                }
              </p>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              {currentSeries && (
                <div className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                  <Layers className="w-5 h-5 text-purple-400" />
                  <div>
                    <p className="text-sm font-medium text-purple-400">Adding to series</p>
                    <p className="text-foreground font-semibold">{currentSeries.name}</p>
                  </div>
                  <div className="ml-auto text-sm text-muted-foreground">
                    Episode #{form.watch("episodeNumber") || nextEpisodeNumber}
                  </div>
                </div>
              )}

              {!presetSeriesId && allSeries && allSeries.length > 0 && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Series (optional)</label>
                  <select
                    value={selectedSeriesId || ""}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : undefined;
                      form.setValue("seriesId", val);
                      if (!val) {
                        form.setValue("episodeNumber", undefined);
                      }
                    }}
                    data-testid="select-series"
                    className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all duration-200 appearance-none cursor-pointer"
                  >
                    <option value="">Standalone script (no series)</option>
                    {allSeries.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedSeriesId && !presetSeriesId && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Episode Number</label>
                  <input
                    type="number"
                    min="1"
                    {...form.register("episodeNumber", { valueAsNumber: true })}
                    data-testid="input-episode-number"
                    className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all duration-200"
                    placeholder="Episode number"
                  />
                </div>
              )}

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Video Topic</label>
                <input
                  {...form.register("topic")}
                  data-testid="input-topic"
                  className={cn(
                    "w-full px-4 py-3 rounded-xl bg-background border-2 transition-all duration-200",
                    form.formState.errors.topic
                      ? "border-destructive focus:border-destructive focus:ring-4 focus:ring-destructive/10"
                      : "border-border focus:border-primary focus:ring-4 focus:ring-primary/10"
                  )}
                  placeholder="e.g. The History of Space Exploration..."
                  autoFocus
                />
                {form.formState.errors.topic && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {form.formState.errors.topic.message}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Tone & Style</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TONE_OPTIONS.map((tone) => (
                    <label
                      key={tone.value}
                      data-testid={`radio-tone-${tone.value}`}
                      className={cn(
                        "relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                        form.watch("tone") === tone.value
                          ? "border-primary bg-primary/5 shadow-inner"
                          : "border-border hover:border-primary/50 hover:bg-white/5"
                      )}
                    >
                      <input
                        type="radio"
                        value={tone.value}
                        {...form.register("tone")}
                        className="sr-only"
                      />
                      <span className="font-semibold text-sm">{tone.label}</span>
                      <span className="text-xs text-muted-foreground">{tone.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Voiceover Voice</label>
                <p className="text-xs text-muted-foreground -mt-1">Click the speaker icon to hear a preview</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {VOICE_OPTIONS.map((v) => {
                    const isPlaying = playingVoice === v.value;
                    const isLoading = loadingVoice === v.value;
                    return (
                      <div
                        key={v.value}
                        className={cn(
                          "relative rounded-xl border-2 transition-all duration-200",
                          form.watch("voice") === v.value
                            ? "border-purple-500 bg-purple-500/5 shadow-inner"
                            : "border-border hover:border-purple-500/50 hover:bg-white/5"
                        )}
                      >
                        <label
                          data-testid={`radio-voice-${v.value}`}
                          className="flex flex-col p-4 pb-2 cursor-pointer"
                        >
                          <input
                            type="radio"
                            value={v.value}
                            {...form.register("voice")}
                            className="sr-only"
                          />
                          <span className="font-semibold text-sm">{v.label}</span>
                          <span className="text-xs text-muted-foreground">{v.desc}</span>
                        </label>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); playPreview(v.value); }}
                          disabled={isLoading}
                          data-testid={`button-preview-${v.value}`}
                          className={cn(
                            "flex items-center gap-1.5 text-xs px-4 py-2 w-full rounded-b-xl transition-all duration-200",
                            isPlaying
                              ? "text-purple-400 bg-purple-500/10"
                              : "text-muted-foreground hover:text-purple-400 hover:bg-purple-500/5"
                          )}
                        >
                          {isLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isPlaying ? (
                            <Square className="w-3 h-3 fill-current" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                          {isLoading ? "Loading..." : isPlaying ? "Stop" : "Preview"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-foreground">Target Length (Words)</label>
                  <span className="text-sm text-primary font-mono">{form.watch("length")} words</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="2000"
                  step="50"
                  {...form.register("length")}
                  data-testid="input-length"
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Short (100)</span>
                  <span>Long (2000)</span>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex justify-end">
                <button
                  type="submit"
                  disabled={isPending}
                  data-testid="button-submit"
                  className="
                    px-8 py-3 rounded-xl font-semibold text-lg
                    bg-gradient-to-r from-primary to-purple-600
                    text-white shadow-lg shadow-primary/25
                    hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5
                    active:translate-y-0 active:shadow-md
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                    transition-all duration-200 flex items-center gap-2
                  "
                >
                  {isPending ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      {presetSeriesId ? "Generate Episode" : "Generate Script"}
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
