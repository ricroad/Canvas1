import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Box, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

import {
  assetsApi,
  episodesApi,
  showsApi,
  type Asset,
  type AssetCategory,
  type Episode,
  type Show,
} from '@/api';
import { call } from '@/api/client';
import { UiButton } from '@/components/ui/primitives';
import { storage } from '@/storage';

const ASSET_CATEGORIES: AssetCategory[] = ['character', 'scene', 'prop', 'other'];

type AssetApiWithUpdate = typeof assetsApi & {
  updateAsset?: (input: { id: string; name: string }) => Promise<Asset>;
};

function isShowNotFoundError(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return message.includes('show not found') || message.includes('404');
}

function createEmptyAssetGroups(): Record<AssetCategory, Asset[]> {
  return {
    character: [],
    scene: [],
    prop: [],
    other: [],
  };
}

function createExpandedAssetSections(): Record<AssetCategory, boolean> {
  return {
    character: true,
    scene: true,
    prop: true,
    other: true,
  };
}

async function updateAssetName(asset: Asset, name: string): Promise<void> {
  const updateAsset = (assetsApi as AssetApiWithUpdate).updateAsset;

  if (updateAsset) {
    await updateAsset({ id: asset.id, name });
    return;
  }

  await call<unknown>('update_asset', {
    id: asset.id,
    name,
    category: asset.category,
  });
}

