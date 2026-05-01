import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { UiButton } from '@/components/ui/primitives';

export function ShowDetailPage() {
  const navigate = useNavigate();
  const { showId } = useParams();

  return (
    <div className="ui-scrollbar h-full w-full overflow-auto p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <UiButton
          type="button"
          variant="ghost"
          onClick={() => navigate('/shows')}
          className="w-fit gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </UiButton>

        <div>
          <h1 className="text-2xl font-bold text-text-dark">剧详情（Phase C 待实现）</h1>
          <p className="mt-3 font-mono text-sm text-text-muted">showId: {showId}</p>
        </div>
      </div>
    </div>
  );
}
