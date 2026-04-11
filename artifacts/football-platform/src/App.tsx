import React, { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe } from "@workspace/api-client-react";

import { SessionProvider } from "./lib/session";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { Fixtures } from "./pages/Fixtures";
import { Match } from "./pages/Match";
import { Standings } from "./pages/Standings";
import { Following } from "./pages/Following";
import { Admin } from "./pages/Admin";
import NotFound from "./pages/not-found";
import { ShieldAlert, Activity } from "lucide-react";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

function SignInPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background opacity-50" />
      <div className="z-10">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </div>
  );
}

function SignUpPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background opacity-50" />
      <div className="z-10">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function AccessPendingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4">
      <ShieldAlert className="w-16 h-16 text-secondary mb-6" />
      <h1 className="text-3xl font-bold font-mono text-white mb-2 tracking-tight">ACCESS PENDING</h1>
      <p className="text-muted-foreground max-w-md mb-8">
        Your account has been authenticated but you lack authorization to access the terminal. Please contact a syndicate administrator to grant access.
      </p>
      <button onClick={() => window.location.href = '/'} className="px-6 py-2 border border-white/10 rounded-md text-sm font-mono text-white hover:bg-white/5 transition-colors">
        RETURN
      </button>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isSignedIn, isLoaded } = useUser();
  const { data: me, isLoading: meLoading } = useGetMe();

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Activity className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/" />;
  }

  if (meLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Activity className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  if (me?.accessDenied) {
    return <AccessPendingPage />;
  }

  return <Component />;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      appearance={{
        variables: {
          colorPrimary: 'hsl(180, 100%, 40%)',
          colorBackground: 'hsl(213, 45%, 17%)',
          colorText: 'hsl(220, 20%, 95%)',
          colorTextSecondary: 'hsl(220, 15%, 65%)',
          colorInputBackground: 'hsl(215, 35%, 22%)',
          colorInputText: 'white',
          colorNeutral: 'hsl(220, 20%, 50%)',
        },
        elements: {
          card: {
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(12px)',
          },
          headerTitle: {
            color: 'white',
            fontFamily: 'monospace',
            letterSpacing: '0.05em',
          },
          headerSubtitle: { color: 'rgba(255,255,255,0.55)' },
          formFieldLabel: { color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem' },
          socialButtonsBlockButton: {
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.85)',
            backgroundColor: 'rgba(255,255,255,0.05)',
          },
          dividerText: { color: 'rgba(255,255,255,0.35)' },
          footerActionText: { color: 'rgba(255,255,255,0.45)' },
          footerActionLink: { color: 'hsl(180, 100%, 45%)' },
        }
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <SessionProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            
            <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
            <Route path="/fixtures"><ProtectedRoute component={Fixtures} /></Route>
            <Route path="/match/:id"><ProtectedRoute component={Match} /></Route>
            <Route path="/standings"><ProtectedRoute component={Standings} /></Route>
            <Route path="/following"><ProtectedRoute component={Following} /></Route>
            <Route path="/admin"><ProtectedRoute component={Admin} /></Route>
            
            <Route component={NotFound} />
          </Switch>
        </SessionProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
