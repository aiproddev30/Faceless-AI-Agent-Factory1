import { useScript, useRegenerateAudio, useGenerateAudio, useUpdateScript } from "@/hooks/use-scripts";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Copy, Calendar, Tag, AlertTriangle, Volume2, Mic, RefreshCw, Film, Pencil, Check, X, Square, Loader2, Trash2, Download, ChevronDown, ChevronUp, Monitor, Smartphone, Sparkles, Upload, Clock } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";
import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { buildUrl, api } from "@shared/routes";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const VOICE_OPTIONS = [
  { value: "alloy",   label: "Alloy",   desc: "Neutral and balanced"   },
  { value: "echo",    label: "Echo",    desc: "Warm and confident"      },
  { value: "fable",   label: "Fable",   desc: "Expressive storyteller" },
  { value: "onyx",    label: "Onyx",    desc: "Deep and authoritative" },
  { value: "nova",    label: "Nova",    desc: "Friendly and upbeat"    },
  { value: "shimmer", label: "Shimmer", desc: "Clear and polished"     },
];

// ── Video versions hooks ─────────────────────────────────────────────────────
function useScriptVideos(scriptId: number) {
  return useQuery({
    queryKey: ["videos", scriptId],
    queryFn: async () => {
      const res = await fetch(`/api/scripts/${scriptId}/videos`);
      if (!res.ok) throw new Error("Failed to load videos");
      return res.json() as Promise<any[]>;
    },
    enabled: !!scriptId,
  });
}

function useDeleteVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (videoId: number) => {
      const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete video");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["videos"] }),
  });
}

function usePolishVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      videoId: number;
      scriptId: number;
      videoPath: string;
      format: string;
      visualStyle: string;
      introImage: string | null;
      introDuration: number;
      outroImage: string | null;
      outroDuration: number;
      trimStart: number;
      trimEnd: number;
      burnSubtitles: boolean;
      scriptSections: any[] | null;
      subtitleStyle: any | null;
    }) => {
      const res = await fetch(`/api/videos/${payload.videoId}/polish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Polish failed");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["videos", vars.scriptId] }),
  });
}

// ── Image upload helper ──────────────────────────────────────────────────────
function useImageUpload() {
  const toBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res((r.result as string).split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  return { toBase64 };
}

// ── Polish Panel ─────────────────────────────────────────────────────────────
function PolishPanel({
  video,
  scriptId,
  scriptSections,
  onClose,
}: {
  video: any;
  scriptId: number;
  scriptSections: any[];
  onClose: () => void;
}) {
  const { toast }    = useToast();
  const { toBase64 } = useImageUpload();
  const { mutate: polishVideo, isPending } = usePolishVideo();

  // Trim
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd,   setTrimEnd]   = useState(0);

  // Intro
  const [introPreview,  setIntroPreview]  = useState<string | null>(null);
  const [introB64,      setIntroB64]      = useState<string | null>(null);
  const [introDuration, setIntroDuration] = useState(3);
  const introInputRef = useRef<HTMLInputElement>(null);

  // Outro
  const [outroPreview,  setOutroPreview]  = useState<string | null>(null);
  const [outroB64,      setOutroB64]      = useState<string | null>(null);
  const [outroDuration, setOutroDuration] = useState(5);
  const outroInputRef = useRef<HTMLInputElement>(null);

  // Subtitles
  const [burnSubtitles, setBurnSubtitles] = useState(false);
  const [fontName,      setFontName]      = useState("Arial");
  const [fontSize,      setFontSize]      = useState(18);
  const [primaryColor,  setPrimaryColor]  = useState("#FFFFFF");
  const [outlineColor,  setOutlineColor]  = useState("#000000");
  const [outline,       setOutline]       = useState(2);
  const [bold,          setBold]          = useState(false);
  const [italic,        setItalic]        = useState(false);
  const [underline,     setUnderline]     = useState(false);
  const [position,      setPosition]      = useState<"bottom"|"top"|"center">("bottom");
  const [shadow,        setShadow]        = useState(0);

  // Active tab
  const [tab, setTab] = useState<"trim"|"intro"|"outro"|"subtitles">("trim");

  const FONTS = ["Arial", "Impact", "Helvetica", "Georgia", "Courier New", "Verdana", "Trebuchet MS", "Comic Sans MS"];

  const handleImageSelect = async (
    file: File,
    setPreview: (s: string) => void,
    setB64: (s: string) => void,
  ) => {
    const b64 = await toBase64(file);
    setB64(b64);
    setPreview(URL.createObjectURL(file));
  };

  const hasChanges = introB64 || outroB64 || trimStart > 0 || trimEnd > 0 || burnSubtitles;

  const handlePolish = () => {
    polishVideo({
      videoId:        video.id,
      scriptId,
      videoPath:      video.videoPath,
      format:         video.format,
      visualStyle:    video.visualStyle,
      introImage:     introB64,
      introDuration,
      outroImage:     outroB64,
      outroDuration,
      trimStart,
      trimEnd,
      burnSubtitles,
      scriptSections,
      subtitleStyle: burnSubtitles ? {
        fontName, fontSize, primaryColor, outlineColor,
        outline, bold, italic, underline, position, shadow,
      } : null,
    }, {
      onSuccess: () => {
        toast({ title: "Video polished!", description: "New version saved." });
        onClose();
      },
      onError: (e: any) => toast({ title: "Polish failed", description: e.message, variant: "destructive" }),
    });
  };

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={cn(
        "px-3 py-1.5 text-xs rounded-lg font-medium transition-colors",
        tab === id ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
      )}
    >{label}</button>
  );

  return (
    <div className="border border-border rounded-2xl bg-card/50 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-yellow-400" /> Polish Video
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-3">
        {tabBtn("trim",      "✂️ Trim")}
        {tabBtn("intro",     "▶️ Intro")}
        {tabBtn("outro",     "⏹️ Outro")}
        {tabBtn("subtitles", "💬 Subtitles")}
      </div>

      {/* Trim tab */}
      {tab === "trim" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Remove from start (sec)</label>
            <input type="number" min={0} step={0.5} value={trimStart}
              onChange={e => setTrimStart(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Remove from end (sec)</label>
            <input type="number" min={0} step={0.5} value={trimEnd}
              onChange={e => setTrimEnd(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
        </div>
      )}

      {/* Intro tab */}
      {tab === "intro" && (
        <div className="space-y-3">
          <input ref={introInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files?.[0] && handleImageSelect(e.target.files[0], setIntroPreview, setIntroB64)} />
          {introPreview ? (
            <div className="relative">
              <img src={introPreview} className="w-full h-36 object-cover rounded-xl border border-border" />
              <button onClick={() => { setIntroPreview(null); setIntroB64(null); }}
                className="absolute top-2 right-2 bg-black/60 rounded-full p-1 hover:bg-black/80">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => introInputRef.current?.click()}
              className="w-full h-28 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
              <Upload className="w-5 h-5" /><span className="text-xs">Upload intro image</span>
            </button>
          )}
          {introB64 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Display duration (seconds)</label>
              <input type="number" min={1} max={10} step={0.5} value={introDuration}
                onChange={e => setIntroDuration(Number(e.target.value))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
          )}
        </div>
      )}

      {/* Outro tab */}
      {tab === "outro" && (
        <div className="space-y-3">
          <input ref={outroInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => e.target.files?.[0] && handleImageSelect(e.target.files[0], setOutroPreview, setOutroB64)} />
          {outroPreview ? (
            <div className="relative">
              <img src={outroPreview} className="w-full h-36 object-cover rounded-xl border border-border" />
              <button onClick={() => { setOutroPreview(null); setOutroB64(null); }}
                className="absolute top-2 right-2 bg-black/60 rounded-full p-1 hover:bg-black/80">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => outroInputRef.current?.click()}
              className="w-full h-28 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
              <Upload className="w-5 h-5" /><span className="text-xs">Upload outro image</span>
            </button>
          )}
          {outroB64 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Display duration (seconds)</label>
              <input type="number" min={1} max={15} step={0.5} value={outroDuration}
                onChange={e => setOutroDuration(Number(e.target.value))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
          )}
        </div>
      )}

      {/* Subtitles tab */}
      {tab === "subtitles" && (
        <div className="space-y-4">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Burn subtitles into video</span>
            <button onClick={() => setBurnSubtitles(v => !v)}
              className={cn("w-11 h-6 rounded-full transition-colors relative",
                burnSubtitles ? "bg-primary" : "bg-border")}>
              <span className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                burnSubtitles ? "left-6" : "left-1")} />
            </button>
          </div>

          {burnSubtitles && (
            <div className="space-y-4">
              {/* Preview */}
              <div className="relative h-16 bg-black rounded-xl overflow-hidden flex items-end justify-center pb-2">
                <span style={{
                  fontFamily: fontName,
                  fontSize: `${Math.max(10, fontSize * 0.7)}px`,
                  color: primaryColor,
                  fontWeight: bold ? "bold" : "normal",
                  fontStyle: italic ? "italic" : "normal",
                  textDecoration: underline ? "underline" : "none",
                  textShadow: outline > 0 ? `0 0 ${outline}px ${outlineColor}, 0 0 ${outline}px ${outlineColor}` : "none",
                  ...(position === "top" ? { position: "absolute", top: "8px" } : {}),
                  ...(position === "center" ? { position: "absolute", top: "50%", transform: "translateY(-50%)" } : {}),
                }}>Preview subtitle text here</span>
              </div>

              {/* Font */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Font</label>
                  <select value={fontName} onChange={e => setFontName(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary">
                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Size</label>
                  <input type="number" min={10} max={60} value={fontSize}
                    onChange={e => setFontSize(Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                </div>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Text color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                      className="w-10 h-9 rounded border border-border cursor-pointer bg-transparent" />
                    <span className="text-xs text-muted-foreground font-mono">{primaryColor}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Outline color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={outlineColor} onChange={e => setOutlineColor(e.target.value)}
                      className="w-10 h-9 rounded border border-border cursor-pointer bg-transparent" />
                    <span className="text-xs text-muted-foreground font-mono">{outlineColor}</span>
                  </div>
                </div>
              </div>

              {/* Style toggles */}
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Style</label>
                <div className="flex items-center gap-2">
                  {[
                    { label: "B", active: bold,      set: setBold,      style: "font-bold"   },
                    { label: "I", active: italic,    set: setItalic,    style: "italic"      },
                    { label: "U", active: underline, set: setUnderline, style: "underline"   },
                  ].map(({ label, active, set, style }) => (
                    <button key={label} onClick={() => set((v: boolean) => !v)}
                      className={cn(
                        `w-9 h-9 rounded-lg border text-sm transition-colors ${style}`,
                        active ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
                      )}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Position */}
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Position</label>
                <div className="flex items-center gap-2">
                  {(["top", "center", "bottom"] as const).map(p => (
                    <button key={p} onClick={() => setPosition(p)}
                      className={cn(
                        "flex-1 py-1.5 text-xs rounded-lg border capitalize transition-colors",
                        position === p ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
                      )}>{p}</button>
                  ))}
                </div>
              </div>

              {/* Outline thickness */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Outline thickness: {outline}px</label>
                <input type="range" min={0} max={5} step={0.5} value={outline}
                  onChange={e => setOutline(Number(e.target.value))}
                  className="w-full accent-primary" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Render button */}
      <button
        onClick={handlePolish}
        disabled={isPending || !hasChanges}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending
          ? <><Loader2 className="w-4 h-4 animate-spin" />Rendering...</>
          : <><Sparkles className="w-4 h-4" />Render Polished Version</>
        }
      </button>
      {isPending && <p className="text-xs text-center text-muted-foreground">Takes 15–60 seconds depending on video length.</p>}
    </div>
  );
}

// ── Video versions panel ─────────────────────────────────────────────────────
  function VideoVersions({ scriptId, scriptSections }: { scriptId: number; scriptSections: any[] }) {
  const { data: videos = [], isLoading } = useScriptVideos(scriptId);
  const { mutate: deleteVideo, isPending: isDeleting } = useDeleteVideo();
  const [open,          setOpen]          = useState(true);
  const [polishingId,   setPolishingId]   = useState<number | null>(null);

  const formatLabel = (v: any) => {
    const fmt   = v.format === "shorts" ? "Shorts" : "YouTube";
    const style = v.visualStyle.charAt(0).toUpperCase() + v.visualStyle.slice(1);
    const lbl   = v.label !== "Full Video" ? ` · ${v.label}` : "";
    return `${fmt} · ${style}${lbl}`;
  };

  return (
    <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-colors">
        <h2 className="font-semibold flex items-center gap-2">
          <Film className="w-5 h-5 text-primary" />
          Video Versions
          {videos.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono">{videos.length}</span>
          )}
        </h2>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-4 border-t border-border pt-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading videos...
            </div>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No videos rendered yet. Generate a video below.</p>
          ) : (
            <div className="space-y-6">
              {videos.map((v: any) => (
                <div key={v.id} className="space-y-3">
                  <div className="border border-border rounded-xl overflow-hidden">
                    <video controls className="w-full max-h-[400px] bg-black" src={`/${v.videoPath}`} />
                    <div className="flex items-center justify-between px-4 py-2.5 bg-card border-t border-border">
                      <div className="flex items-center gap-3">
                        {v.format === "shorts"
                          ? <Smartphone className="w-4 h-4 text-muted-foreground" />
                          : <Monitor className="w-4 h-4 text-muted-foreground" />
                        }
                        <div>
                          <p className="text-sm font-medium">{formatLabel(v)}</p>
                          <p className="text-xs text-muted-foreground">
                            {v.createdAt && format(new Date(v.createdAt), "MMM d, yyyy · h:mm a")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPolishingId(polishingId === v.id ? null : v.id)}
                          className={cn(
                            "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors",
                            polishingId === v.id
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "text-muted-foreground hover:bg-yellow-500/10 hover:text-yellow-400"
                          )}
                        >
                          <Sparkles className="w-3.5 h-3.5" /> Polish
                        </button>
                        <a href={`/${v.videoPath}`} download
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                          <Download className="w-3.5 h-3.5" /> Download
                        </a>
                        <button onClick={() => deleteVideo(v.id)} disabled={isDeleting}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Polish panel — inline below the video */}
                  {polishingId === v.id && (
                    <PolishPanel
                      video={v}
                      scriptId={scriptId}
                      scriptSections={scriptSections}
                      onClose={() => setPolishingId(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Voice preview hook ───────────────────────────────────────────────────────
function useVoicePreview() {
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    setPlayingVoice(null);
  }, []);

  useEffect(() => () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
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
        if (!res.ok || res.status === 202) throw new Error("Preview still generating");
      }
      if (!res.ok) throw new Error("Failed to load preview");
      const blob    = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrlRef.current = blobUrl;
      const audio = new Audio(blobUrl);
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

  return { playPreview, playingVoice, loadingVoice, stopPlayback };
}

// ── Voice grid ───────────────────────────────────────────────────────────────
function VoiceGrid({ selectedVoice, onSelect, playPreview, playingVoice, loadingVoice }: {
  selectedVoice: string; onSelect: (v: string) => void;
  playPreview: (v: string) => void; playingVoice: string | null; loadingVoice: string | null;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {VOICE_OPTIONS.map((v) => {
        const isPlaying  = playingVoice === v.value;
        const isLoading  = loadingVoice === v.value;
        const isSelected = selectedVoice === v.value;
        return (
          <div key={v.value} className={cn(
            "relative rounded-xl border-2 transition-all duration-200",
            isSelected ? "border-purple-500 bg-purple-500/10 shadow-inner" : "border-border hover:border-purple-500/50 hover:bg-white/5"
          )}>
            <button type="button" onClick={() => onSelect(v.value)} className="flex flex-col p-4 pb-2 cursor-pointer w-full text-left">
              <span className="font-semibold text-sm">{v.label}</span>
              <span className="text-xs text-muted-foreground">{v.desc}</span>
            </button>
            <button type="button" onClick={() => playPreview(v.value)} disabled={isLoading}
              className={cn("flex items-center gap-1.5 text-xs px-4 py-2 w-full rounded-b-xl transition-all duration-200",
                isPlaying ? "text-purple-400 bg-purple-500/10" : "text-muted-foreground hover:text-purple-400 hover:bg-purple-500/5")}>
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Volume2 className="w-3.5 h-3.5" />}
              {isLoading ? "Loading..." : isPlaying ? "Stop" : "Preview"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ScriptDetail() {
  const [, params] = useRoute("/script/:id");
  const id = Number(params?.id);
  const { data: script, isLoading, error } = useScript(id);
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement>(null);

  const { mutate: regenerateAudio, isPending: isRegenerating } = useRegenerateAudio();
  const { mutate: generateAudio,   isPending: isGenerating   } = useGenerateAudio();
  const { mutate: updateScript,    isPending: isSaving       } = useUpdateScript();

  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [isEditing,     setIsEditing]     = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [scriptEdited,  setScriptEdited]  = useState(false);

  const { playPreview, playingVoice, loadingVoice } = useVoicePreview();

  useEffect(() => {
    if (script?.voice && !selectedVoice) setSelectedVoice(script.voice);
  }, [script?.voice]);

  if (isLoading) return (
    <div className="min-h-screen bg-background p-8 md:pl-72 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-muted-foreground">Loading script...</p>
      </div>
    </div>
  );

  if (error || !script) return (
    <div className="min-h-screen bg-background p-8 md:pl-72 flex items-center justify-center">
      <div className="text-center">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold">Script Not Found</h2>
        <Link href="/" className="text-primary hover:underline mt-2 block">Return to Dashboard</Link>
      </div>
    </div>
  );

  const audioUrl    = script.audioPath ? `/audio/${script.audioPath}` : undefined;
  const voiceToUse  = selectedVoice || script.voice;
  const audioExists = script.audioStatus === "complete" && !!audioUrl;

  const handleGenerateAudio = () => generateAudio({ id: script.id, voice: voiceToUse });
  const handleRegenerate    = () => regenerateAudio({ id: script.id, voice: voiceToUse });
  const handleEditStart     = () => { setEditedContent(script.content || ""); setIsEditing(true); };
  const handleEditSave      = () => {
    updateScript({ id: script.id, updates: { content: editedContent } }, {
      onSuccess: () => { setIsEditing(false); setScriptEdited(true); toast({ title: "Saved!" }); },
    });
  };
  const handleEditCancel = () => { setIsEditing(false); setEditedContent(""); };

  return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <div className="max-w-4xl mx-auto space-y-6">

        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />Back to Dashboard
        </Link>

        {/* Header */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <StatusBadge status={script.status} label="Script" />
                <StatusBadge status={script.audioStatus} label="Audio" />
                <span className="text-xs text-muted-foreground font-mono">ID: #{script.id}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">{script.topic}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5"><Tag className="w-4 h-4" />{script.tone}</span>
                <span className="flex items-center gap-1.5"><Mic className="w-4 h-4" />{script.voice}</span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {script.createdAt && format(new Date(script.createdAt), "PPP p")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Out of sync warning */}
        {scriptEdited && audioExists && (
          <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-2xl p-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="text-yellow-400 text-lg mt-0.5">⚠️</span>
              <div>
                <p className="font-semibold text-yellow-400 text-sm">Script edited — voiceover & video are out of date</p>
                <p className="text-xs text-muted-foreground mt-0.5">Regenerate the voiceover to reflect your changes.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => { handleRegenerate(); setScriptEdited(false); }} disabled={isRegenerating}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg transition-colors disabled:opacity-50">
                <RefreshCw className={cn("w-3 h-3", isRegenerating && "animate-spin")} /> Regenerate VO
              </button>
              <button onClick={() => setScriptEdited(false)} className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Voiceover */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg space-y-5">
          <h2 className="font-semibold flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-purple-400" />Voiceover
          </h2>
          {script.status === "complete" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {audioExists ? "Preview voices below. Select one and regenerate to switch." : "Preview voices and select one before generating your voiceover."}
              </p>
              <VoiceGrid selectedVoice={voiceToUse} onSelect={setSelectedVoice} playPreview={playPreview} playingVoice={playingVoice} loadingVoice={loadingVoice} />
            </div>
          )}
          {audioExists ? (
            <div className="space-y-4 border-t border-border pt-4">
              <audio ref={audioRef} controls preload="metadata" className="w-full" src={audioUrl} />
              <button onClick={handleRegenerate} disabled={isRegenerating || !selectedVoice}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-40 text-sm">
                <RefreshCw className={cn("w-4 h-4", isRegenerating && "animate-spin")} />
                {isRegenerating ? "Regenerating..." : `Regenerate with ${voiceToUse}`}
              </button>
            </div>
          ) : script.audioStatus === "failed" ? (
            <div className="text-destructive bg-destructive/10 rounded-xl p-4">
              <p className="font-medium">Audio generation failed</p>
              <p className="text-sm text-muted-foreground">{script.audioError || "Unknown error"}</p>
            </div>
          ) : script.audioStatus === "processing" ? (
            <div className="text-blue-400 bg-blue-500/10 rounded-xl p-4 flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin" /><p className="font-medium">Generating voiceover...</p>
            </div>
          ) : script.status === "complete" ? (
            <div className="border-t border-border pt-4">
              <button onClick={handleGenerateAudio} disabled={isGenerating || !selectedVoice}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-40 font-medium transition-colors">
                {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</> : <><Volume2 className="w-4 h-4" />Generate Voiceover with {voiceToUse}</>}
              </button>
            </div>
          ) : (
            <div className="text-blue-400 bg-blue-500/10 rounded-xl p-4">
              <p className="font-medium">Waiting for script to complete...</p>
            </div>
          )}
        </div>

          {/* Video Versions */}
          <VideoVersions scriptId={script.id} scriptSections={(script as any).sceneData?.scenes || (script as any).sections || []} />

        {/* Marketing Copy Panel */}
        {((script as any).youtubeHooks?.length > 0 || (script as any).tweetHooks?.length > 0) && (
          <div className="bg-card border border-border rounded-2xl shadow-lg p-8 space-y-6">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">📣 Marketing Copy</h2>
            {(script as any).episodeSummary && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-mono uppercase">Episode Summary</p>
                <div className="bg-muted/40 rounded-xl p-4 flex items-start justify-between gap-3">
                  <p className="text-sm">{(script as any).episodeSummary}</p>
                  <button onClick={() => navigator.clipboard.writeText((script as any).episodeSummary)} className="shrink-0 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-white/5">Copy</button>
                </div>
              </div>
            )}
            {(script as any).youtubeHooks?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-mono uppercase">📺 YouTube Hooks</p>
                <div className="space-y-2">
                  {((script as any).youtubeHooks as string[]).map((hook: string, i: number) => (
                    <div key={i} className="bg-muted/40 rounded-xl p-3 flex items-center justify-between gap-3">
                      <p className="text-sm">{hook}</p>
                      <button onClick={() => navigator.clipboard.writeText(hook)} className="shrink-0 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-white/5">Copy</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(script as any).tweetHooks?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-mono uppercase">𝕏 Tweet Hooks</p>
                <div className="space-y-2">
                  {((script as any).tweetHooks as string[]).map((tweet: string, i: number) => (
                    <div key={i} className="bg-muted/40 rounded-xl p-3 flex items-center justify-between gap-3">
                      <p className="text-sm">{tweet}</p>
                      <button onClick={() => navigator.clipboard.writeText(tweet)} className="shrink-0 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-white/5">Copy</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Generate Deep Dive Button — only for news styleMode */}
        {(script as any).styleMode === "news" && script.status === "complete" && (
          <div className="bg-card border border-border rounded-2xl shadow-lg p-6 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-sm uppercase tracking-wider">🎯 Mid-Week Deep Dive</h2>
              <p className="text-xs text-muted-foreground mt-1">Generate a companion "What does this mean for me?" episode from this week's stories.</p>
            </div>
            <button
              onClick={() => {
                const params = new URLSearchParams({
                  topic: `What this week's AI news means for you — ${script.topic}`,
                  styleMode: "impact",
                  seriesId: "3",
                  parentScriptId: String(script.id),
                });
                window.location.href = `/new?${params.toString()}`;
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 transition-all text-sm font-medium whitespace-nowrap"
            >
              ⚡ Generate Deep Dive
            </button>
          </div>
        )}

        {/* Script Content */}
        <div className="bg-card border border-border rounded-2xl shadow-lg p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Script Content</h2>
            {script.status === "complete" && !isEditing && (
              <div className="flex items-center gap-2">
                <button onClick={() => { navigator.clipboard.writeText(script.content || ""); toast({ title: "Copied!" }); }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all">
                  <Copy className="w-3.5 h-3.5" />Copy
                </button>
                <button onClick={handleEditStart}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all">
                  <Pencil className="w-3.5 h-3.5" />Edit
                </button>
              </div>
            )}
            {isEditing && (
              <div className="flex items-center gap-2">
                <button onClick={handleEditSave} disabled={isSaving}
                  className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 px-3 py-1.5 rounded-lg hover:bg-green-500/10 transition-all disabled:opacity-50">
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {isSaving ? "Saving..." : "Save"}
                </button>
                <button onClick={handleEditCancel}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all">
                  <X className="w-3.5 h-3.5" />Cancel
                </button>
              </div>
            )}
          </div>
          {script.status === "complete" ? (
            isEditing ? (
              <textarea value={editedContent} onChange={e => setEditedContent(e.target.value)}
                className="w-full min-h-[400px] bg-background border border-border rounded-xl p-4 font-mono text-sm resize-y focus:outline-none focus:border-primary transition-colors" autoFocus />
            ) : (
              <div className="whitespace-pre-wrap font-mono text-sm">{script.content}</div>
            )
          ) : (
            <div className="text-muted-foreground">Generating script...</div>
          )}
        </div>

      </div>
    </div>
  );
}