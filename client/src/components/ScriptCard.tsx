import { format } from "date-fns";
import { Script } from "@shared/schema";
import { StatusBadge } from "./StatusBadge";
import { FileText, MoreVertical, Trash2, Calendar, Hash, Volume2 } from "lucide-react";
import { Link } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ScriptCardProps {
  script: Script;
  onDelete: (id: number) => void;
  showEpisodeNumber?: boolean;
}

export function ScriptCard({ script, onDelete, showEpisodeNumber }: ScriptCardProps) {
  return (
    <div
      className="group relative bg-card border border-border/50 hover:border-primary/50 rounded-xl p-5 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
      data-testid={`card-script-${script.id}`}
    >
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="p-2 hover:bg-white/5 rounded-lg transition-colors outline-none"
            data-testid={`button-menu-${script.id}`}
          >
            <MoreVertical className="w-4 h-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 bg-card border-border">
            <DropdownMenuItem
              className="text-red-500 focus:text-red-500 focus:bg-red-500/10 cursor-pointer"
              data-testid={`button-delete-${script.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(script.id);
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Link href={`/script/${script.id}`}>
        <div className="cursor-pointer">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-lg bg-primary/10 text-primary">
              <FileText className="w-6 h-6" />
            </div>
          </div>

          <h3
            className="text-lg font-semibold text-foreground mb-3 line-clamp-1 group-hover:text-primary transition-colors"
            data-testid={`text-topic-${script.id}`}
          >
            {showEpisodeNumber && script.episodeNumber != null && (
              <span className="text-xs font-mono text-muted-foreground mr-2">
                EP {script.episodeNumber}
              </span>
            )}
            {script.topic}
          </h3>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <StatusBadge status={script.status} label="Script" />
            <StatusBadge status={script.audioStatus} label="Audio" />
          </div>

          {/* 🎬 Create Video Button */}
          <div className="mt-4">
            <Link
              href={`/video/${script.id}`}
              className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all"
            >
              🎬 Create Video
            </Link>
          </div>

          <div className="space-y-2 mb-4 mt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">
                {script.tone}
              </span>
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 flex items-center gap-1">
                <Volume2 className="w-3 h-3" />
                {script.voice}
              </span>
              <span className="flex items-center gap-1">
                <Hash className="w-3 h-3" />
                {script.wordCount
                  ? `${script.wordCount} words`
                  : `~${script.length} target`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-4 border-t border-border/50">
            <Calendar className="w-3 h-3" />
            {script.createdAt &&
              format(new Date(script.createdAt), "MMM d, yyyy")}
          </div>
        </div>
      </Link>
    </div>
  );
}
