import type {
  ClientRepository,
  CursorPageRequest,
  ProjectRepository,
  RequirementRepository,
  TaskRepository,
} from "@clientflow/contracts";

export interface ClientDetailServices {
  clients: Pick<ClientRepository, "getById">;
  projects: Pick<ProjectRepository, "listByClient">;
  requirements: Pick<RequirementRepository, "listByProjectIds">;
  tasks: Pick<TaskRepository, "listByProjectIds">;
}

export async function loadClientDetail(
  services: ClientDetailServices,
  clientId: string,
  projectPageInput?: CursorPageRequest,
) {
  const client = await services.clients.getById(clientId);
  if (!client) return null;

  const projectPage = await services.projects.listByClient(
    clientId,
    projectPageInput,
  );
  const projectIds = projectPage.items.map(({ id }) => id);
  const [requirements, tasks] =
    projectIds.length === 0
      ? [[], []]
      : await Promise.all([
          services.requirements.listByProjectIds(projectIds),
          services.tasks.listByProjectIds(projectIds),
        ]);
  const requirementsByProject = groupByProjectId(requirements);
  const tasksByProject = groupByProjectId(tasks);

  return {
    client,
    nextProjectCursor: projectPage.nextCursor,
    projects: projectPage.items.map((project) => ({
      project,
      requirements: requirementsByProject.get(project.id) ?? [],
      tasks: tasksByProject.get(project.id) ?? [],
    })),
  };
}

function groupByProjectId<Item extends { projectId: string }>(items: Item[]) {
  const grouped = new Map<string, Item[]>();
  for (const item of items) {
    const projectItems = grouped.get(item.projectId);
    if (projectItems) projectItems.push(item);
    else grouped.set(item.projectId, [item]);
  }
  return grouped;
}