export function ShowDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showId } = useParams<{ showId: string }>();
  const [show, setShow] = useState<Show | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isRenamingShow, setIsRenamingShow] = useState(false);
  const [isDeletingShow, setIsDeletingShow] = useState(false);
  const [isCreatingEpisode, setIsCreatingEpisode] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [deletingEpisodeId, setDeletingEpisodeId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<AssetCategory, boolean>>(
    createExpandedAssetSections
  );

  useEffect(() => {
    if (!showId) {
      setIsLoading(false);
      setIsNotFound(true);
      return;
    }

    let isMounted = true;

    const loadDetail = async () => {
      setIsLoading(true);
      setIsNotFound(false);
      setLoadFailed(false);

      try {
        const [nextShow, episodePage, assetPage] = await Promise.all([
          showsApi.getShow(showId),
          episodesApi.listEpisodes({ show_id: showId }),
          assetsApi.listAssets({ show_id: showId }),
        ]);

        if (!isMounted) {
          return;
        }

        setShow(nextShow);
        setEpisodes(episodePage.items);
        setAssets(assetPage.items);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.error('Failed to load show detail', error);
        if (isShowNotFoundError(error)) {
          setIsNotFound(true);
          setShow(null);
          setEpisodes([]);
          setAssets([]);
        } else {
          setLoadFailed(true);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadDetail();

    return () => {
      isMounted = false;
    };
  }, [showId]);

  useEffect(() => {
    if (show) {
      document.title = `${show.title} - ${t('app.title')}`;
    }

    return () => {
      document.title = t('app.title');
    };
  }, [show, t]);

  const refreshShow = async () => {
    if (!showId) {
      return;
    }

    const nextShow = await showsApi.getShow(showId);
    setShow(nextShow);
  };

  const refreshEpisodes = async () => {
    if (!showId) {
      return;
    }

    const episodePage = await episodesApi.listEpisodes({ show_id: showId });
    setEpisodes(episodePage.items);
  };

  const refreshAssets = async () => {
    if (!showId) {
      return;
    }

    const assetPage = await assetsApi.listAssets({ show_id: showId });
    setAssets(assetPage.items);
  };

  const handleRenameShow = async () => {
    if (!showId || !show) {
      return;
    }

    const nextTitle = window.prompt(t('showDetail.renameShowTitle'), show.title);
    const normalizedTitle = nextTitle?.trim();

    if (!normalizedTitle || normalizedTitle === show.title) {
      return;
    }

    setIsRenamingShow(true);
    try {
      await showsApi.updateShow(showId, {
        title: normalizedTitle,
        description: show.description,
        cover_url: show.cover_url,
      });
      await refreshShow();
    } catch (error) {
      console.error('Failed to rename show', error);
      window.alert(t('showDetail.loadFailed'));
    } finally {
      setIsRenamingShow(false);
    }
  };

  const handleDeleteShow = async () => {
    if (!showId) {
      return;
    }

    if (!window.confirm(t('showDetail.confirmDeleteShow'))) {
      return;
    }

    setIsDeletingShow(true);
    try {
      await showsApi.deleteShow(showId);
      navigate('/shows');
    } catch (error) {
      console.error('Failed to delete show', error);
      window.alert(t('showDetail.loadFailed'));
    } finally {
      setIsDeletingShow(false);
    }
  };

  const handleCreateEpisode = async () => {
    if (!showId) {
      return;
    }

    const title = window.prompt(t('showDetail.newEpisodeTitle'));
    const normalizedTitle = title?.trim();

    if (!normalizedTitle) {
      return;
    }

    setIsCreatingEpisode(true);
    try {
      await episodesApi.createEpisode({
        show_id: showId,
        title: normalizedTitle,
        episode_number: episodes.length + 1,
      });
      await refreshEpisodes();
    } catch (error) {
      console.error('Failed to create episode', error);
      window.alert(t('showDetail.loadFailed'));
    } finally {
      setIsCreatingEpisode(false);
    }
  };

  const handleDeleteEpisode = async (
    episodeId: string,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();

    if (!window.confirm(t('showDetail.confirmDeleteEpisode'))) {
      return;
    }

    setDeletingEpisodeId(episodeId);
    try {
      await episodesApi.deleteEpisode(episodeId);
      await refreshEpisodes();
    } catch (error) {
      console.error('Failed to delete episode', error);
      window.alert(t('showDetail.loadFailed'));
    } finally {
      setDeletingEpisodeId(null);
    }
  };

  const handleUpload = async (category: AssetCategory, files: FileList | null) => {
    const selectedFiles = files ? Array.from(files) : [];

    if (!showId || selectedFiles.length === 0) {
      return;
    }

    setUploading(true);
    try {
      for (const file of selectedFiles) {
        const assetId = crypto.randomUUID();
        const { storage_key } = await storage.putObject({
          showId,
          assetId,
          file,
          mimeType: file.type,
        });

        await assetsApi.createAsset({
          show_id: showId,
          category,
          name: file.name,
          storage_key,
          mime_type: file.type,
          size_bytes: file.size,
        });
      }

      await refreshAssets();
    } catch (error) {
      console.error('Failed to upload asset', error);
      window.alert(`${t('showDetail.uploadFailed')}: ${String(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAsset = async (asset: Asset) => {
    if (!window.confirm(t('showDetail.confirmDeleteAsset'))) {
      return;
    }

    try {
      try {
        await storage.deleteObject(asset.storage_key);
      } catch (error) {
        console.warn('Failed to delete asset file', error);
      }

      await assetsApi.deleteAsset(asset.id);
      await refreshAssets();
    } catch (error) {
      console.error('Failed to delete asset', error);
      window.alert(t('showDetail.loadFailed'));
    }
  };

  const handleRenameAsset = async (asset: Asset, nextName: string) => {
    const normalizedName = nextName.trim();

    if (!normalizedName || normalizedName === asset.name) {
      return;
    }

    try {
      await updateAssetName(asset, normalizedName);
      await refreshAssets();
    } catch (error) {
      console.error('Failed to rename asset', error);
      window.alert(t('showDetail.renameAssetFailed'));
      throw error;
    }
  };

  const toggleAssetCategory = (category: AssetCategory) => {
    setExpandedCategories((current) => ({
      ...current,
      [category]: !current[category],
    }));
  };

  const sortedEpisodes = useMemo(() => {
    return [...episodes].sort((a, b) => {
      const left = a.episode_number ?? Number.MAX_SAFE_INTEGER;
      const right = b.episode_number ?? Number.MAX_SAFE_INTEGER;

      if (left !== right) {
        return left - right;
      }

      return Date.parse(a.created_at) - Date.parse(b.created_at);
    });
  }, [episodes]);

  const assetsByCategory = useMemo(() => {
    const groups = createEmptyAssetGroups();

    for (const asset of assets) {
      groups[asset.category].push(asset);
    }

    return groups;
  }, [assets]);

  const formatDate = (isoTimestamp: string) => {
    return new Date(isoTimestamp).toLocaleDateString();
  };

  if (isNotFound) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg-dark px-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-2xl font-bold text-text-dark">404</h1>
          <p className="text-sm text-text-muted">{t('showDetail.notFound')}</p>
          <Link
            to="/shows"
            className="rounded-md border border-border-dark px-4 py-2 text-sm text-text-dark transition-colors hover:bg-surface-dark"
          >
            {t('showDetail.backToShows')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-scrollbar h-full w-full overflow-auto">
      <style>
        {`
          @keyframes episode-card-record-pulse {
            50% {
              transform: scale(1.2);
            }
          }
        `}
      </style>

      <div className="sticky top-0 z-20 border-b border-border-dark bg-bg-dark/90 px-8 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <UiButton
              type="button"
              variant="ghost"
              onClick={() => navigate('/shows')}
              className="shrink-0 gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('showDetail.backToShows')}
            </UiButton>
            <h1 className="min-w-0 truncate text-2xl font-bold text-text-dark">
              {show?.title ?? t('common.loading')}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <UiButton
              type="button"
              variant="ghost"
              onClick={handleRenameShow}
              disabled={!show || isRenamingShow}
              className="gap-2"
            >
              <Pencil className="h-4 w-4" />
              {t('showDetail.renameShow')}
            </UiButton>
            <UiButton
              type="button"
              variant="ghost"
              onClick={handleDeleteShow}
              disabled={!show || isDeletingShow}
              className="gap-2 text-[rgb(var(--state-error-rgb))]"
            >
              <Trash2 className="h-4 w-4" />
              {t('showDetail.deleteShow')}
            </UiButton>
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 p-8 lg:grid-cols-3">
        {loadFailed && (
          <div className="lg:col-span-3 rounded-md border border-[rgb(var(--state-error-rgb))]/35 bg-[rgb(var(--state-error-rgb))]/10 px-4 py-3 text-sm text-text-dark">
            {t('showDetail.loadFailed')}
          </div>
        )}

        <aside className="lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            {/* Keep this title outside the card body so it shares a baseline with the right-side episodes title. */}
            <h2 className="text-lg font-semibold text-text-dark">{t('showDetail.assetLibrary')}</h2>
          </div>

          <div className="flex h-[calc(100vh-13rem)] min-h-[420px] flex-col overflow-hidden rounded-cinema border border-border-dark bg-[var(--ui-surface-panel)] shadow-panel">
            <div className="ui-scrollbar flex-1 overflow-y-auto">
              {ASSET_CATEGORIES.map((category) => {
                const categoryAssets = assetsByCategory[category];
                const isExpanded = expandedCategories[category];
                const categoryLabel = t(`showDetail.assetCategory.${category}`);

                return (
                  <section
                    key={category}
                    className="border-b border-border-dark/70 last:border-b-0"
                  >
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[color:var(--ui-border-soft)] bg-[var(--ui-surface-panel)] px-3 py-2">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-label={t(
                          isExpanded
                            ? 'showDetail.collapseCategory'
                            : 'showDetail.expandCategory',
                          { category: categoryLabel }
                        )}
                        onClick={() => toggleAssetCategory(category)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-semibold text-text-dark"
                      >
                        <span className="w-4 shrink-0 text-text-muted" aria-hidden="true">
                          {isExpanded ? '▾' : '▸'}
                        </span>
                        <span className="min-w-0 truncate">
                          {categoryLabel}{' '}
                          <span className="text-text-muted">({categoryAssets.length})</span>
                        </span>
                      </button>
                      <label
                        className={`inline-flex shrink-0 ${
                          !show || isUploading ? 'pointer-events-none' : 'cursor-pointer'
                        }`}
                      >
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={!show || isUploading}
                          onChange={(event) => {
                            const files = event.currentTarget.files;
                            void handleUpload(category, files);
                            event.currentTarget.value = '';
                          }}
                        />
                        <UiButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!show || isUploading}
                          className="pointer-events-none gap-1.5"
                        >
                          {isUploading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          {isUploading ? t('showDetail.uploading') : t('showDetail.uploadAsset')}
                        </UiButton>
                      </label>
                    </div>

                    {isExpanded && (
                      <div className="p-2">
                        {categoryAssets.length === 0 ? (
                          <p className="px-2 py-2 text-xs text-[var(--text-muted)]">
                            {t('showDetail.assetCategoryEmpty', {
                              category: categoryLabel,
                            })}
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {categoryAssets.map((asset) => (
                              <AssetItem
                                key={asset.id}
                                asset={asset}
                                onDelete={handleDeleteAsset}
                                onRename={handleRenameAsset}
                              />
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-text-dark">{t('showDetail.episodes')}</h2>
            <UiButton
              type="button"
              variant="primary"
              onClick={handleCreateEpisode}
              disabled={!show || isCreatingEpisode}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              {t('showDetail.newEpisode')}
            </UiButton>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-text-muted">
              {t('common.loading')}
            </div>
          ) : episodes.length === 0 && !loadFailed ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-[var(--text-muted)] max-w-sm">{t('showDetail.episodesEmpty')}</p>
              <UiButton variant="primary" onClick={handleCreateEpisode}>
                {t('showDetail.createFirstEpisode')}
              </UiButton>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {sortedEpisodes.map((episode, index) => {
                const episodeNumber = episode.episode_number ?? index + 1;

                return (
                  <div
                    key={episode.id}
                    onClick={() => navigate(`/shows/${showId}/episodes/${episode.id}`)}
                    className="group cursor-pointer rounded-cinema border border-border-dark bg-[var(--ui-surface-panel)] p-4 shadow-panel transition-[transform,border-color,box-shadow] duration-[180ms] ease-out hover:-translate-y-0.5 hover:border-brand-reel-500/50 hover:shadow-card-hover"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="h-2 w-2 origin-center bg-brand-reel-500 group-hover:[animation:episode-card-record-pulse_180ms_ease-out_1]" />
                      <button
                        type="button"
                        onClick={(event) => void handleDeleteEpisode(episode.id, event)}
                        disabled={deletingEpisodeId === episode.id}
                        className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-[background-color,color,opacity] hover:bg-bg-dark hover:text-[rgb(var(--state-error-rgb))] disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mb-3 flex items-start gap-3">
                      <span className="shrink-0 rounded-md border border-brand-reel-500/30 bg-brand-reel-500/10 px-2 py-1 text-xs font-medium text-brand-reel-500">
                        {t('showDetail.episodeNumber', { n: episodeNumber })}
                      </span>
                      <h3 className="min-w-0 flex-1 truncate text-base font-semibold leading-6 text-text-dark">
                        {episode.title}
                      </h3>
                    </div>
                    <div className="space-y-1 font-mono text-xs leading-5 text-text-muted">
                      <p>
                        {t('project.modified')}: {formatDate(episode.updated_at)}
                      </p>
                      <p>
                        {t('project.created')}: {formatDate(episode.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

interface AssetItemProps {
  asset: Asset;
  onDelete: (asset: Asset) => Promise<void>;
  onRename: (asset: Asset, nextName: string) => Promise<void>;
}

function AssetItem({ asset, onDelete, onRename }: AssetItemProps) {
  const { t } = useTranslation();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isMissing, setIsMissing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(asset.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const isCommittingNameRef = useRef(false);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    setObjectUrl(null);
    setIsMissing(false);

    storage
      .getObjectUrl(asset.storage_key)
      .then((url) => {
        if (isMounted) {
          setObjectUrl(url);
        }
      })
      .catch((error) => {
        console.warn('Failed to resolve asset URL', error);
        if (isMounted) {
          setIsMissing(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [asset.storage_key]);

  useEffect(() => {
    if (!isEditingName) {
      setDraftName(asset.name);
    }
  }, [asset.name, isEditingName]);

  useEffect(() => {
    if (isEditingName) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isEditingName]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(asset);
    } finally {
      setIsDeleting(false);
    }
  };

  const startRename = () => {
    skipBlurCommitRef.current = false;
    setDraftName(asset.name);
    setIsEditingName(true);
  };

  const cancelRename = () => {
    skipBlurCommitRef.current = true;
    setDraftName(asset.name);
    setIsEditingName(false);
  };

  const commitRename = async () => {
    if (isCommittingNameRef.current) {
      return;
    }

    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }

    const normalizedName = draftName.trim();

    if (!normalizedName || normalizedName === asset.name) {
      setDraftName(asset.name);
      setIsEditingName(false);
      return;
    }

    isCommittingNameRef.current = true;
    setIsSavingName(true);
    try {
      await onRename(asset, normalizedName);
      setIsEditingName(false);
    } catch {
      renameInputRef.current?.focus();
    } finally {
      setIsSavingName(false);
      isCommittingNameRef.current = false;
    }
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitRename();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelRename();
    }
  };

  return (
    <li className="group flex h-14 items-center gap-2 rounded-md bg-bg-dark/40 px-2 text-sm text-text-dark">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-bg-dark/70 text-text-muted">
        {objectUrl && !isMissing ? (
          <img
            src={objectUrl}
            alt={asset.name}
            className="h-10 w-10 object-cover"
            onError={() => setIsMissing(true)}
          />
        ) : (
          <Box className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {isEditingName ? (
          <input
            ref={renameInputRef}
            type="text"
            value={draftName}
            disabled={isSavingName}
            onChange={(event) => setDraftName(event.currentTarget.value)}
            onKeyDown={handleNameKeyDown}
            onBlur={() => void commitRename()}
            className="h-8 w-full rounded-md border border-[color:var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-sm text-text-dark outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={startRename}
            className="block w-full truncate text-left"
            title={t('showDetail.renameAsset')}
          >
            {asset.name}
          </button>
        )}
        {isMissing && (
          <div className="truncate text-[11px] leading-4 text-text-muted">
            {t('showDetail.assetMissing')}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => void handleDelete()}
        disabled={isDeleting}
        className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-colors hover:bg-bg-dark hover:text-[rgb(var(--state-error-rgb))] disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100"
        title={t('common.delete')}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
