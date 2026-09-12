import React from "react";

type Variant = "light" | "dark" | "icon";

const LOGO_SRCS: Record<Variant, string> = {
  light: "/images/solen_logo_light.png",
  dark: "/images/solen_logo_dark.png",
  icon: "/images/solen_app_icon.png",
};

export default function SolenLogo({
  variant = "light",
  className = "",
  decorative = false,
  width,
  height,
}: {
  variant?: Variant;
  className?: string;
  decorative?: boolean;
  width?: number | string;
  height?: number | string;
}) {
  const src = LOGO_SRCS[variant] || LOGO_SRCS.light;
  return (
    <span className={`solen-logo solen-logo--${variant} ${className}`} style={{ width, height }}>
      <img
        src={src}
        alt={decorative ? "" : "SOLEN"}
        aria-hidden={decorative || undefined}
        className="solen-logo__img"
      />
    </span>
  );
}
