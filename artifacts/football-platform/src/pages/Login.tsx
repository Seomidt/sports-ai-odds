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
    <div className="min-h-screen flex flex-col bg-[#060a12] text-white">
      <header className="border-b border-white/10 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link href="/">
            <span className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-white transition-colors cursor-pointer">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </span>
          </Link>
          <Link href="/pricing">
            <span className="text-xs font-mono text-primary hover:underline cursor-pointer">Pricing</span>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center p-2 rounded-xl bg-white/5 border border-white/10 mx-auto">
              <img src="/logo.png" alt="Signal Terminal" className="w-10 h-10 object-contain" />
            </div>
            <h1 className="text-2xl font-bold font-mono tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              After you sign in you land on Today — live games, next kickoffs, and top edges in one calm screen.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6 shadow-xl">
            <Auth
              supabaseClient={supabase}
              redirectTo={window.location.origin}
              providers={["google"]}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: "#18cfc0",
                      brandAccent: "#14a89b",
                    },
                  },
                },
              }}
            />
          </div>

          <p className="text-[11px] text-center text-muted-foreground/60 font-mono leading-relaxed">
            By continuing you agree to use Signal Terminal as an analytics tool only. We do not provide betting advice.
          </p>
        </div>
      </div>
    </div>
  );
}
