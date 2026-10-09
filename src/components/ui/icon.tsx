import type { ComponentType } from "react";

type IconProps = { size?: number; strokeWidth?: number };
export function Icon({
  icon: IconComponent,
  ...props
}: { icon: ComponentType<IconProps> } & IconProps) {
  return <IconComponent aria-hidden="true" {...props} />;
}
