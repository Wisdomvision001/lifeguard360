import type { JSX, ReactNode } from "react";

import styles from "@/components/Field.module.css";

export interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps): JSX.Element {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint !== undefined && error === undefined && <p className={styles.hint}>{hint}</p>}
      {error !== undefined && error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface SelectFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}

export function SelectField({ id, value, onChange, options }: SelectFieldProps): JSX.Element {
  return (
    <select
      id={id}
      className={styles.control}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export interface TextFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "tel" | "password";
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}

export function TextField({
  id,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required,
}: TextFieldProps): JSX.Element {
  return (
    <input
      id={id}
      className={styles.control}
      type={type}
      value={value}
      placeholder={placeholder}
      autoComplete={autoComplete}
      required={required}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
