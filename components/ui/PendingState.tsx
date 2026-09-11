import type { ReactNode } from "react";
import LoadingSpinner from "./LoadingSpinner";

export default function PendingState({
  title,
  description,
  action,
  state = "pending",
  compact = false,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  state?: "pending" | "error";
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role={state === "error" ? "alert" : "status"}
      aria-live="polite"
      aria-busy={state === "pending"}
      data-state={state}
      className={`flex ${compact ? "items-start gap-3" : "flex-col items-center text-center"} ${className}`}
    >
      {state === "pending" ? (
        <LoadingSpinner
          size={compact ? "sm" : "md"}
          className="mt-0.5 text-white/55"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-5 shrink-0 items-center justify-center rounded-full border border-red-300/40 text-xs text-red-200"
        >
          !
        </span>
      )}
      <div>
        <p className="text-sm font-medium text-white/70">{title}</p>
        {description && (
          <p className="mt-1 text-xs leading-5 text-white/35">
            {description}
          </p>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
