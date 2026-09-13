"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getPlanVisual } from "@/lib/plan-visuals";
import {
  BILLING_RETURN_POLL_INTERVAL_MS,
  BILLING_RETURN_REDIRECT_DELAY_MS,
  BILLING_RETURN_TIMEOUT_MS,
  getBillingReturnView,
  type BillingReturnSource,
} from "@/lib/billing/return-presentation";
import type { BillingPlan } from "@/lib/billing/policy";

type StatusResponse = { plan?: unknown };

export default function BillingReturnClient({
  initialPlan,
  source,
}: {
  initialPlan: BillingPlan | null;
  source: BillingReturnSource;
}) {
  const [plan, setPlan] = useState<BillingPlan | null>(initialPlan);
  const [timedOut, setTimedOut] = useState(false);
  const view = getBillingReturnView({ source, plan, timedOut });

  useEffect(() => {
    if (view.status === "confirmed" || timedOut) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutTimer = setTimeout(() => {
      setTimedOut(true);
      controller.abort();
    }, BILLING_RETURN_TIMEOUT_MS);

    const checkPlan = async () => {
      try {
        const response = await fetch("/api/billing/status", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.location.replace("/acceso?next=%2Fbilling%2Freturn");
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as StatusResponse;
          if (data.plan === "plus" || data.plan === "pro") {
            const nextView = getBillingReturnView({
              source,
              plan: data.plan,
              timedOut: false,
            });
            if (nextView.status === "confirmed") {
              clearTimeout(timeoutTimer);
              setPlan(data.plan);
              return;
            }
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }

      timer = setTimeout(checkPlan, BILLING_RETURN_POLL_INTERVAL_MS);
    };

    timer = setTimeout(checkPlan, BILLING_RETURN_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearTimeout(timeoutTimer);
      if (timer) clearTimeout(timer);
    };
  }, [source, timedOut, view.status]);

  useEffect(() => {
    if (view.status !== "confirmed") return;
    const timer = setTimeout(() => {
      window.location.replace("/planes");
    }, BILLING_RETURN_REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [view.status]);

  const visual =
    view.status === "confirmed"
      ? getPlanVisual(view.plan)
      : getPlanVisual("pro");

  return (
    <section className="mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-5xl items-center px-5 py-12 sm:px-8 lg:py-16">
      <div
        className={`grid w-full overflow-hidden rounded-3xl border ${visual.panelClassName} shadow-2xl shadow-black/30 md:grid-cols-[15rem_1fr]`}
      >
        <div className="flex min-h-48 items-end justify-center bg-black/15 px-8 pt-8 md:min-h-[23rem] md:px-6">
          <Image
            src="/brand/matti/matti-plan-success.png"
            alt="Matti, la mascota de FILMATTA"
            width={360}
            height={360}
            priority
            className="h-auto max-h-48 w-auto max-w-full object-contain object-bottom md:max-h-72"
          />
        </div>

        <div
          aria-live="polite"
          className="flex flex-col justify-center px-6 py-9 text-center sm:px-10 md:py-12 md:text-left"
        >
          <p
            className={`text-xs font-semibold uppercase tracking-[0.26em] ${visual.accentClassName}`}
          >
            FILMATTA Learn
          </p>

          {view.status === "confirmed" ? (
            <>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                {view.title}
              </h1>
              <p className="mt-4 max-w-xl leading-7 text-white/60">
                {view.message}
              </p>
              <p className="mt-4 text-sm text-white/35">
                Te llevaremos a tus planes en un momento.
              </p>
            </>
          ) : view.status === "timeout" ? (
            <>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Seguimos verificando tu cuenta
              </h1>
              <p className="mt-4 max-w-xl leading-7 text-white/60">
                La actualización todavía no aparece confirmada. Tu acceso seguirá
                dependiendo del plan vigente registrado en FILMATTA.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Estamos actualizando tu cuenta…
              </h1>
              <p className="mt-4 max-w-xl leading-7 text-white/60">
                Estamos esperando la confirmación segura de tu plan. Esto suele
                tomar sólo unos segundos.
              </p>
            </>
          )}

          <div className="mt-8">
            <a
              href="/planes"
              className="inline-flex rounded-full border border-white/15 bg-black/15 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              {view.status === "confirmed" ? "Ver mi plan" : "Volver a mis planes"}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
