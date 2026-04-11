import { Link, useLocation } from "wouter";
import { Activity, LayoutDashboard, ListOrdered, ShieldAlert, Star, LogOut, User } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { AlertPoller } from "./AlertPoller";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { data: me } = useGetMe();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/standings", label: "Standings", icon: ListOrdered },
    { href: "/following", label: "Following", icon: Star },
  ];

  if (me?.role === "admin") {
    navItems.push({ href: "/admin", label: "Admin", icon: ShieldAlert });
  }

  return (
    <div className="flex h-screen w-full overflow-hidden text-foreground">
      <AlertPoller />
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-white/5 bg-black/20 backdrop-blur-xl flex flex-col">
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative z-0">
        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
