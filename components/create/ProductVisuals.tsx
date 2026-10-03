import type { ReactNode } from "react";

function Chrome({
  title,
  product,
  children,
  className = "",
}: {
  title: string;
  product: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`create-window ${className}`} inert aria-hidden="true">
      <div className="create-window-bar">
        <span className="create-window-mark">F</span>
        <strong>{product}</strong>
        <span className="create-window-separator" />
        <span>{title}</span>
        <i>Guardado</i>
      </div>
      {children}
    </div>
  );
}
export function WriterVisual({ compact = false }: { compact?: boolean }) {
  return (
    <Chrome
      title="LA FRECUENCIA"
      product="Writer"
      className={compact ? "is-compact" : ""}
    >
      <div className="writer-demo">
        <aside>
          <p>GUION</p>
          <strong>La Frecuencia</strong>
          <p>ESCENAS</p>
          <button className="is-active">01 · RADIO K-17</button>
          <button>02 · EL PASILLO</button>
          <button>03 · ANTENA</button>
          <p>PERSONAJES</p>
          <span>MARA</span>
          <span>ELÍAS</span>
        </aside>
        <div className="writer-demo-editor">
          <div className="writer-demo-tools">
            <span>Acción⌄</span>
            <span>Insertar</span>
            <b>B</b><em>I</em><u>U</u>
            <i>1,248 palabras</i>
          </div>
          <article>
            <h4>INT. RADIO K-17 — NOCHE</h4>
            <p>
              La aguja del transmisor tiembla. MARA acerca el viejo CASETE al
              micrófono mientras una frecuencia imposible llena la cabina.
            </p>
            <h5>MARA</h5>
            <p className="dialogue">Si alguien escucha esto, no sigan la señal.</p>
            <h5>ELÍAS (V.O.)</h5>
            <p className="dialogue">Ya es tarde.</p>
          </article>
        </div>
        <aside className="writer-demo-review">
          <div className="create-tabs"><b>Revisión</b><span>Breakdown</span></div>
          <p className="spark">✦ PULSE</p>
          <strong>La señal cambia el objetivo de Mara.</strong>
          <small>Escena 01 · giro narrativo</small>
          <div className="pulse-line"><i /><i /><i /><i /></div>
          <p>RELACIÓN</p>
          <span>Mara protege a Elías, pero ya no confía en su voz.</span>
        </aside>
      </div>
    </Chrome>
  );
}

const shots = [
  ["01", "Plano general", "Mara entra a la cabina", "24 mm", "Dolly in"],
  ["02", "Plano medio", "Mara enciende la radio", "50 mm", "Fijo"],
  ["03", "Plano detalle", "La aguja vibra", "85 mm", "Push-in"],
  ["04", "Primer plano", "Mara reconoce la voz", "75 mm", "Fijo"],
] as const;

export function ShotlistVisual({ compact = false }: { compact?: boolean }) {
  return (
    <Chrome
      title="LA FRECUENCIA · Cobertura"
      product="Shotlist"
      className={compact ? "is-compact" : ""}
    >
      <div className="shotlist-demo">
        <aside>
          <p>ESCENAS</p>
          <button className="is-active"><b>01</b> RADIO K-17 <small>4 planos</small></button>
          <button><b>02</b> EL PASILLO <small>3 planos</small></button>
          <button><b>03</b> ANTENA <small>2 planos</small></button>
        </aside>
        <div className="shotlist-demo-grid">
          <div className="shotlist-demo-toolbar">
            <span className="is-active">✎ Libre</span>
            <span>◉ Asistido</span>
            <span>✦ Sugerido</span>
            <i>9 planos · 3 escenas</i>
          </div>
          <header><span>#</span><span>PLANO</span><span>SUJETO / ACCIÓN</span><span>LENTE</span><span>MOVIMIENTO</span></header>
          {shots.map((shot, index) => (
            <div className={index === 2 ? "is-selected" : ""} key={shot[0]}>
              {shot.map((value) => <span key={value}>{value}</span>)}
            </div>
          ))}
        </div>
        <aside className="shotlist-demo-inspector">
          <p>PLANO 03</p>
          <strong>La aguja vibra</strong>
          <label>TIPO <span>Plano detalle</span></label>
          <label>LENTE <span>85 mm</span></label>
          <label>INTENCIÓN <span>Convertir la radio en una amenaza.</span></label>
          <div><b>Referencia visual</b><small>Imagen manual</small></div>
        </aside>
      </div>
    </Chrome>
  );
}

function StoryFrame({ number, state, children }: { number: string; state: string; children: ReactNode }) {
  return (
    <article className="story-frame">
      <div className="story-image">{children}</div>
      <footer><b>{number}</b><span>{state}</span></footer>
    </article>
  );
}

