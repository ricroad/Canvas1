import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Film, LocateFixed, PanelLeftClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useCanvasStore } from '@/stores/canvasStore';
import { canvasEventBus } from '@/features/canvas/application/canvasServices';

import {
  useAssetLibraryStore,
  type AssetCategory,
} from './assetLibraryStore';
import { scanAssets, type AssetItem } from './scanAssets';
import type { DownloadAssetsResult } from './downloadAssets';

interface AssetLibraryPanelProps {
  onDownloadItems?: (items: AssetItem[]) => Promise<DownloadAssetsResult>;
}

type StatusMessage = { kind: 'success' | 'error'; text: string };

const CATEGORIES: AssetCategory[] = [
  'all',
  'uploadedImage',
  'generatedImage',
  'generatedVideo',
  'storyboard',
];

function categoryKey(category: AssetCategory): string {
  return `assetLibrary.category.${category}`;
}

export const AssetLibraryPanel = memo(({ onDownloadItems }: AssetLibraryPanelProps) => {
  const { t } = useTranslation();
  const nodes = useCanvasStore((state) => state.nodes);
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const isOpen = useAssetLibraryStore((state) => state.isOpen);
  const selectedCategory = useAssetLibraryStore((state) => state.selectedCategory);
  const selectedIds = useAssetLibraryStore((state) => state.selectedIds);
  const close = useAssetLibraryStore((state) => state.close);
  const setCategory = useAssetLibraryStore((state) => state.setCategory);
  const toggleSelection = useAssetLibraryStore((state) => state.toggleSelection);
  const clearSelection = useAssetLibraryStore((state) => state.clearSelection);

  const assets = useMemo(() => scanAssets(nodes), [nodes]);
  const visibleAssets = useMemo(
    () =>
      selectedCategory === 'all'
        ? assets
        : assets.filter((asset) => asset.category === selectedCategory),
    [assets, selectedCategory]
  );
  const counts = useMemo(() => {
    const next: Record<AssetCategory, number> = {
      all: assets.length,
      uploadedImage: 0,
      generatedImage: 0,
      generatedVideo: 0,
      storyboard: 0,
    };
    for (const asset of assets) {
      next[asset.category] += 1;
    }
    return next;
  }, [assets]);
  const selectedItems = useMemo(
    () => assets.filter((asset) => selectedIds.has(asset.id)),
    [assets, selectedIds]
  );

  const [status, setStatus] = useState<StatusMessage | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);
  const showStatus = (next: StatusMessage) => {
    setStatus(next);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus(null), 4000);
  };
  const downloadItems = async (items: AssetItem[]) => {
    if (!onDownloadItems) return;
    const result = await onDownloadItems(items);
    if (!result.targetDir) return;
    if (result.failed.length === 0) {
      showStatus({
        kind: 'success',
        text: t('assetLibrary.downloadSucceeded', { count: result.succeeded.length }),
      });
    } else {
      showStatus({
        kind: 'error',
        text: t('assetLibrary.downloadPartial', {
          succeeded: result.succeeded.length,
          failed: result.failed.length,
        }),
      });
    }
  };
  const locateNode = (nodeId: string) => {
    setSelectedNode(nodeId);
    canvasEventBus.publish('focus/node', { nodeId });
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
          <h2 className="truncate text-sm font-semibold">{t('assetLibrary.title')}</h2>
        </div>
        {selectedItems.length > 0 && (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors hover:bg-[rgba(255,255,255,0.08)]"
            style={{ color: 'var(--accent)' }}
            onClick={() => downloadItems(selectedItems)}
          >
            <Download className="h-3.5 w-3.5" />
            {t('assetLibrary.downloadSelected', { count: selectedItems.length })}
          </button>
        )}
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

      {status && (
        <div
          className="mb-2 rounded-xl px-3 py-2 text-[11px]"
          style={{
            background:
              status.kind === 'success'
                ? 'rgba(var(--accent-rgb) / 0.14)'
                : 'rgba(239, 68, 68, 0.14)',
            color: status.kind === 'success' ? 'var(--accent)' : 'rgb(248, 113, 113)',
          }}
        >
          {status.text}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pb-3">
        {CATEGORIES.map((category) => {
          const active = selectedCategory === category;
          return (
            <button
              key={category}
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-medium transition-colors"
              style={{
                background: active ? 'rgba(var(--accent-rgb) / 0.14)' : 'rgba(255,255,255,0.04)',
                color: active ? 'var(--accent)' : 'var(--copilot-text-secondary)',
                border: '1px solid var(--copilot-card-border)',
              }}
              onClick={() => setCategory(category)}
            >
              <span>{t(categoryKey(category))}</span>
              <span className="tabular-nums opacity-70">{counts[category]}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {visibleAssets.length === 0 ? (
          <div
            className="flex h-full items-center justify-center px-8 text-center text-sm"
            style={{ color: 'var(--copilot-text-tertiary)' }}
          >
            {t('assetLibrary.empty')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visibleAssets.map((asset) => {
              const selected = selectedIds.has(asset.id);
              return (
                <article
                  key={asset.id}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-black/20"
                >
                  <button
                    type="button"
                    className="block h-full w-full"
                    onClick={() => locateNode(asset.nodeId)}
                    aria-label={t('assetLibrary.locate')}
                  >
                    <img
                      src={asset.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  </button>

                  <div
                    className={`absolute inset-x-0 top-0 flex items-center justify-between p-2 transition-opacity ${
                      selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <button
                      type="button"
                      className={`flex h-7 w-7 items-center justify-center rounded-lg border text-white backdrop-blur transition-colors ${
                        selected
                          ? 'border-transparent bg-[rgba(var(--accent-rgb)/0.9)]'
                          : 'border-[rgba(255,255,255,0.18)] bg-black/55'
                      }`}
                      onClick={() => toggleSelection(asset.id)}
                      aria-pressed={selected}
                    >
                      {selected && <Check className="h-4 w-4" />}
                    </button>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[rgba(255,255,255,0.18)] bg-black/55 text-white backdrop-blur"
                        onClick={() => locateNode(asset.nodeId)}
                        title={t('assetLibrary.locate')}
                        aria-label={t('assetLibrary.locate')}
                      >
                        <LocateFixed className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[rgba(255,255,255,0.18)] bg-black/55 text-white backdrop-blur"
                        onClick={() => downloadItems([asset])}
                        title={t('assetLibrary.downloadOne')}
                        aria-label={t('assetLibrary.downloadOne')}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {asset.kind === 'video' && (
                    <div className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur">
                      <Film className="h-3.5 w-3.5" />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <footer className="pt-3">
          <button
            type="button"
            className="h-8 text-xs"
            style={{ color: 'var(--copilot-text-secondary)' }}
            onClick={clearSelection}
          >
            {t('common.cancel')}
          </button>
        </footer>
      )}
    </aside>
  );
});

AssetLibraryPanel.displayName = 'AssetLibraryPanel';
