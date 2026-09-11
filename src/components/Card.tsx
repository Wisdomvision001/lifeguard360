import type { JSX, ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons";
import styles from "@/components/Card.module.css";

export interface CardProps {
  title?: ReactNode;
  titleIcon?: IconName;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, titleIcon, actions, children, className }: CardProps): JSX.Element {
  return (
    <section className={[styles.card, className ?? ""].filter(Boolean).join(" ")}>
      {(title !== undefined || actions !== undefined) && (
        <div className={styles.header}>
          {title !== undefined && (
            <h3 className={styles.title}>
              {titleIcon !== undefined && <Icon name={titleIcon} size={18} />}
              <span>{title}</span>
            </h3>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
