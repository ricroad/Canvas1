import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, FolderOpen, Pencil, Trash2 } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { getConfiguredApiKeyCount, useSettingsStore } from '@/stores/settingsStore';
import { UI_CONTENT_OVERLAY_INSET_CLASS } from '@/components/ui/motion';
import { UiButton, UiSelect } from '@/components/ui/primitives';
import { isTestProjectName, TEST_PROJECT_NAME } from '@/features/canvas/application/testProjectMode';
import { MissingApiKeyHint } from '@/features/settings/MissingApiKeyHint';
import { listModelProviders } from '@/features/canvas/models';
import { RenameDialog } from './RenameDialog';

type ProjectSortField = 'name' | 'createdAt' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

export function ProjectManager() {
  const { t } = useTranslation();
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [sortField, setSortField] = useState<ProjectSortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const providerIds = useMemo(() => listModelProviders().map((provider) => provider.id), []);
  const configuredApiKeyCount = useSettingsStore((state) =>
    getConfiguredApiKeyCount(state.apiKeys, providerIds)
  );

  const { projects, isOpeningProject, createProject, deleteProject, renameProject, openProject } =
    useProjectStore();

  const handleCreateProject = () => {
    setEditingProjectId(null);
    setEditingProjectName('');
    setShowRenameDialog(true);
  };

  const handleOpenTestProject = () => {
    const existing = projects.find((project) => isTestProjectName(project.name));
    if (existing) {
      openProject(existing.id);
      return;
    }
    createProject(TEST_PROJECT_NAME);
  };

  const handleRenameClick = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProjectId(id);
    setEditingProjectName(name);
    setShowRenameDialog(true);
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteProject(id);
  };

  const handleConfirm = (name: string) => {
    if (editingProjectId) {
      renameProject(editingProjectId, name);
    } else {
      createProject(name);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  const sortedProjects = useMemo(() => {
    const list = [...projects];
    const direction = sortDirection === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      if (sortField === 'name') {
        return a.name.localeCompare(b.name, 'zh-Hans-CN', { sensitivity: 'base' }) * direction;
      }

      const left = sortField === 'createdAt' ? a.createdAt : a.updatedAt;
      const right = sortField === 'createdAt' ? b.createdAt : b.updatedAt;
      return (left - right) * direction;
    });

    return list;
  }, [projects, sortDirection, sortField]);

  return (
    <div className="ui-scrollbar h-full w-full overflow-auto p-8">
      <style>
        {`
          @keyframes project-card-record-pulse {
            50% {
              transform: scale(1.2);
            }
          }
        `}
      </style>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-dark">{t('project.title')}</h1>
            <div className="flex items-center gap-2">
              <UiSelect
                aria-label={t('project.sortBy')}
                value={sortField}
                onChange={(event) => setSortField(event.target.value as ProjectSortField)}
                className="h-9 w-[100px] rounded-lg text-sm"
              >
                <option value="name">{t('project.sortByName')}</option>
                <option value="createdAt">{t('project.sortByCreatedAt')}</option>
                <option value="updatedAt">{t('project.sortByUpdatedAt')}</option>
              </UiSelect>
              <UiSelect
                aria-label={t('project.sortDirection')}
                value={sortDirection}
                onChange={(event) => setSortDirection(event.target.value as SortDirection)}
                className="h-9 w-[60px] rounded-lg text-sm"
              >
                <option value="asc">{t('project.sortAsc')}</option>
                <option value="desc">{t('project.sortDesc')}</option>
              </UiSelect>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UiButton type="button" variant="muted" onClick={handleOpenTestProject} className="gap-2">
              <FolderOpen className="w-5 h-5" />
              {t('project.openTestProject')}
            </UiButton>
            <UiButton type="button" variant="primary" onClick={handleCreateProject} className="gap-2">
              <Plus className="w-5 h-5" />
              {t('project.newProject')}
            </UiButton>
          </div>
        </div>

        {configuredApiKeyCount === 0 && <MissingApiKeyHint className="mb-8" />}

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg">{t('project.empty')}</p>
            <p className="text-sm mt-2">{t('project.emptyHint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => openProject(project.id)}
                className="group cursor-pointer rounded-cinema border border-border-dark bg-[var(--ui-surface-panel)] p-4 shadow-panel transition-[transform,border-color,box-shadow] duration-[180ms] ease-out hover:-translate-y-0.5 hover:border-brand-reel-500/50 hover:shadow-card-hover"
              >
                <div className="mb-4 h-2 w-2 origin-center bg-brand-reel-500 group-hover:[animation:project-card-record-pulse_180ms_ease-out_1]" />
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="min-w-0 flex-1 truncate text-base font-semibold leading-6 text-text-dark">
                    {project.name}
                  </h3>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => handleRenameClick(project.id, project.name, e)}
                      className="p-1 hover:bg-bg-dark rounded"
                      title={t('project.rename')}
                    >
                      <Pencil className="w-4 h-4 text-text-muted hover:text-text-dark" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(project.id, e)}
                      className="p-1 hover:bg-bg-dark rounded"
                      title={t('project.delete')}
                    >
                      <Trash2 className="w-4 h-4 text-text-muted hover:text-[rgb(var(--state-error-rgb))]" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 font-mono text-xs leading-5 text-text-muted">
                  <p>
                    {t('project.modified')}: {formatDate(project.updatedAt)}
                  </p>
                  <p>
                    {t('project.created')}: {formatDate(project.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isOpeningProject && (
        <div className={`pointer-events-none fixed ${UI_CONTENT_OVERLAY_INSET_CLASS} bg-black/10`} />
      )}

      <RenameDialog
        isOpen={showRenameDialog}
        title={editingProjectId ? t('project.renameTitle') : t('project.newProjectTitle')}
        defaultValue={editingProjectName}
        onClose={() => setShowRenameDialog(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
