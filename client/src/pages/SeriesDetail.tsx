import { useSeriesById, useSeriesScripts } from "@/hooks/use-series";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useDeleteScript } from "@/hooks/use-scripts";
import { ScriptCard } from "@/components/ScriptCard";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Layers, Plus, AlertTriangle, Calendar, FileText, ImageIcon, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

export default function SeriesDetail() {
  const [, params] = useRoute("/series/:id");
  const id = Number(params?.id);
  const { data: seriesData, isLoading: seriesLoading } = useSeriesById(id);
  const { data: scripts, isLoading: scriptsLoading } = useSeriesScripts(id);
  const { mutate: deleteScript } = useDeleteScript();
  const [episode, setEpisode] = useState(1);
  const [week, setWeek] = useState(() => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
  const [cards, setCards] = useState<{intro_path: string; outro_path: string} | null>(null);
  const { mutate: generateCards, isPending: isGenerating } = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/series/${id}/generate-cards`, { episode, week });
      return res.json();
    },
    onSuccess: (data) => setCards(data),
  });

  const isLoading = seriesLoading || scriptsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8 md:pl-72 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading series...</p>
        </div>
      </div>
    );
  }

  if (!seriesData) {
    return (
      <div className="min-h-screen bg-background p-8 md:pl-72 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold">Series Not Found</h2>
          <Link href="/" className="text-primary hover:underline mt-2 block">Return to Dashboard</Link>
        </div>
      </div>
    );
  }

  const completedCount = scripts?.filter(s => s.status === "complete").length || 0;
  const totalCount = scripts?.length || 0;

  return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <div className="max-w-7xl mx-auto space-y-6">

        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
                <Layers className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1" data-testid="text-series-name">
                  {seriesData.name}
                </h1>
                {seriesData.description && (
                  <p className="text-muted-foreground mb-2">{seriesData.description}</p>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4" />
                    {completedCount}/{totalCount} episodes complete
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {seriesData.createdAt && format(new Date(seriesData.createdAt), "PPP")}
                  </span>
                </div>
              </div>
            </div>

            <Link href={`/new?seriesId=${seriesData.id}`} data-testid="link-add-episode" className="
              flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm
              bg-purple-600 text-white
              shadow-lg shadow-purple-600/25
              hover:shadow-xl hover:shadow-purple-600/30 hover:bg-purple-500 hover:-translate-y-0.5
              transition-all duration-200 whitespace-nowrap
            ">
              <Plus className="w-4 h-4" />
              Add Episode
            </Link>
          </div>
        </div>

        {/* Card Generator Panel */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-lg">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
            <ImageIcon className="w-4 h-4 text-yellow-400" /> Intro / Outro Card Generator
          </h3>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Episode Number</label>
              <input type="number" min={1} value={episode} onChange={e => setEpisode(Number(e.target.value))}
                className="w-24 px-3 py-2 rounded-lg bg-background border border-border text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Week Of</label>
              <input type="text" value={week} onChange={e => setWeek(e.target.value)}
                placeholder="March 15, 2026"
                className="w-56 px-3 py-2 rounded-lg bg-background border border-border text-sm" />
            </div>
            <button onClick={() => generateCards()} disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-yellow-500 text-black font-semibold text-sm hover:bg-yellow-400 transition-colors disabled:opacity-50">
              {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><ImageIcon className="w-4 h-4" /> Generate</>}
            </button>
            {cards && (
              <div className="flex gap-3">
                <a href={`/${cards.intro_path}`} download
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium">
                  <Download className="w-4 h-4" /> Intro Card
                </a>
                <a href={`/${cards.outro_path}`} download
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium">
                  <Download className="w-4 h-4" /> Outro Card
                </a>
              </div>
            )}
          </div>
        </div>

        {totalCount === 0 ? (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl bg-card/30">
            <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No episodes yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Start building this series by adding your first episode.
            </p>
            <Link href={`/new?seriesId=${seriesData.id}`} className="text-purple-400 hover:underline font-medium">
              Add Episode &rarr;
            </Link>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              Episodes
              <span className="text-sm text-muted-foreground font-normal">({totalCount})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {scripts?.map((script) => (
                  <motion.div
                    key={script.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    layout
                  >
                    <ScriptCard script={script} onDelete={deleteScript} showEpisodeNumber />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
