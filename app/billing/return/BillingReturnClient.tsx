"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getPlanVisual } from "@/lib/plan-visuals";
import {
  BILLING_RETURN_POLL_INTERVAL_MS,
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

  const visual =
    view.status === "confirmed"
      ? getPlanVisual(view.plan)
      : getPlanVisual("pro");

  return (
    <section className="mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-3xl items-center px-5 py-10 sm:px-8 sm:py-12">
      <div
        className={`flex w-full flex-col items-center rounded-3xl border px-6 py-10 text-center ${visual.panelClassName} shadow-2xl shadow-black/30 sm:px-10 sm:py-12`}
      >
        <Image
          src="/brand/matti/matti-plan-success.png"
          alt="Matti, la mascota de FILMATTA"
          width={240}
          height={240}
          priority
          className="h-auto w-36 object-contain sm:w-44 lg:w-48"
        />

        <div
          aria-live="polite"
          className="mt-7 flex w-full flex-col items-center"
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
                Tu plan ya está listo. Continúa cuando quieras.
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
            <button
              type="button"
              onClick={() => window.location.replace("/planes")}
              className="inline-flex rounded-full border border-white/15 bg-black/15 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              {view.status === "confirmed" ? "Ver mi plan" : "Volver a mis planes"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
