import { format } from "date-fns";
import { Series, Script } from "@shared/schema";
import { Link } from "wouter";
import { Layers, Calendar, MoreVertical, Trash2, FileText, CheckCircle2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SeriesCardProps {
  series: Series;
  scripts: Script[];
  onDelete: (id: number) => void;
}

export function SeriesCard({ series, scripts, onDelete }: SeriesCardProps) {
  const totalEpisodes = scripts.length;
  const completedEpisodes = scripts.filter(s => s.status === "complete").length;
  const processingCount = scripts.filter(s => s.status === "pending" || s.status === "processing").length;

  return (
    <div className="group relative bg-card border border-border/50 hover:border-purple-500/50 rounded-xl p-5 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/5" data-testid={`card-series-${series.id}`}>
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger className="p-2 hover:bg-white/5 rounded-lg transition-colors outline-none" data-testid={`button-series-menu-${series.id}`}>
            <MoreVertical className="w-4 h-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 bg-card border-border">
            <DropdownMenuItem
              className="text-red-500 focus:text-red-500 focus:bg-red-500/10 cursor-pointer"
              data-testid={`button-delete-series-${series.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(series.id);
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Series
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Link href={`/series/${series.id}`}>
        <div className="cursor-pointer">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
              <Layers className="w-6 h-6" />
            </div>
          </div>

          <h3 className="text-lg font-semibold text-foreground mb-2 line-clamp-1 group-hover:text-purple-400 transition-colors" data-testid={`text-series-name-${series.id}`}>
            {series.name}
          </h3>

          {series.description && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{series.description}</p>
          )}

          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-1.5 text-sm">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground font-medium">{totalEpisodes}</span>
              <span className="text-muted-foreground">{totalEpisodes === 1 ? 'episode' : 'episodes'}</span>
            </div>
            {completedEpisodes > 0 && (
              <div className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {completedEpisodes} done
              </div>
            )}
            {processingCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-blue-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {processingCount} in progress
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-4 border-t border-border/50">
            <Calendar className="w-3 h-3" />
            {series.createdAt && format(new Date(series.createdAt), "MMM d, yyyy")}
          </div>
        </div>
      </Link>
    </div>
  );
}
