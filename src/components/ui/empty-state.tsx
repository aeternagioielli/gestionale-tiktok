import type { ReactNode } from "react";
import { LinkButton } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

export function EmptyState({
  eyebrow,
  title,
  description,
  href,
  action,
  icon,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  href?: string;
  action?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-copy">
        <div className="empty-state-top">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <StatusBadge tone="disconnected">Non collegato</StatusBadge>
        </div>
        <h3>{title}</h3>
        <p>{description}</p>
        {href && action && (
          <LinkButton href={href} variant="secondary">
            {action}
          </LinkButton>
        )}
      </div>
    </div>
  );
}
