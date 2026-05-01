import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

import { GlobalErrorDialog } from '@/components/GlobalErrorDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { TitleBar } from '@/components/TitleBar';
import {
  subscribeOpenGlobalErrorDialog,
  type GlobalErrorDialogDetail,
} from '@/features/app/errorDialogEvents';
import {
  subscribeOpenSettingsDialog,
  type SettingsCategory,
} from '@/features/settings/settingsEvents';

export function RootLayout() {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialCategory, setSettingsInitialCategory] =
    useState<SettingsCategory>('general');
  const [globalError, setGlobalError] = useState<GlobalErrorDialogDetail | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeOpenGlobalErrorDialog((detail) => {
      setGlobalError(detail);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeOpenSettingsDialog(({ category }) => {
      setSettingsInitialCategory(category ?? 'general');
      setShowSettings(true);
    });
    return unsubscribe;
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-bg-dark">
      <TitleBar
        onSettingsClick={() => {
          setSettingsInitialCategory('general');
          setShowSettings(true);
        }}
      />

      <main className="relative flex-1 overflow-hidden">
        <Outlet />
      </main>

      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        initialCategory={settingsInitialCategory}
      />
      <GlobalErrorDialog
        isOpen={Boolean(globalError)}
        title={globalError?.title ?? ''}
        message={globalError?.message ?? ''}
        details={globalError?.details}
        copyText={globalError?.copyText}
        onClose={() => setGlobalError(null)}
      />
    </div>
  );
}
