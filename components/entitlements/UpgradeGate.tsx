"use client";

import Link from "next/link";
import { useRef } from "react";
import { emitMonetizationEvent } from "@/lib/entitlements/analytics";
import { getEntitlementDefinition } from "@/lib/entitlements/catalog";
import type { EntitlementCheck } from "@/lib/entitlements/types";
import { FeaturePlanBadge } from "./FeaturePlanBadge";
import { PlanBadge, planLabel } from "./PlanBadge";

export function UpgradeGate({
  access,
  context,
  children,
  className = "",
}: {
  access: EntitlementCheck;
  context?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const feature = getEntitlementDefinition(access.entitlement);
  const featureName = feature?.name ?? "Esta función";

  if (access.allowed) return <>{children}</>;

  if (
    access.reason === "UNAVAILABLE" ||
    access.reason === "UNKNOWN_ENTITLEMENT"
  ) {
    return (
      <span
        aria-disabled="true"
        className={`inline-flex cursor-not-allowed items-center gap-2 text-white/35 ${className}`}
      >
        {children ?? featureName}
        <span className="text-[10px] uppercase tracking-[0.12em]">
          No disponible
        </span>
      </span>
    );
  }

  const openGate = () => {
    emitMonetizationEvent({
      event: "feature_gate_triggered",
      entitlement: access.entitlement,
      currentPlan: access.currentPlan,
      requiredPlan: access.requiredPlan,
      context,
      reason: access.reason,
    });
    if (access.reason !== "PLAN_LOCKED") {
      emitMonetizationEvent({
        event: "allowance_exhausted",
        entitlement: access.entitlement,
        currentPlan: access.currentPlan,
        requiredPlan: access.requiredPlan,
        context,
        reason: access.reason,
      });
    }
    dialogRef.current?.showModal();
    emitMonetizationEvent({
      event: "upgrade_gate_viewed",
      entitlement: access.entitlement,
      currentPlan: access.currentPlan,
      requiredPlan: access.requiredPlan,
      context,
      reason: access.reason,
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={openGate}
        className={`inline-flex items-center gap-2 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white ${className}`}
        aria-haspopup="dialog"
      >
        <span>{children ?? featureName}</span>
        {access.requiredPlan && access.requiredPlan !== "free" && (
          <FeaturePlanBadge plan={access.requiredPlan} />
        )}
      </button>

      <UpgradeModal
        dialogRef={dialogRef}
        access={access}
        context={context}
      />
    </>
  );
}

function UpgradeModal({
  dialogRef,
  access,
  context,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  access: EntitlementCheck;
  context?: string;
}) {
  const feature = getEntitlementDefinition(access.entitlement);
  const copy = gateCopy(access, feature?.upgradeTitle, feature?.upgradeDescription);
  const requiredPlan = access.requiredPlan;
  const plansHref = requiredPlan && requiredPlan !== "free"
    ? `/planes#${requiredPlan}`
    : "/planes";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`upgrade-title-${safeId(access.entitlement)}`}
      aria-describedby={`upgrade-description-${safeId(access.entitlement)}`}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-white/15 bg-[#101010] p-0 text-white shadow-2xl backdrop:bg-black/75 open:animate-[fadeIn_.16s_ease-out]"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="relative p-6 sm:p-8">
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Cerrar"
          className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full border border-white/10 text-xl text-white/50 transition hover:border-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          ×
        </button>

        {requiredPlan && requiredPlan !== "free" && (
          <PlanBadge plan={requiredPlan} size="card" />
        )}
        <h2
          id={`upgrade-title-${safeId(access.entitlement)}`}
          className="mt-5 max-w-md pr-8 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl"
        >
          {copy.title}
        </h2>
        <p
          id={`upgrade-description-${safeId(access.entitlement)}`}
          className="mt-4 leading-7 text-white/55"
        >
          {copy.description}
        </p>

        {copy.quota && (
          <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/65">
            {copy.quota}
          </p>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 text-sm">
          <div>
            <dt className="text-white/35">Tu plan</dt>
            <dd className="mt-1 font-semibold">
              {planLabel(access.currentPlan)}
            </dd>
          </div>
          <div>
            <dt className="text-white/35">Disponible desde</dt>
            <dd className="mt-1 font-semibold">
              {requiredPlan ? planLabel(requiredPlan) : "Por definir"}
            </dd>
          </div>
        </dl>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-full px-5 py-3 text-sm font-semibold text-white/55 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Ahora no
          </button>
          <Link
            href={plansHref}
            onClick={() => {
              emitMonetizationEvent({
                event: "upgrade_cta_clicked",
                entitlement: access.entitlement,
                currentPlan: access.currentPlan,
                requiredPlan: access.requiredPlan,
                context,
                reason: access.reason,
              });
              dialogRef.current?.close();
            }}
            className="rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            {access.reason === "PLAN_LOCKED" ? "Mejorar plan" : "Ver planes"}
          </Link>
        </div>
      </div>
    </dialog>
  );
}

function gateCopy(
  access: EntitlementCheck,
  upgradeTitle = "Amplía tus capacidades",
  upgradeDescription = "Consulta los planes disponibles para esta función."
) {
  if (access.reason === "PLAN_LOCKED") {
    return {
      title: upgradeTitle,
      description: upgradeDescription,
      quota: null,
    };
  }

  if (access.reason === "AI_CREDITS_EXHAUSTED") {
    return {
      title: "Has utilizado tus AI Credits",
      description:
        "No tienes suficientes AI Credits para esta operación. Tu acceso al producto sigue activo.",
      quota: quotaLabel(access),
    };
  }

  if (access.reason === "STORAGE_LIMIT") {
    return {
      title: "Llegaste al límite de esta capacidad",
      description:
        "Tu perfil sigue activo. Puedes liberar espacio o consultar planes con mayor capacidad.",
      quota: quotaLabel(access),
    };
  }

  return {
    title: "Has utilizado tu cuota de este periodo",
    description:
      "La función forma parte de tu plan, pero la cuota disponible para este periodo se agotó.",
    quota: quotaLabel(access),
  };
}

function quotaLabel(access: EntitlementCheck) {
  if (access.allowance === null) return null;
  return `${access.usage}/${access.allowance}${access.unit ? ` ${access.unit}` : ""}`;
}

function safeId(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-");
}
