import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateScript } from "@/hooks/use-scripts";
import { insertScriptSchema, type InsertScript } from "@shared/schema";
import { useLocation } from "wouter";
import { ArrowLeft, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE_OPTIONS = [
  { value: "educational", label: "Educational", desc: "Informative and clear" },
  { value: "humorous", label: "Humorous", desc: "Funny and entertaining" },
  { value: "dramatic", label: "Dramatic", desc: "Emotional and storytelling" },
  { value: "professional", label: "Professional", desc: "Corporate and clean" },
  { value: "casual", label: "Casual", desc: "Relaxed and vlog-style" },
];

export default function NewScript() {
  const [, setLocation] = useLocation();
  const { mutate: createScript, isPending } = useCreateScript();
  
  const form = useForm<InsertScript>({
    resolver: zodResolver(insertScriptSchema),
    defaultValues: {
      topic: "",
      tone: "educational",
      length: 500,
    },
  });

  const onSubmit = (data: InsertScript) => {
    createScript(data, {
      onSuccess: () => setLocation("/"),
    });
  };

  return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <div className="max-w-3xl mx-auto">
        <button 
          onClick={() => setLocation("/")}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </button>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          {/* Decorative background element */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative z-10">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <Sparkles className="w-8 h-8 text-primary" />
                Generate New Script
              </h1>
              <p className="text-muted-foreground mt-2">
                Configure your settings and let our AI agents craft the perfect script.
              </p>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              {/* Topic Input */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Video Topic</label>
                <input
                  {...form.register("topic")}
                  className={cn(
                    "w-full px-4 py-3 rounded-xl bg-background border-2 transition-all duration-200",
                    form.formState.errors.topic 
                      ? "border-destructive focus:border-destructive focus:ring-4 focus:ring-destructive/10" 
                      : "border-border focus:border-primary focus:ring-4 focus:ring-primary/10"
                  )}
                  placeholder="e.g. The History of Space Exploration..."
                  autoFocus
                />
                {form.formState.errors.topic && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {form.formState.errors.topic.message}
                  </p>
                )}
              </div>

              {/* Tone Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Tone & Style</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TONE_OPTIONS.map((tone) => (
                    <label 
                      key={tone.value}
                      className={cn(
                        "relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                        form.watch("tone") === tone.value
                          ? "border-primary bg-primary/5 shadow-inner"
                          : "border-border hover:border-primary/50 hover:bg-white/5"
                      )}
                    >
                      <input 
                        type="radio" 
                        value={tone.value} 
                        {...form.register("tone")} 
                        className="sr-only" 
                      />
                      <span className="font-semibold text-sm">{tone.label}</span>
                      <span className="text-xs text-muted-foreground">{tone.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Length Input */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-foreground">Target Length (Words)</label>
                  <span className="text-sm text-primary font-mono">{form.watch("length")} words</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="2000"
                  step="50"
                  {...form.register("length")}
                  className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Short (100)</span>
                  <span>Long (2000)</span>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4 border-t border-white/10 flex justify-end">
                <button
                  type="submit"
                  disabled={isPending}
                  className="
                    px-8 py-3 rounded-xl font-semibold text-lg
                    bg-gradient-to-r from-primary to-purple-600
                    text-white shadow-lg shadow-primary/25
                    hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5
                    active:translate-y-0 active:shadow-md
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                    transition-all duration-200 flex items-center gap-2
                  "
                >
                  {isPending ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate Script
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
