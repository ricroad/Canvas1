import { CornerUpLeft, Download, Info, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { VideoResultNodeData } from '@/features/canvas/domain/canvasNodes';
import {
  VIDEO_RESULT_INFO_LABEL_CLASS,
  VIDEO_RESULT_INFO_VALUE_CLASS,
  VIDEO_RESULT_PANEL_CLASS,
} from '@/features/canvas/ui/nodeControlStyles';
import {
  NODE_HOVER_TOOLBAR_BUTTON_CLASS,
  NODE_HOVER_TOOLBAR_PANEL_CLASS,
  NODE_HOVER_TOOLBAR_TOP,
} from '@/features/canvas/ui/nodeToolbarConfig';

interface VideoResultToolbarProps {
  snapshotParams: VideoResultNodeData['snapshotParams'];
  durationSeconds: number;
  aspectRatio: string | null | undefined;
  onDownload: () => void | Promise<void>;
  onFullscreen: () => void | Promise<void>;
  onTrace: () => void;
}

export function VideoResultToolbar({
  snapshotParams,
  durationSeconds,
  aspectRatio,
  onDownload,
  onFullscreen,
  onTrace,
}: VideoResultToolbarProps) {
  const { t } = useTranslation();
  const mode = typeof snapshotParams.extraParams?.mode === 'string' ? snapshotParams.extraParams.mode : '-';

  return (
    <div
      className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      style={{ top: `${NODE_HOVER_TOOLBAR_TOP}px` }}
    >
      <div className={NODE_HOVER_TOOLBAR_PANEL_CLASS} onClick={(event) => event.stopPropagation()}>
        <button type="button" className={NODE_HOVER_TOOLBAR_BUTTON_CLASS} onClick={() => void onDownload()}>
          <Download className="h-3.5 w-3.5" />
          <span>{t('node.videoResult.download')}</span>
        </button>
        <button type="button" className={NODE_HOVER_TOOLBAR_BUTTON_CLASS} onClick={() => void onFullscreen()}>
          <Maximize2 className="h-3.5 w-3.5" />
          <span>{t('node.videoResult.fullscreen')}</span>
        </button>
        <button type="button" className={NODE_HOVER_TOOLBAR_BUTTON_CLASS} onClick={onTrace}>
          <CornerUpLeft className="h-3.5 w-3.5" />
          <span>{t('node.videoResult.trace')}</span>
        </button>
        <div className="group/info relative pointer-events-auto">
          <button type="button" className={NODE_HOVER_TOOLBAR_BUTTON_CLASS}>
            <Info className="h-3.5 w-3.5" />
            <span>{t('node.videoResult.info')}</span>
          </button>
          <div className={`absolute right-0 top-[calc(100%+8px)] hidden w-[240px] p-3 group-hover/info:block ${VIDEO_RESULT_PANEL_CLASS}`}>
            <div className="space-y-2">
              <div>
                <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.videoResult.model')}</div>
                <div className={VIDEO_RESULT_INFO_VALUE_CLASS}>{snapshotParams.modelId}</div>
              </div>
              <div>
                <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.videoResult.duration')}</div>
                <div className={VIDEO_RESULT_INFO_VALUE_CLASS}>{durationSeconds}s</div>
              </div>
              <div>
                <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.videoResult.aspectRatio')}</div>
                <div className={VIDEO_RESULT_INFO_VALUE_CLASS}>{aspectRatio}</div>
              </div>
              <div>
                <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.videoResult.mode')}</div>
                <div className={VIDEO_RESULT_INFO_VALUE_CLASS}>{mode}</div>
              </div>
              <div>
                <div className={VIDEO_RESULT_INFO_LABEL_CLASS}>{t('node.videoResult.prompt')}</div>
                <div className={`${VIDEO_RESULT_INFO_VALUE_CLASS} line-clamp-4 whitespace-pre-wrap break-words`}>
                  {snapshotParams.prompt || '-'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
