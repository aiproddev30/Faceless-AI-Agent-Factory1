import { useScripts, useDeleteScript } from "@/hooks/use-scripts";
import { useSeries, useDeleteSeries } from "@/hooks/use-series";
import { ScriptCard } from "@/components/ScriptCard";
import { SeriesCard } from "@/components/SeriesCard";
import { Link } from "wouter";
import { Plus, Search, FileText, Layers, X } from "lucide-react";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

type ViewMode = "all" | "series" | "standalone";

export default function Dashboard() {
  const { data: scripts, isLoading: scriptsLoading } = useScripts();
  const { data: allSeries, isLoading: seriesLoading } = useSeries();
  const { mutate: deleteScript } = useDeleteScript();
  const { mutate: deleteSeries } = useDeleteSeries();
  const [search, setSearch] = useState("");
  const [toneFilter, setToneFilter] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  const isLoading = scriptsLoading || seriesLoading;

  const tones = useMemo(() => {
    if (!scripts) return [];
    const unique = Array.from(new Set(scripts.map(s => s.tone)));
    return unique.sort();
  }, [scripts]);

  const standaloneScripts = useMemo(() => {
    if (!scripts) return [];
    return scripts.filter(s => !s.seriesId);
  }, [scripts]);

  const seriesScriptsMap = useMemo(() => {
    if (!scripts) return new Map<number, typeof scripts>();
    const map = new Map<number, typeof scripts>();
    scripts.forEach(s => {
      if (s.seriesId) {
        const existing = map.get(s.seriesId) || [];
        existing.push(s);
        map.set(s.seriesId, existing);
      }
    });
    return map;
  }, [scripts]);

  const filteredStandalone = useMemo(() => {
    let filtered = standaloneScripts;
    if (search) {
      filtered = filtered.filter(s =>
        s.topic.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (toneFilter) {
      filtered = filtered.filter(s => s.tone === toneFilter);
    }
    return filtered;
  }, [standaloneScripts, search, toneFilter]);

  const filteredSeries = useMemo(() => {
    if (!allSeries) return [];
    let filtered = allSeries;
    if (search) {
      filtered = filtered.filter(s => {
        const nameMatch = s.name.toLowerCase().includes(search.toLowerCase());
        const descMatch = s.description?.toLowerCase().includes(search.toLowerCase());
        const episodeMatch = (seriesScriptsMap.get(s.id) || []).some(ep =>
          ep.topic.toLowerCase().includes(search.toLowerCase())
        );
        return nameMatch || descMatch || episodeMatch;
      });
    }
    if (toneFilter) {
      filtered = filtered.filter(s => {
        const eps = seriesScriptsMap.get(s.id) || [];
        return eps.some(ep => ep.tone === toneFilter);
      });
    }
    return filtered;
  }, [allSeries, search, toneFilter, seriesScriptsMap]);

  const hasActiveFilters = search || toneFilter;

  return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <div className="max-w-7xl mx-auto space-y-8">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your AI-generated video scripts and series.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/new" data-testid="link-create-script" className="
              flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm
              bg-primary text-primary-foreground
              shadow-lg shadow-primary/25
              hover:shadow-xl hover:shadow-primary/30 hover:bg-primary/90 hover:-translate-y-0.5
              transition-all duration-200
            ">
              <Plus className="w-4 h-4" />
              New Script
            </Link>
            <Link href="/new-series" data-testid="link-create-series" className="
              flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm
              bg-purple-600 text-white
              shadow-lg shadow-purple-600/25
              hover:shadow-xl hover:shadow-purple-600/30 hover:bg-purple-500 hover:-translate-y-0.5
              transition-all duration-200
            ">
              <Layers className="w-4 h-4" />
              New Series
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              placeholder="Search scripts and series..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
              className="w-full bg-card/30 border border-white/5 rounded-xl pl-9 pr-8 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/50 placeholder:text-muted-foreground/50 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded"
                data-testid="button-clear-search"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>

          <select
            value={toneFilter}
            onChange={(e) => setToneFilter(e.target.value)}
            data-testid="select-tone-filter"
            className="bg-card/30 border border-white/5 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all appearance-none cursor-pointer"
          >
            <option value="">All Tones</option>
            {tones.map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>

          <div className="flex items-center bg-card/30 border border-white/5 rounded-xl p-1 gap-1">
            {([
              { value: "all", label: "All" },
              { value: "series", label: "Series" },
              { value: "standalone", label: "Scripts" },
            ] as const).map(tab => (
              <button
                key={tab.value}
                onClick={() => setViewMode(tab.value)}
                data-testid={`button-view-${tab.value}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === tab.value
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button
              onClick={() => { setSearch(""); setToneFilter(""); }}
              data-testid="button-clear-filters"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-xl bg-card/50 animate-pulse border border-white/5" />
            ))}
          </div>
        ) : (
          <>
            {(viewMode === "all" || viewMode === "series") && filteredSeries.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-purple-400" />
                  Series
                  <span className="text-sm text-muted-foreground font-normal">({filteredSeries.length})</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <AnimatePresence>
                    {filteredSeries.map((s) => (
                      <motion.div
                        key={`series-${s.id}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        layout
                      >
                        <SeriesCard
                          series={s}
                          scripts={seriesScriptsMap.get(s.id) || []}
                          onDelete={deleteSeries}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {(viewMode === "all" || viewMode === "standalone") && filteredStandalone.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Standalone Scripts
                  <span className="text-sm text-muted-foreground font-normal">({filteredStandalone.length})</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <AnimatePresence>
                    {filteredStandalone.map((script) => (
                      <motion.div
                        key={script.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        layout
                      >
                        <ScriptCard script={script} onDelete={deleteScript} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {filteredSeries.length === 0 && filteredStandalone.length === 0 && (
              <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl bg-card/30">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  {hasActiveFilters ? "No results found" : "No scripts yet"}
                </h3>
                <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                  {hasActiveFilters
                    ? "Try adjusting your search or filters."
                    : "Get started by creating your first AI video script or series."
                  }
                </p>
                {!hasActiveFilters && (
                  <div className="flex items-center justify-center gap-3">
                    <Link href="/new" className="text-primary hover:underline font-medium">
                      Create Script &rarr;
                    </Link>
                    <span className="text-muted-foreground">or</span>
                    <Link href="/new-series" className="text-purple-400 hover:underline font-medium">
                      Create Series &rarr;
                    </Link>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
