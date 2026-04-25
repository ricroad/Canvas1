import { useState, useCallback, useEffect, useMemo } from 'react';
import { X, Eye, EyeOff, FolderOpen, Plus, Trash2, WandSparkles } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { isTauriEnv } from '@/commands/platform';
import { testKlingConnection } from '@/commands/ai';
import { openFileDialog, openUrl } from '@/commands/web/dialog';
import { useSettingsStore } from '@/stores/settingsStore';
import { UiCheckbox, UiSelect } from '@/components/ui';
import { UI_CONTENT_OVERLAY_INSET_CLASS, UI_DIALOG_TRANSITION_MS } from '@/components/ui/motion';
import { useDialogTransition } from '@/components/ui/useDialogTransition';
import { listImageModels, listModelProviders } from '@/features/canvas/models';
import { GRSAI_NANO_BANANA_PRO_MODEL_OPTIONS } from '@/features/canvas/models/providers/grsai';
import { GRSAI_CREDIT_TIERS } from '@/features/canvas/pricing/types';
import {
  STORYBOARD_PLANNING_SKILLS,
  getStoryboardPlanningSkill,
} from '@/features/storyboard-skills';
import providerGuideMarkdown from '../../docs/settings/provider-guide.md?raw';
import type { SettingsCategory } from '@/features/settings/settingsEvents';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: SettingsCategory;
}

