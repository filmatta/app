export const OPPORTUNITY_CATEGORIES = [
  { value: "casting", label: "Casting" },
  { value: "crew", label: "Crew" },
  { value: "paid_work", label: "Trabajo pagado / Freelance" },
  { value: "collaboration", label: "Colaboración" },
  { value: "internship", label: "Prácticas" },
] as const;
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseOpportunityForm(form: FormData) {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const optional = (key: string) => text(key) || null;
  const id = optional("id");
  const status = text("status") || "draft";
  const projectTitle = text("project_title");
  const values = {
    title: text("title"),
    opportunity_type: text("opportunity_type") || "opportunity",
    deliverables: optional("deliverables"),
    summary: optional("summary"),
    description: optional("description"),
    category: text("category"),
    discipline: optional("discipline"),
    city: optional("city"),
    work_mode: text("work_mode"),
    compensation_type: text("compensation_type"),
    compensation_min:
      optional("compensation_min") === null
        ? null
        : Number(text("compensation_min")),
    compensation_max:
      optional("compensation_max") === null
        ? null
        : Number(text("compensation_max")),
    compensation_currency: optional("compensation_currency"),
    starts_on: optional("starts_on"),
    ends_on: optional("ends_on"),
    application_deadline: optional("application_deadline")
      ? `${text("application_deadline")}T23:59:59Z`
      : null,
  };
  if (
    !["opportunity", "job"].includes(values.opportunity_type) ||
    (values.deliverables?.length ?? 0) > 4000
  )
    return {
      ok: false as const,
      error:
        "Revisa el tipo de publicación y los entregables (máximo 4 000 caracteres).",
    };
  if (
    values.opportunity_type === "job" &&
    (values.category !== "paid_work" ||
      values.compensation_type !== "paid" ||
      (status === "published" &&
        ((values.deliverables?.length ?? 0) < 20 ||
          (values.description?.length ?? 0) < 40 ||
          (values.discipline?.length ?? 0) < 2 ||
          !(values.compensation_min !== null && values.compensation_min > 0) ||
          !values.application_deadline)))
  )
    return {
      ok: false as const,
      error:
        "Para publicar un encargo pagado, define brief (40 caracteres), entregables (20), disciplina, presupuesto positivo, moneda y fecha límite.",
    };
  if (id && !UUID_PATTERN.test(id))
    return { ok: false as const, error: "No encontramos esta publicación." };
  if (
    !["draft", "published", "closed", "archived"].includes(status) ||
    (!id && !["draft", "published"].includes(status))
  )
    return { ok: false as const, error: "El estado no es válido." };
  if (!id && (projectTitle.length < 3 || projectTitle.length > 160))
    return {
      ok: false as const,
      error: "Escribe un título de proyecto de 3 a 160 caracteres.",
    };
  if (values.title.length < 3 || values.title.length > 160)
    return {
      ok: false as const,
      error: "El título debe tener de 3 a 160 caracteres.",
    };
  if (
    (values.summary?.length ?? 0) > 500 ||
    (values.description?.length ?? 0) > 20000 ||
    (values.discipline?.length ?? 0) > 120 ||
    (values.city?.length ?? 0) > 120
  )
    return {
      ok: false as const,
      error: "Uno de los textos supera el límite indicado.",
    };
  if (
    !OPPORTUNITY_CATEGORIES.some((item) => item.value === values.category) ||
    !["on_site", "remote", "hybrid"].includes(values.work_mode) ||
    !["paid", "expenses", "unpaid", "unspecified"].includes(
      values.compensation_type,
    )
  )
    return {
      ok: false as const,
      error: "Revisa el tipo, la modalidad y la compensación.",
    };
  if (
    status === "published" &&
    ((values.description?.length ?? 0) < 20 ||
      (values.work_mode !== "remote" && (values.city?.length ?? 0) < 2))
  )
    return {
      ok: false as const,
      error:
        "Para publicar, añade un brief de al menos 20 caracteres y la ciudad si no es remoto.",
    };
  const min = values.compensation_min,
    max = values.compensation_max;
  if (
    ["compensation_min", "compensation_max"].some(
      (key) => optional(key) !== null && !/^\d+(\.\d{1,2})?$/.test(text(key)),
    )
  )
    return {
      ok: false as const,
      error:
        "Escribe importes decimales válidos, sin símbolos ni notación científica.",
    };
  if (
    [min, max].some(
      (value) =>
        value !== null &&
        (!Number.isFinite(value) ||
          value < 0 ||
          value > 9999999999.99 ||
          Math.abs(value * 100 - Math.round(value * 100)) > 0.001),
    ) ||
    (min === null && (max !== null || values.compensation_currency !== null)) ||
    (min !== null &&
      (values.compensation_type !== "paid" ||
        !["MXN", "USD", "EUR"].includes(values.compensation_currency ?? "") ||
        (max !== null && max < min)))
  )
    return {
      ok: false as const,
      error:
        "Revisa el presupuesto: importes positivos, hasta dos decimales, moneda y máximo mayor o igual al mínimo.",
    };
  for (const value of [
    values.starts_on,
    values.ends_on,
    optional("application_deadline"),
  ]) {
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        value < "2000-01-01" ||
        value > "2200-12-31" ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      return {
        ok: false as const,
        error: "Usa fechas válidas entre 2000 y 2200.",
      };
  }
  if (values.starts_on && values.ends_on && values.ends_on < values.starts_on)
    return {
      ok: false as const,
      error: "La fecha final debe ser posterior o igual a la inicial.",
    };
  return { ok: true as const, id, status, projectTitle, values };
}
