import { memo, useEffect, useMemo, useState, type DragEvent } from 'react';
import { Package, PanelLeftClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { assetsApi, type Asset, type AssetCategory } from '@/api';
import { storage } from '@/storage';

import { useShowAssetPanelStore } from './showAssetPanelStore';

const CATEGORIES: AssetCategory[] = ['character', 'scene', 'prop', 'other'];

type GroupedAssets = Record<AssetCategory, Asset[]>;

function createEmptyGroups(): GroupedAssets {
  return {
    character: [],
    scene: [],
    prop: [],
    other: [],
  };
}

function categoryKey(category: AssetCategory): string {
  return `showDetail.assetCategory.${category}`;
}

interface ShowAssetCardProps {
  asset: Asset;
}

function ShowAssetThumbnail({ asset }: ShowAssetCardProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isMissing, setIsMissing] = useState(false);

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
        console.warn('[ShowAssetPanel] Failed to resolve asset URL', error);
        if (isMounted) {
          setIsMissing(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [asset.storage_key]);

  if (objectUrl && !isMissing) {
    return (
      <img
        src={objectUrl}
        alt={asset.name}
        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        draggable={false}
        onError={() => setIsMissing(true)}
      />
    );
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ color: 'var(--copilot-text-tertiary)' }}
    >
      <Package className="h-6 w-6" />
    </div>
  );
}

function ShowAssetCard({ asset }: ShowAssetCardProps) {
  const { t } = useTranslation();

  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData(
      'application/x-reelforce-show-asset',
      JSON.stringify({
        assetId: asset.id,
        storageKey: asset.storage_key,
        name: asset.name,
        mimeType: asset.mime_type,
      })
    );
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <article
      draggable={true}
      onDragStart={handleDragStart}
      className="group cursor-grab overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-black/20 active:cursor-grabbing"
      title={`${asset.name} - ${t('showAssetPanel.dragHint')}`}
    >
      <div className="aspect-square bg-black/25">
        <ShowAssetThumbnail asset={asset} />
      </div>
      <div className="min-w-0 px-2 py-1.5">
        <p className="truncate text-[11px] font-medium" style={{ color: 'var(--copilot-text-primary)' }}>
          {asset.name}
        </p>
      </div>
    </article>
  );
}

export const ShowAssetPanel = memo(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showId } = useParams<{ showId: string }>();
  const isOpen = useShowAssetPanelStore((state) => state.isOpen);
  const close = useShowAssetPanelStore((state) => state.close);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!showId) {
      return undefined;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(false);

    assetsApi
      .listAssets({ show_id: showId })
      .then((page) => {
        if (isMounted) {
          setAssets(page.items);
        }
      })
      .catch((error) => {
        console.warn('[ShowAssetPanel] Failed to load show assets', error);
        if (isMounted) {
          setAssets([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [showId]);

  const groupedAssets = useMemo(() => {
    const next = createEmptyGroups();
    for (const asset of assets) {
      next[asset.category].push(asset);
    }
    return next;
  }, [assets]);

  if (!showId) {
    return null;
  }

  const handleManage = () => {
    close();
    navigate(`/shows/${showId}`);
  };

  return (
    <aside
      className={`
        absolute left-[74px] top-12 z-20 flex h-[calc(100vh-96px)] w-[360px]
        flex-col overflow-hidden rounded-[22px] p-3 transition-all duration-200 ease-out
        ${isOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-3 opacity-0'}
      `}
      style={{
        background: 'var(--copilot-card-bg)',
        border: '1px solid var(--copilot-card-border)',
        boxShadow: 'var(--strip-pill-shadow)',
        color: 'var(--copilot-text-primary)',
        backdropFilter: 'blur(28px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.8)',
      }}
    >
      <header className="flex items-center gap-2 px-1 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{t('showAssetPanel.title')}</h2>
          <p className="truncate text-[11px]" style={{ color: 'var(--copilot-text-tertiary)' }}>
            {t('showAssetPanel.dragHint')}
          </p>
        </div>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:bg-[rgba(255,255,255,0.08)]"
          style={{ color: 'var(--copilot-text-secondary)' }}
          onClick={close}
          aria-label={t('common.close')}
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div
            className="flex h-full items-center justify-center px-8 text-center text-sm"
            style={{ color: 'var(--copilot-text-tertiary)' }}
          >
            {t('common.loading')}
          </div>
        ) : loadError ? (
          <div
            className="flex h-full items-center justify-center px-8 text-center text-sm"
            style={{ color: 'rgb(248, 113, 113)' }}
          >
            {t('showAssetPanel.loadFailed')}
          </div>
        ) : assets.length === 0 ? (
          <div
            className="flex h-full items-center justify-center px-8 text-center text-sm"
            style={{ color: 'var(--copilot-text-tertiary)' }}
          >
            {t('showAssetPanel.empty')}
          </div>
        ) : (
          <div className="space-y-4">
            {CATEGORIES.map((category) => (
              <section key={category}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3
                    className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: 'var(--copilot-text-secondary)' }}
                  >
                    {t(categoryKey(category))}
                  </h3>
                  <span
                    className="text-[11px] tabular-nums"
                    style={{ color: 'var(--copilot-text-tertiary)' }}
                  >
                    {groupedAssets[category].length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {groupedAssets[category].map((asset) => (
                    <ShowAssetCard key={asset.id} asset={asset} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <footer className="pt-3">
        <button
          type="button"
          className="h-8 text-xs font-medium transition-colors hover:text-[var(--copilot-text-primary)]"
          style={{ color: 'var(--copilot-text-secondary)' }}
          onClick={handleManage}
        >
          {t('showAssetPanel.manageHint')}
        </button>
      </footer>
    </aside>
  );
});

ShowAssetPanel.displayName = 'ShowAssetPanel';
