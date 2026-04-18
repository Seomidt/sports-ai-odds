import { useEffect } from "react";
import { useLocation } from "wouter";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export default function Login() {
  const { isSignedIn, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isSignedIn) {
      setLocation("/dashboard");
    }
  }, [isSignedIn, isLoading, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">Sign in</h1>
        <Auth
          supabaseClient={supabase}
          providers={["google"]}
          redirectTo={window.location.origin}
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
    </div>
  );
}
