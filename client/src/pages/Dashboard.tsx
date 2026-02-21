import { useScripts, useDeleteScript } from "@/hooks/use-scripts";
import { ScriptCard } from "@/components/ScriptCard";
import { Link } from "wouter";
import { Plus, Search, Filter } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard() {
  const { data: scripts, isLoading } = useScripts();
  const { mutate: deleteScript } = useDeleteScript();
  const [filter, setFilter] = useState("");

  const filteredScripts = scripts?.filter(s => 
    s.topic.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background p-8 md:pl-72">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your AI-generated video scripts.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/new" className="
              flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm
              bg-primary text-primary-foreground 
              shadow-lg shadow-primary/25 
              hover:shadow-xl hover:shadow-primary/30 hover:bg-primary/90 hover:-translate-y-0.5
              transition-all duration-200
            ">
              <Plus className="w-4 h-4" />
              Create New Script
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 bg-card/30 p-1.5 rounded-xl border border-white/5 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              placeholder="Search topics..." 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full bg-transparent border-none pl-9 py-2 text-sm focus:ring-0 placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="w-px h-6 bg-white/10" />
          <button className="p-2 hover:bg-white/5 rounded-lg transition-colors text-muted-foreground hover:text-foreground">
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Content Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-xl bg-card/50 animate-pulse border border-white/5" />
            ))}
          </div>
        ) : filteredScripts?.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl bg-card/30">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No scripts found</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Get started by creating your first AI video script.
            </p>
            <Link href="/new" className="text-primary hover:underline font-medium">
              Create Script &rarr;
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredScripts?.map((script) => (
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
        )}
      </div>
    </div>
  );
}

// Needed for the empty state icon
import { FileText } from "lucide-react";
