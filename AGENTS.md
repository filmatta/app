# FILMATTA — AGENTS.md

## 1. Qué es FILMATTA

FILMATTA es una plataforma vertical para la industria audiovisual.

La visión a largo plazo incluye:

- Learn
- Professional Profiles / Talent
- Opportunities
- Projects
- Locations
- Rentals
- Services
- Business Workspaces

No implementar funciones futuras sólo porque aparecen descritas en este archivo.

La prioridad actual es lanzar y monetizar FILMATTA Learn.

---

## 2. Prioridad actual

El objetivo inmediato es:

> Que un usuario real pueda entrar a FILMATTA, encontrar un curso, registrarse, obtener acceso y aprender.

Orden actual de desarrollo:

1. Página pública de curso `/cursos/[slug]`
2. Módulos de curso
3. Lecciones
4. CMS para módulos y lecciones
5. Registro público
6. Cuenta del alumno
7. Acceso a cursos
8. Navegación entre lecciones
9. Progreso
10. Integración de pago/acceso

No desarrollar todavía Projects, Hiring, Scout, Rentals, Services u otras funciones grandes salvo petición explícita.

---

## 3. Filosofía de desarrollo

Priorizar:

producto funcionando
→ validación
→ usuarios
→ ingresos
→ iteración

No priorizar:

arquitectura perfecta
→ scope gigante
→ lanzamiento algún día

Cuando existan varias soluciones técnicamente correctas, elegir la más sencilla que:

- sea segura;
- sea mantenible;
- permita escalar razonablemente;
- no bloquee el roadmap conocido;
- pueda lanzarse rápido.

Evitar overengineering.

---

## 4. Stack actual

FILMATTA utiliza:

- Next.js 16
- App Router
- TypeScript
- Tailwind CSS
- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage
- Row Level Security
- Vercel
- GitHub

Repositorio:

`https://github.com/filmatta/app`

Proyecto local del fundador:

`G:\proyectos\filmatta`

---

## 5. Convenciones de Next.js

Usar App Router.

Preferir:

- Server Components por defecto.
- Server Actions para mutaciones seguras.
- Client Components únicamente cuando se necesite estado o interacción del navegador.

No convertir páginas completas a `"use client"` sin necesidad.

En Next.js 16, `params` y `searchParams` pueden ser Promises.

Ejemplo conceptual:

`params: Promise<{ slug: string }>`

y después:

`const { slug } = await params`

La autenticación SSR existente usa `proxy.ts`.

No crear un `middleware.ts` paralelo sin una razón explícita.

---

## 6. Supabase

Supabase maneja actualmente:

- base de datos;
- autenticación;
- perfiles;
- cursos;
- permisos;
- RLS;
- imágenes de portada.

Variables públicas existentes:

`NEXT_PUBLIC_SUPABASE_URL`

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Nunca exponer:

- service role key;
- secret keys;
- credenciales privilegiadas;
- secretos de infraestructura.

`.env.local` debe permanecer ignorado por Git.

---

## 7. Clientes Supabase existentes

Ya existen helpers aproximadamente en:

- `lib/supabase/server.ts`
- `lib/supabase/client.ts`
- `lib/supabase/proxy.ts`
- `proxy.ts`

Reutilizarlos.

No crear clientes Supabase duplicados si ya existe uno adecuado.

Usar cliente server-side para operaciones de servidor.

Usar browser client únicamente cuando realmente sea necesario.

---

## 8. Autenticación

Supabase Auth ya funciona.

Existe una tabla `profiles`.

Los roles actuales incluyen:

- `user`
- `instructor`
- `admin`

Existe un helper:

`lib/auth/require-admin.ts`

Usar `requireAdmin()` para proteger administración y mutaciones administrativas.

No crear un segundo sistema de autorización de admins.

---

## 9. Seguridad y RLS

Row Level Security es obligatorio.

Nunca resolver problemas de permisos desactivando RLS.

Existe un helper PostgreSQL similar a:

`private.is_admin()`

Las reglas de seguridad deben aplicarse en servidor/base de datos.

Ocultar un botón en frontend NO equivale a autorización.

Cuando se cree una tabla nueva con datos privados o privilegiados:

- activar RLS;
- crear policies explícitas;
- limitar lectura/escritura correctamente.

---

## 10. Tabla courses existente

La tabla `courses` ya existe.

Incluye conceptos como:

- `id`
- `title`
- `slug`
- `short_description`
- `description`
- `cover_image_url`
- `cover_image_path`
- `category`
- `level`
- `duration_minutes`
- `instructor`
- `hotmart_url`
- `status`
- `featured`
- `sort_order`
- `created_at`
- `updated_at`

Estados válidos:

- `draft`
- `published`
- `archived`

