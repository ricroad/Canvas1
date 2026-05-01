import { createHashRouter, redirect } from 'react-router-dom';

import { NotFoundPage } from '@/features/common/NotFoundPage';
import { EpisodeCanvasPage } from '@/features/canvas/EpisodeCanvasPage';
import { ShowListPage } from '@/features/project/ShowListPage';
import { ShowDetailPage } from '@/features/show-detail/ShowDetailPage';
import { RootLayout } from './RootLayout';

export const router = createHashRouter([
  {
    path: '/',
    id: 'root',
    element: <RootLayout />,
    children: [
      {
        index: true,
        id: 'home-redirect',
        loader: () => redirect('/shows'),
      },
      {
        path: 'shows',
        id: 'show-list',
        element: <ShowListPage />,
      },
      {
        path: 'shows/:showId',
        id: 'show-detail',
        element: <ShowDetailPage />,
      },
      {
        path: 'shows/:showId/episodes/:episodeId',
        id: 'episode-canvas',
        element: <EpisodeCanvasPage />,
      },
      {
        path: '*',
        id: 'not-found',
        element: <NotFoundPage />,
      },
    ],
  },
]);
