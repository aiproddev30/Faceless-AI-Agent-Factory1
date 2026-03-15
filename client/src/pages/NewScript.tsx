import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateScript } from "@/hooks/use-scripts";
import { useSeries, useSeriesScripts } from "@/hooks/use-series";
import { useResearch, type ResearchResult } from "@/hooks/use-trends";
import { insertScriptSchema, type InsertScript } from "@shared/schema";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Sparkles, AlertCircle, Volume2, Loader2, Square, Layers, Globe, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
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

const HISTORY_SCRIPT_TYPES = [
  { value: "why_wouldnt_survive", label: "Why You Wouldn't Survive", desc: "Second-person survival stakes in a past era" },
  { value: "daily_life",          label: "Daily Life in X",          desc: "Sensory social history, morning to night" },
  { value: "full_story",          label: "The Full Story of X",      desc: "Epic narrative arc, rise and fall" },
  { value: "secrets_of",          label: "Secrets of X",             desc: "Surprising reveals, forgotten knowledge" },
  { value: "how_survived",        label: "How They Survived X",      desc: "Ingenuity and resilience of our ancestors" },
];

const VOICE_OPTIONS = [
  { value: "alloy", label: "Alloy", desc: "Neutral and balanced" },
  { value: "echo", label: "Echo", desc: "Warm and confident" },
  { value: "fable", label: "Fable", desc: "Expressive storyteller" },
  { value: "onyx", label: "Onyx", desc: "Deep and authoritative" },
  { value: "nova", label: "Nova", desc: "Friendly and upbeat" },
  { value: "shimmer", label: "Shimmer", desc: "Clear and polished" },
];

