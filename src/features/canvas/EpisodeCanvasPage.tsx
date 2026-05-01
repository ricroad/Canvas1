import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import confetti from 'canvas-confetti';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { episodesApi } from '@/api';
import { UiButton } from '@/components/ui/primitives';
import { LeftStrip } from '@/components/LeftStrip';
import { CopilotPanel } from '@/features/copilot/CopilotPanel';
import { ShowAssetPanel } from '@/features/show-asset-panel/ShowAssetPanel';
import { useNavTitleStore } from '@/stores/navTitleStore';
import { useProjectStore } from '@/stores/projectStore';
import { Canvas } from './Canvas';

function fireDoneConfetti() {
  void confetti({
    particleCount: 200,
    spread: 90,
    origin: { y: 0.1 },
    colors: ['#E94E1B', '#FF5A2E', '#3FCF8E', '#F2A93B', '#FFFFFF'],
    ticks: 200,
    scalar: 1.1,
  });
  window.setTimeout(() => {
    void confetti({ particleCount: 120, spread: 70, origin: { x: 0.1, y: 0.1 } });
    void confetti({ particleCount: 120, spread: 70, origin: { x: 0.9, y: 0.1 } });
  }, 250);
}

export function EpisodeCanvasPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { showId, episodeId } = useParams();
  const [requestedEpisodeId, setRequestedEpisodeId] = useState<string | null>(null);
  const [episodeIsDone, setEpisodeIsDone] = useState(false);
  const [isDoneUpdating, setIsDoneUpdating] = useState(false);
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const currentProject = useProjectStore((state) => state.currentProject);
  const isOpeningProject = useProjectStore((state) => state.isOpeningProject);

  useEffect(() => {
    if (!episodeId) {
      return undefined;
    }

    setRequestedEpisodeId(episodeId);
    const projectState = useProjectStore.getState();
    if (
      projectState.currentProjectId !== episodeId ||
      projectState.currentProject?.id !== episodeId
    ) {
      projectState.openProject(episodeId);
    }

    return () => {
      useProjectStore.getState().closeProject();
    };
  }, [episodeId]);

  useEffect(() => {
    if (!episodeId) {
      setEpisodeIsDone(false);
      return undefined;
    }

    let isCancelled = false;
    episodesApi.getEpisode(episodeId)
      .then((episode) => {
        if (!isCancelled) {
          setEpisodeIsDone(episode.is_done);
        }
      })
      .catch((error) => {
        console.error('Failed to load episode metadata', error);
      });

    return () => {
      isCancelled = true;
    };
  }, [episodeId]);

  useEffect(() => {
    if (currentProject) useNavTitleStore.getState().setEpisodeTitle(currentProject.name);
    return () => useNavTitleStore.getState().setEpisodeTitle(null);
  }, [currentProject]);

  const handleDoneToggle = async () => {
    if (!episodeId || isDoneUpdating) {
      return;
    }

    const nextIsDone = !episodeIsDone;
    setIsDoneUpdating(true);

    try {
      const episode = await episodesApi.updateEpisodeMeta(episodeId, {
        is_done: nextIsDone,
      });
      setEpisodeIsDone(episode.is_done);

      if (nextIsDone) {
        fireDoneConfetti();
      }
    } catch (error) {
      console.error('Failed to update episode done state', error);
      window.alert(t('canvas.markDoneFailed'));
    } finally {
      setIsDoneUpdating(false);
    }
  };

  if (!showId || !episodeId) {
    return <Navigate to="/shows" replace />;
  }

  const isCurrentProject =
    currentProjectId === episodeId && currentProject?.id === episodeId;

  if (!isCurrentProject) {
    const isLoading = requestedEpisodeId !== episodeId || isOpeningProject;

    return (
      <div className="flex h-full w-full items-center justify-center bg-bg-dark px-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-text-muted">
            {isLoading ? '正在加载画布...' : '未找到项目'}
          </p>
          <UiButton
            type="button"
            variant="ghost"
            onClick={() => navigate(`/shows/${showId}`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回剧详情
          </UiButton>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full">
        <UiButton
          type="button"
          variant={episodeIsDone ? 'ghost' : 'primary'}
          disabled={isDoneUpdating}
          onClick={handleDoneToggle}
          className={`absolute right-4 top-4 z-[80] ${
            episodeIsDone
              ? 'border-[#3FCF8E]/45 bg-[#3FCF8E]/10 text-[#3FCF8E] hover:bg-[#3FCF8E]/15'
              : 'bg-[#E94E1B] hover:bg-[#FF5A2E] active:bg-[#C53A0F]'
          }`}
        >
          {episodeIsDone ? `${t('canvas.alreadyDone')} ✓` : t('canvas.markDone')}
        </UiButton>
        <Canvas key={episodeId} />
        <LeftStrip />
        <ShowAssetPanel />
        <CopilotPanel />
      </div>
    </ReactFlowProvider>
  );
}
