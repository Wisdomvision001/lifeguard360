import { Link } from "react-router";
import type { ButtonHTMLAttributes, JSX, ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons";
import styles from "@/components/Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "danger" | "success" | "outline" | "ghost";
  size?: "md" | "lg";
  icon?: IconName;
  block?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  block = false,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps): JSX.Element {
  const classes = [
    styles.button,
    styles[variant],
    size === "lg" ? styles.lg : "",
    block ? styles.block : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {icon !== undefined && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

/**
 * Anchor styled as a button, for navigation actions.
 *
 * Internal routes (root-relative, e.g. "/get-help") render as router links so
 * SPA navigation respects the deployment basename. External URLs and
 * non-http protocols (tel:, sms:, mailto:) pass through as plain anchors.
 */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  icon,
  block = false,
  children,
  className,
  ...rest
}: {
  href: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  icon?: IconName;
  block?: boolean;
  children?: ReactNode;
  className?: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">): JSX.Element {
  const classes = [
    styles.button,
    styles[variant ?? "primary"],
    size === "lg" ? styles.lg : "",
    block ? styles.block : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const isInternal =
    href.startsWith("/") && !href.startsWith("//") && !PROTOCOL.test(href);

  if (isInternal) {
    return (
      <Link to={href} className={classes} {...rest}>
        {icon !== undefined && <Icon name={icon} size={16} />}
        {children}
      </Link>
    );
  }

  return (
    <a href={href} className={classes} {...rest}>
      {icon !== undefined && <Icon name={icon} size={16} />}
      {children}
    </a>
  );
}

/** Protocols that must never be routed through the SPA router. */
const PROTOCOL = /^[a-z][a-z0-9+.-]*:/i;
