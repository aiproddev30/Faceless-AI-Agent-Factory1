import { Link, useLocation } from "wouter";
import { LayoutDashboard, PlusCircle, Settings, Library, Video, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/new", label: "New Script", icon: PlusCircle },
    { href: "/library", label: "Asset Library", icon: Library },
    { href: "/renders", label: "Video Renders", icon: Video },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen border-r border-border bg-card/30 backdrop-blur-md fixed left-0 top-0 z-50">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-700 flex items-center justify-center shadow-lg shadow-primary/20">
          <Youtube className="w-6 h-6 text-white fill-white/20" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight">Agent<span className="text-primary">Factory</span></h1>
          <p className="text-xs text-muted-foreground font-mono">v1.0.0-beta</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {links.map((link) => {
          const isActive = location === link.href;
          return (
            <Link key={link.href} href={link.href} className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group",
              isActive 
                ? "bg-primary/10 text-primary" 
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}>
              <link.icon className={cn(
                "w-5 h-5 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-6 border-t border-border">
        <div className="bg-gradient-to-br from-primary/20 to-purple-900/20 rounded-xl p-4 border border-primary/10">
          <h4 className="text-sm font-semibold text-primary mb-1">Pro Plan</h4>
          <p className="text-xs text-muted-foreground mb-3">12/50 scripts generated</p>
          <div className="h-1.5 w-full bg-background rounded-full overflow-hidden">
            <div className="h-full bg-primary w-[24%]" />
          </div>
        </div>
      </div>
    </aside>
  );
}
