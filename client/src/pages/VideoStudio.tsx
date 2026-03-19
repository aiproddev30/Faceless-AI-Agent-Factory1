import {  useState } from "react";
import { useRoute } from "wouter";
import { useScript } from "@/hooks/use-scripts";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Film, Search, RefreshCw, CheckCircle, Loader2,
  ChevronRight, Play, X, Wand2, Sparkles, Camera, Palette,
  Monitor, Smartphone
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Asset { type: string; source: string; path: string; }
interface SceneClips {
  scene_number: number;
  title: string;
  estimated_duration: number;
  visual_style: string;
  vo: string;
  assets: Asset[];
}

type Step = "idle" | "fetching" | "preview" | "rendering" | "done" | "error";
type VisualStyle = "realistic" | "cartoon" | "cinematic" | "news" | "history";
type VideoFormat = "youtube" | "shorts";

const VISUAL_STYLES: { key: VisualStyle; label: string; description: string; icon: React.ReactNode }[] = [
  {
    key: "realistic",
    label: "Realistic",
    description: "Stock footage from Pexels & Pixabay",
    icon: <Camera className="w-4 h-4" />,
  },
  {
    key: "cinematic",
    label: "Cinematic",
    description: "High-quality curated footage",
    icon: <Film className="w-4 h-4" />,
  },
  {
    key: "cartoon",
    label: "Cartoon",
    description: "AI-generated illustrated scenes",
    icon: <Palette className="w-4 h-4" />,
  },
  {
    key: "news",
    label: "News Slides",
    description: "Branded AI Weekly Buzz slides",
    icon: <Film className="w-4 h-4" />,
  },
  {
    key: "history" as VisualStyle,
    label: "History While You Sleep",
    description: "Ember animation with fire audio",
    icon: <Film className="w-4 h-4" />,
  },
];

const VIDEO_FORMATS: { key: VideoFormat; label: string; description: string; icon: React.ReactNode; dims: string }[] = [
  {
    key: "youtube",
    label: "YouTube",
    description: "Landscape 16:9",
    icon: <Monitor className="w-4 h-4" />,
    dims: "1920×1080",
  },
  {
    key: "shorts",
    label: "Shorts / Reels",
    description: "Vertical 9:16",
    icon: <Smartphone className="w-4 h-4" />,
    dims: "1080×1920",
  },
];

const FETCH_MESSAGES: Record<VisualStyle, string> = {
  realistic: "Searching for relevant clips...",
  cinematic: "Curating cinematic footage...",
  cartoon: "Generating cartoon illustrations...",
  news: "Generating branded news slides...",
  history: "Rendering History While You Sleep episode...",
};

const IDLE_DESCRIPTIONS: Record<VisualStyle, string> = {
  realistic: "We'll fetch relevant clips from Pexels & Pixabay for each scene. You can swap any before rendering.",
  cinematic: "We'll curate high-quality cinematic footage for each scene. You can swap any before rendering.",
  cartoon: "We'll generate AI cartoon illustrations for each scene using your script as prompts.",
  news: "We'll generate branded AI Weekly Buzz slides for each scene with your logo and brand colors.",
  history: "Renders the full episode over the History While You Sleep ember background with fire crackling audio.",
};

const STATUS_STEPS = [
  { key: "media",    label: "Fetching clips"    },
  { key: "timeline", label: "Building timeline" },
  { key: "render",   label: "Rendering video"   },
  { key: "audio",    label: "Mixing audio"      },
  { key: "done",     label: "Complete!"         },
];

