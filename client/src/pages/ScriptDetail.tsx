import { useScript } from "@/hooks/use-scripts";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Copy, Calendar, Tag, CheckCircle2, Clock, XCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";

export default function ScriptDetail() {
  const [, params] = useRoute("/script/:id");
  const id = Number(params?.id);
  const { data: script, isLoading, error } = useScript(id);
  const { toast } = useToast();

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
          <Link href="/" className="text-primary hover:underline mt-2 block">Return to Dashboard</Link>
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

  return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Navigation */}
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>

        {/* Header Card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <StatusBadge status={script.status} />
                <span className="text-xs text-muted-foreground font-mono">ID: #{script.id}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                {script.topic}
              </h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Tag className="w-4 h-4" />
                  {script.tone}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {script.createdAt && format(new Date(script.createdAt), "PPP p")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-card border border-border rounded-2xl shadow-lg min-h-[500px] flex flex-col relative overflow-hidden">
          
          {/* Toolbar */}
          <div className="border-b border-border p-4 bg-muted/30 flex justify-between items-center">
            <h2 className="font-semibold flex items-center gap-2">
              Script Content
              {script.wordCount && (
                <span className="text-xs font-normal text-muted-foreground bg-white/5 px-2 py-0.5 rounded">
                  {script.wordCount} words
                </span>
              )}
            </h2>
            {script.content && (
              <button 
                onClick={copyToClipboard}
                className="text-sm flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy Text
              </button>
            )}
          </div>

          {/* Body */}
          <div className="p-8 flex-1 relative">
            {script.status === "complete" ? (
              <div className="prose prose-invert max-w-none font-mono text-sm md:text-base leading-relaxed whitespace-pre-wrap">
                {script.content}
              </div>
            ) : script.status === "failed" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                <XCircle className="w-16 h-16 text-destructive mb-4" />
                <h3 className="text-xl font-bold text-destructive mb-2">Generation Failed</h3>
                <p className="text-muted-foreground max-w-md">
                  {script.error || "An unknown error occurred while generating this script. Please try again."}
                </p>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-black/20">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-6" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">Generating Script...</h3>
                <p className="text-muted-foreground max-w-md">
                  Our AI agents are researching and writing your script. This usually takes about 30-60 seconds.
                </p>
              </div>
            )}
          </div>
          
        </div>

      </div>
    </div>
  );
}
