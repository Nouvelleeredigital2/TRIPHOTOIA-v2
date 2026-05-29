import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, FolderKanban, Plus, RefreshCw, Sparkles, Trash2, UserRound, Users } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  createCloudProject,
  fetchCloudProjectPhotos,
  fetchCloudProjects,
  type CloudProjectPhoto,
  type CloudProjectSummary,
} from './cloudProjects';
import {
  formatSimilarityScore,
  searchSimilarToPhoto,
  type SemanticSearchResponse,
} from './cloudSemanticSearch';
import {
  clusterFacesIntoGroups,
  deleteAllProjectFaces,
  fetchProjectFaces,
  nameAnonymousGroup,
  setProjectFaceAnalysis,
  type AnonymousFaceGroup,
} from './cloudFaces';
import { useCloudProjectStore } from '../../store/cloudProjectStore';

interface CloudProjectsDashboardProps {
  userId: string;
}

export function CloudProjectsDashboard({ userId }: CloudProjectsDashboardProps) {
  const queryClient = useQueryClient();
  const [projectName, setProjectName] = useState('');
  const activeCloudProject = useCloudProjectStore((state) => state.activeProject);
  const setActiveCloudProject = useCloudProjectStore((state) => state.setActiveProject);

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
      setActiveCloudProject({
        id: project.id,
        organizationId: project.organization_id,
        name: project.name,
      });
    },
  });

  const projects = projectsQuery.data ?? [];

  useEffect(() => {
    if (activeCloudProject || projects.length === 0) return;
    const firstProject = projects[0];
    setActiveCloudProject({
      id: firstProject.id,
      organizationId: firstProject.organization_id,
      name: firstProject.name,
    });
  }, [activeCloudProject, projects, setActiveCloudProject]);

  const activeProject = useMemo(() => {
    return projects.find((project) => project.id === activeCloudProject?.id) ?? projects[0] ?? null;
  }, [activeCloudProject?.id, projects]);

  const projectPhotosQuery = useQuery({
    queryKey: ['cloud-project-photos', activeProject?.id],
    queryFn: () => fetchCloudProjectPhotos(activeProject!.id),
    enabled: Boolean(activeProject?.id),
  });

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
                onClick={() => setActiveCloudProject({
                  id: project.id,
                  organizationId: project.organization_id,
                  name: project.name,
                })}
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

            <CloudProjectPhotoList
              projectId={activeProject.id}
              photos={projectPhotosQuery.data ?? []}
              isLoading={projectPhotosQuery.isLoading}
              error={projectPhotosQuery.error as Error | null}
            />

            <CloudProjectFacesPanel
              projectId={activeProject.id}
              faceAnalysisEnabled={activeProject.face_analysis_enabled ?? false}
            />

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

const FALLBACK_MESSAGES: Record<string, string> = {
  'no-embedding': "Embedding pas encore calculé pour cette photo (analyse en cours).",
  'no-results': 'Aucune photo similaire trouvée dans ce projet.',
  'rpc-error': 'Recherche sémantique indisponible (vérifiez pgvector côté Supabase).',
};

