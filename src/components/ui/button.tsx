import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Common = { children: ReactNode; variant?: Variant; className?: string; icon?: ReactNode };
export function Button({
  children,
  variant = "primary",
  className,
  icon,
  ...props
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn("button", `button-${variant}`, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}
export function LinkButton({
  children,
  variant = "secondary",
  className,
  icon,
  ...props
}: Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link prefetch={false} className={cn("button", `button-${variant}`, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