const LENGTH_PRESETS = [
  { words: 300,  label: "Short",   desc: "~2 min",  color: "text-green-400"  },
  { words: 750,  label: "Medium",  desc: "~5 min",  color: "text-blue-400"   },
  { words: 1500, label: "Long",    desc: "~10 min", color: "text-purple-400" },
  { words: 3000, label: "Deep",    desc: "~20 min", color: "text-orange-400" },
  { words: 6000, label: "Epic",    desc: "~40 min", color: "text-red-400"    },
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
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.onended = null; audioRef.current = null; }
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    };
  }, []);

  const playPreview = useCallback(async (voice: string) => {
    if (playingVoice === voice) { stopPlayback(); return; }
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
        if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
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
  const presetTopic = searchParams.get("topic") || "";
  const presetStyleMode = searchParams.get("styleMode") || "";
  const presetResearchContext = searchParams.get("researchContext") || "";
  const parentScriptId = searchParams.get("parentScriptId") || "";
  const [parentResearch, setParentResearch] = useState<string>("");

  // Fetch parent script stories if parentScriptId is provided
  useEffect(() => {
    if (!parentScriptId) return;
    fetch(`/api/scripts/${parentScriptId}`)
      .then(r => r.json())
      .then(data => {
        const scenes = data?.sceneData?.scenes || [];
        const storyText = scenes
          .filter((s: any) => !["morse intro","hook","outro"].includes(s.title?.toLowerCase()))
          .map((s: any) => `${s.title}: ${s.voText}`)
          .join("\n\n");
        setParentResearch(storyText);
      })
      .catch(() => {});
  }, [parentScriptId]);

  const { mutate: createScript, isPending } = useCreateScript();
  const { playPreview, playingVoice, loadingVoice } = useVoicePreview();
  const { data: allSeries } = useSeries();
  const { mutate: doResearch, isPending: isResearching, data: researchData, reset: resetResearch } = useResearch();

  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const [historyScriptType, setHistoryScriptType] = useState("daily_life");
  const [scriptModel, setScriptModel] = useState("openai");
  const [showResearch, setShowResearch] = useState(false);

  const form = useForm<InsertScript>({
    resolver: zodResolver(insertScriptSchema),
    defaultValues: {
      topic: presetTopic,
      tone: "educational",
      length: 500,
      voice: "alloy",
      seriesId: presetSeriesId || undefined,
      episodeNumber: undefined,
    },
  });

  const selectedSeriesId = form.watch("seriesId");
  const activeSeriesId = selectedSeriesId || presetSeriesId || 0;
  const currentLength = form.watch("length");

  const { data: seriesEpisodes } = useSeriesScripts(activeSeriesId);
  const nextEpisodeNumber = activeSeriesId && seriesEpisodes
    ? Math.max(0, ...seriesEpisodes.map(s => s.episodeNumber || 0)) + 1
    : 1;

  useEffect(() => {
    if (activeSeriesId && nextEpisodeNumber) form.setValue("episodeNumber", nextEpisodeNumber);
  }, [activeSeriesId, nextEpisodeNumber, form]);

  useEffect(() => {
    if (researchData) { setResearchResult(researchData); setShowResearch(true); }
  }, [researchData]);

  const handleResearch = () => {
    const topic = form.getValues("topic");
    if (!topic.trim()) return;
    doResearch({ topic, style_mode: autoStyleMode });
  };

  const onSubmit = (data: InsertScript) => {
    const payload: any = {
      ...data,
      seriesId: data.seriesId || undefined,
      episodeNumber: data.seriesId ? (data.episodeNumber || nextEpisodeNumber) : undefined,
      styleMode: autoStyleMode,
      tone: isHistorySeries ? historyScriptType : data.tone,
      scriptModel,
    };
    if (researchResult?.research) payload.researchContext = researchResult.research;
    if (presetResearchContext && !payload.researchContext) payload.researchContext = presetResearchContext;
    if (parentResearch && !payload.researchContext) payload.researchContext = parentResearch;
    createScript(payload, {
      onSuccess: () => {
        if (presetSeriesId) setLocation(`/series/${presetSeriesId}`);
        else setLocation("/");
      },
    });
  };

  const currentSeries = allSeries?.find(s => s.id === activeSeriesId);
  const isNewsSeries = currentSeries?.name?.toLowerCase().includes("buzz") || 
                       currentSeries?.name?.toLowerCase().includes("weekly") ||
                       currentSeries?.name?.toLowerCase().includes("news");
  const isHistorySeries = currentSeries?.name?.toLowerCase().includes("history") ||
                         currentSeries?.name?.toLowerCase().includes("sleep");
  const autoStyleMode = presetStyleMode || (isNewsSeries ? "news" : isHistorySeries ? "history" : "timeline");

  // Estimated minutes from word count
  const estimatedMinutes = Math.round(currentLength / 150);

  // Warning level
  const isLong  = currentLength > 3000;
  const isEpic  = currentLength > 5000;

  return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => { if (presetSeriesId) setLocation(`/series/${presetSeriesId}`); else setLocation("/"); }}
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
                      if (!val) form.setValue("episodeNumber", undefined);
                    }}
                    data-testid="select-series"
                    className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all duration-200 appearance-none cursor-pointer"
                  >
                    <option value="">Standalone script (no series)</option>
                    {allSeries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {selectedSeriesId && !presetSeriesId && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Episode Number</label>
                  <input type="number" min="1" {...form.register("episodeNumber", { valueAsNumber: true })}
                    data-testid="input-episode-number"
                    className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all duration-200"
                    placeholder="Episode number" />
                </div>
              )}

              {/* Topic */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Video Topic</label>
                <div className="flex gap-2">
                  <input
                    {...form.register("topic")}
                    data-testid="input-topic"
                    className={cn(
                      "flex-1 px-4 py-3 rounded-xl bg-background border-2 transition-all duration-200",
                      form.formState.errors.topic
                        ? "border-destructive focus:border-destructive focus:ring-4 focus:ring-destructive/10"
                        : "border-border focus:border-primary focus:ring-4 focus:ring-primary/10"
                    )}
                    placeholder="e.g. Punch the Monkey, AI breakthroughs, viral moments..."
                    autoFocus
                  />
                  <button type="button" onClick={handleResearch}
                    disabled={isResearching || !form.watch("topic")?.trim()}
                    data-testid="button-research"
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm whitespace-nowrap transition-all duration-200",
                      "bg-cyan-600/20 text-cyan-400 border-2 border-cyan-600/30",
                      "hover:bg-cyan-600/30 hover:border-cyan-500/50",
                      "disabled:opacity-40 disabled:cursor-not-allowed"
                    )}>
                    {isResearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                    {isResearching ? "Researching..." : "Research"}
                  </button>
                </div>
                {form.formState.errors.topic && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{form.formState.errors.topic.message}
                  </p>
                )}
              </div>

              {/* Research results */}
              {researchResult && (
                <div className="space-y-2" data-testid="research-results">
                  <button type="button" onClick={() => setShowResearch(!showResearch)}
                    className="flex items-center gap-2 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors w-full">
                    <Globe className="w-4 h-4" />Web Research Results
                    {showResearch ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                  </button>
                  {showResearch && (
                    <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-xl p-4 space-y-3">
                      <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto" data-testid="text-research-content">
                        {researchResult.research}
                      </div>
                      {researchResult.sources && researchResult.sources.length > 0 && (
                        <div className="border-t border-cyan-500/10 pt-3">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Sources:</p>
                          <div className="flex flex-wrap gap-2">
                            {researchResult.sources.slice(0, 5).map((source, i) => (
                              <a key={i} href={source.url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 px-2 py-1 rounded-lg transition-colors">
                                <ExternalLink className="w-3 h-3" />
                                {source.title || new URL(source.url).hostname}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-cyan-400/60">This research will be used to make your script accurate and current.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tone / History Script Type */}
              {isHistorySeries ? (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Episode Type</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {HISTORY_SCRIPT_TYPES.map((t) => (
                      <label key={t.value}
                        className={cn(
                          "relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                          historyScriptType === t.value
                            ? "border-amber-500 bg-amber-500/5 shadow-inner"
                            : "border-border hover:border-amber-500/50 hover:bg-white/5"
                        )}
                        onClick={() => setHistoryScriptType(t.value)}>
                        <span className="font-semibold text-sm">{t.label}</span>
                        <span className="text-xs text-muted-foreground">{t.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Tone & Style</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {TONE_OPTIONS.map((tone) => (
                      <label key={tone.value} data-testid={`radio-tone-${tone.value}`}
                        className={cn(
                          "relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                          form.watch("tone") === tone.value
                            ? "border-primary bg-primary/5 shadow-inner"
                            : "border-border hover:border-primary/50 hover:bg-white/5"
                        )}>
                        <input type="radio" value={tone.value} {...form.register("tone")} className="sr-only" />
                        <span className="font-semibold text-sm">{tone.label}</span>
                        <span className="text-xs text-muted-foreground">{tone.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Voice */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Voiceover Voice</label>
                <p className="text-xs text-muted-foreground -mt-1">Click the speaker icon to hear a preview</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {VOICE_OPTIONS.map((v) => {
                    const isPlaying = playingVoice === v.value;
                    const isLoading = loadingVoice === v.value;
                    return (
                      <div key={v.value} className={cn(
                        "relative rounded-xl border-2 transition-all duration-200",
                        form.watch("voice") === v.value
                          ? "border-purple-500 bg-purple-500/5 shadow-inner"
                          : "border-border hover:border-purple-500/50 hover:bg-white/5"
                      )}>
                        <label data-testid={`radio-voice-${v.value}`} className="flex flex-col p-4 pb-2 cursor-pointer">
                          <input type="radio" value={v.value} {...form.register("voice")} className="sr-only" />
                          <span className="font-semibold text-sm">{v.label}</span>
                          <span className="text-xs text-muted-foreground">{v.desc}</span>
                        </label>
                        <button type="button" onClick={(e) => { e.preventDefault(); playPreview(v.value); }}
                          disabled={isLoading} data-testid={`button-preview-${v.value}`}
                          className={cn(
                            "flex items-center gap-1.5 text-xs px-4 py-2 w-full rounded-b-xl transition-all duration-200",
                            isPlaying ? "text-purple-400 bg-purple-500/10" : "text-muted-foreground hover:text-purple-400 hover:bg-purple-500/5"
                          )}>
                          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Volume2 className="w-3.5 h-3.5" />}
                          {isLoading ? "Loading..." : isPlaying ? "Stop" : "Preview"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Length */}
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <label className="text-sm font-medium text-foreground">Target Length</label>
                  <span className="text-sm text-primary font-mono">
                    {currentLength.toLocaleString()} words · ~{estimatedMinutes} min video
                  </span>
                </div>

                {/* Preset buttons */}
                <div className="grid grid-cols-5 gap-2">
                  {LENGTH_PRESETS.map((p) => (
                    <button key={p.words} type="button"
                      onClick={() => form.setValue("length", p.words)}
                      className={cn(
                        "flex flex-col items-center py-2 px-1 rounded-xl border-2 transition-all duration-200 text-center",
                        currentLength === p.words
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40 hover:bg-white/5"
                      )}>
                      <span className={cn("text-xs font-bold", currentLength === p.words ? "text-primary" : p.color)}>
                        {p.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{p.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Slider */}
                <input type="range" min="100" max="8000" step="50"
                  {...form.register("length", { valueAsNumber: true })}
                  data-testid="input-length"
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>100 words</span>
                  <span>8,000 words</span>
                </div>

                {/* Warnings */}
                {isEpic && (
                  <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/30 rounded-xl p-3">
                    <span className="text-orange-400 text-sm mt-0.5">⚠️</span>
                    <p className="text-xs text-orange-400">
                      <strong>Epic length:</strong> Script and voiceover generation will take 5-10 minutes. Video rendering may take 20-30 minutes. Make sure your Replit stays active.
                    </p>
                  </div>
                )}
                {isLong && !isEpic && (
                  <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
                    <span className="text-yellow-400 text-sm mt-0.5">⏱️</span>
                    <p className="text-xs text-yellow-400">
                      <strong>Long script:</strong> Generation will take 3-5 minutes. Video rendering may take 10-15 minutes.
                    </p>
                  </div>
                )}
              </div>

              {/* Model Selector */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Script Model</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "openai", label: "GPT-4o Mini", desc: "OpenAI — best quality" },
                    { value: "groq",   label: "Llama 3.3 70B", desc: "Groq — free & fast" },
                  ].map((m) => (
                    <label key={m.value}
                      className={cn(
                        "relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                        scriptModel === m.value
                          ? "border-green-500 bg-green-500/5 shadow-inner"
                          : "border-border hover:border-green-500/50 hover:bg-white/5"
                      )}
                      onClick={() => setScriptModel(m.value)}>
                      <span className="font-semibold text-sm">{m.label}</span>
                      <span className="text-xs text-muted-foreground">{m.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex justify-end">
                <button type="submit" disabled={isPending} data-testid="button-submit"
                  className="px-8 py-3 rounded-xl font-semibold text-lg bg-gradient-to-r from-primary to-purple-600 text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none transition-all duration-200 flex items-center gap-2">
                  {isPending ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating...</>
                  ) : (
                    <><Sparkles className="w-5 h-5" />{presetSeriesId ? "Generate Episode" : "Generate Script"}</>
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
