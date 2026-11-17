"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils/cn";

/**
 * Buttons that show their own work.
 *
 * A press that starts a server action has to say so before the response lands,
 * otherwise the interface looks stuck. Both components render the same markup;
 * `SubmitButton` reads the pending flag from the enclosing form, `ActionButton`
 * takes it from a `useActionState` hook the caller already has.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

type ButtonContentProps = {
  pending: boolean;
  icon?: ReactNode;
  pendingLabel?: string;
  children: ReactNode;
};

function ButtonContent({ pending, icon, pendingLabel, children }: ButtonContentProps) {
  return (
    <>
      {pending ? (
        <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" strokeWidth={2.2} />
      ) : (
        icon
      )}
      <span>{pending ? (pendingLabel ?? children) : children}</span>
    </>
  );
}

type ButtonProps = {
  variant?: ButtonVariant;
  icon?: ReactNode;
  pendingLabel?: string;
  className?: string;
  children: ReactNode;
};

/** Submits the form it sits in and disables itself while the action runs. */
export function SubmitButton({ variant = "primary", icon, pendingLabel, className, children }: ButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(VARIANT[variant], "pressable", className)}
    >
      <ButtonContent pending={pending} icon={icon} pendingLabel={pendingLabel}>
        {children}
      </ButtonContent>
    </button>
  );
}

type ActionButtonProps = ButtonProps & {
  pending: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
};

/** For client components that already track their own pending state. */
export function ActionButton({
  pending,
  variant = "primary",
  icon,
  pendingLabel,
  className,
  children,
  onClick,
  type = "submit",
}: ActionButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={pending}
      aria-busy={pending}
      className={cn(VARIANT[variant], "pressable", className)}
    >
      <ButtonContent pending={pending} icon={icon} pendingLabel={pendingLabel}>
        {children}
      </ButtonContent>
    </button>
  );
}
