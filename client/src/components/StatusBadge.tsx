import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = {
    pending: {
      color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      icon: Clock,
      text: "Pending"
    },
    processing: {
      color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      icon: Loader2,
      text: "Processing",
      spin: true
    },
    complete: {
      color: "bg-green-500/10 text-green-500 border-green-500/20",
      icon: CheckCircle2,
      text: "Complete"
    },
    failed: {
      color: "bg-red-500/10 text-red-500 border-red-500/20",
      icon: XCircle,
      text: "Failed"
    }
  };

  const state = config[status as keyof typeof config] || config.pending;
  const Icon = state.icon;

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
      state.color
    )} data-testid={`badge-status-${label?.toLowerCase() || "default"}`}>
      <Icon className={cn("w-3.5 h-3.5", state.spin && "animate-spin")} />
      {label ? `${label}: ${state.text}` : state.text}
    </div>
  );
}
