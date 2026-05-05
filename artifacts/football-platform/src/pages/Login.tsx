import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export default function Login() {
  const { isSignedIn, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isSignedIn) {
      setLocation("/today");
    }
  }, [isSignedIn, isLoading, setLocation]);

  return (
    <div className="min-h-screen flex flex-col text-foreground">
      <header className="border-b border-white/[0.07] px-4 py-4 bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link href="/">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </span>
          </Link>
          <Link href="/pricing">
            <span className="text-xs font-semibold text-primary hover:underline cursor-pointer">Pricing</span>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center p-3 rounded-2xl glass-card mx-auto ring-1 ring-primary/15">
              <img src="/logo.png" alt="Signal Terminal" className="w-11 h-11 object-contain" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/90">Member access</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              You will land on Today — live games, next kickoffs, and model edges in one view.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6 md:p-8">
            <Auth
              supabaseClient={supabase}
              redirectTo={window.location.origin}
              providers={["google"]}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: "#d4a843",
                      brandAccent: "#b8922f",
                    },
                  },
                },
              }}
            />
          </div>

          <p className="text-[11px] text-center text-muted-foreground/70 leading-relaxed max-w-sm mx-auto">
            Signal Terminal is an analytics product only — not betting or financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
