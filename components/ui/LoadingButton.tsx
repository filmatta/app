"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import LoadingSpinner from "./LoadingSpinner";

type LoadingButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  children: ReactNode;
  loading?: boolean;
  loadingText: string;
};

export default function LoadingButton({
  children,
  loading = false,
  loadingText,
  disabled,
  className = "",
  type = "button",
  ...props
}: LoadingButtonProps) {
  const { pending } = useFormStatus();
  const isLoading = loading || pending;

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      className={`relative inline-flex items-center justify-center ${className}`}
    >
      <span
        className={`inline-flex items-center justify-center gap-2 ${
          isLoading ? "invisible" : ""
        }`}
      >
        {children}
      </span>
      {isLoading && (
        <span
          role="status"
          aria-live="polite"
          className="absolute inset-0 inline-flex items-center justify-center gap-2"
        >
          <LoadingSpinner size="sm" />
          <span>{loadingText}</span>
        </span>
      )}
    </button>
  );
}
