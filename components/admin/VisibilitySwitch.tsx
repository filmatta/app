type VisibilitySwitchProps = {
  id: string;
  name?: string;
  defaultPublic?: boolean;
  archived?: boolean;
};

export default function VisibilitySwitch({
  id,
  name = "status",
  defaultPublic = false,
  archived = false,
}: VisibilitySwitchProps) {
  if (archived) {
    return (
      <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-5">
        <input type="hidden" name={name} value="archived" />
        <span className="inline-flex rounded-full bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
          Archivado
        </span>
        <p className="mt-3 text-sm leading-6 text-white/45">
          Este contenido permanece archivado y no se representa como público o
          privado. La restauración debe gestionarse como una acción separada.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="font-semibold text-white/80">Público</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/40">
            Cuando está activo, este contenido es visible para los usuarios
            según sus reglas de acceso. Desactivado, sólo los administradores
            pueden verlo.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
          <span>Privado</span>
          <label htmlFor={id} className="relative cursor-pointer">
            <span className="sr-only">Público</span>
            <input
              id={id}
              type="checkbox"
              name={name}
              value="published"
              defaultChecked={defaultPublic}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="block h-7 w-12 rounded-full border border-white/15 bg-white/10 transition after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white/65 after:transition peer-checked:border-green-300/30 peer-checked:bg-green-400/20 peer-checked:after:translate-x-5 peer-checked:after:bg-green-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-white"
            />
          </label>
          <span>Público</span>
        </div>
      </div>
    </div>
  );
}
