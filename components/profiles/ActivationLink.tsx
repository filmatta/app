"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  activationEvent,
  type ActivationEvent,
} from "@/lib/profiles/activation-events";
export default function ActivationLink({
  href,
  className,
  children,
  event,
  category,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  event: ActivationEvent;
  category?: Parameters<typeof activationEvent>[1];
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => activationEvent(event, category)}
    >
      {children}
    </Link>
  );
}
