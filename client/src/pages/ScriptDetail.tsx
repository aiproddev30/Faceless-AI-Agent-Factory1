import { useScript, useRegenerateAudio } from "@/hooks/use-scripts";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Copy, Calendar, Tag, Clock, XCircle, AlertTriangle, Volume2, Mic, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const VOICE_OPTIONS = [
  { value: "alloy", label: "Alloy", desc: "Neutral and balanced" },
  { value: "echo", label: "Echo", desc: "Warm and confident" },
  { value: "fable", label: "Fable", desc: "Expressive storyteller" },
  { value: "onyx", label: "Onyx", desc: "Deep and authoritative" },
  { value: "nova", label: "Nova", desc: "Friendly and upbeat" },
  { value: "shimmer", label: "Shimmer", desc: "Clear and polished" },
];

export default function ScriptDetail() {
  const [, params] = useRoute("/script/:id");
  const id = Number(params?.id);
  const { data: script, isLoading, error } = useScript(id);
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement>(null);
  const { mutate: regenerateAudio, isPending: isRegenerating } = useRegenerateAudio();
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8 md:pl-72 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading script...</p>
        </div>
      </div>
    );
  }

  if (error || !script) {
    return (
      <div className="min-h-screen bg-background p-8 md:pl-72 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold">Script Not Found</h2>
          <Link href="/" className="text-primary hover:underline mt-2 block">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const copyToClipboard = () => {
    if (script.content) {
      navigator.clipboard.writeText(script.content);
      toast({ title: "Copied!", description: "Script content copied to clipboard." });
    }
  };

  // ✅ STATIC AUDIO PATH (NEW)
  const audioUrl = script.audioPath
    ? `/audio/${script.audioPath}`
    : undefined;

  const voiceToUse = selectedVoice || script.voice;

  const handleRegenerate = () => {
    regenerateAudio({ id: script.id, voice: voiceToUse });
    setSelectedVoice(null);
  };

  const canRegenerate =
    script.status === "complete" &&
    script.audioStatus !== "processing";

  return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <div className="max-w-4xl mx-auto space-y-6">

        <Link
          href="/"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <StatusBadge status={script.status} label="Script" />
                <StatusBadge status={script.audioStatus} label="Audio" />
                <span className="text-xs text-muted-foreground font-mono">
                  ID: #{script.id}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">
                {script.topic}
              </h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Tag className="w-4 h-4" />
                  {script.tone}
                </span>
                <span className="flex items-center gap-1.5">
                  <Mic className="w-4 h-4" />
                  {script.voice}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {script.createdAt &&
                    format(new Date(script.createdAt), "PPP p")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Player */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          <h2 className="font-semibold flex items-center gap-2 mb-4">
            <Volume2 className="w-5 h-5 text-purple-400" />
            Voiceover Audio
          </h2>

          {script.audioStatus === "complete" && audioUrl ? (
            <audio
              ref={audioRef}
              controls
              preload="metadata"
              className="w-full mb-4"
              src={audioUrl}
            >
              Your browser does not support the audio element.
            </audio>
          ) : script.audioStatus === "failed" ? (
            <div className="text-destructive bg-destructive/10 rounded-xl p-4 mb-4">
              <p className="font-medium">Audio generation failed</p>
              <p className="text-sm text-muted-foreground">
                {script.audioError || "Unknown error"}
              </p>
            </div>
          ) : (
            <div className="text-blue-400 bg-blue-500/10 rounded-xl p-4 mb-4">
              <p className="font-medium">
                {script.status === "complete"
                  ? "Generating voiceover..."
                  : "Waiting for script to complete..."}
              </p>
            </div>
          )}

          {/* Regenerate */}
          {canRegenerate && (
            <div className="border-t border-border pt-4 mt-2">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                {VOICE_OPTIONS.map((v) => (
                  <button
                    key={v.value}
                    onClick={() => setSelectedVoice(v.value)}
                    className={cn(
                      "p-2 rounded-xl border-2 text-xs",
                      (selectedVoice ?? script.voice) === v.value
                        ? "border-purple-500 bg-purple-500/10"
                        : "border-border hover:border-purple-500/50"
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <button
                onClick={handleRegenerate}
                disabled={
                  isRegenerating ||
                  (!selectedVoice || selectedVoice === script.voice)
                }
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-40"
              >
                <RefreshCw
                  className={cn("w-4 h-4", isRegenerating && "animate-spin")}
                />
                {isRegenerating
                  ? "Regenerating..."
                  : "Regenerate Voiceover"}
              </button>
            </div>
          )}
        </div>

        {/* Script Content */}
        <div className="bg-card border border-border rounded-2xl shadow-lg p-8">
          {script.status === "complete" ? (
            <div className="whitespace-pre-wrap font-mono text-sm">
              {script.content}
            </div>
          ) : (
            <div className="text-muted-foreground">
              Generating script...
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
