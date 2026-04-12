import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ReactNode } from "react";

interface HelpTooltipProps {
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  iconClassName?: string;
}

export function HelpTooltip({ children, side = "top", className = "", iconClassName = "" }: HelpTooltipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center shrink-0 focus:outline-none ${className}`}
          aria-label="Help"
        >
          <HelpCircle className={`text-primary/70 hover:text-primary transition-colors ${iconClassName || "w-3.5 h-3.5"}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        sideOffset={6}
        className="w-auto max-w-56 px-3 py-2.5 text-xs font-mono text-white bg-black/90 border border-white/15 rounded-lg shadow-xl"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