Los visitantes sólo deben leer cursos `published`.

Los admins pueden administrar todos.

NO recrear la tabla `courses`.

---

## 11. Portadas de cursos

Las portadas utilizan Supabase Storage.

Bucket:

`course-covers`

Tipos permitidos:

- `image/jpeg`
- `image/png`
- `image/webp`

Máximo aproximado:

`5 MB`

Al reemplazar una portada:

1. subir nueva imagen;
2. actualizar base de datos;
3. si falla la actualización, eliminar la nueva imagen;
4. si funciona, eliminar la imagen anterior.

Al borrar un curso:

1. obtener `cover_image_path`;
2. borrar registro;
3. limpiar Storage.

Preservar este comportamiento.

---

## 12. CMS actual

Ya existen:

- `/admin`
- `/admin/cursos`
- `/admin/cursos/nuevo`
- `/admin/cursos/[id]`

CRUD de cursos ya funciona:

- crear;
- editar;
- eliminar;
- portada;
- status;
- featured;
- categoría;
- nivel.

No reescribir funcionalidad que ya funciona sin motivo.

Extender el CMS existente.

---

## 13. Arquitectura inmediata de Learn

La estructura de contenido debe ser:

courses
→ course_modules
→ course_lessons

### course_modules

Campos sugeridos:

- `id`
- `course_id`
- `title`
- `description`
- `sort_order`
- `status`
- `created_at`
- `updated_at`

### course_lessons

Campos sugeridos:

- `id`
- `module_id`
- `title`
- `slug`
- `description`
- `duration_minutes`
- `sort_order`
- `is_preview`
- `status`
- `video_url`
- `created_at`
- `updated_at`

Mantener esta primera versión sencilla.

No crear todavía un editor de contenido complejo.

---

## 14. Vídeo de cursos

Los vídeos educativos pueden vivir inicialmente fuera de FILMATTA, incluyendo Hotmart.

No hacer pasar archivos de vídeo pesados por el servidor de Next.js.

FILMATTA debe almacenar principalmente metadata y URLs/identificadores necesarios.

---

## 15. Rutas de Learn

Rutas públicas actuales/futuras:

- `/cursos`
- `/cursos/[slug]`

Ruta futura para lecciones, por ejemplo:

- `/cursos/[courseSlug]/lecciones/[lessonSlug]`

La página pública del curso debe poder mostrar:

- portada;
- título;
- descripción;
- instructor;
- categoría;
- nivel;
- duración;
- módulos;
- lecciones;
- previews;
- CTA de acceso/compra.

---

## 16. Registro

`/registro` debe convertirse en registro público real.

El registro inicial debe ser ligero.

NO obligar a una persona que sólo quiere estudiar a crear un perfil audiovisual completo.

Una misma cuenta podrá ser simultáneamente:

- estudiante;
- profesional;
- instructor;
- empleador;
- miembro de una organización.

No modelarlos como tipos de cuenta mutuamente excluyentes.

---

## 17. Professional Profiles — FUTURO

NO implementar sin petición explícita.

Un usuario podrá tener un perfil profesional con múltiples disciplinas.

Ejemplo:

User
→ Professional Profile
→ Actor
→ Director
→ DP

No crear una cuenta diferente para cada disciplina.

El perfil público debe usar identidad profesional legible.

Ejemplo bueno:

`Alain T.`

Evitar que la identidad principal sea:

`@alain.dilon`

Puede existir alias artístico como información secundaria.

---

## 18. Estrategia beta de Professional Profiles

La primera beta de profesionales será gratuita.

Inicialmente NO habrá un gran catálogo/buscador público.

Cada persona obtendrá una página profesional pública y compartible tipo CV/portfolio audiovisual.

Objetivos:

- aportar valor inmediato;
- permitir compartir perfil por Instagram, WhatsApp o email;
- atraer nuevos usuarios;
- crowdsourcing de profesionales;
- construir masa crítica antes de abrir Discover.

Cuando exista suficiente densidad:

- abrir catálogo;
- búsqueda;
- filtros;
- Hiring;
- Talent+;
- matching;
- Opportunities.

---

## 19. Layouts futuros de perfiles

Usar una misma arquitectura de datos, pero distintas presentaciones según disciplina.

Familias posibles:

### Actor / Performer
- headshots;
- reel;
- créditos;
- playing age;
- idiomas;
- skills;
- disponibilidad.

### Visual Creative
Para DP, director, fotógrafo, colorista, etc.

- reel principal;
- stills;
- proyectos;
- créditos;
- equipo;
- experiencia.

### Technical Crew
Para gaffer, AC, sonido, grip, etc.

- CV visual;
- proyectos;
- sistemas/equipo que domina;
- certificaciones;
- experiencia;
- disponibilidad.

