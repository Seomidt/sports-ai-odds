import { Link } from "wouter";
import { ArrowRight, Shield, Zap, LineChart } from "lucide-react";

export function Home() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background to-background opacity-50" />
      
      <div className="z-10 text-center max-w-3xl px-6">
        <div className="inline-flex items-center justify-center p-3 mb-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
          <img src="/logo.png" alt="sports-ai-odds" className="w-20 h-20 object-contain" />
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 font-mono">
          SPORTS <span className="text-primary">AI ODDS</span>
        </h1>
        
        <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
          Professional-grade AI sports analysis platform. Track live signals, access predictive insights, and monitor market anomalies in real-time.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/sign-up">
            <div className="h-12 px-8 flex items-center justify-center rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors cursor-pointer border border-transparent">
              Kom i gang <ArrowRight className="ml-2 w-4 h-4" />
            </div>
          </Link>
          <Link href="/sign-in">
            <div className="h-12 px-8 flex items-center justify-center rounded-md glass-card text-white font-medium hover:bg-white/10 transition-colors cursor-pointer">
              Log ind
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 text-left">
          <div className="glass-card p-6 rounded-xl">
            <Zap className="w-6 h-6 text-secondary mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Live Signals</h3>
            <p className="text-sm text-muted-foreground">Millisecond-latency event detection and AI pattern recognition.</p>
          </div>
          <div className="glass-card p-6 rounded-xl">
            <LineChart className="w-6 h-6 text-primary mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Predictive Models</h3>
            <p className="text-sm text-muted-foreground">Pre-match and in-play statistical anomalies analyzed automatically.</p>
          </div>
          <div className="glass-card p-6 rounded-xl">
            <Shield className="w-6 h-6 text-violet-400 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Secure Access</h3>
            <p className="text-sm text-muted-foreground">Restricted terminal access for verified analysts and syndicate members.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
