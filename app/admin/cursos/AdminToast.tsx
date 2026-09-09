"use client";

import { useEffect, useState } from "react";

export default function AdminToast({
  message,
  variant,
}: {
  message: string;
  variant: "success" | "error";
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("success");
    url.searchParams.delete("error");
    url.searchParams.delete("content_error");
    url.searchParams.delete("notice");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );

    const timeout = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  if (!visible) {
    return null;
  }

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={`fixed right-5 top-5 z-50 flex max-w-sm items-start gap-3 rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur-md sm:right-8 sm:top-8 ${
        variant === "error"
          ? "border-red-500/25 bg-[#1a0d0d]/95 text-red-100"
          : "border-green-500/20 bg-[#0d1711]/95 text-green-100"
      }`}
    >
      <span aria-hidden="true" className="mt-0.5 text-sm">
        {variant === "error" ? "!" : "✓"}
      </span>
      <span className="text-sm font-medium leading-6">{message}</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Cerrar mensaje"
        className="ml-2 text-white/40 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        ×
      </button>
    </div>
  );
}
