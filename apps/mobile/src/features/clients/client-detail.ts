import type { AppServices } from "@/services/app-services";

export async function loadClientDetail(
  services: Pick<
    AppServices,
    "clients" | "projects" | "requirements" | "tasks"
  >,
  clientId: string,
) {
  const client = await services.clients.getById(clientId);
  if (!client) return null;

  const projects = (await services.projects.listByClient(clientId)).items;
  const projectDetails = await Promise.all(
    projects.map(async (project) => ({
      project,
      requirements: await services.requirements.listByProject(project.id),
      tasks: await services.tasks.listByProject(project.id),
    })),
  );
  return { client, projects: projectDetails };
}
