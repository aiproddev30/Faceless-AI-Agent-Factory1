import { useTrends, type TrendingTopic } from "@/hooks/use-trends";
import { TrendingUp, Flame, RefreshCw, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "wouter";

const CATEGORY_COLORS: Record<string, string> = {
  News: "bg-blue-500/20 text-blue-400",
  Science: "bg-green-500/20 text-green-400",
  Tech: "bg-cyan-500/20 text-cyan-400",
  Culture: "bg-pink-500/20 text-pink-400",
  Animals: "bg-amber-500/20 text-amber-400",
  Sports: "bg-red-500/20 text-red-400",
  Business: "bg-emerald-500/20 text-emerald-400",
  Entertainment: "bg-purple-500/20 text-purple-400",
};

function TrendCard({ trend }: { trend: TrendingTopic }) {
  const colorClass = CATEGORY_COLORS[trend.category] || "bg-white/10 text-muted-foreground";

  return (
    <Link
      href={`/new?topic=${encodeURIComponent(trend.title)}`}
      data-testid={`trend-card-${trend.title.replace(/\s+/g, "-").toLowerCase().slice(0, 30)}`}
      className="flex-shrink-0 w-72 group"
    >
      <div className="h-full bg-card/50 border border-white/5 rounded-xl p-4 hover:border-primary/30 hover:bg-card/80 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${colorClass}`}>
                {trend.category}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-tight">
              {trend.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
              {trend.summary}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function TrendingBar() {
  const { data: trends, isLoading, isError, refetch, isFetching } = useTrends();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollButtons = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 5);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
  };

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 300;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
    setTimeout(updateScrollButtons, 400);
  };

  if (isError) {
    return null;
  }

  return (
    <div data-testid="trending-bar">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-orange-500/10 px-3 py-1 rounded-full">
            <TrendingUp className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-semibold text-orange-400">Trending Now</span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-trends"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50"
            title="Refresh trends"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-20"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-20"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading || isFetching ? (
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-shrink-0 w-72 h-24 rounded-xl bg-card/30 animate-pulse border border-white/5">
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-4 bg-white/5 rounded-full" />
                </div>
                <div className="w-48 h-3 bg-white/5 rounded" />
                <div className="w-36 h-3 bg-white/5 rounded" />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-center px-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="w-4 h-4 animate-pulse text-orange-400" />
              <span>Searching the web for trends...</span>
            </div>
          </div>
        </div>
      ) : trends && trends.length > 0 ? (
        <div
          ref={scrollRef}
          onScroll={updateScrollButtons}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {trends.map((trend, i) => (
            <TrendCard key={i} trend={trend} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
