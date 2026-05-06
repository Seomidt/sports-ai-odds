import { cn } from "@/lib/utils";
import { getLeagueDisplayEmoji, getLeagueLogo } from "@/lib/leagues";

type Size = "xs" | "sm" | "md";

/** League logo (API) + flag emoji (or ⚽). Use `flagOnly` in dropdowns — kun lande-/liga-flag, ikke logo-URL. */
export function LeagueMark({
  leagueId,
  leagueLogo,
  size = "sm",
  className,
  showEmoji = true,
  flagOnly = false,
}: {
  leagueId: number;
  leagueLogo?: string | null;
  size?: Size;
  className?: string;
  showEmoji?: boolean;
  /** I Select-lister: kun emoji (land/region), ingen media.api-sports logo */
  flagOnly?: boolean;
}) {
  const url = leagueLogo?.trim() ? leagueLogo : getLeagueLogo(leagueId);
  const emoji = getLeagueDisplayEmoji(leagueId);
  const [imgCls, emCls] = size === "xs" ? ["w-3.5 h-3.5", "text-[11px]"] : size === "md" ? ["w-5 h-5", "text-base"] : ["w-4 h-4", "text-sm"];

  if (flagOnly) {
    const box =
      size === "xs"
        ? "w-7 min-w-7 text-[15px]"
        : size === "md"
          ? "w-9 min-w-9 text-xl"
          : "w-8 min-w-8 text-[16px]";
    return (
      <span
        className={cn("inline-flex items-center justify-center shrink-0 leading-none select-none", box, className)}
        aria-hidden
      >
        {emoji}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1 shrink-0", className)}>
      <img
        src={url}
        alt=""
        className={cn(imgCls, "object-contain bg-white/90 rounded p-0.5")}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      {showEmoji && (
        <span className={cn("leading-none select-none", emCls)} aria-hidden>
          {emoji}
        </span>
      )}
    </span>
  );
}