function StyleSelector({ value, onChange }: { value: VisualStyle; onChange: (s: VisualStyle) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {VISUAL_STYLES.map((style) => {
        const active = value === style.key;
        return (
          <button
            key={style.key}
            onClick={() => onChange(style.key)}
            className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center
              ${active
                ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
              }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all
              ${active ? "bg-primary text-white" : "bg-white/10 text-muted-foreground"}`}>
              {style.icon}
            </div>
            <div>
              <p className={`text-sm font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {style.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{style.description}</p>
            </div>
            {active && (
              <div className="absolute top-2 right-2">
                <CheckCircle className="w-3.5 h-3.5 text-primary" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FormatSelector({ value, onChange }: { value: VideoFormat; onChange: (f: VideoFormat) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {VIDEO_FORMATS.map((fmt) => {
        const active = value === fmt.key;
        return (
          <button
            key={fmt.key}
            onClick={() => onChange(fmt.key)}
            className={`relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left
              ${active
                ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
              }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all
              ${active ? "bg-primary text-white" : "bg-white/10 text-muted-foreground"}`}>
              {fmt.icon}
            </div>
            <div>
              <p className={`text-sm font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {fmt.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{fmt.description}</p>
              <p className="text-xs font-mono text-muted-foreground/60 mt-0.5">{fmt.dims}</p>
            </div>
            {active && (
              <div className="absolute top-2 right-2">
                <CheckCircle className="w-3.5 h-3.5 text-primary" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ClipThumb({ url, type, selected, onClick }: {
  url: string; type?: string; selected?: boolean; onClick?: () => void;
}) {
  const isImage = type === "image" || !url.match(/\.(mp4|webm|mov)/i);
  return (
    <div
      onClick={onClick}
      className={`relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all aspect-[9/16] bg-black/40
        ${selected ? "border-primary shadow-lg shadow-primary/30" : "border-white/10 hover:border-white/30"}`}
    >
      {isImage ? (
        <img src={url} className="w-full h-full object-cover" alt="" />
      ) : (
        <video
          src={url}
          className="w-full h-full object-cover"
          muted loop
          onMouseEnter={e => (e.target as HTMLVideoElement).play()}
          onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
        />
      )}
      {selected && (
        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
          <CheckCircle className="w-6 h-6 text-primary" />
        </div>
      )}
      {!isImage && (
        <div className="absolute bottom-1 right-1">
          <Play className="w-3 h-3 text-white/60" />
        </div>
      )}
    </div>
  );
}

function SceneCard({ scene, onSwap, scriptId, videoFormat }: {
  scene: SceneClips;
  onSwap: (sceneIdx: number, assetIdx: number, newUrl: string) => void;
  scriptId: number;
  videoFormat: string;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [activeAsset, setActiveAsset] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const sceneIdx = scene.scene_number - 1;

  async function doSearch() {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const res = await apiRequest("POST", `/api/scripts/${scriptId}/swap-clip`, { query, count: 6, videoFormat });
      const data = await res.json();
      setSearchResults(data.clips || []);
    } catch (e) { console.error(e); }
    finally { setIsSearching(false); }
  }

  return (
    <div className="bg-card border border-border/50 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded">
              Scene {scene.scene_number}
            </span>
            <span className="text-xs text-muted-foreground">{scene.estimated_duration}s</span>
          </div>
          <h3 className="font-semibold mt-1">{scene.title}</h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{scene.vo}</p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={() => setSearching(!searching)}>
          <Search className="w-3 h-3 mr-1" />Swap
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {scene.assets.map((asset, i) => (
          <ClipThumb key={i} url={asset.path} type={asset.type} selected={activeAsset === i}
            onClick={() => setActiveAsset(activeAsset === i ? null : i)} />
        ))}
        {scene.assets.length === 0 && (
          <div className="col-span-2 h-20 rounded-lg bg-white/5 flex items-center justify-center text-xs text-muted-foreground">
            No clips found
          </div>
        )}
      </div>
      <AnimatePresence>
        {searching && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="pt-2 space-y-3">
              <p className="text-xs text-muted-foreground">
                {activeAsset !== null ? `Replacing clip ${activeAsset + 1}` : "Select a clip above first"}
              </p>
              <div className="flex gap-2">
                <Input value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="e.g. hamburger grill smoke" className="text-sm h-8"
                  onKeyDown={e => e.key === "Enter" && doSearch()} />
                <Button size="sm" onClick={doSearch} disabled={isSearching} className="h-8">
                  {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                </Button>
              </div>
              {searchResults.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {searchResults.map((url, i) => (
                    <ClipThumb key={i} url={url} onClick={() => {
                      if (activeAsset !== null) {
                        onSwap(sceneIdx, activeAsset, url);
                        setSearching(false); setSearchResults([]); setActiveAsset(null);
                      }
                    }} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RenderStatus({ currentStep }: { currentStep: string }) {
  const currentIdx = STATUS_STEPS.findIndex(s => s.key === currentStep);
  return (
    <div className="bg-card border border-border/50 rounded-xl p-6 space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        Rendering your video...
      </h3>
      <div className="space-y-2">
        {STATUS_STEPS.map((step, i) => {
          const done = i < currentIdx || currentStep === "done";
          const active = step.key === currentStep;
          return (
            <div key={step.key} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0
                ${done ? "bg-primary" : active ? "bg-primary/30 border border-primary" : "bg-white/5"}`}>
                {done ? <CheckCircle className="w-3 h-3 text-white" />
                  : active ? <Loader2 className="w-3 h-3 animate-spin text-primary" /> : null}
              </div>
              <span className={`text-sm ${active ? "text-foreground font-medium"
                : done ? "text-muted-foreground line-through" : "text-muted-foreground/50"}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function VideoStudio() {
  const [match, params] = useRoute("/video/:id");
  const scriptId = match && params?.id ? Number(params.id) : null;
  const { data: script } = useScript(scriptId ?? 0, { enabled: !!scriptId } as any);

  const [step, setStep] = useState<Step>("idle");
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("realistic");
  const [videoFormat, setVideoFormat] = useState<VideoFormat>("youtube");
  const [scenes, setScenes] = useState<SceneClips[]>([]);
  const [renderStep, setRenderStep] = useState("media");
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchClips = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/scripts/${scriptId}/preview-clips`, {
        visualStyle,
        videoFormat,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onMutate: () => { setStep("fetching"); setError(null); },
    onSuccess: (data) => { setScenes(data); setStep("preview"); },
    onError: (e: any) => { setError(e.message); setStep("error"); },
  });

  function handleSwap(sceneIdx: number, assetIdx: number, newUrl: string) {
    setScenes(prev => prev.map((s, i) => {
      if (i !== sceneIdx) return s;
      const assets = [...s.assets];
      assets[assetIdx] = { ...assets[assetIdx], path: newUrl };
      return { ...s, assets };
    }));
  }

  const renderVideo = useMutation({
    mutationFn: async () => {
      const steps = ["media", "timeline", "render", "audio"];
      let si = 0;
      const interval = setInterval(() => {
        si = Math.min(si + 1, steps.length - 1);
        setRenderStep(steps[si]);
      }, 8000);
      try {
        const res = await apiRequest("POST", `/api/scripts/${scriptId}/generate-video`, {
          scenes,
          visualStyle,
          videoFormat,
          episode:  (script as any)?.episodeNumber ?? 1,
          week:     (window as any).__aiwb_week ?? "",
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      } finally { clearInterval(interval); setRenderStep("done"); }
    },
    onMutate: () => { setStep("rendering"); setRenderStep("media"); },
    onSuccess: (data) => { setVideoPath(data.videoPath); setStep("done"); },
    onError: (e: any) => { setError(e.message); setStep("error"); },
  });

  if (!scriptId) return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <p className="text-muted-foreground">Select a script to create a video.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Film className="w-6 h-6 text-primary" />Video Studio
          </h1>
          {script && <p className="text-muted-foreground mt-1">{script.topic}</p>}
        </div>

        <div className="flex items-center gap-2 text-sm">
          {["Fetch Clips", "Review & Swap", "Render"].map((label, i) => {
            const active = (i === 0 && (step === "idle" || step === "fetching"))
              || (i === 1 && step === "preview")
              || (i === 2 && (step === "rendering" || step === "done"));
            const done = (i === 0 && !["idle","fetching"].includes(step))
              || (i === 1 && ["rendering","done"].includes(step));
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all
                  ${active ? "bg-primary text-white" : done ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"}`}>
                  {done && <CheckCircle className="w-3 h-3" />}{label}
                </div>
                {i < 2 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            );
          })}
        </div>

        {step === "idle" && (
          <div className="bg-card border border-border/50 rounded-xl p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Wand2 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Ready to create your video</h2>
              <p className="text-muted-foreground text-sm">{IDLE_DESCRIPTIONS[visualStyle]}</p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Visual style</p>
              <StyleSelector value={visualStyle} onChange={setVisualStyle} />
              {visualStyle === "news" && (
                <div className="flex gap-3 mt-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Episode #</label>
                    <input type="number" min={1} defaultValue={1}
                      onChange={e => { (window as any).__aiwb_episode = Number(e.target.value); }}
                      className="w-24 px-3 py-2 rounded-lg bg-background border border-border text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Week Of</label>
                    <input type="text" defaultValue={new Date().toLocaleDateString("en-US", {month:"long",day:"numeric",year:"numeric"})}
                      onChange={e => { (window as any).__aiwb_week = e.target.value; }}
                      className="w-56 px-3 py-2 rounded-lg bg-background border border-border text-sm" />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Format</p>
              <FormatSelector value={videoFormat} onChange={setVideoFormat} />
            </div>

            <Button onClick={() => visualStyle === "history" ? setStep("preview") : fetchClips.mutate()} size="lg" className="w-full">
              {visualStyle === "history"
                ? <><Film className="w-4 h-4 mr-2" />Ready to Render</>
                : visualStyle === "cartoon"
                ? <><Sparkles className="w-4 h-4 mr-2" />Generate Illustrations</>
                : <><Search className="w-4 h-4 mr-2" />Fetch Clips</>
              }
            </Button>
          </div>
        )}

        {step === "fetching" && (
          <div className="bg-card border border-border/50 rounded-xl p-8 text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">{FETCH_MESSAGES[visualStyle]}</p>
          </div>
        )}

        {step === "preview" && visualStyle === "history" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center space-y-3">
              <div className="text-4xl">🔥</div>
              <h2 className="text-lg font-semibold text-amber-400">History While You Sleep</h2>
              <p className="text-sm text-muted-foreground">
                Your episode will render over the ember background with fire crackling audio.
                This may take several minutes for full-length episodes.
              </p>
            </div>
            <Button size="lg" className="w-full bg-amber-600 hover:bg-amber-700" onClick={() => renderVideo.mutate()}>
              <Film className="w-4 h-4 mr-2" />Render History Episode
            </Button>
          </motion.div>
        )}

        {step === "preview" && visualStyle === "news" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {scenes.length} branded slides generated. Ready to render.
              </p>
              <Button variant="outline" size="sm" onClick={() => fetchClips.mutate()}>
                <RefreshCw className="w-3 h-3 mr-1" />Regenerate Slides
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {scenes.map((scene, i) => (
                <div key={i} className="relative rounded-lg overflow-hidden border border-border/50 bg-black group">
                  {scene.assets?.[0]?.path ? (
                    <img
                      src={`/storage/output/slides/${scene.assets[0].path.split("/").pop()}`}
                      alt={scene.title}
                      className="w-full aspect-video object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-muted flex items-center justify-center">
                      <Film className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2">
                    <p className="text-xs font-mono text-yellow-400 truncate">
                      {i + 1}. {scene.title}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Button size="lg" className="w-full" onClick={() => renderVideo.mutate()}>
              <Film className="w-4 h-4 mr-2" />Render News Video
            </Button>
          </motion.div>
        )}
        {step === "preview" && visualStyle !== "news" && visualStyle !== "history" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {visualStyle === "cartoon" ? "Click to preview illustrations." : "Hover clips to preview."}
                {" "}Click Swap to find alternatives.
              </p>
              <Button variant="outline" size="sm" onClick={() => fetchClips.mutate()}>
                <RefreshCw className="w-3 h-3 mr-1" />Re-fetch All
              </Button>
            </div>
            {scenes.map((scene, i) => (
              <SceneCard key={i} scene={scene} onSwap={handleSwap} scriptId={scriptId} videoFormat={videoFormat} />
            ))}
            <Button size="lg" className="w-full" onClick={() => renderVideo.mutate()}>
              <Film className="w-4 h-4 mr-2" />Render Video
            </Button>
          </motion.div>
        )}

        {step === "rendering" && <RenderStatus currentStep={renderStep} />}

        {step === "done" && videoPath && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <h2 className="text-xl font-semibold">Video Ready!</h2>
            </div>
            <video src={`/${videoPath}`} controls className="w-full rounded-xl border border-border/50 max-h-[600px]" />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setStep("preview"); setVideoPath(null); }} className="flex-1">Edit Clips</Button>
              <Button asChild className="flex-1"><a href={`/${videoPath}`} download>Download</a></Button>
            </div>
          </motion.div>
        )}

        {step === "error" && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 space-y-3">
            <div className="flex items-start gap-3">
              <X className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-500">Something went wrong</p>
                <p className="text-sm text-muted-foreground mt-1 font-mono">{error}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setStep("idle")}>Try Again</Button>
          </div>
        )}
      </div>
    </div>
  );
}