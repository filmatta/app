import type { CreateProjectContext } from "./project";

export type CreateModule = "writer" | "breakdown" | "shotlist" | "storyboard" | "production" | "documents";

export function createProjectModuleRoute(project: CreateProjectContext, module: CreateModule) {
  const base = `/create/projects/${project.id}`;
  if (module === "writer" || module === "breakdown") {
    return project.writers.length === 1 ? `/writer/${project.writers[0].id}?project=${project.id}` : `${base}#writer`;
  }
  if (module === "shotlist") {
    return project.shotlists.length === 1 ? `/shotlists/${project.shotlists[0].id}?project=${project.id}` : `${base}#shotlists`;
  }
  if (module === "storyboard") {
    const available = project.storyboards.filter((board) => board.panelCount > 0 || project.shotlists.some((shotlist) =>
      shotlist.id === board.id && shotlist.scriptId && project.writers.some((writer) => writer.id === shotlist.scriptId)));
    return project.storyboards.length === 1 && available.length === 1
      ? `/shotlists/${available[0].id}/storyboard?project=${project.id}` : `${base}#storyboards`;
  }
  if (module === "documents") return `${base}/documents`;
  return project.productions.length === 1 ? `/production/${project.productions[0].id}?project=${project.id}` : `/production?project=${project.id}`;
}
