import type { JSX, ReactNode } from "react";

import styles from "@/components/Badge.module.css";

export type BadgeTone = "neutral" | "success" | "danger" | "amber" | "blue";

export interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}

export function Badge({ tone = "neutral", dot = false, children }: BadgeProps): JSX.Element {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