### Hybrid
Para profesionales con varias disciplinas.

No crear bases de datos completamente diferentes por layout.

---

## 20. Contacto — FUTURO

Cada perfil público podrá incluir un botón:

`Contactar`

No mostrar simplemente teléfono o WhatsApp públicamente.

Para iniciar contacto, el visitante debe tener cuenta y una identidad mínima en FILMATTA.

El receptor podrá recibir:

- notificación in-app;
- email;
- push más adelante.

Tipos futuros:

- interés profesional;
- invitación a proyecto;
- invitación a casting;
- oportunidad;
- consulta de servicio.

El contacto puede permanecer pendiente hasta ser aceptado.

Opciones del receptor:

- Ver perfil
- Ver proyecto
- Aceptar
- Rechazar
- Reportar

Las señales de calidad del contacto pueden incluir:

- Relevante
- No relevante
- Spam / abuso

---

## 21. Projects — FUTURO

NO implementar hasta que se solicite explícitamente.

Projects será la columna vertebral operativa de FILMATTA.

Conectará:

- profesionales;
- casting;
- crew;
- oportunidades;
- locaciones;
- rentals;
- services.

Project V1 previsto:

- Overview
- Crew / Casting
- Opportunities
- Shortlists
- Members
- Activity
- Settings

Más adelante:

- Locations
- Rentals
- Services

NO construir inicialmente:

- presupuestos complejos;
- call sheets;
- shot lists;
- ERP de producción;
- task manager gigante.

---

## 22. Business Workspaces — FUTURO

Una suscripción Business pertenece a una organización/workspace.

No pertenece globalmente a cada individuo.

Concepto:

Organization
→ Owner
→ Admin / Producer
→ Members / Seats
→ Projects

Un plan Business podrá incluir varios seats.

Los poderes Business sólo aplican cuando la persona trabaja dentro de proyectos pertenecientes a esa organización.

Ejemplo:

Una persona con un seat Business puede usar Hiring avanzado dentro de un proyecto de la productora.

Fuera de ese proyecto vuelve a las capacidades de su plan personal.

También existirán Project Guests con acceso sólo al proyecto invitado.

---

## 23. Opportunities — FUTURO

Opportunities será un sistema de posts estructurados ligados a Projects.

NO será un feed social genérico.

Categorías iniciales posibles:

- Casting / Talent
- Crew
- Trabajo pagado / Freelance
- Colaboración / Proyecto estudiantil
- Prácticas / Asistencia

Aplicar a una oportunidad debe ser gratis.

Talent+ podrá monetizar:

- filtros avanzados;
- matching;
- alertas inmediatas;
- búsquedas guardadas;
- filtros por pago;
- ciudad/distancia;
- fechas;
- disciplina;
- disponibilidad;
- tipo de proyecto.

No retrasar artificialmente oportunidades para usuarios gratuitos.

La ventaja premium debe ser mejor descubrimiento y automatización, no derecho exclusivo a trabajar.

---

## 24. Hiring — FUTURO

El descubrimiento básico de profesionales debe poder ser gratuito.

FILMATTA monetiza cuando el usuario empieza a utilizar herramientas profesionales de contratación.

Concepto:

buscar
→ ver perfil
→ guardar
→ contactar
→ consumir crédito cuando corresponda

Una relación desbloqueada no debe cobrar repetidamente por cada mensaje.

Projects dará contexto al Hiring.

---

## 25. Locations — FUTURO

Primera beta:

- publicación gratuita;
- fotos;
- ciudad/zona;
- tipo de espacio;
- precio orientativo;
- interior/exterior;
- restricciones básicas;
- página pública compartible.

Objetivo inicial:

crowdsourcing de inventario.

No implementar inicialmente:

- reservas;
- checkout;
- depósitos;
- seguros;
- disputas;
- pagos marketplace.

Más adelante existirá Scout.

Scout podrá ofrecer filtros avanzados como:

- ruido;
- vecinos;
- rodaje nocturno;
- humo;
- fuego controlado;
- pirotecnia;
- acceso de vehículos;
- estacionamiento;
- energía;
- baños;
- camerinos;
- aforo;
- restricciones;
- aislamiento;
- etc.

---

## 26. Rentals — FUTURO

La búsqueda de rentals debe ser gratuita para quien necesita equipo.

El proveedor paga por:

- aparecer;
- catálogo;
- SEO;
- visibilidad;
- destacados.

La experiencia será tipo marketplace multi-vendor.

Un mismo equipo puede aparecer ofrecido por diferentes proveedores con:

- ubicación;
- precio;
- condiciones;
- especificaciones.

No intermediar pagos al principio.

---

## 27. Services — FUTURO

Una vertical única llamada Services puede contener categorías como:

