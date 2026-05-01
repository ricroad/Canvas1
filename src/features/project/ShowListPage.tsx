import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ImageOff, Plus, Trash2 } from 'lucide-react';

import { showsApi, type Show } from '@/api';
import { BrandLogo } from '@/components/BrandLogo';
import { UI_CONTENT_OVERLAY_INSET_CLASS } from '@/components/ui/motion';
import { UiButton, UiSelect } from '@/components/ui/primitives';
import { MissingApiKeyHint } from '@/features/settings/MissingApiKeyHint';
import { listModelProviders } from '@/features/canvas/models';
import { getConfiguredApiKeyCount, useSettingsStore } from '@/stores/settingsStore';
import { storage } from '@/storage';

type ShowSortField = 'title' | 'createdAt' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

async function fetchShows(): Promise<Show[]> {
  const response = await showsApi.listShows();
  return response.items;
}

interface ShowCoverProps {
  coverKey: string | null | undefined;
}

function ShowCover({ coverKey }: ShowCoverProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isMissing, setIsMissing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    setObjectUrl(null);
    setIsMissing(false);

    if (!coverKey) {
      return () => {
        isMounted = false;
      };
    }

    storage
      .getObjectUrl(coverKey)
      .then((url) => {
        if (isMounted) {
          setObjectUrl(url);
        }
      })
      .catch((error) => {
        console.warn('Failed to resolve show cover URL', error);
        if (isMounted) {
          setIsMissing(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [coverKey]);

  const showPlaceholder = !coverKey || isMissing;
  const isResolving = Boolean(coverKey) && !objectUrl && !isMissing;

  return (
    <div className="h-[120px] w-20 shrink-0 overflow-hidden rounded-md border border-[color:var(--ui-border-soft)] bg-[var(--surface)] p-1 shadow-sm">
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded bg-[var(--surface)]">
        {coverKey && objectUrl && !isMissing ? (
          <img
            src={objectUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setIsMissing(true)}
          />
        ) : isResolving ? (
          <div className="h-full w-full bg-[var(--surface)]" />
        ) : showPlaceholder ? (
          <ImageOff className="h-7 w-7 text-text-muted opacity-30" />
        ) : null}
      </div>
    </div>
  );
}

export function ShowListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [shows, setShows] = useState<Show[]>([]);
  const [isLoadingShows, setIsLoadingShows] = useState(true);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [isCreatingShow, setIsCreatingShow] = useState(false);
  const [deletingShowId, setDeletingShowId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<ShowSortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const providerIds = useMemo(() => listModelProviders().map((provider) => provider.id), []);
  const configuredApiKeyCount = useSettingsStore((state) =>
    getConfiguredApiKeyCount(state.apiKeys, providerIds)
  );

  useEffect(() => {
    let isMounted = true;

    const loadShows = async () => {
      setIsLoadingShows(true);
      setLoadError(null);
      try {
        const nextShows = await fetchShows();
        if (isMounted) {
          setShows(nextShows);
        }
      } catch (error) {
        console.error('Failed to load shows', error);
        if (isMounted) {
          setLoadError(error);
        }
      } finally {
        if (isMounted) {
          setIsLoadingShows(false);
        }
      }
    };

    void loadShows();

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshShows = async () => {
    const nextShows = await fetchShows();
    setShows(nextShows);
  };

  const handleCreateShow = async () => {
    const title = window.prompt(t('showList.newShowTitle'));
    const normalizedTitle = title?.trim();

    if (!normalizedTitle) {
      return;
    }

    setIsCreatingShow(true);
    try {
      const newShow = await showsApi.createShow({ title: normalizedTitle });
      await refreshShows();
      navigate(`/shows/${newShow.id}`);
    } catch (error) {
      console.error('Failed to create show', error);
    } finally {
      setIsCreatingShow(false);
    }
  };

  const handleDeleteShow = async (id: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (!window.confirm(t('showList.confirmDeleteShow'))) {
      return;
    }

    setDeletingShowId(id);
    try {
      await showsApi.deleteShow(id);
      await refreshShows();
    } catch (error) {
      console.error('Failed to delete show', error);
    } finally {
      setDeletingShowId(null);
    }
  };

  const formatDate = (isoTimestamp: string) => {
    return new Date(isoTimestamp).toLocaleDateString();
  };

  const sortedShows = useMemo(() => {
    const list = [...shows];
    const direction = sortDirection === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      if (sortField === 'title') {
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) * direction;
      }

      const left = Date.parse(sortField === 'createdAt' ? a.created_at : a.updated_at);
      const right = Date.parse(sortField === 'createdAt' ? b.created_at : b.updated_at);
      return (left - right) * direction;
    });

    return list;
  }, [shows, sortDirection, sortField]);
  const isEmptyState = !isLoadingShows && !loadError && shows.length === 0;

  return (
    <div className="ui-scrollbar h-full w-full overflow-auto p-8">
      <style>
        {`
          @keyframes show-card-record-pulse {
            50% {
              transform: scale(1.2);
            }
          }
        `}
      </style>
      <div className="max-w-5xl mx-auto">
        {!isEmptyState && (
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-dark">{t('showList.title')}</h1>
              <div className="flex items-center gap-2">
                <UiSelect
                  aria-label={t('project.sortBy')}
                  value={sortField}
                  onChange={(event) => setSortField(event.target.value as ShowSortField)}
                  className="h-9 w-[100px] rounded-lg text-sm"
                >
                  <option value="title">{t('project.sortByName')}</option>
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
            <UiButton
              type="button"
              variant="primary"
              onClick={handleCreateShow}
              disabled={isCreatingShow}
              className="gap-2"
            >
              <Plus className="w-5 h-5" />
              {t('showList.newShow')}
            </UiButton>
          </div>
        )}

        {configuredApiKeyCount === 0 && <MissingApiKeyHint className="mb-8" />}

        {isLoadingShows ? (
          <div className="flex items-center justify-center py-20 text-text-muted">
            {t('common.loading')}
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-center py-20 text-text-muted">
            {t('common.error')}
          </div>
        ) : isEmptyState ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center text-text-muted">
            <BrandLogo size={72} variant="mark" className="mb-5 rounded-2xl shadow-panel" />
            <h1 className="text-2xl font-bold text-text-dark">{t('showList.emptyTitle')}</h1>
            <p className="mt-2 text-sm leading-6">{t('showList.emptyHint')}</p>
            <div className="mt-6">
              <UiButton
                type="button"
                variant="primary"
                onClick={handleCreateShow}
                disabled={isCreatingShow}
                className="gap-2"
              >
                {t('showList.createFirst')}
              </UiButton>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedShows.map((show) => {
              const isDone =
                show.episode_count > 0 && show.done_episode_count === show.episode_count;

              return (
                <div
                  key={show.id}
                  onClick={() => navigate(`/shows/${show.id}`)}
                  className="group relative cursor-pointer overflow-visible rounded-cinema border border-border-dark bg-[var(--ui-surface-panel)] p-4 shadow-panel transition-[transform,border-color,box-shadow] duration-[180ms] ease-out hover:-translate-y-0.5 hover:border-brand-reel-500/50 hover:shadow-card-hover"
                >
                  <div className="pointer-events-none absolute bottom-3 right-3 z-0 origin-bottom-right transition-transform duration-[180ms] ease-out [filter:drop-shadow(var(--show-cover-shadow))] [transform:translate(0,_0)_rotate(-7deg)_scale(1)] group-hover:[transform:translate(0,_-3px)_rotate(-10deg)_scale(1.03)]">
                    <ShowCover coverKey={show.cover_url} />
                  </div>
                  <div className="relative z-10">
                    <div
                      aria-label={isDone ? t('showList.completedBadge') : ''}
                      className={`mb-4 h-2 w-2 origin-center ${
                        isDone
                          ? 'bg-[var(--state-success)] [animation:pulse-success_2s_ease-out_infinite]'
                          : 'bg-[var(--accent)]'
                      } group-hover:[animation:show-card-record-pulse_180ms_ease-out_1]`}
                    />
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h3 className="min-w-0 flex-1 truncate text-base font-semibold leading-6 text-text-dark">
                        {show.title}
                      </h3>
                      <button
                        type="button"
                        onClick={(event) => void handleDeleteShow(show.id, event)}
                        disabled={deletingShowId === show.id}
                        className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-[background-color,color,opacity] hover:bg-bg-dark hover:text-[rgb(var(--state-error-rgb))] disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="max-w-[calc(100%_-_80px)] space-y-1 font-mono text-xs leading-5 text-text-muted">
                      <p>
                        {t('project.modified')}: {formatDate(show.updated_at)}
                      </p>
                      <p>
                        {t('project.created')}: {formatDate(show.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(isLoadingShows || isCreatingShow || deletingShowId) && (
        <div className={`pointer-events-none fixed ${UI_CONTENT_OVERLAY_INSET_CLASS} bg-black/10`} />
      )}
    </div>
  );
}