function CloudProjectPhotoList({
  projectId,
  photos,
  isLoading,
  error,
}: {
  projectId: string;
  photos: CloudProjectPhoto[];
  isLoading: boolean;
  error: Error | null;
}) {
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);

  const filenamesById = useMemo(() => {
    const map = new Map<string, string>();
    photos.forEach((photo) => map.set(photo.id, photo.originalFilename));
    return map;
  }, [photos]);

  const similarMutation = useMutation<SemanticSearchResponse, Error, string>({
    mutationFn: (photoId: string) => searchSimilarToPhoto({ projectId, photoId }),
  });

  const handleFindSimilar = (photoId: string) => {
    setActivePhotoId(photoId);
    similarMutation.mutate(photoId);
  };

  const response = similarMutation.data;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Photos cloud</h4>
        <span className="text-xs text-muted-foreground">{photos.length}</span>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
          Chargement des photos cloud...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
          {error.message}
        </div>
      )}

      {!isLoading && !error && photos.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground">
          Aucune photo cloud pour ce projet.
        </div>
      )}

      {photos.slice(0, 8).map((photo) => (
        <div
          key={photo.id}
          className={`rounded-lg border bg-background px-3 py-2 ${
            activePhotoId === photo.id ? 'border-primary/50' : 'border-border/70'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{photo.originalFilename}</div>
              <div className="truncate text-xs text-muted-foreground">{photo.storagePath}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {photo.analysisStatus}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => handleFindSimilar(photo.id)}
                disabled={similarMutation.isPending && activePhotoId === photo.id}
              >
                {similarMutation.isPending && activePhotoId === photo.id ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Similaires
              </Button>
            </div>
          </div>

          {activePhotoId === photo.id && response && (
            <div className="mt-2 border-t border-border/60 pt-2">
              {response.source === 'semantic' ? (
                <ul className="space-y-1">
                  {response.results.map((result) => (
                    <li
                      key={result.photoId}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate text-muted-foreground">
                        {filenamesById.get(result.photoId) ?? result.photoId}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {formatSimilarityScore(result.similarity)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {FALLBACK_MESSAGES[response.reason ?? ''] ?? 'Recherche sémantique indisponible.'}
                </p>
              )}
            </div>
          )}

          {activePhotoId === photo.id && similarMutation.error && (
            <p className="mt-2 border-t border-border/60 pt-2 text-xs text-destructive">
              {similarMutation.error.message}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function CloudProjectFacesPanel({
  projectId,
  faceAnalysisEnabled,
}: {
  projectId: string;
  faceAnalysisEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(faceAnalysisEnabled);
  const [groups, setGroups] = useState<AnonymousFaceGroup[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setEnabled(faceAnalysisEnabled);
    setGroups([]);
    setLoaded(false);
  }, [projectId, faceAnalysisEnabled]);

  const toggleMutation = useMutation<void, Error, boolean>({
    mutationFn: (next: boolean) => setProjectFaceAnalysis({ projectId, enabled: next }),
    onSuccess: (_data, next) => setEnabled(next),
  });

  const loadMutation = useMutation<AnonymousFaceGroup[], Error, void>({
    mutationFn: async () => {
      const faces = await fetchProjectFaces({ projectId });
      return clusterFacesIntoGroups(faces);
    },
    onSuccess: (result) => {
      setGroups(result);
      setLoaded(true);
    },
  });

  const nameMutation = useMutation<void, Error, { group: AnonymousFaceGroup; displayName: string }>({
    mutationFn: async ({ group, displayName }) => {
      await nameAnonymousGroup({ projectId, faceIds: group.faceIds, displayName });
    },
    onSuccess: (_data, { group }) => {
      setGroups((current) => current.filter((item) => item.groupId !== group.groupId));
    },
  });

  const deleteAllMutation = useMutation<void, Error, void>({
    mutationFn: () => deleteAllProjectFaces({ projectId }),
    onSuccess: () => {
      setGroups([]);
      setLoaded(true);
    },
  });

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-background/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" />
          Personnes & visages
        </div>
        <Button
          type="button"
          size="sm"
          variant={enabled ? 'default' : 'outline'}
          className="h-7 px-3 text-xs"
          onClick={() => toggleMutation.mutate(!enabled)}
          disabled={toggleMutation.isPending}
        >
          {enabled ? 'Analyse activée' : 'Analyse désactivée'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        L'analyse de visage est strictement opt-in. Les visages détectés restent anonymes : aucun nom n'est attribué automatiquement.
      </p>

      {enabled && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => loadMutation.mutate()}
            disabled={loadMutation.isPending}
          >
            {loadMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
            Charger les groupes anonymes
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => deleteAllMutation.mutate()}
            disabled={deleteAllMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer les données visage
          </Button>
        </div>
      )}

      {(toggleMutation.error || loadMutation.error || nameMutation.error || deleteAllMutation.error) && (
        <p className="text-xs text-destructive">
          {(toggleMutation.error || loadMutation.error || nameMutation.error || deleteAllMutation.error)?.message}
        </p>
      )}

      {enabled && loaded && groups.length === 0 && !loadMutation.isPending && (
        <p className="text-xs text-muted-foreground">Aucun groupe anonyme à valider.</p>
      )}

      {enabled && groups.length > 0 && (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li key={group.groupId} className="rounded-lg border border-border/70 bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <UserRound className="h-3.5 w-3.5" />
                  Groupe anonyme · {group.size} visage{group.size > 1 ? 's' : ''}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={names[group.groupId] ?? ''}
                  onChange={(event) => setNames((current) => ({ ...current, [group.groupId]: event.target.value }))}
                  placeholder="Nommer cette personne"
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => nameMutation.mutate({ group, displayName: names[group.groupId] ?? '' })}
                  disabled={nameMutation.isPending || !(names[group.groupId] ?? '').trim()}
                >
                  Valider
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
