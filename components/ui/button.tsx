import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "standard" | "compact" | "icon";

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

export function buttonClassName({ variant = "primary", size = "standard", className }: ButtonStyleOptions = {}) {
  return [styles.button, styles[variant], styles[size], className].filter(Boolean).join(" ");
}
