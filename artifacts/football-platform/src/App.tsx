import React, { useEffect, useRef } from "react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe, setAuthTokenGetter, setTokenGetter } from "@workspace/api-client-react";

import { SessionProvider } from "./lib/session";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { Live } from "./pages/Live";
import { PreMatch } from "./pages/PreMatch";
import { PostMatch } from "./pages/PostMatch";
import { Match } from "./pages/Match";
import { Standings } from "./pages/Standings";
import { Following } from "./pages/Following";
import { News } from "./pages/News";
import { Admin } from "./pages/Admin";
import { Signals } from "./pages/Signals";
import { Pricing } from "./pages/Pricing";
import NotFound from "./pages/not-found";
import Login from "./pages/Login";
import { useAuth } from "./hooks/useAuth";
import { supabase } from "./lib/supabase";
import accessPendingImage from "@assets/IMG_3621_1775934471623.png";
import { ShieldAlert, Activity } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

function SupabaseTokenInjector() {
  useEffect(() => {
    const getter = () => supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null);
    setAuthTokenGetter(getter);
    setTokenGetter(getter);
    return () => {
      setAuthTokenGetter(() => Promise.resolve(null));
      setTokenGetter(() => Promise.resolve(null));
    };
  }, []);
  return null;
}

function SupabaseCacheInvalidator() {
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  return null;
}

function AccessPendingPage() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4">
      <div className="w-40 h-40 rounded-3xl overflow-hidden border border-white/10 bg-white/5 mb-6 shadow-2xl">
        <img src={accessPendingImage} alt="Access pending" className="w-full h-full object-cover" />
      </div>
      <ShieldAlert className="w-16 h-16 text-secondary mb-6" />
      <h1 className="text-3xl font-bold font-mono text-white mb-2 tracking-tight">ACCESS PENDING</h1>
      <p className="text-muted-foreground max-w-md mb-8">
        Your account is signed in, but access has not been granted yet. If you should have access, ask an admin to approve your account.
      </p>
      <button
        onClick={() => signOut().then(() => window.location.replace("/"))}
        className="px-6 py-2 border border-white/10 rounded-md text-sm font-mono text-white hover:bg-white/5 transition-colors"
      >
        SIGN OUT
      </button>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isSignedIn, isLoading } = useAuth();
  const { data: me, isLoading: meLoading } = useGetMe({ retry: false });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Activity className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/login" />;
  }

  if (meLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Activity className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  if (me?.authenticated && me?.accessDenied) {
    return <AccessPendingPage />;
  }

  return <Component />;
}

function HomeRedirect() {
  const { isSignedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Activity className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  if (isSignedIn) {
    return <Redirect to="/dashboard" />;
  }

  return <Home />;
}

function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <SupabaseTokenInjector />
      <SupabaseCacheInvalidator />
      <SessionProvider>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/login" component={Login} />

          <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
          <Route path="/live"><ProtectedRoute component={Live} /></Route>
          <Route path="/pre-match"><ProtectedRoute component={PreMatch} /></Route>
          <Route path="/post-match"><ProtectedRoute component={PostMatch} /></Route>
          <Route path="/match/:id"><ProtectedRoute component={Match} /></Route>
          <Route path="/signals"><ProtectedRoute component={Signals} /></Route>
          <Route path="/standings"><ProtectedRoute component={Standings} /></Route>
          <Route path="/following"><ProtectedRoute component={Following} /></Route>
          <Route path="/news"><ProtectedRoute component={News} /></Route>
          <Route path="/admin"><ProtectedRoute component={Admin} /></Route>
          <Route path="/pricing"><ProtectedRoute component={Pricing} /></Route>

          <Route component={NotFound} />
        </Switch>
      </SessionProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <AppRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
