import { Link, useLocation } from "wouter";
import { Activity, ListOrdered, ShieldAlert, Star, LogOut, User, Menu, X, Radio, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { AlertPoller } from "./AlertPoller";
import { useState } from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { data: me } = useGetMe();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: TrendingUp },
    { href: "/live", label: "Live", icon: Radio },
    { href: "/pre-match", label: "Før kamp", icon: Clock },
    { href: "/post-match", label: "Efter kamp", icon: CheckCircle2 },
    { href: "/standings", label: "Standings", icon: ListOrdered },
    { href: "/following", label: "Following", icon: Star },
  ];

  if (me?.role === "admin") {
    navItems.push({ href: "/admin", label: "Admin", icon: ShieldAlert });
  }

  return (
    <div className="flex h-screen w-full overflow-hidden text-foreground">
      <AlertPoller />

      {/* ── Desktop Sidebar (hidden on mobile) ─────────────────────────── */}
      <aside className="hidden md:flex w-64 flex-shrink-0 border-r border-white/5 bg-black/20 backdrop-blur-xl flex-col">
        <div className="h-16 flex items-center px-6 border-b border-white/5">
          <Activity className="w-6 h-6 text-primary mr-3" />
          <span className="font-mono font-bold tracking-tight text-lg">SIGNAL TERMINAL</span>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href || location.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-md cursor-pointer transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <item.icon className={`w-5 h-5 mr-3 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-secondary border border-secondary/30">
              <User className="w-4 h-4" />
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{user?.primaryEmailAddress?.emailAddress}</p>
              <p className="text-xs text-muted-foreground capitalize">{me?.role || "User"}</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center px-4 py-2 text-sm font-medium rounded-md text-muted-foreground hover:bg-white/5 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Mobile slide-out menu overlay ──────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 bg-[#0a0f1e] border-r border-white/5 flex flex-col z-10">
            <div className="h-16 flex items-center justify-between px-5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-primary" />
                <span className="font-mono font-bold tracking-tight">SIGNAL TERMINAL</span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="text-muted-foreground hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 px-3 space-y-1">
              {navItems.map((item) => {
                const isActive = location === item.href || location.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <div
                      className={`flex items-center px-4 py-3.5 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-muted-foreground hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <item.icon className={`w-5 h-5 mr-3 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </nav>
            <div className="p-4 border-t border-white/5">
              <div className="flex items-center mb-4 px-2">
                <div className="w-9 h-9 rounded-full bg-secondary/20 flex items-center justify-center text-secondary border border-secondary/30">
                  <User className="w-4 h-4" />
                </div>
                <div className="ml-3 overflow-hidden">
                  <p className="text-sm font-medium text-white truncate">{user?.primaryEmailAddress?.emailAddress}</p>
                  <p className="text-xs text-muted-foreground capitalize">{me?.role || "User"}</p>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white transition-colors"
              >
                <LogOut className="w-4 h-4 mr-3" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-white/5 bg-black/30 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <span className="font-mono font-bold text-sm tracking-tight">SIGNAL TERMINAL</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="text-muted-foreground hover:text-white p-1"
          >
            <Menu className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden shrink-0 flex items-center justify-around border-t border-white/5 bg-black/40 backdrop-blur-xl pb-safe">
          {navItems.map((item) => {
            const isActive = location === item.href || location.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href}>
                <div className="flex flex-col items-center gap-0.5 px-4 py-3">
                  <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`text-[10px] font-mono tracking-wider ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    {item.label.toUpperCase()}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
