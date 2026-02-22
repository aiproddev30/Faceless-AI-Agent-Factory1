import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateSeries } from "@/hooks/use-series";
import { insertSeriesSchema, type InsertSeries } from "@shared/schema";
import { useLocation } from "wouter";
import { ArrowLeft, Layers } from "lucide-react";

export default function NewSeries() {
  const [, setLocation] = useLocation();
  const { mutate: createSeries, isPending } = useCreateSeries();

  const form = useForm<InsertSeries>({
    resolver: zodResolver(insertSeriesSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const onSubmit = (data: InsertSeries) => {
    createSeries(data, {
      onSuccess: () => setLocation("/"),
    });
  };

  return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </button>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative z-10">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <Layers className="w-8 h-8 text-purple-400" />
                Create New Series
              </h1>
              <p className="text-muted-foreground mt-2">
                Group related scripts into a series. You can add episodes after creating it.
              </p>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Series Name</label>
                <input
                  {...form.register("name")}
                  data-testid="input-series-name"
                  className={`w-full px-4 py-3 rounded-xl bg-background border-2 transition-all duration-200 ${
                    form.formState.errors.name
                      ? "border-destructive focus:border-destructive focus:ring-4 focus:ring-destructive/10"
                      : "border-border focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10"
                  }`}
                  placeholder="e.g. The History of Cuba"
                  autoFocus
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Description (optional)</label>
                <textarea
                  {...form.register("description")}
                  data-testid="input-series-description"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all duration-200 resize-none"
                  placeholder="Brief description of what this series covers..."
                />
              </div>

              <div className="pt-4 border-t border-white/10 flex justify-end">
                <button
                  type="submit"
                  disabled={isPending}
                  data-testid="button-submit"
                  className="
                    px-8 py-3 rounded-xl font-semibold text-lg
                    bg-gradient-to-r from-purple-600 to-purple-700
                    text-white shadow-lg shadow-purple-600/25
                    hover:shadow-xl hover:shadow-purple-600/30 hover:-translate-y-0.5
                    active:translate-y-0 active:shadow-md
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                    transition-all duration-200 flex items-center gap-2
                  "
                >
                  {isPending ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Layers className="w-5 h-5" />
                      Create Series
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