export function StoryboardVisual() {
  return (
    <div className="concept-shell storyboard-concept">
      <header>
        <div><span>LA FRECUENCIA</span><strong>Visual Board</strong></div>
        <span className="concept-label">STORYBOARD · EN DESARROLLO</span>
      </header>
      <div className="story-layout">
        <aside>
          <p>ESCENA 01</p>
          <b>Beat 01 · La señal</b>
          <span className="is-active">Shot 01 — Entrada</span>
          <span>Shot 02 — Radio</span>
          <span>Shot 03 — Frecuencia</span>
          <span>Shot 04 — Reacción</span>
        </aside>
        <div className="story-grid">
          <StoryFrame number="01" state="Referencia">
            <div className="story-door" /><div className="story-person" />
          </StoryFrame>
          <StoryFrame number="02" state="Sketch">
            <div className="story-radio" /><svg viewBox="0 0 100 40"><path d="M8 32 Q48 2 92 27" /></svg>
          </StoryFrame>
          <StoryFrame number="03" state="Seleccionado">
            <div className="story-dial" /><div className="story-signal" />
          </StoryFrame>
          <StoryFrame number="04" state="Brief">
            <div className="story-closeup" /><p>Mara reconoce la voz.</p>
          </StoryFrame>
        </div>
      </div>
      <p className="concept-caption">Vista conceptual — capa visual opcional de Shotlist</p>
    </div>
  );
}

export function SketcherVisual() {
  return (
    <div className="concept-shell sketcher-concept">
      <header>
        <div><span>SHOT 03</span><strong>Sketcher</strong></div>
        <span className="concept-label">VISTA CONCEPTUAL</span>
      </header>
      <div className="sketcher-tools" aria-hidden="true">
        <b>✎</b><span>⌫</span><span>↶</span><span>↷</span><span>□</span><span>→</span><span>T</span>
      </div>
      <div className="sketcher-body">
        <div className="sketch-canvas">
          <svg viewBox="0 0 520 290" role="img" aria-label="Boceto del plano detalle de una radio">
            <path d="M35 235 L480 235 L445 68 L80 68 Z" />
            <rect x="150" y="108" width="225" height="98" rx="8" />
            <circle cx="205" cy="158" r="28" />
            <path d="M255 142 L342 142 M255 160 L325 160 M255 178 L354 178" />
            <path className="sketch-arrow" d="M98 226 Q180 250 240 208" />
            <path className="sketch-arrow" d="M402 78 Q444 112 424 158" />
          </svg>
          <span className="sketch-note">PUSH-IN LENTO</span>
        </div>
        <aside>
          <p>BRIEF DEL PLANO</p>
          <h4>La aguja responde a la voz.</h4>
          <dl><dt>Encuadre</dt><dd>Plano detalle · 85 mm</dd><dt>Objeto</dt><dd>Radio K-17 / casete</dd><dt>Movimiento</dt><dd>Push-in</dd></dl>
          <div className="sketcher-paths"><span>✎ Dibujar</span><span>⇧ Subir referencia</span><span>✦ Generar opcionalmente</span></div>
        </aside>
      </div>
    </div>
  );
}

export function ProductionVisual() {
  const tasks = [
    ["Confirmar acceso a Radio K-17", "Locaciones", "Pendiente"],
    ["Preparar el casete", "Arte", "En curso"],
    ["Revisar vestuario de Mara", "Vestuario", "Listo"],
    ["Prueba de sonido", "Sonido", "Pendiente"],
  ];
  return (
    <div className="concept-shell production-concept">
      <header>
        <div><span>LA FRECUENCIA</span><strong>Production</strong></div>
        <span className="concept-label">PRODUCTION · EN DESARROLLO</span>
      </header>
      <nav aria-label="Vistas conceptuales"><b>Overview</b><span>Tareas</span><span>Calendario</span><span>Departamentos</span><span>Recursos</span></nav>
      <div className="production-main">
        <section>
          <div className="production-day"><span>JORNADA 01</span><b>Noche · Radio K-17</b><small>Escenas 01–03 · 9 planos</small></div>
          <h4>Trabajo para preparar</h4>
          {tasks.map((task) => <div className="production-task" key={task[0]}><i /><b>{task[0]}</b><span>{task[1]}</span><em>{task[2]}</em></div>)}
        </section>
        <aside>
          <button type="button" tabIndex={-1}>✦ Generar producción</button>
          <div><p>RECURSOS</p><b>Radio de época</b><span>Necesidad detectada</span></div>
          <div><p>FALTANTE</p><b>Acceso nocturno</b><span>Sin confirmar</span></div>
          <div><p>PRÓXIMO</p><b>Prueba de sonido</b><span>Viernes · 18:00</span></div>
        </aside>
      </div>
      <p className="concept-caption">Vista conceptual — datos ficticios del proyecto demo</p>
    </div>
  );
}

export function RecVisual() {
  return (
    <div className="rec-device" aria-label="Vista conceptual de REC en móvil">
      <div className="rec-notch" />
      <header><b>REC</b><span>JORNADA 01</span><i>●</i></header>
      <main>
        <p>AHORA</p><h4>Shot 03 · La aguja vibra</h4><span>Plano detalle · 85 mm · Push-in</span>
        <div className="rec-frame"><div className="story-dial" /><div className="story-signal" /></div>
        <button type="button" tabIndex={-1}>Marcar plano listo</button>
        <section><span>SIGUIENTE</span><b>Shot 04 · Mara reconoce la voz</b></section>
      </main>
      <footer><b>Hoy</b><span>Shots</span><span>Tareas</span><span>Docs</span></footer>
    </div>
  );
}
