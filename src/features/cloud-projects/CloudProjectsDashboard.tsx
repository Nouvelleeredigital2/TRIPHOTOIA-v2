import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, FolderKanban, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { createCloudProject, fetchCloudProjects, type CloudProjectSummary } from './cloudProjects';

interface CloudProjectsDashboardProps {
  userId: string;
}

export function CloudProjectsDashboard({ userId }: CloudProjectsDashboardProps) {
  const queryClient = useQueryClient();
  const [projectName, setProjectName] = useState('');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['cloud-projects', userId],
    queryFn: () => fetchCloudProjects(userId),
  });

  const createProjectMutation = useMutation({
    mutationFn: (name: string) => createCloudProject(userId, name),
    onSuccess: (project) => {
      queryClient.setQueryData<CloudProjectSummary[]>(['cloud-projects', userId], (current = []) => [
        project,
        ...current.filter((item) => item.id !== project.id),
      ]);
      setProjectName('');
      setActiveProjectId(project.id);
    },
  });

  const projects = projectsQuery.data ?? [];
  const activeProject = useMemo(() => {
    return projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null;
  }, [activeProjectId, projects]);

  const handleCreateProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectName.trim() || createProjectMutation.isPending) return;
    createProjectMutation.mutate(projectName);
  };

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(260px,0.9fr)_minmax(320px,1.1fr)]">
      <section className="space-y-4">
        <form onSubmit={handleCreateProject} className="flex gap-2">
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Nouveau reportage"
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" size="sm" className="h-10 gap-2" disabled={!projectName.trim() || createProjectMutation.isPending}>
            {createProjectMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Créer
          </Button>
        </form>

        {createProjectMutation.error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {(createProjectMutation.error as Error).message}
          </p>
        )}

        <div className="space-y-2">
          {projectsQuery.isLoading && (
            <div className="rounded-lg border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
              Chargement des projets cloud...
            </div>
          )}

          {projectsQuery.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {(projectsQuery.error as Error).message}
            </div>
          )}

          {!projectsQuery.isLoading && projects.length === 0 && !projectsQuery.error && (
            <div className="rounded-lg border border-dashed border-border bg-card/60 px-4 py-5 text-sm text-muted-foreground">
              Aucun projet cloud pour ce compte.
            </div>
          )}

          {projects.map((project) => {
            const selected = activeProject?.id === project.id;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => setActiveProjectId(project.id)}
                className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                  selected
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border bg-card hover:bg-muted/60'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold">{project.name}</span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {project.project_type}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(project.updated_at).toLocaleDateString('fr-FR')}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        {activeProject ? (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <FolderKanban className="h-4 w-4" />
                  Projet cloud
                </div>
                <h3 className="mt-2 text-xl font-semibold">{activeProject.name}</h3>
              </div>
              <Badge>{activeProject.status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <ProjectStat label="Photos" value={activeProject.stats.totalPhotos} />
              <ProjectStat label="Analysées" value={activeProject.stats.analyzed} />
              <ProjectStat label="À revoir" value={activeProject.stats.review} />
              <ProjectStat label="Picks" value={activeProject.stats.picks} />
              <ProjectStat label="Rejetées" value={activeProject.stats.rejected} />
            </div>

            <p className="text-sm text-muted-foreground">
              Ce tableau de bord prépare l'entrée cloud. L'import et AutoFlow restent disponibles en mode local tant que le projet cloud n'est pas synchronisé.
            </p>
          </div>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
            Sélectionnez ou créez un projet cloud.
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background px-3 py-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
