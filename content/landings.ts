export type Landing = {
  name: string; accent: string; title: string; description: string;
  layout: "portfolio" | "talent" | "spaces" | "board" | "learn" | "services" | "job";
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  capabilities: { title: string; description: string }[];
  steps: string[]; connection: { title: string; description: string; label: string; href: string };
};

export const landings: Record<string, Landing> = {
  jobs: {
    name:"Jobs",accent:"#9DADBD",layout:"job",
    title:"Un encargo claro. El profesional adecuado.",
    description:"Publica lo que necesitas producir o descubre encargos audiovisuales con entregables, fechas, ubicación y presupuesto definidos.",
    primary:{label:"Ver trabajos",href:"/jobs"},secondary:{label:"Publicar un encargo",href:"/mis-oportunidades/nueva?type=job"},
    capabilities:[
      {title:"Define el resultado.",description:"Describe el brief y concreta los entregables: piezas, formatos y alcance del trabajo audiovisual."},
      {title:"Presenta las condiciones.",description:"Indica disciplina, modalidad, presupuesto, moneda y fecha límite. Un encargo publicado es una oportunidad pagada."},
      {title:"Recibe propuestas con contexto.",description:"Las personas con perfil publicado pueden presentar su interés mediante una consulta privada. Revisa su presentación y acepta o declina el interés en tu bandeja."},
    ],
    steps:["Prepara el brief y guarda un borrador.","Publica cuando entregables y condiciones estén definidos.","Revisa el interés recibido en Consultas privadas."],
    connection:{title:"El trabajo ayuda a decidir.",description:"Un reel y los proyectos seleccionados dan contexto a la presentación profesional. Jobs comparte la identidad y los perfiles de FILMATTA.",label:"Explorar profesionales",href:"/perfiles"},
  },
  marketplace: {
    name:"Marketplace",accent:"#A7C4BF",layout:"services",
    title:"Los servicios detrás de cada producción.",
    description:"Encuentra proveedores de equipo, postproducción, sonido, arte y otros servicios audiovisuales con información clara sobre lo que ofrecen.",
    primary:{label:"Explorar servicios",href:"/marketplace"},secondary:{label:"Publicar un servicio",href:"/mis-servicios/nuevo"},
    capabilities:[
      {title:"Qué ofrecen.",description:"Revisa el alcance del servicio, sus muestras de trabajo y el precio orientativo cuando esté indicado."},
      {title:"Dónde trabajan.",description:"Busca por ciudad y modalidad. Distingue lo que necesita presencia en set de lo que puede resolverse a distancia."},
      {title:"Cómo solicitar información.",description:"Con tu perfil profesional publicado, envía una consulta privada. El responsable podrá verla y responder a tu interés desde su bandeja."},
    ],
    steps:["Encuentra una especialidad y revisa la ficha completa.","Presenta tu proyecto en una consulta privada.","Consulta si el responsable acepta tu interés en la bandeja privada."],
    connection:{title:"Un servicio tiene personas detrás.",description:"Conoce el trabajo y la experiencia de quien participa en tu producción. La identidad profesional conecta el directorio con el resto de FILMATTA.",label:"Explorar profesionales",href:"/perfiles"},
  },
  perfiles: {
    name: "Perfiles", accent: "#B9DCEB", layout: "portfolio",
    title: "Tu trabajo merece una mejor presentación.",
    description: "Reúne tu demo reel, book, experiencia y habilidades en un perfil hecho para la industria audiovisual.",
    primary: { label: "Crear mi perfil", href: "/mi-perfil" },
    secondary: { label: "Explorar profesionales", href: "/perfiles" },
    capabilities: [
      { title: "Tu trabajo, antes que un currículum.", description: "Selecciona un reel y enlaces a tus proyectos. Da contexto a cada pieza: qué hiciste y qué quieres mostrar." },
      { title: "Una identidad, distintas disciplinas.", description: "Dirección, cámara, edición o actuación. Reúne tus disciplinas en el mismo perfil y actualízalas cuando cambie tu trabajo." },
      { title: "Una dirección para compartir lo que haces.", description: "Publica tu página y comparte su enlace. Tú eliges cuándo hacer visible el perfil; tu correo y teléfono permanecen privados." },
    ],
    steps: ["Crea tu cuenta y elige tus disciplinas.", "Añade reel, proyectos, habilidades y ciudad.", "Revisa tu perfil, publícalo y comparte tu enlace."],
    connection: { title: "Del portafolio al próximo proyecto.", description: "Consulta convocatorias y prepara tu material según lo que necesita cada producción.", label: "Descubrir oportunidades", href: "/descubre/oportunidades" },
  },
  talento: {
    name: "Talento", accent: "#B9DCEB", layout: "talent",
    title: "Presencia frente a cámara. Un perfil que la muestre.",
    description: "Un espacio para actores, actrices y modelos: book, reel y experiencia presentados con el contexto que necesita una producción.",
    primary: { label: "Crear mi perfil de talento", href: "/mi-perfil" },
    secondary: { label: "Explorar talento", href: "/talento" },
    capabilities: [
      { title: "Material que habla por ti.", description: "Enlaza tu reel, book y trabajos seleccionados. Presenta material vigente y accesible para quien revise tu perfil." },
      { title: "Tu experiencia en contexto.", description: "Cuenta tu participación en cada proyecto y añade las habilidades que forman parte de tu trabajo frente a cámara." },
      { title: "Conecta tu perfil con nuevas convocatorias.", description: "Comparte la misma página en tus procesos de casting. No necesitas una segunda cuenta para sumar otras disciplinas." },
    ],
    steps: ["Usa tu cuenta de FILMATTA y añade actuación o modelaje.", "Selecciona tu material y describe tu experiencia.", "Publica tu perfil y consulta las convocatorias."],
    connection: { title: "Cada convocatoria tiene su contexto.", description: "Revisa requisitos, ciudad y condiciones antes de preparar tu participación.", label: "Ver oportunidades", href: "/oportunidades" },
  },
  locaciones: {
    name: "Locaciones", accent: "#B2B9A2", layout: "spaces",
    title: "El siguiente escenario de tu producción.",
    description: "Explora espacios para cine, fotografía y video, o publica una locación con la información necesaria para evaluar su uso.",
    primary: { label: "Explorar locaciones", href: "/locaciones" },
    secondary: { label: "Publicar una locación", href: "/mis-locaciones/nueva" },
    capabilities: [
      { title: "Mira el espacio.", description: "Recorre las fotografías y sitúa el lugar por ciudad y zona. La dirección exacta no forma parte de la ficha pública." },
      { title: "Entiende sus condiciones.", description: "Consulta tipo de espacio, interior o exterior, restricciones y precio orientativo cuando el propietario lo haya indicado." },
      { title: "Prepara la conversación.", description: "Anota las necesidades de tu rodaje y las condiciones que debes confirmar. El contacto privado desde FILMATTA todavía está en preparación." },
    ],
    steps: ["Explora las fichas publicadas y sus fotografías.", "Revisa condiciones y necesidades de tu rodaje.", "Conserva el enlace del espacio para evaluar tus opciones."],
    connection: { title: "Un espacio cobra vida con un equipo.", description: "Presenta tu experiencia y encuentra a las personas que pueden formar parte de tu producción.", label: "Descubrir perfiles", href: "/descubre/perfiles" },
  },
  oportunidades: {
    name: "Oportunidades", accent: "#AFC1CD", layout: "board",
    title: "Tu próximo proyecto empieza con una oportunidad.",
    description: "Encuentra castings, llamados de crew, colaboraciones y convocatorias audiovisuales con requisitos y condiciones claros.",
    primary: { label: "Ver oportunidades", href: "/oportunidades" },
    secondary: { label: "Publicar oportunidad", href: "/mis-oportunidades/nueva" },
    capabilities: [
      { title: "Qué buscan.", description: "Conoce la disciplina, el perfil y el contexto del proyecto. Una convocatoria precisa ayuda a decidir si puedes aportar." },
      { title: "Cuándo y dónde.", description: "Revisa ciudad, modalidad, fechas y compensación declaradas. Las condiciones deben estar claras antes de participar." },
      { title: "Cómo participar.", description: "Lee la convocatoria completa y prepara una presentación relevante. Las postulaciones dentro de FILMATTA aún no están disponibles." },
    ],
    steps: ["Consulta las oportunidades publicadas.", "Lee los requisitos y las condiciones del proyecto.", "Prepara el material que solicita la convocatoria."],
    connection: { title: "Llega con tu trabajo a la vista.", description: "Tu perfil reúne el material que permite entender tu experiencia y tus disciplinas.", label: "Crear mi perfil", href: "/mi-perfil" },
  },
  learn: {
    name: "Learn", accent: "#DCC6A7", layout: "learn",
    title: "Aprende el oficio. Lleva tus ideas al set.",
    description: "Formación práctica en cámara, iluminación, edición, sonido y procesos creativos para aplicar lo aprendido en tus proyectos.",
    primary: { label: "Explorar cursos", href: "/cursos" },
    secondary: { label: "Ver planes", href: "/planes" },
    capabilities: [
      { title: "Aprende con ejemplos.", description: "Consulta el temario y las lecciones de cada curso publicado. Revisa las vistas previas disponibles antes de elegir." },
      { title: "Practica con intención.", description: "Lleva una idea de la lección a tu siguiente ejercicio: observa, prueba y compara lo que cambia en tu trabajo." },
      { title: "Vuelve a lo que necesitas.", description: "Retoma tus cursos desde Mi aprendizaje y consulta las lecciones a las que tengas acceso." },
    ],
    steps: ["Explora los cursos y revisa su temario.", "Crea tu cuenta y consulta las opciones de acceso.", "Aprende a tu ritmo y registra tu progreso."],
    connection: { title: "Lo que aprendes también forma parte de tu trabajo.", description: "Selecciona tus mejores proyectos y presenta cómo aplicas tus nuevas habilidades.", label: "Descubrir perfiles", href: "/descubre/perfiles" },
  },
};

export function getLanding(slug: string): Landing | null {
  return Object.hasOwn(landings, slug) ? landings[slug] : null;
}

export function landingActionHref(href: string, authenticated: boolean) {
  const needsAccount = href === "/mi-perfil" || href.startsWith("/mis-locaciones/") || href.startsWith("/mis-oportunidades/") || href.startsWith("/mis-servicios/");
  return needsAccount && !authenticated ? `/registro?next=${encodeURIComponent(href)}` : href;
}
