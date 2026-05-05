import { Link } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 text-foreground">
      <div className="glass-card rounded-2xl max-w-md w-full p-8 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-destructive/10 text-destructive mx-auto">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-semibold text-white tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The page you are looking for does not exist or has moved.
        </p>
        <Link href="/today">
          <span className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-95 cursor-pointer transition-opacity">
            <ArrowLeft className="w-4 h-4" />
            Back to Today
          </span>
        </Link>
      </div>
    </div>
  );
}
