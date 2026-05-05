import { Link, useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  ListOrdered,
  ShieldAlert,
  Star,
  LogOut,
  User,
  Menu,
  X,
  Radio,
  Clock,
  CheckCircle2,
  Target,
  Newspaper,
  Zap,
  BarChart3,
  LayoutDashboard,
  CalendarDays,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useGetMe } from "@workspace/api-client-react";
import { keepPreviousData } from "@tanstack/react-query";
import { TopSignalBanner } from "./TopSignalBanner";
import { NotificationBell } from "./NotificationBell";
import { useState } from "react";
import { cn } from "@/lib/utils";

const appLogo = "/logo.png";
const BRAND = "Signal Terminal";
const BRAND_TAG = "Intelligence";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut, user } = useAuth();
  const { data: me } = useGetMe({
    query: {
      staleTime: 5 * 60 * 1000,
      placeholderData: keepPreviousData,
    },
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const primaryNav = [
    { href: "/today", label: "Today", icon: LayoutDashboard },
    { href: "/matches", label: "Matches", icon: CalendarDays },
    { href: "/predictions", label: "Predictions", icon: Target },
  ];

  const secondaryNav = [
    { href: "/live", label: "Live", icon: Radio },
    { href: "/pre-match", label: "Pre-Match", icon: Clock },
    { href: "/post-match", label: "Post-Match", icon: CheckCircle2 },
    { href: "/signals", label: "Signals", icon: Zap },
    { href: "/following", label: "Watchlist", icon: Star },
    { href: "/standings", label: "Standings", icon: ListOrdered },
    { href: "/news", label: "News", icon: Newspaper },
    { href: "/performance", label: "Performance", icon: BarChart3 },
    { href: "/pricing", label: "Plan", icon: CreditCard },
  ];

  const adminNav = me?.role === "admin" ? [{ href: "/admin", label: "Admin", icon: ShieldAlert }] : [];

  const renderNavLink = (item: { href: string; label: string; icon: LucideIcon }) => {
    const isActive = location === item.href || location.startsWith(`${item.href}/`);
    return (
      <Link key={item.href} href={item.href}>
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-all duration-200",
            isActive
              ? "bg-primary/12 text-primary border border-primary/25 shadow-[inset_0_1px_0_0_hsl(0_0%_100%_/_.06)]"
              : "text-muted-foreground border border-transparent hover:bg-white/[0.04] hover:text-foreground",
          )}
        >
          <item.icon className={cn("w-[18px] h-[18px] shrink-0", isActive ? "text-primary" : "opacity-70")} />
          <span className="truncate">{item.label}</span>
        </div>
      </Link>
    );
  };

  const BrandBlock = ({ compact = false }: { compact?: boolean }) => (
    <Link href="/today">
      <div
        className={cn(
          "flex items-center gap-3 cursor-pointer rounded-lg transition-colors hover:bg-white/[0.03]",
          compact ? "px-2 py-2" : "px-3 py-2.5 -mx-1",
        )}
      >
        <div className="relative shrink-0">
          <img src={appLogo} alt="" className={cn("rounded-lg object-contain ring-1 ring-white/10", compact ? "w-7 h-7" : "w-9 h-9")} />
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(43_72%_54%_/_.5)]" aria-hidden />
        </div>
        <div className="min-w-0 text-left">
          <div className={cn("font-semibold text-white tracking-tight truncate font-sans", compact ? "text-sm" : "text-[15px]")}>
            {BRAND}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">{BRAND_TAG}</div>
        </div>
      </div>
    </Link>
  );

  return (
    <div className="flex md:h-[100dvh] w-full md:overflow-hidden text-foreground">
      <aside className="hidden md:flex w-[260px] flex-shrink-0 flex-col border-r border-white/[0.07] bg-[hsl(222_44%_6%_/_.97)] backdrop-blur-xl">
        <div className="h-[4.5rem] flex items-center px-4 border-b border-white/[0.06]">
          <BrandBlock />
        </div>

        <nav className="flex-1 py-5 px-3 space-y-6 overflow-y-auto">
          <div className="space-y-1">
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/55">Start</p>
            {primaryNav.map(renderNavLink)}
          </div>
          <div className="space-y-1">
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/55">Explore</p>
            {secondaryNav.map(renderNavLink)}
          </div>
          {adminNav.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-white/[0.06]">
              {adminNav.map(renderNavLink)}
            </div>
          )}
        </nav>

        <div className="p-3 border-t border-white/[0.06]">
          <div className="glass-card rounded-lg p-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">{user?.email}</p>
                <p className="text-[10px] text-muted-foreground capitalize tracking-wide">{me?.role || "Member"}</p>
              </div>
              <NotificationBell />
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent hover:border-white/10 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-[min(88vw,300px)] bg-[hsl(222_44%_7%)] border-r border-white/10 flex flex-col z-10 shadow-2xl">
            <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06]">
              <BrandBlock compact />
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="text-muted-foreground hover:text-white p-1 rounded-md">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 py-4 px-3 space-y-5 overflow-y-auto">
              <div className="space-y-1">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/55">Start</p>
                {primaryNav.map((item) => {
                  const isActive = location === item.href || location.startsWith(`${item.href}/`);
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                      <div
                        className={cn(
                          "flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-lg",
                          isActive
                            ? "bg-primary/12 text-primary border border-primary/25"
                            : "text-muted-foreground border border-transparent hover:bg-white/[0.04]",
                        )}
                      >
                        <item.icon className="w-5 h-5 shrink-0" />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
              <div className="space-y-1">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/55">Explore</p>
                {secondaryNav.map((item) => {
                  const isActive = location === item.href || location.startsWith(`${item.href}/`);
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                      <div
                        className={cn(
                          "flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-lg",
                          isActive
                            ? "bg-primary/12 text-primary border border-primary/25"
                            : "text-muted-foreground border border-transparent hover:bg-white/[0.04]",
                        )}
                      >
                        <item.icon className="w-5 h-5 shrink-0" />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
              {adminNav.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-white/[0.06]">
                  {adminNav.map((item) => {
                    const isActive = location === item.href || location.startsWith(`${item.href}/`);
                    return (
                      <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                        <div
                          className={cn(
                            "flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-lg",
                            isActive
                              ? "bg-primary/12 text-primary border border-primary/25"
                              : "text-muted-foreground border border-transparent hover:bg-white/[0.04]",
                          )}
                        >
                          <item.icon className="w-5 h-5 shrink-0" />
                          {item.label}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </nav>
            <div className="p-4 border-t border-white/[0.06]">
              <div className="flex items-center gap-3 mb-3 px-1">
                <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary border border-primary/20">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white truncate">{user?.email}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{me?.role || "Member"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm rounded-lg text-muted-foreground hover:bg-white/[0.04] hover:text-white"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 md:overflow-hidden">
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 border-b border-white/[0.07] bg-[hsl(222_47%_6%_/_.92)] backdrop-blur-xl shrink-0">
          <BrandBlock compact />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button type="button" onClick={() => setMobileMenuOpen(true)} className="text-muted-foreground hover:text-white p-2 rounded-lg hover:bg-white/[0.05]">
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        <TopSignalBanner />
        <main className="md:flex-1 md:min-h-0 md:overflow-y-auto">
          <div className="px-4 py-6 md:px-10 md:py-9 max-w-6xl mx-auto pb-24 md:pb-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
