import type { CreateProjectContext } from "./project";

export type CreateModule = "writer" | "breakdown" | "shotlist" | "storyboard" | "production";

export function createProjectModuleRoute(project: CreateProjectContext, module: CreateModule) {
  const base = `/create/projects/${project.id}`;
  if (module === "writer" || module === "breakdown") {
    return project.writers.length === 1 ? `/writer/${project.writers[0].id}?project=${project.id}` : `${base}#writer`;
  }
  if (module === "shotlist") {
    return project.shotlists.length === 1 ? `/shotlists/${project.shotlists[0].id}?project=${project.id}` : `${base}#shotlists`;
  }
  if (module === "storyboard") {
    return project.storyboards.length === 1 ? `/shotlists/${project.storyboards[0].id}/storyboard?project=${project.id}` : `${base}#storyboards`;
  }
  return project.productions.length === 1 ? `/production/${project.productions[0].id}?project=${project.id}` : `${base}#production`;
}
