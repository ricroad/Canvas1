import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { ArrowLeft } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { UiButton } from '@/components/ui/primitives';
import { LeftStrip } from '@/components/LeftStrip';
import { CopilotPanel } from '@/features/copilot/CopilotPanel';
import { useProjectStore } from '@/stores/projectStore';
import { Canvas } from './Canvas';

export function EpisodeCanvasPage() {
  const navigate = useNavigate();
  const { showId, episodeId } = useParams();
  const [requestedEpisodeId, setRequestedEpisodeId] = useState<string | null>(null);
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
        <Canvas key={episodeId} />
        <LeftStrip />
        <CopilotPanel />
      </div>
    </ReactFlowProvider>
  );
}