interface SettingsCheckboxCardProps {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const PROVIDER_REGISTER_URLS: Record<string, string> = {
  moonshot: 'https://platform.moonshot.cn',
  ppio: 'https://ppio.com/user/register?invited_by=WGY0DZ',
  grsai: 'https://grsai.com',
  kie: 'https://kie.ai?ref=eef20ef0b0595cad227d45b29c635f6c',
  fal: 'https://fal.ai',
  google: 'https://aistudio.google.com',
};

const PROVIDER_GET_KEY_URLS: Record<string, string> = {
  moonshot: 'https://platform.moonshot.cn/console/api-keys',
  ppio: 'https://ppio.com/settings/key-management',
  grsai: 'https://grsai.com/zh/dashboard/api-keys',
  kie: 'https://kie.ai/api-key',
  fal: 'https://fal.ai/dashboard/keys',
  google: 'https://aistudio.google.com/apikey',
};

// LLM-only providers (not image generation, managed separately)
const LLM_PROVIDERS = [
  { id: 'moonshot', name: 'Moonshot Kimi', label: 'Moonshot Kimi' },
  { id: 'google', name: 'Google Gemini', label: 'Google Gemini' },
];

function SettingsCheckboxCard({
  title,
  description,
  checked,
  onCheckedChange,
}: SettingsCheckboxCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onCheckedChange(!checked)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onCheckedChange(!checked);
        }
      }}
      className="w-full rounded-lg border border-border-dark bg-bg-dark p-4 text-left transition-colors hover:border-[rgba(255,255,255,0.2)]"
    >
      <div className="flex items-start gap-3">
        <UiCheckbox
          checked={checked}
          onCheckedChange={(nextChecked) => onCheckedChange(nextChecked)}
          onClick={(event) => event.stopPropagation()}
          className="mt-0.5 shrink-0"
        />
        <div>
          <h3 className="text-sm font-medium text-text-dark">{title}</h3>
          <p className="mt-1 text-xs text-text-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function SettingsDialog({
  isOpen,
  onClose,
  initialCategory = 'general',
}: SettingsDialogProps) {
  const { t, i18n } = useTranslation();
  const {
    apiKeys,
    kling,
    videoConcurrency,
    storyboardPlanningSkillId,
    grsaiNanoBananaProModel,
    defaultImageModelId,
    defaultImageSize,
    defaultImageAspectRatio,
    hideProviderGuidePopover,
    downloadPresetPaths,
    useUploadFilenameAsNodeTitle,
    storyboardGenKeepStyleConsistent,
    storyboardGenDisableTextInImage,
    storyboardGenAutoInferEmptyFrame,
    ignoreAtTagWhenCopyingAndGenerating,
    enableStoryboardGenGridPreviewShortcut,
    showStoryboardGenAdvancedRatioControls,
    showNodePrice,
    priceDisplayCurrencyMode,
    usdToCnyRate,
    preferDiscountedPrice,
    grsaiCreditTierId,
    uiRadiusPreset,
    themeTonePreset,
    accentColor,
    canvasEdgeRoutingMode,
    autoCheckAppUpdateOnLaunch,
    enableUpdateDialog,
    setKlingSettings,
    setVideoConcurrencyMaxConcurrent,
    setProviderApiKey,
    setStoryboardPlanningSkillId,
    setGrsaiNanoBananaProModel,
    setDefaultImageModelId,
    setDefaultImageSize,
    setDefaultImageAspectRatio,
    setDownloadPresetPaths,
    setUseUploadFilenameAsNodeTitle,
    setStoryboardGenKeepStyleConsistent,
    setStoryboardGenDisableTextInImage,
    setStoryboardGenAutoInferEmptyFrame,
    setIgnoreAtTagWhenCopyingAndGenerating,
    setEnableStoryboardGenGridPreviewShortcut,
    setShowStoryboardGenAdvancedRatioControls,
    setShowNodePrice,
    setPriceDisplayCurrencyMode,
    setUsdToCnyRate,
    setPreferDiscountedPrice,
    setGrsaiCreditTierId,
    setUiRadiusPreset,
    setThemeTonePreset,
    setAccentColor,
    setCanvasEdgeRoutingMode,
    setAutoCheckAppUpdateOnLaunch,
    setEnableUpdateDialog,
  } = useSettingsStore();
  const providers = useMemo(() => {
    const providerOrder = ['kie', 'ppio', 'fal', 'grsai'];
    const providerIndex = new Map(providerOrder.map((id, index) => [id, index]));
    return listModelProviders().slice().sort((left, right) => {
      const leftIndex = providerIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = providerIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
  }, []);
  const imageModels = useMemo(() => listImageModels(), []);
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory);
  const [appVersion, setAppVersion] = useState<string>('');
  const [localApiKeys, setLocalApiKeys] = useState<Record<string, string>>(apiKeys);
  const [localKlingAccessKey, setLocalKlingAccessKey] = useState(kling.accessKey ?? '');
  const [localKlingSecretKey, setLocalKlingSecretKey] = useState(kling.secretKey ?? '');
  const [localKlingEnabled, setLocalKlingEnabled] = useState(kling.enabled);
  const [localVideoMaxConcurrent, setLocalVideoMaxConcurrent] = useState(
    String(videoConcurrency.maxConcurrent)
  );
  const [localStoryboardPlanningSkillId, setLocalStoryboardPlanningSkillId] = useState(
    storyboardPlanningSkillId
  );
  const [localGrsaiNanoBananaProModel, setLocalGrsaiNanoBananaProModel] = useState(
    grsaiNanoBananaProModel
  );
  const [localDefaultImageModelId, setLocalDefaultImageModelId] = useState(defaultImageModelId);
  const [localDefaultImageSize, setLocalDefaultImageSize] = useState(defaultImageSize);
  const [localDefaultImageAspectRatio, setLocalDefaultImageAspectRatio] = useState(
    defaultImageAspectRatio
  );
  const selectedDefaultImageModel = useMemo(
    () =>
      imageModels.find((model) => model.id === localDefaultImageModelId)
      ?? imageModels[0]
      ?? null,
    [imageModels, localDefaultImageModelId]
  );
  const [localDownloadPathInput, setLocalDownloadPathInput] = useState('');
  const [localDownloadPresetPaths, setLocalDownloadPresetPaths] = useState(downloadPresetPaths);
  const [localUseUploadFilenameAsNodeTitle, setLocalUseUploadFilenameAsNodeTitle] = useState(
    useUploadFilenameAsNodeTitle
  );
  const [localStoryboardGenKeepStyleConsistent, setLocalStoryboardGenKeepStyleConsistent] =
    useState(storyboardGenKeepStyleConsistent);
  const [localStoryboardGenDisableTextInImage, setLocalStoryboardGenDisableTextInImage] = useState(
    storyboardGenDisableTextInImage
  );
  const [localStoryboardGenAutoInferEmptyFrame, setLocalStoryboardGenAutoInferEmptyFrame] = useState(
    storyboardGenAutoInferEmptyFrame
  );
  const [localIgnoreAtTagWhenCopyingAndGenerating, setLocalIgnoreAtTagWhenCopyingAndGenerating] =
    useState(ignoreAtTagWhenCopyingAndGenerating);
  const [localEnableStoryboardGenGridPreviewShortcut, setLocalEnableStoryboardGenGridPreviewShortcut] =
    useState(enableStoryboardGenGridPreviewShortcut);
  const [localShowStoryboardGenAdvancedRatioControls, setLocalShowStoryboardGenAdvancedRatioControls] =
    useState(showStoryboardGenAdvancedRatioControls);
  const [localShowNodePrice, setLocalShowNodePrice] = useState(showNodePrice);
  const [localPriceDisplayCurrencyMode, setLocalPriceDisplayCurrencyMode] = useState(
    priceDisplayCurrencyMode
  );
  const [localUsdToCnyRate, setLocalUsdToCnyRate] = useState(String(usdToCnyRate));
  const [localPreferDiscountedPrice, setLocalPreferDiscountedPrice] = useState(
    preferDiscountedPrice
  );
  const [localGrsaiCreditTierId, setLocalGrsaiCreditTierId] = useState(grsaiCreditTierId);
  const [localUiRadiusPreset, setLocalUiRadiusPreset] = useState(uiRadiusPreset);
  const [localThemeTonePreset, setLocalThemeTonePreset] = useState(themeTonePreset);
  const [localAccentColor, setLocalAccentColor] = useState(accentColor);
  const [localCanvasEdgeRoutingMode, setLocalCanvasEdgeRoutingMode] = useState(canvasEdgeRoutingMode);
  const [localAutoCheckAppUpdateOnLaunch, setLocalAutoCheckAppUpdateOnLaunch] = useState(
    autoCheckAppUpdateOnLaunch
  );
  const [localEnableUpdateDialog, setLocalEnableUpdateDialog] = useState(enableUpdateDialog);
  const [revealedApiKeys, setRevealedApiKeys] = useState<Record<string, boolean>>({});
  const [revealedKlingSecretKey, setRevealedKlingSecretKey] = useState(false);
  const [klingConnectionStatus, setKlingConnectionStatus] = useState<{
    tone: 'idle' | 'success' | 'error' | 'loading';
    message: string;
  }>({ tone: 'idle', message: '' });
  const { shouldRender, isVisible } = useDialogTransition(isOpen, UI_DIALOG_TRANSITION_MS);
  const selectedStoryboardSkill = useMemo(
    () => getStoryboardPlanningSkill(localStoryboardPlanningSkillId),
    [localStoryboardPlanningSkillId]
  );

  useEffect(() => {
    let mounted = true;
    const loadAppVersion = async () => {
      try {
        if (!isTauriEnv()) { if (mounted) setAppVersion('web'); return; }
        const { getVersion } = await import('@tauri-apps/api/app');
        const version = await getVersion();
        if (mounted) {
          setAppVersion(version);
        }
      } catch {
        if (mounted) {
          setAppVersion('');
        }
      }
    };
    void loadAppVersion();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setLocalApiKeys(apiKeys);
    setLocalKlingAccessKey(kling.accessKey ?? '');
    setLocalKlingSecretKey(kling.secretKey ?? '');
    setLocalKlingEnabled(kling.enabled);
    setLocalVideoMaxConcurrent(String(videoConcurrency.maxConcurrent));
    setLocalStoryboardPlanningSkillId(storyboardPlanningSkillId);
    setLocalDownloadPresetPaths(downloadPresetPaths);
    setLocalGrsaiNanoBananaProModel(grsaiNanoBananaProModel);
    setLocalDefaultImageModelId(defaultImageModelId);
    setLocalDefaultImageSize(defaultImageSize);
    setLocalDefaultImageAspectRatio(defaultImageAspectRatio);
    setLocalUseUploadFilenameAsNodeTitle(useUploadFilenameAsNodeTitle);
    setLocalStoryboardGenKeepStyleConsistent(storyboardGenKeepStyleConsistent);
    setLocalStoryboardGenDisableTextInImage(storyboardGenDisableTextInImage);
    setLocalStoryboardGenAutoInferEmptyFrame(storyboardGenAutoInferEmptyFrame);
    setLocalIgnoreAtTagWhenCopyingAndGenerating(ignoreAtTagWhenCopyingAndGenerating);
    setLocalEnableStoryboardGenGridPreviewShortcut(enableStoryboardGenGridPreviewShortcut);
    setLocalShowStoryboardGenAdvancedRatioControls(showStoryboardGenAdvancedRatioControls);
    setLocalShowNodePrice(showNodePrice);
    setLocalPriceDisplayCurrencyMode(priceDisplayCurrencyMode);
    setLocalUsdToCnyRate(String(usdToCnyRate));
    setLocalPreferDiscountedPrice(preferDiscountedPrice);
    setLocalGrsaiCreditTierId(grsaiCreditTierId);
    setLocalUiRadiusPreset(uiRadiusPreset);
    setLocalThemeTonePreset(themeTonePreset);
    setLocalAccentColor(accentColor);
    setLocalCanvasEdgeRoutingMode(canvasEdgeRoutingMode);
    setLocalAutoCheckAppUpdateOnLaunch(autoCheckAppUpdateOnLaunch);
    setLocalEnableUpdateDialog(enableUpdateDialog);
    setRevealedApiKeys({});
    setRevealedKlingSecretKey(false);
    setKlingConnectionStatus({ tone: 'idle', message: '' });
    setLocalDownloadPathInput('');
  }, [
    isOpen,
    apiKeys,
    kling.accessKey,
    kling.enabled,
    kling.secretKey,
    videoConcurrency.maxConcurrent,
    storyboardPlanningSkillId,
    downloadPresetPaths,
    grsaiNanoBananaProModel,
    defaultImageModelId,
    defaultImageSize,
    defaultImageAspectRatio,
    useUploadFilenameAsNodeTitle,
    storyboardGenKeepStyleConsistent,
    storyboardGenDisableTextInImage,
    storyboardGenAutoInferEmptyFrame,
    ignoreAtTagWhenCopyingAndGenerating,
    enableStoryboardGenGridPreviewShortcut,
    showStoryboardGenAdvancedRatioControls,
    showNodePrice,
    priceDisplayCurrencyMode,
    usdToCnyRate,
    preferDiscountedPrice,
    grsaiCreditTierId,
    uiRadiusPreset,
    themeTonePreset,
    accentColor,
    canvasEdgeRoutingMode,
    autoCheckAppUpdateOnLaunch,
    enableUpdateDialog,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveCategory(initialCategory);
  }, [initialCategory, isOpen]);

  const handleSave = useCallback(() => {
    providers.forEach((provider) => {
      setProviderApiKey(provider.id, localApiKeys[provider.id] ?? '');
    });
    setKlingSettings({
      accessKey: localKlingAccessKey,
      secretKey: localKlingSecretKey,
      enabled: localKlingEnabled,
    });
    setVideoConcurrencyMaxConcurrent(Number(localVideoMaxConcurrent));
    setStoryboardPlanningSkillId(localStoryboardPlanningSkillId);
    setGrsaiNanoBananaProModel(localGrsaiNanoBananaProModel);
    setDefaultImageModelId(localDefaultImageModelId);
    setDefaultImageSize(localDefaultImageSize);
    setDefaultImageAspectRatio(localDefaultImageAspectRatio);
    setDownloadPresetPaths(localDownloadPresetPaths);
    setUseUploadFilenameAsNodeTitle(localUseUploadFilenameAsNodeTitle);
    setStoryboardGenKeepStyleConsistent(localStoryboardGenKeepStyleConsistent);
    setStoryboardGenDisableTextInImage(localStoryboardGenDisableTextInImage);
    setStoryboardGenAutoInferEmptyFrame(localStoryboardGenAutoInferEmptyFrame);
    setIgnoreAtTagWhenCopyingAndGenerating(localIgnoreAtTagWhenCopyingAndGenerating);
    setEnableStoryboardGenGridPreviewShortcut(localEnableStoryboardGenGridPreviewShortcut);
    setShowStoryboardGenAdvancedRatioControls(localShowStoryboardGenAdvancedRatioControls);
    setShowNodePrice(localShowNodePrice);
    setPriceDisplayCurrencyMode(localPriceDisplayCurrencyMode);
    setUsdToCnyRate(Number(localUsdToCnyRate));
    setPreferDiscountedPrice(localPreferDiscountedPrice);
    setGrsaiCreditTierId(localGrsaiCreditTierId);
    setUiRadiusPreset(localUiRadiusPreset);
    setThemeTonePreset(localThemeTonePreset);
    setAccentColor(localAccentColor);
    setCanvasEdgeRoutingMode(localCanvasEdgeRoutingMode);
    setAutoCheckAppUpdateOnLaunch(localAutoCheckAppUpdateOnLaunch);
    setEnableUpdateDialog(localEnableUpdateDialog);
    onClose();
  }, [
    localApiKeys,
    localKlingAccessKey,
    localKlingEnabled,
    localKlingSecretKey,
    localVideoMaxConcurrent,
    localStoryboardPlanningSkillId,
    localDownloadPresetPaths,
    localGrsaiNanoBananaProModel,
    localDefaultImageModelId,
    localDefaultImageSize,
    localDefaultImageAspectRatio,
    localUseUploadFilenameAsNodeTitle,
    localStoryboardGenKeepStyleConsistent,
    localStoryboardGenDisableTextInImage,
    localStoryboardGenAutoInferEmptyFrame,
    localIgnoreAtTagWhenCopyingAndGenerating,
    localEnableStoryboardGenGridPreviewShortcut,
    localShowStoryboardGenAdvancedRatioControls,
    localShowNodePrice,
    localPriceDisplayCurrencyMode,
    localUsdToCnyRate,
    localPreferDiscountedPrice,
    localGrsaiCreditTierId,
    localUiRadiusPreset,
    localThemeTonePreset,
    localAccentColor,
    localCanvasEdgeRoutingMode,
    localAutoCheckAppUpdateOnLaunch,
    localEnableUpdateDialog,
    providers,
    setKlingSettings,
    setVideoConcurrencyMaxConcurrent,
    setProviderApiKey,
    setStoryboardPlanningSkillId,
    setGrsaiNanoBananaProModel,
    setDefaultImageModelId,
    setDefaultImageSize,
    setDefaultImageAspectRatio,
    setDownloadPresetPaths,
    setUseUploadFilenameAsNodeTitle,
    setStoryboardGenKeepStyleConsistent,
    setStoryboardGenDisableTextInImage,
    setStoryboardGenAutoInferEmptyFrame,
    setIgnoreAtTagWhenCopyingAndGenerating,
    setEnableStoryboardGenGridPreviewShortcut,
    setShowStoryboardGenAdvancedRatioControls,
    setShowNodePrice,
    setPriceDisplayCurrencyMode,
    setUsdToCnyRate,
    setPreferDiscountedPrice,
    setGrsaiCreditTierId,
    setUiRadiusPreset,
    setThemeTonePreset,
    setAccentColor,
    setCanvasEdgeRoutingMode,
    setAutoCheckAppUpdateOnLaunch,
    setEnableUpdateDialog,
    onClose,
  ]);

  const handleTestKlingConnection = useCallback(async () => {
    const accessKey = localKlingAccessKey.trim();
    const secretKey = localKlingSecretKey.trim();
    if (!accessKey || !secretKey) {
      setKlingConnectionStatus({
        tone: 'error',
        message: t('settings.klingTestMissingCredentials'),
      });
      return;
    }

    setKlingConnectionStatus({
      tone: 'loading',
      message: t('settings.klingTesting'),
    });

    try {
      await testKlingConnection({ accessKey, secretKey });
      setKlingConnectionStatus({
        tone: 'success',
        message: t('settings.klingTestSuccess'),
      });
    } catch (error) {
      setKlingConnectionStatus({
        tone: 'error',
        message:
          error instanceof Error ? error.message : t('settings.klingTestFailed'),
      });
    }
  }, [localKlingAccessKey, localKlingSecretKey, t]);

  const handlePickDownloadPath = useCallback(async () => {
    try {
      const selected = await openFileDialog({
        directory: true,
        multiple: false,
      });
      if (!selected) {
        return;
      }
      setLocalDownloadPresetPaths((previous) => {
        if (previous.includes(selected)) {
          return previous;
        }
        return [...previous, selected].slice(0, 8);
      });
    } catch (error) {
      console.error('Failed to pick download path', error);
    }
  }, []);

  const handleAddDownloadPathFromInput = useCallback(() => {
    const next = localDownloadPathInput.trim();
    if (!next) {
      return;
    }
    setLocalDownloadPresetPaths((previous) => {
      if (previous.includes(next)) {
        return previous;
      }
      return [...previous, next].slice(0, 8);
    });
    setLocalDownloadPathInput('');
  }, [localDownloadPathInput]);

  const handleRemoveDownloadPath = useCallback((path: string) => {
    setLocalDownloadPresetPaths((previous) => previous.filter((value) => value !== path));
  }, []);

  const handleMarkdownLinkClick = useCallback((href?: string) => {
    if (!href) {
      return;
    }
    void openUrl(href);
  }, []);

  if (!shouldRender) return null;

  return (
    <div className={`fixed ${UI_CONTENT_OVERLAY_INSET_CLASS} z-50 flex items-center justify-center`}>
      <div
        className={`absolute inset-0 bg-black/90 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div className="relative w-[min(96vw,1120px)]">
        <div
          className={`relative mx-auto h-[500px] w-[700px] overflow-hidden rounded-lg border border-border-dark bg-surface-dark shadow-xl transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'} flex`}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 hover:bg-bg-dark rounded transition-colors z-10"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>

          {/* Sidebar */}
          <div className="w-[180px] bg-bg-dark border-r border-border-dark flex flex-col">
            <div className="px-4 py-4">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                {t('settings.title')}
              </span>
            </div>

            <nav className="flex-1">
              <button
                onClick={() => setActiveCategory('skills')}
                className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-left
                transition-colors
                ${activeCategory === 'skills'
                    ? 'bg-accent/10 text-text-dark border-l-2 border-accent'
                    : 'text-text-muted hover:bg-bg-dark hover:text-text-dark'
                  }
              `}
              >
                <WandSparkles className="h-4 w-4 shrink-0" />
                <span className="text-sm">{t('settings.skills', { defaultValue: 'Skills' })}</span>
              </button>

              <button
                onClick={() => setActiveCategory('general')}
                className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-left
                transition-colors
                ${activeCategory === 'general'
                    ? 'bg-accent/10 text-text-dark border-l-2 border-accent'
                    : 'text-text-muted hover:bg-bg-dark hover:text-text-dark'
                  }
              `}
              >
                <span className="text-sm">{t('settings.general')}</span>
              </button>

              <button
                onClick={() => setActiveCategory('providers')}
                className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-left
                transition-colors
                ${activeCategory === 'providers'
                    ? 'bg-accent/10 text-text-dark border-l-2 border-accent'
                    : 'text-text-muted hover:bg-bg-dark hover:text-text-dark'
                  }
              `}
              >
                <span className="text-sm">{t('settings.providers')}</span>
              </button>

              <button
                onClick={() => setActiveCategory('appearance')}
                className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-left
                transition-colors
                ${activeCategory === 'appearance'
                    ? 'bg-accent/10 text-text-dark border-l-2 border-accent'
                    : 'text-text-muted hover:bg-bg-dark hover:text-text-dark'
                  }
              `}
              >
                <span className="text-sm">{t('settings.appearance')}</span>
              </button>

              <button
                onClick={() => setActiveCategory('pricing')}
                className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-left
                transition-colors
                ${activeCategory === 'pricing'
                    ? 'bg-accent/10 text-text-dark border-l-2 border-accent'
                    : 'text-text-muted hover:bg-bg-dark hover:text-text-dark'
                  }
              `}
              >
                <span className="text-sm">{t('settings.pricing')}</span>
              </button>

              <button
                onClick={() => setActiveCategory('experimental')}
                className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-left
                transition-colors
                ${activeCategory === 'experimental'
                    ? 'bg-accent/10 text-text-dark border-l-2 border-accent'
                    : 'text-text-muted hover:bg-bg-dark hover:text-text-dark'
                  }
              `}
              >
                <span className="text-sm">{t('settings.experimental')}</span>
              </button>

              <button
                onClick={() => setActiveCategory('about')}
                className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-left
                transition-colors
                ${activeCategory === 'about'
                    ? 'bg-accent/10 text-text-dark border-l-2 border-accent'
                    : 'text-text-muted hover:bg-bg-dark hover:text-text-dark'
                  }
              `}
              >
                <span className="text-sm">{t('settings.about')}</span>
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col">
            {activeCategory === 'skills' && (
              <>
                <div className="px-6 py-5 border-b border-border-dark">
                  <h2 className="text-lg font-semibold text-text-dark">
                    {t('settings.skills', { defaultValue: 'Skills' })}
                  </h2>
                  <p className="text-sm text-text-muted mt-1">
                    {t('settings.skillsDesc', {
                      defaultValue:
                        'Select the storyboard planning skill used before storyboard image generation.',
                    })}
                  </p>
                </div>

                <div className="ui-scrollbar flex-1 space-y-4 overflow-y-auto p-6">
                  <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                    <h3 className="text-sm font-medium text-text-dark">
                      {t('settings.storyboardPlanningSkill', {
                        defaultValue: 'Storyboard Planning Skill',
                      })}
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      {t('settings.storyboardPlanningSkillDesc', {
                        defaultValue:
                          'This skill controls how the script is analyzed into storyboard prompts.',
                      })}
                    </p>
                    <div className="mt-3">
                      <UiSelect
                        value={localStoryboardPlanningSkillId}
                        onChange={(event) =>
                          setLocalStoryboardPlanningSkillId(
                            event.target.value as typeof localStoryboardPlanningSkillId
                          )
                        }
                        className="h-9 text-sm"
                      >
                        {STORYBOARD_PLANNING_SKILLS.map((skill) => (
                          <option key={skill.id} value={skill.id}>
                            {skill.displayName}
                          </option>
                        ))}
                      </UiSelect>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-md bg-accent/10 p-2 text-accent">
                        <WandSparkles className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-text-dark">
                            {selectedStoryboardSkill.displayName}
                          </h3>
                          <span className="rounded border border-border-dark px-2 py-0.5 text-[10px] text-text-muted">
                            {selectedStoryboardSkill.id}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-text-muted">
                          {selectedStoryboardSkill.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end border-t border-border-dark px-6 py-4">
                  <button
                    onClick={handleSave}
                    className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </>
            )}

            {activeCategory === 'providers' && (
              <>
                <div className="px-6 py-5 border-b border-border-dark">
                  <h2 className="text-lg font-semibold text-text-dark">
                    {t('settings.providers')}
                  </h2>
                  <p className="text-sm text-text-muted mt-1">
                    {t('settings.providersDesc')}
                  </p>
                </div>

                <div className="ui-scrollbar flex-1 overflow-y-auto p-6 space-y-6">

                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="rounded border border-emerald-500/25 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-400">
                        VIDEO
                      </span>
                      <span className="text-xs text-text-muted">{t('settings.videoCategoryDesc')}</span>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                        <div className="mb-3">
                          <h3 className="text-sm font-medium text-text-dark">Kling</h3>
                          <p className="text-xs text-text-muted">{t('settings.klingProviderDesc')}</p>
                        </div>

                        <div className="space-y-3">
                          <label className="flex items-center gap-3 text-sm text-text-dark">
                            <UiCheckbox
                              checked={localKlingEnabled}
                              onCheckedChange={setLocalKlingEnabled}
                            />
                            <span>{t('settings.klingEnabled')}</span>
                          </label>

                          <div>
                            <div className="mb-1 text-xs text-text-muted">{t('settings.klingAccessKey')}</div>
                            <input
                              type="text"
                              value={localKlingAccessKey}
                              onChange={(event) => setLocalKlingAccessKey(event.target.value)}
                              placeholder={t('settings.enterApiKey')}
                              className="w-full rounded border border-border-dark bg-surface-dark px-3 py-2 text-sm text-text-dark placeholder:text-text-muted"
                            />
                          </div>

                          <div>
                            <div className="mb-1 text-xs text-text-muted">{t('settings.klingSecretKey')}</div>
                            <div className="relative">
                              <input
                                type={revealedKlingSecretKey ? 'text' : 'password'}
                                value={localKlingSecretKey}
                                onChange={(event) => setLocalKlingSecretKey(event.target.value)}
                                placeholder={t('settings.enterApiKey')}
                                className="w-full rounded border border-border-dark bg-surface-dark px-3 py-2 pr-10 text-sm text-text-dark placeholder:text-text-muted"
                              />
                              <button
                                type="button"
                                onClick={() => setRevealedKlingSecretKey((value) => !value)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-bg-dark"
                              >
                                {revealedKlingSecretKey
                                  ? <EyeOff className="h-4 w-4 text-text-muted" />
                                  : <Eye className="h-4 w-4 text-text-muted" />}
                              </button>
                            </div>
                          </div>

                          <div>
                            <div className="mb-1 text-xs text-text-muted">{t('settings.videoConcurrency')}</div>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={localVideoMaxConcurrent}
                              onChange={(event) => setLocalVideoMaxConcurrent(event.target.value)}
                              className="w-full rounded border border-border-dark bg-surface-dark px-3 py-2 text-sm text-text-dark placeholder:text-text-muted"
                            />
                            <p className="mt-1 text-[11px] text-text-muted">
                              {t('settings.videoConcurrencyDesc')}
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => { void handleTestKlingConnection(); }}
                              className="rounded border border-border-dark bg-surface-dark px-3 py-2 text-xs text-text-dark transition-colors hover:bg-bg-dark"
                            >
                              {t('settings.klingTestConnection')}
                            </button>
                            {klingConnectionStatus.message ? (
                              <span
                                className={`text-xs ${
                                  klingConnectionStatus.tone === 'success'
                                    ? 'text-emerald-400'
                                    : klingConnectionStatus.tone === 'error'
                                      ? 'text-red-300'
                                      : 'text-text-muted'
                                }`}
                              >
                                {klingConnectionStatus.message}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── LLM 分类 ─────────────────────────────────────── */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide bg-violet-500/15 text-violet-400 border border-violet-500/25">
                        LLM
                      </span>
                      <span className="text-xs text-text-muted">{t('settings.llmCategoryDesc')}</span>
                    </div>
                    <div className="space-y-3">
                  {LLM_PROVIDERS.map((provider) => {
                    const isRevealed = Boolean(revealedApiKeys[provider.id]);
                    return (
                      <div key={provider.id} className="rounded-lg border border-border-dark bg-bg-dark p-4">
                        <div className="mb-3">
                          <h3 className="text-sm font-medium text-text-dark">{provider.label}</h3>
                          <p className="text-xs text-text-muted">
                            {t('settings.providerApiKeyGuidePrefix')}{' '}
                            <a href={PROVIDER_REGISTER_URLS[provider.id]} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                              {t('settings.providerRegisterLink')}
                            </a>
                            {t('settings.providerApiKeyGuideMiddle')}{' '}
                            <a href={PROVIDER_GET_KEY_URLS[provider.id]} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                              {t('settings.getApiKeyLink')}
                            </a>
                          </p>
                          <p className="mt-1 text-[11px] text-text-muted/60">{t('settings.llmProviderNote')}</p>
                        </div>
                        <div className="relative">
                          <input
                            type={isRevealed ? 'text' : 'password'}
                            value={localApiKeys[provider.id] ?? ''}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setLocalApiKeys((previous) => ({ ...previous, [provider.id]: nextValue }));
                              setProviderApiKey(provider.id, nextValue);
                            }}
                            placeholder={t('settings.enterApiKey')}
                            className="w-full rounded border border-border-dark bg-surface-dark px-3 py-2 pr-10 text-sm text-text-dark placeholder:text-text-muted"
                          />
                          <button
                            type="button"
                            onClick={() => setRevealedApiKeys((previous) => ({ ...previous, [provider.id]: !isRevealed }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-bg-dark"
                          >
                            {isRevealed ? <EyeOff className="h-4 w-4 text-text-muted" /> : <Eye className="h-4 w-4 text-text-muted" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                    </div>
                  </div>

                  {/* ── 图像生成 分类 ─────────────────────────────────── */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide bg-blue-500/15 text-blue-400 border border-blue-500/25">
                        {t('settings.imageCategoryLabel')}
                      </span>
                      <span className="text-xs text-text-muted">{t('settings.imageCategoryDesc')}</span>
                    </div>
                    <div className="space-y-3">
                  {providers.map((provider) => {
                    const displayName = i18n.language.startsWith('zh') ? provider.label : provider.name;
                    const isRevealed = Boolean(revealedApiKeys[provider.id]);

                    return (
                      <div key={provider.id} className="rounded-lg border border-border-dark bg-bg-dark p-4">
                        <div className="mb-3">
                          <h3 className="text-sm font-medium text-text-dark">{displayName}</h3>
                          {PROVIDER_REGISTER_URLS[provider.id] && PROVIDER_GET_KEY_URLS[provider.id] ? (
                            <p className="text-xs text-text-muted">
                              {t('settings.providerApiKeyGuidePrefix')}{' '}
                              <a
                                href={PROVIDER_REGISTER_URLS[provider.id]}
                                target="_blank"
                                rel="noreferrer"
                                className="text-accent hover:underline"
                              >
                                {t('settings.providerRegisterLink')}
                              </a>
                              {t('settings.providerApiKeyGuideMiddle')}{' '}
                              <a
                                href={PROVIDER_GET_KEY_URLS[provider.id]}
                                target="_blank"
                                rel="noreferrer"
                                className="text-accent hover:underline"
                              >
                                {t('settings.getApiKeyLink')}
                              </a>
                            </p>
                          ) : (
                            <p className="text-xs text-text-muted">{provider.id}</p>
                          )}
                        </div>

                        <div className="relative">
                          <input
                            type={isRevealed ? 'text' : 'password'}
                            value={localApiKeys[provider.id] ?? ''}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setLocalApiKeys((previous) => ({
                                ...previous,
                                [provider.id]: nextValue,
                              }));
                              setProviderApiKey(provider.id, nextValue);
                            }}
                            placeholder={t('settings.enterApiKey')}
                            className="w-full rounded border border-border-dark bg-surface-dark px-3 py-2 pr-10 text-sm text-text-dark placeholder:text-text-muted"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedApiKeys((previous) => ({
                                ...previous,
                                [provider.id]: !isRevealed,
                              }))
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-bg-dark"
                          >
                            {isRevealed ? (
                              <EyeOff className="h-4 w-4 text-text-muted" />
                            ) : (
                              <Eye className="h-4 w-4 text-text-muted" />
                            )}
                          </button>
                        </div>

                        {provider.id === 'grsai' && (
                          <div className="mt-3">
                            <div className="mb-1 text-xs font-medium text-text-dark">
                              {t('settings.nanoBananaProModel')}
                            </div>
                            <p className="mb-2 text-xs text-text-muted">
                              <Trans
                                i18nKey="settings.nanoBananaProModelDesc"
                                components={{
                                  modelListLink: (
                                    <a
                                      href="https://grsai.com/zh/dashboard/models"
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-accent hover:underline"
                                    />
                                  ),
                                }}
                              />
                            </p>
                            <UiSelect
                              value={localGrsaiNanoBananaProModel}
                              onChange={(event) =>
                                setLocalGrsaiNanoBananaProModel(event.target.value)
                              }
                              className="h-9 text-sm"
                            >
                              {GRSAI_NANO_BANANA_PRO_MODEL_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </UiSelect>
                          </div>
                        )}
                      </div>
                    );
                  })}
                    </div>
                  </div>

                </div>

                <div className="px-6 py-4 border-t border-border-dark flex justify-end">
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 text-sm font-medium bg-accent text-white rounded
                             hover:bg-accent/80 transition-colors"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </>
            )}

            {activeCategory === 'appearance' && (
              <>
                <div className="px-6 py-5 border-b border-border-dark">
                  <h2 className="text-lg font-semibold text-text-dark">
                    {t('settings.appearance')}
                  </h2>
                  <p className="text-sm text-text-muted mt-1">
                    {t('settings.appearanceDesc')}
                  </p>
                </div>

                <div className="ui-scrollbar flex-1 space-y-4 overflow-y-auto p-6">
                  <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                    <h3 className="text-sm font-medium text-text-dark">
                      {t('settings.radiusPreset')}
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      {t('settings.radiusPresetDesc')}
                    </p>
                    <div className="mt-3">
                      <UiSelect
                        value={localUiRadiusPreset}
                        onChange={(event) =>
                          setLocalUiRadiusPreset(event.target.value as typeof localUiRadiusPreset)
                        }
                        className="h-9 text-sm"
                      >
                        <option value="compact">{t('settings.radiusCompact')}</option>
                        <option value="default">{t('settings.radiusDefault')}</option>
                        <option value="large">{t('settings.radiusLarge')}</option>
                      </UiSelect>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                    <h3 className="text-sm font-medium text-text-dark">
                      {t('settings.themeTone')}
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      {t('settings.themeToneDesc')}
                    </p>
                    <div className="mt-3">
                      <UiSelect
                        value={localThemeTonePreset}
                        onChange={(event) =>
                          setLocalThemeTonePreset(event.target.value as typeof localThemeTonePreset)
                        }
                        className="h-9 text-sm"
                      >
                        <option value="neutral">{t('settings.toneNeutral')}</option>
                        <option value="warm">{t('settings.toneWarm')}</option>
                        <option value="cool">{t('settings.toneCool')}</option>
                      </UiSelect>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                    <h3 className="text-sm font-medium text-text-dark">
                      {t('settings.edgeRoutingMode')}
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      {t('settings.edgeRoutingModeDesc')}
                    </p>
                    <div className="mt-3">
                      <UiSelect
                        value={localCanvasEdgeRoutingMode}
                        onChange={(event) =>
                          setLocalCanvasEdgeRoutingMode(
                            event.target.value as typeof localCanvasEdgeRoutingMode
                          )
                        }
                        className="h-9 text-sm"
                      >
                        <option value="spline">{t('settings.edgeRoutingSpline')}</option>
                        <option value="orthogonal">{t('settings.edgeRoutingOrthogonal')}</option>
                        <option value="smartOrthogonal">{t('settings.edgeRoutingSmartOrthogonal')}</option>
                      </UiSelect>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                    <h3 className="text-sm font-medium text-text-dark">
                      {t('settings.accentColor')}
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      {t('settings.accentColorDesc')}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="color"
                        value={localAccentColor}
                        onChange={(event) => setLocalAccentColor(event.target.value)}
                        className="h-9 w-12 rounded border border-border-dark bg-surface-dark p-1"
                      />
                      <input
                        value={localAccentColor}
                        onChange={(event) => setLocalAccentColor(event.target.value)}
                        placeholder="#3B82F6"
                        className="h-9 flex-1 rounded border border-border-dark bg-surface-dark px-3 text-sm text-text-dark outline-none placeholder:text-text-muted"
                      />
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded border border-border-dark bg-surface-dark px-3 text-xs text-text-dark transition-colors hover:bg-bg-dark"
                        onClick={() => setLocalAccentColor('#3B82F6')}
                      >
                        {t('settings.resetAccentColor')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end border-t border-border-dark px-6 py-4">
                  <button
                    onClick={handleSave}
                    className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </>
            )}

            {activeCategory === 'pricing' && (
              <>
                <div className="px-6 py-5 border-b border-border-dark">
                  <h2 className="text-lg font-semibold text-text-dark">
                    {t('settings.pricing')}
                  </h2>
                  <p className="text-sm text-text-muted mt-1">
                    {t('settings.pricingDesc')}
                  </p>
                </div>

                <div className="ui-scrollbar flex-1 space-y-4 overflow-y-auto p-6">
                  <SettingsCheckboxCard
                    checked={localShowNodePrice}
                    onCheckedChange={setLocalShowNodePrice}
                    title={t('settings.showNodePrice')}
                    description={t('settings.showNodePriceDesc')}
                  />

                  <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                    <h3 className="text-sm font-medium text-text-dark">
                      {t('settings.priceDisplayCurrencyMode')}
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      {t('settings.priceDisplayCurrencyModeDesc')}
                    </p>
                    <div className="mt-3">
                      <UiSelect
                        value={localPriceDisplayCurrencyMode}
                        onChange={(event) =>
                          setLocalPriceDisplayCurrencyMode(
                            event.target.value as typeof localPriceDisplayCurrencyMode
                          )
                        }
                        className="h-9 text-sm"
                      >
                        <option value="auto">{t('settings.priceCurrencyAuto')}</option>
                        <option value="cny">{t('settings.priceCurrencyCny')}</option>
                        <option value="usd">{t('settings.priceCurrencyUsd')}</option>
                      </UiSelect>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                    <h3 className="text-sm font-medium text-text-dark">
                      {t('settings.usdToCnyRate')}
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      {t('settings.usdToCnyRateDesc')}
                    </p>
                    <div className="mt-3">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={localUsdToCnyRate}
                        onChange={(event) => setLocalUsdToCnyRate(event.target.value)}
                        className="h-9 w-full rounded border border-border-dark bg-surface-dark px-3 text-sm text-text-dark outline-none placeholder:text-text-muted"
                      />
                    </div>
                  </div>

                  <SettingsCheckboxCard
                    checked={localPreferDiscountedPrice}
                    onCheckedChange={setLocalPreferDiscountedPrice}
                    title={t('settings.preferDiscountedPrice')}
                    description={t('settings.preferDiscountedPriceDesc')}
                  />

                  <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                    <h3 className="text-sm font-medium text-text-dark">
                      {t('settings.grsaiCreditTier')}
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      {t('settings.grsaiCreditTierDesc')}
                    </p>
                    <div className="mt-3">
                      <UiSelect
                        value={localGrsaiCreditTierId}
                        onChange={(event) =>
                          setLocalGrsaiCreditTierId(event.target.value as typeof localGrsaiCreditTierId)
                        }
                        className="h-9 text-sm"
                      >
                        {GRSAI_CREDIT_TIERS.map((tier) => (
                          <option key={tier.id} value={tier.id}>
                            {t('settings.grsaiCreditTierOption', {
                              price: tier.priceCny.toFixed(2),
                              credits: tier.credits.toLocaleString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'),
                            })}
                          </option>
                        ))}
                      </UiSelect>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end border-t border-border-dark px-6 py-4">
                  <button
                    onClick={handleSave}
                    className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </>
            )}

            {activeCategory === 'general' && (
              <>
                <div className="px-6 py-5 border-b border-border-dark">
                  <h2 className="text-lg font-semibold text-text-dark">
                    {t('settings.general')}
                  </h2>
                  <p className="text-sm text-text-muted mt-1">
                    {t('settings.generalDesc')}
                  </p>
                </div>

                <div className="ui-scrollbar flex-1 space-y-4 overflow-y-auto p-6">
                  <SettingsCheckboxCard
                    checked={localStoryboardGenKeepStyleConsistent}
                    onCheckedChange={setLocalStoryboardGenKeepStyleConsistent}
                    title={t('settings.storyboardGenKeepStyleConsistent')}
                    description={t('settings.storyboardGenKeepStyleConsistentDesc')}
                  />

                  <SettingsCheckboxCard
                    checked={localIgnoreAtTagWhenCopyingAndGenerating}
                    onCheckedChange={setLocalIgnoreAtTagWhenCopyingAndGenerating}
                    title={t('settings.ignoreAtTagWhenCopyingAndGenerating')}
                    description={t('settings.ignoreAtTagWhenCopyingAndGeneratingDesc')}
                  />

                  <SettingsCheckboxCard
                    checked={localStoryboardGenDisableTextInImage}
                    onCheckedChange={setLocalStoryboardGenDisableTextInImage}
                    title={t('settings.storyboardGenDisableTextInImage')}
                    description={t('settings.storyboardGenDisableTextInImageDesc')}
                  />

                  <SettingsCheckboxCard
                    checked={localUseUploadFilenameAsNodeTitle}
                    onCheckedChange={setLocalUseUploadFilenameAsNodeTitle}
                    title={t('settings.useUploadFilenameAsNodeTitle')}
                    description={t('settings.useUploadFilenameAsNodeTitleDesc')}
                  />

                  <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                    <h3 className="text-sm font-medium text-text-dark">
                      {t('settings.projectDefaults')}
                    </h3>
                    <p className="mt-1 text-xs text-text-muted">
                      {t('settings.projectDefaultsDesc')}
                    </p>

                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-text-muted">
                          {t('modelParams.model')}
                        </label>
                        <UiSelect
                          value={localDefaultImageModelId}
                          onChange={(event) => {
                            const nextModelId = event.target.value;
                            const nextModel = imageModels.find((model) => model.id === nextModelId);
                            setLocalDefaultImageModelId(nextModelId);
                            if (nextModel) {
                              setLocalDefaultImageSize(nextModel.defaultResolution);
                              setLocalDefaultImageAspectRatio(nextModel.defaultAspectRatio);
                            }
                          }}
                          className="h-9 text-sm"
                        >
                          {imageModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.displayName}
                            </option>
                          ))}
                        </UiSelect>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-text-muted">
                          {t('node.imageNode.size')}
                        </label>
                        <UiSelect
                          value={localDefaultImageSize}
                          onChange={(event) => setLocalDefaultImageSize(event.target.value)}
                          className="h-9 text-sm"
                        >
                          {(selectedDefaultImageModel?.resolutions ?? []).map((resolution) => (
                            <option key={resolution.value} value={resolution.value}>
                              {resolution.label}
                            </option>
                          ))}
                        </UiSelect>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-text-muted">
                          {t('modelParams.aspectRatio')}
                        </label>
                        <UiSelect
                          value={localDefaultImageAspectRatio}
                          onChange={(event) => setLocalDefaultImageAspectRatio(event.target.value)}
                          className="h-9 text-sm"
                        >
                          <option value="auto">{t('modelParams.autoAspectRatio')}</option>
                          {(selectedDefaultImageModel?.aspectRatios ?? []).map((aspectRatio) => (
                            <option key={aspectRatio.value} value={aspectRatio.value}>
                              {aspectRatio.label}
                            </option>
                          ))}
                        </UiSelect>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                    <div className="mb-3">
                      <h3 className="text-sm font-medium text-text-dark">
                        {t('settings.downloadPresetPaths')}
                      </h3>
                      <p className="mt-1 text-xs text-text-muted">
                        {t('settings.downloadPresetPathsDesc')}
                      </p>
                    </div>

                    <div className="mb-2 flex items-center gap-2">
                      <input
                        value={localDownloadPathInput}
                        onChange={(event) => setLocalDownloadPathInput(event.target.value)}
                        placeholder={t('settings.downloadPathPlaceholder')}
                        className="h-9 flex-1 rounded border border-border-dark bg-surface-dark px-3 text-sm text-text-dark outline-none placeholder:text-text-muted"
                      />
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded border border-border-dark bg-surface-dark px-3 text-xs text-text-dark transition-colors hover:bg-bg-dark"
                        onClick={handleAddDownloadPathFromInput}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {t('settings.addPath')}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded border border-border-dark bg-surface-dark px-3 text-xs text-text-dark transition-colors hover:bg-bg-dark"
                        onClick={() => {
                          void handlePickDownloadPath();
                        }}
                      >
                        <FolderOpen className="mr-1 h-3.5 w-3.5" />
                        {t('settings.chooseFolder')}
                      </button>
                    </div>

                    <div className="space-y-1">
                      {localDownloadPresetPaths.length > 0 ? (
                        localDownloadPresetPaths.map((path) => (
                          <div
                            key={path}
                            className="flex items-center gap-2 rounded border border-border-dark bg-surface-dark px-2 py-1.5"
                          >
                            <span className="truncate text-xs text-text-dark">{path}</span>
                            <button
                              type="button"
                              className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-dark hover:text-text-dark"
                              onClick={() => handleRemoveDownloadPath(path)}
                              title={t('common.delete')}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-text-muted">{t('settings.noDownloadPresetPaths')}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end border-t border-border-dark px-6 py-4">
                  <button
                    onClick={handleSave}
                    className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </>
            )}

            {activeCategory === 'experimental' && (
              <>
                <div className="px-6 py-5 border-b border-border-dark">
                  <h2 className="text-lg font-semibold text-text-dark">
                    {t('settings.experimental')}
                  </h2>
                  <p className="text-sm text-text-muted mt-1">
                    {t('settings.experimentalDesc')}
                  </p>
                </div>

                <div className="ui-scrollbar flex-1 space-y-4 overflow-y-auto p-6">
                  <SettingsCheckboxCard
                    checked={localEnableStoryboardGenGridPreviewShortcut}
                    onCheckedChange={setLocalEnableStoryboardGenGridPreviewShortcut}
                    title={t('settings.enableStoryboardGenGridPreviewShortcut')}
                    description={t('settings.enableStoryboardGenGridPreviewShortcutDesc')}
                  />

                  <SettingsCheckboxCard
                    checked={localShowStoryboardGenAdvancedRatioControls}
                    onCheckedChange={setLocalShowStoryboardGenAdvancedRatioControls}
                    title={t('settings.showStoryboardGenAdvancedRatioControls')}
                    description={t('settings.showStoryboardGenAdvancedRatioControlsDesc')}
                  />

                  <SettingsCheckboxCard
                    checked={localStoryboardGenAutoInferEmptyFrame}
                    onCheckedChange={setLocalStoryboardGenAutoInferEmptyFrame}
                    title={t('settings.storyboardGenAutoInferEmptyFrame')}
                    description={t('settings.storyboardGenAutoInferEmptyFrameDesc')}
                  />
                </div>

                <div className="flex justify-end border-t border-border-dark px-6 py-4">
                  <button
                    onClick={handleSave}
                    className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </>
            )}

            {activeCategory === 'about' && (
              <>
                <div className="px-6 py-5 border-b border-border-dark">
                  <h2 className="text-lg font-semibold text-text-dark">
                    {t('settings.about')}
                  </h2>
                </div>

                <div className="ui-scrollbar flex-1 space-y-4 overflow-y-auto p-6">
                  <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                    <div className="flex items-start gap-4">
                      <img
                        src="/app-icon.png"
                        alt="Infinite Canvas"
                        className="h-14 w-14 rounded-lg border border-border-dark object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-text-dark">
                          {t('settings.aboutAppName')}
                        </p>
                        <p className="mt-1 text-sm text-text-muted">
                          {t('settings.aboutVersionLabel')}: {appVersion || '-'}
                        </p>
                        <p className="mt-1 text-sm text-text-muted">
                          {t('settings.aboutAuthorLabel')}: He Yanzu
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end border-t border-border-dark px-6 py-4">
                  <div className="flex gap-2">
                    <button
                      onClick={onClose}
                      className="rounded border border-border-dark px-4 py-2 text-sm font-medium text-text-dark transition-colors hover:bg-bg-dark"
                    >
                      {t('common.close')}
                    </button>
                    <button
                      onClick={handleSave}
                      className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
                    >
                      {t('common.save')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {activeCategory === 'providers' && !hideProviderGuidePopover && (
          <div
            className={`absolute top-0 bottom-0 left-[calc(50%+366px)] right-0 min-w-[240px] max-w-[380px] rounded-lg border border-border-dark bg-surface-dark/95 p-3 shadow-xl transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
          >
            <div className="markdown-body break-words text-xs leading-5 text-text-muted [&_a]:text-accent [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-semibold [&_hr]:border-white/10 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-0 [&_p+_p]:mt-4 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-black/30 [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-4">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  a: ({ href, children, ...props }) => (
                    <a
                      {...props}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => {
                        event.preventDefault();
                        handleMarkdownLinkClick(href);
                      }}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {providerGuideMarkdown}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
