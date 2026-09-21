import { notFound, redirect } from "next/navigation";
import ProjectMetadata, { ProjectStatus } from "@/components/networking/ProjectMetadata";
import SiteHeader from "@/components/SiteHeader";
import ProjectForm from "@/components/networking/ProjectForm";
import { MetaChips } from "@/components/ui/MetaChip";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { PREFERENCE_GROUPS } from "@/lib/profiles/project-preferences";
import { SCHEDULES, ECONOMICS, type Project } from "@/lib/networking/types";
import "@/components/networking/networking.css";
export const metadata = { title: "Proyecto privado", robots: { index: false, follow: false } };
export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
 const {slug}=await params,viewer=await getViewer();if(!viewer)redirect('/login?next='+encodeURIComponent('/proyectos/'+slug));
 const db=await createClient(),{data,error}=await db.rpc('get_authorized_networking_project',{p_slug:slug});
 if(error)throw new Error('No pudimos cargar el proyecto.');if(!data)notFound();
 const project=data as Project & {is_owner:boolean;owner_name:string};
 return <div className="editorial-page"><SiteHeader contextLink={{href:project.is_owner?"/mis-proyectos":"/cuenta/contactos",label:project.is_owner?"← Mis proyectos":"← Solicitudes / Contactos"}}/><main className="network-shell"><header className="network-heading"><p className="eyebrow">{project.is_owner?"PROYECTO":"PROYECTO COMPARTIDO · SÓLO LECTURA"}</p><ProjectStatus project={project}/><h1>{project.title}</h1><ProjectMetadata project={project}/>{!project.is_owner&&<p>Proyecto de: {project.owner_name}</p>}{project.summary&&<p>{project.summary}</p>}{project.is_owner&&<a className="network-link-button" href="#editar-proyecto">Editar proyecto ↓</a>}</header>
 {project.is_owner?<ProjectForm initial={project}/>:<article className="network-card network-project-readonly"><p className="network-muted">Información actual del proyecto. La solicitud conserva las condiciones originales en su resumen.</p><dl>{[["Tipo",project.project_type],["Cliente / artista",project.client_name],["Tipo de cliente",project.client_type],["Ciudad / zona",[project.city,project.work_area].filter(Boolean).join(" · ")],["Jornada",SCHEDULES[project.shooting_schedule]],["Modalidad",ECONOMICS[project.economic_mode]],["Fecha / ventana",project.date_window]].filter(([,v])=>v).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><section><h2>Buscamos</h2><MetaChips labels={project.roles} limit={30}/></section>{Object.entries(project.requirements).map(([group,keys])=>keys.length>0&&<section key={group}><h2>{group==="themes"?"Temáticas":group==="participation"?"Participación":"Condiciones de trabajo"}</h2><MetaChips limit={30} labels={keys.map(k=>(PREFERENCE_GROUPS[group as keyof typeof PREFERENCE_GROUPS] as Record<string,string>)[k])}/></section>)}</article>}
 </main></div>;
}
