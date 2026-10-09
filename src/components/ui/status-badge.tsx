import { cn } from "@/lib/cn";

type Tone =
  | "neutral"
  | "gold"
  | "muted"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "demo"
  | "disconnected"
  | "locked"
  | "completed";
export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={cn("status-badge", `status-badge-${tone}`)}>
      <span className="status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