- catering;
- transporte;
- vans;
- seguridad;
- SFX;
- maquillaje FX;
- stunts;
- plantas eléctricas;
- construcción de sets;
- utilería;
- vestuario;
- postproducción;
- color;
- mezcla;
- VFX;
- subtítulos;
- DCP;
- seguros;
- servicios legales;
- contabilidad audiovisual.

No convertir cada categoría en una aplicación independiente.

---

## 28. Reviews — FUTURO

Debe existir un sistema reutilizable de reputación.

Podrá aplicarse a:

- cursos;
- profesionales;
- locaciones;
- servicios.

Priorizar interacciones verificadas.

Para profesionales evaluar aspectos laborales como:

- profesionalismo;
- puntualidad;
- preparación;
- comunicación;
- trabajo en equipo.

No evaluar apariencia física ni atributos sensibles.

---

## 29. Multimedia futura

No procesar reels pesados con Next.js.

Arquitectura preferida:

Browser
→ proveedor multimedia
→ transcoding/CDN
→ Supabase guarda metadata

Proveedores considerados:

- Mux para video;
- Cloudflare Images para imágenes;
- Cloudflare Stream o Bunny como alternativas.

Reels orientados aproximadamente a 1080p.

---

## 30. Diseño visual

FILMATTA tiene una dirección visual:

- oscura;
- cinematográfica;
- moderna;
- software creativo;
- minimal;
- profesional.

Background actual aproximado:

`#080808`

Evitar:

- exceso de gradients SaaS;
- cards dentro de cards innecesarias;
- interfaces infantiles;
- clutter;
- estilos genéricos de dashboard empresarial.

Branding explorado:

- negro;
- blanco;
- rojo REC / carmín.

Logo:

- una `F` geométrica/modular;
- blanco sobre negro;
- lenguaje de mosaico/software creativo.

Mascota:

`Matti`

Matti es un toro rojo/carmín, estoico y 2D.

Matti NO es el logo.

No insertar automáticamente la mascota en la UI salvo que se pida.

---

## 31. Accesibilidad

Mantener:

- buen contraste;
- focus states;
- HTML semántico;
- labels;
- navegación con teclado;
- botones comprensibles.

No sacrificar accesibilidad por estética.

---

## 32. Calidad de código

Preferir:

- TypeScript claro;
- nombres descriptivos;
- componentes pequeños cuando tenga sentido;
- validación server-side;
- manejo predecible de errores;
- reutilización de código existente.

Evitar:

- abstracciones prematuras;
- dependencias innecesarias;
- helpers duplicados;
- dead code;
- refactors enormes fuera del scope;
- paquetes nuevos para problemas triviales.

---

## 33. Cambios de base de datos

Antes de modificar schema:

1. entender tablas existentes;
2. preferir cambios aditivos;
3. preservar datos actuales;
4. entregar SQL/migration;
5. incluir RLS;
6. añadir constraints e índices cuando correspondan.

Nunca asumir que una tabla de producción puede borrarse y empezar de cero.

---

## 34. Mutaciones

Toda operación create/update/delete debe considerar:

1. autenticación;
2. autorización;
3. validación;
4. mutación;
5. manejo de errores;
6. limpieza de Storage si aplica;
7. revalidación de rutas;
8. redirect únicamente cuando corresponda.

No confiar en hidden inputs para autorización.

---

## 35. Errores

Los errores visibles para usuarios deben ser comprensibles.

Nunca mostrar públicamente:

- stack traces;
- secretos;
- credenciales;
- detalles internos innecesarios de PostgreSQL/Supabase.

Los logs del servidor sí pueden conservar contexto técnico útil.

---

## 36. Git y validación

Antes de considerar una tarea terminada, cuando corresponda ejecutar:

`npm run lint`

y:

`npm run build`

No entregar cambios con TypeScript roto.

No realizar refactors no relacionados dentro de la misma tarea.

Mantener cambios conceptualmente enfocados.

---

## 37. Regla de scope

FILMATTA tiene una visión grande, pero la versión actual debe mantenerse pequeña.

Antes de implementar una función nueva preguntarse:

> ¿Esto ayuda directamente al objetivo actual?

Mientras Learn no sea comercialmente funcional, la mayoría de funciones de:

- Projects
- Hiring
- Locations avanzadas
- Rentals
- Services
- Business
- PM tools

deben permanecer en backlog salvo instrucción explícita.

---

## 38. North Star actual

La pregunta principal del desarrollo actual es:

> ¿Qué tan rápido podemos lograr que una persona real entre a FILMATTA, encuentre un curso, se registre, obtenga acceso y aprenda?

La prioridad es lanzar.

No construir todo FILMATTA antes de empezar a cobrar.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
