import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_GRSAI_CREDIT_TIER_ID,
  PRICE_DISPLAY_CURRENCY_MODES,
  type GrsaiCreditTierId,
  type PriceDisplayCurrencyMode,
} from '@/features/canvas/pricing/types';
import {
  DEFAULT_STORYBOARD_PLANNING_SKILL_ID,
  STORYBOARD_PLANNING_SKILLS,
} from '@/features/storyboard-skills';

export type UiRadiusPreset = 'compact' | 'default' | 'large';
export type ThemeTonePreset = 'neutral' | 'warm' | 'cool';
export type CanvasEdgeRoutingMode = 'spline' | 'orthogonal' | 'smartOrthogonal';
export type ProviderApiKeys = Record<string, string>;
export const DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL = 'nano-banana-pro';
export const DEFAULT_PROJECT_IMAGE_MODEL_ID = 'kie/nano-banana-2';
export const DEFAULT_PROJECT_IMAGE_SIZE = '2K';
export const DEFAULT_PROJECT_IMAGE_ASPECT_RATIO = 'auto';
export const DEFAULT_ACCENT_COLOR = 'var(--accent)';
export type StoryboardPlanningSkillId = (typeof STORYBOARD_PLANNING_SKILLS)[number]['id'];

export interface KlingSettings {
  accessKey?: string;
  secretKey?: string;
  enabled: boolean;
}

export interface VideoConcurrencySettings {
  maxConcurrent: number;
}

interface SettingsState {
  isHydrated: boolean;
  apiKeys: ProviderApiKeys;
  kling: KlingSettings;
  videoConcurrency: VideoConcurrencySettings;
  storyboardPlanningSkillId: StoryboardPlanningSkillId;
  grsaiNanoBananaProModel: string;
  defaultImageModelId: string;
  defaultImageSize: string;
  defaultImageAspectRatio: string;
  hideProviderGuidePopover: boolean;
  downloadPresetPaths: string[];
  useUploadFilenameAsNodeTitle: boolean;
  storyboardGenKeepStyleConsistent: boolean;
  storyboardGenDisableTextInImage: boolean;
  storyboardGenAutoInferEmptyFrame: boolean;
  ignoreAtTagWhenCopyingAndGenerating: boolean;
  enableStoryboardGenGridPreviewShortcut: boolean;
  showStoryboardGenAdvancedRatioControls: boolean;
  showNodePrice: boolean;
  priceDisplayCurrencyMode: PriceDisplayCurrencyMode;
  usdToCnyRate: number;
  preferDiscountedPrice: boolean;
  grsaiCreditTierId: GrsaiCreditTierId;
  uiRadiusPreset: UiRadiusPreset;
  themeTonePreset: ThemeTonePreset;
  accentColor: string;
  canvasEdgeRoutingMode: CanvasEdgeRoutingMode;
  autoCheckAppUpdateOnLaunch: boolean;
  enableUpdateDialog: boolean;
  setKlingSettings: (settings: Partial<KlingSettings>) => void;
  setVideoConcurrencyMaxConcurrent: (value: number) => void;
  setProviderApiKey: (providerId: string, key: string) => void;
  setStoryboardPlanningSkillId: (skillId: StoryboardPlanningSkillId) => void;
  setGrsaiNanoBananaProModel: (model: string) => void;
  setDefaultImageModelId: (modelId: string) => void;
  setDefaultImageSize: (size: string) => void;
  setDefaultImageAspectRatio: (aspectRatio: string) => void;
  setHideProviderGuidePopover: (hide: boolean) => void;
  setDownloadPresetPaths: (paths: string[]) => void;
  setUseUploadFilenameAsNodeTitle: (enabled: boolean) => void;
  setStoryboardGenKeepStyleConsistent: (enabled: boolean) => void;
  setStoryboardGenDisableTextInImage: (enabled: boolean) => void;
  setStoryboardGenAutoInferEmptyFrame: (enabled: boolean) => void;
  setIgnoreAtTagWhenCopyingAndGenerating: (enabled: boolean) => void;
  setEnableStoryboardGenGridPreviewShortcut: (enabled: boolean) => void;
  setShowStoryboardGenAdvancedRatioControls: (enabled: boolean) => void;
  setShowNodePrice: (enabled: boolean) => void;
  setPriceDisplayCurrencyMode: (mode: PriceDisplayCurrencyMode) => void;
  setUsdToCnyRate: (rate: number) => void;
  setPreferDiscountedPrice: (enabled: boolean) => void;
  setGrsaiCreditTierId: (tierId: GrsaiCreditTierId) => void;
  setUiRadiusPreset: (preset: UiRadiusPreset) => void;
  setThemeTonePreset: (preset: ThemeTonePreset) => void;
  setAccentColor: (color: string) => void;
  setCanvasEdgeRoutingMode: (mode: CanvasEdgeRoutingMode) => void;
  setAutoCheckAppUpdateOnLaunch: (enabled: boolean) => void;
  setEnableUpdateDialog: (enabled: boolean) => void;
}

const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/;

function normalizeHexColor(input: string): string {
  const trimmed = input.trim();
  if (trimmed === DEFAULT_ACCENT_COLOR) {
    return DEFAULT_ACCENT_COLOR;
  }
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return DEFAULT_ACCENT_COLOR;
  }
  return trimmed.startsWith('#') ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
}

function normalizeApiKey(input: string): string {
  return input.trim();
}

function normalizeKlingSettings(input: Partial<KlingSettings> | null | undefined): KlingSettings {
  return {
    accessKey: normalizeApiKey(input?.accessKey ?? ''),
    secretKey: normalizeApiKey(input?.secretKey ?? ''),
    enabled: Boolean(input?.enabled),
  };
}

function normalizeVideoConcurrencyMaxConcurrent(input: number | string | null | undefined): number {
  const numeric = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(numeric)) {
    return 3;
  }
  return Math.min(10, Math.max(1, Math.round(numeric)));
}

function normalizePriceDisplayCurrencyMode(
  input: PriceDisplayCurrencyMode | string | null | undefined
): PriceDisplayCurrencyMode {
  return PRICE_DISPLAY_CURRENCY_MODES.includes(input as PriceDisplayCurrencyMode)
    ? (input as PriceDisplayCurrencyMode)
    : 'auto';
}

function normalizeUsdToCnyRate(input: number | string | null | undefined): number {
  const numeric = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 7.2;
  }

  return Math.min(100, Math.max(0.01, Math.round(numeric * 100) / 100));
}

function normalizeGrsaiCreditTierId(
  input: GrsaiCreditTierId | string | null | undefined
): GrsaiCreditTierId {
  switch (input) {
    case 'tier-10':
    case 'tier-20':
    case 'tier-49':
    case 'tier-99':
    case 'tier-499':
    case 'tier-999':
      return input;
    default:
      return DEFAULT_GRSAI_CREDIT_TIER_ID;
  }
}

function normalizeGrsaiNanoBananaProModel(input: string | null | undefined): string {
  const trimmed = (input ?? '').trim().toLowerCase();
  if (trimmed === DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL || trimmed.startsWith('nano-banana-pro-')) {
    return trimmed;
  }
  return DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL;
}

function normalizeDefaultImageModelId(input: string | null | undefined): string {
  const trimmed = (input ?? '').trim();
  return trimmed || DEFAULT_PROJECT_IMAGE_MODEL_ID;
}

function normalizeDefaultImageSize(input: string | null | undefined): string {
  const trimmed = (input ?? '').trim();
  return trimmed || DEFAULT_PROJECT_IMAGE_SIZE;
}

function normalizeDefaultImageAspectRatio(input: string | null | undefined): string {
  const trimmed = (input ?? '').trim();
  return trimmed || DEFAULT_PROJECT_IMAGE_ASPECT_RATIO;
}

function normalizeCanvasEdgeRoutingMode(
  input: CanvasEdgeRoutingMode | string | null | undefined
): CanvasEdgeRoutingMode {
  if (input === 'orthogonal' || input === 'smartOrthogonal' || input === 'spline') {
    return input;
  }
  return 'spline';
}

function normalizeStoryboardPlanningSkillId(
  input: StoryboardPlanningSkillId | string | null | undefined
): StoryboardPlanningSkillId {
  const normalized = (input ?? '').trim();
  return (
    STORYBOARD_PLANNING_SKILLS.find((skill) => skill.id === normalized)?.id
    ?? DEFAULT_STORYBOARD_PLANNING_SKILL_ID
  );
}

function normalizeApiKeys(input: ProviderApiKeys | null | undefined): ProviderApiKeys {
  if (!input) {
    return {};
  }

  return Object.entries(input).reduce<ProviderApiKeys>((acc, [providerId, key]) => {
    const normalizedProviderId = providerId.trim();
    if (!normalizedProviderId) {
      return acc;
    }

    acc[normalizedProviderId] = normalizeApiKey(key);
    return acc;
  }, {});
}

export function hasConfiguredApiKey(apiKeys: ProviderApiKeys): boolean {
  return getConfiguredApiKeyCount(apiKeys) > 0;
}

export function getConfiguredApiKeyCount(
  apiKeys: ProviderApiKeys,
  providerIds?: readonly string[]
): number {
  const keysToCount = providerIds
    ? providerIds.map((providerId) => apiKeys[providerId] ?? '')
    : Object.values(apiKeys);

  return keysToCount.reduce((count, key) => {
    return normalizeApiKey(key).length > 0 ? count + 1 : count;
  }, 0);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      isHydrated: false,
      apiKeys: {},
      kling: {
        accessKey: '',
        secretKey: '',
        enabled: false,
      },
      videoConcurrency: {
        maxConcurrent: 3,
      },
      storyboardPlanningSkillId: DEFAULT_STORYBOARD_PLANNING_SKILL_ID,
      grsaiNanoBananaProModel: DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL,
      defaultImageModelId: DEFAULT_PROJECT_IMAGE_MODEL_ID,
      defaultImageSize: DEFAULT_PROJECT_IMAGE_SIZE,
      defaultImageAspectRatio: DEFAULT_PROJECT_IMAGE_ASPECT_RATIO,
      hideProviderGuidePopover: false,
      downloadPresetPaths: [],
      useUploadFilenameAsNodeTitle: true,
      storyboardGenKeepStyleConsistent: true,
      storyboardGenDisableTextInImage: true,
      storyboardGenAutoInferEmptyFrame: true,
      ignoreAtTagWhenCopyingAndGenerating: true,
      enableStoryboardGenGridPreviewShortcut: false,
      showStoryboardGenAdvancedRatioControls: false,
      showNodePrice: true,
      priceDisplayCurrencyMode: 'auto',
      usdToCnyRate: 7.2,
      preferDiscountedPrice: false,
      grsaiCreditTierId: DEFAULT_GRSAI_CREDIT_TIER_ID,
      uiRadiusPreset: 'default',
      themeTonePreset: 'neutral',
      accentColor: DEFAULT_ACCENT_COLOR,
      canvasEdgeRoutingMode: 'spline',
      autoCheckAppUpdateOnLaunch: true,
      enableUpdateDialog: true,
      setKlingSettings: (settings) =>
        set((state) => ({
          kling: {
            ...state.kling,
            ...normalizeKlingSettings(settings),
          },
        })),
      setVideoConcurrencyMaxConcurrent: (value) =>
        set({
          videoConcurrency: {
            maxConcurrent: normalizeVideoConcurrencyMaxConcurrent(value),
          },
        }),
      setProviderApiKey: (providerId, key) =>
        set((state) => ({
          apiKeys: {
            ...state.apiKeys,
            [providerId]: normalizeApiKey(key),
          },
        })),
      setStoryboardPlanningSkillId: (storyboardPlanningSkillId) =>
        set({
          storyboardPlanningSkillId:
            normalizeStoryboardPlanningSkillId(storyboardPlanningSkillId),
        }),
      setGrsaiNanoBananaProModel: (model) =>
        set({
          grsaiNanoBananaProModel: normalizeGrsaiNanoBananaProModel(model),
        }),
      setDefaultImageModelId: (modelId) =>
        set({ defaultImageModelId: normalizeDefaultImageModelId(modelId) }),
      setDefaultImageSize: (size) =>
        set({ defaultImageSize: normalizeDefaultImageSize(size) }),
      setDefaultImageAspectRatio: (aspectRatio) =>
        set({ defaultImageAspectRatio: normalizeDefaultImageAspectRatio(aspectRatio) }),
      setHideProviderGuidePopover: (hide) => set({ hideProviderGuidePopover: hide }),
      setDownloadPresetPaths: (paths) => {
        const uniquePaths = Array.from(
          new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))
        ).slice(0, 8);
        set({ downloadPresetPaths: uniquePaths });
      },
      setUseUploadFilenameAsNodeTitle: (enabled) => set({ useUploadFilenameAsNodeTitle: enabled }),
      setStoryboardGenKeepStyleConsistent: (enabled) =>
        set({ storyboardGenKeepStyleConsistent: enabled }),
      setStoryboardGenDisableTextInImage: (enabled) =>
        set({ storyboardGenDisableTextInImage: enabled }),
      setStoryboardGenAutoInferEmptyFrame: (enabled) =>
        set({ storyboardGenAutoInferEmptyFrame: enabled }),
      setIgnoreAtTagWhenCopyingAndGenerating: (enabled) =>
        set({ ignoreAtTagWhenCopyingAndGenerating: enabled }),
      setEnableStoryboardGenGridPreviewShortcut: (enabled) =>
        set({ enableStoryboardGenGridPreviewShortcut: enabled }),
      setShowStoryboardGenAdvancedRatioControls: (enabled) =>
        set({ showStoryboardGenAdvancedRatioControls: enabled }),
      setShowNodePrice: (enabled) => set({ showNodePrice: enabled }),
      setPriceDisplayCurrencyMode: (priceDisplayCurrencyMode) =>
        set({
          priceDisplayCurrencyMode:
            normalizePriceDisplayCurrencyMode(priceDisplayCurrencyMode),
        }),
      setUsdToCnyRate: (usdToCnyRate) =>
        set({ usdToCnyRate: normalizeUsdToCnyRate(usdToCnyRate) }),
      setPreferDiscountedPrice: (enabled) => set({ preferDiscountedPrice: enabled }),
      setGrsaiCreditTierId: (grsaiCreditTierId) =>
        set({ grsaiCreditTierId: normalizeGrsaiCreditTierId(grsaiCreditTierId) }),
      setUiRadiusPreset: (uiRadiusPreset) => set({ uiRadiusPreset }),
      setThemeTonePreset: (themeTonePreset) => set({ themeTonePreset }),
      setAccentColor: (color) => set({ accentColor: normalizeHexColor(color) }),
      setCanvasEdgeRoutingMode: (canvasEdgeRoutingMode) =>
        set({ canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(canvasEdgeRoutingMode) }),
      setAutoCheckAppUpdateOnLaunch: (enabled) => set({ autoCheckAppUpdateOnLaunch: enabled }),
      setEnableUpdateDialog: (enabled) => set({ enableUpdateDialog: enabled }),
    }),
    {
      name: 'settings-storage',
      version: 10,
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) {
            console.error('failed to hydrate settings storage', error);
          }
          // Defer to avoid circular reference during store initialization
          queueMicrotask(() => {
            useSettingsStore.setState({ isHydrated: true });
          });
        };
      },
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as {
          apiKey?: string;
          apiKeys?: ProviderApiKeys;
          kling?: Partial<KlingSettings>;
          videoConcurrency?: Partial<VideoConcurrencySettings>;
          storyboardPlanningSkillId?: StoryboardPlanningSkillId | string;
          ignoreAtTagWhenCopyingAndGenerating?: boolean;
          grsaiNanoBananaProModel?: string;
          defaultImageModelId?: string;
          defaultImageSize?: string;
          defaultImageAspectRatio?: string;
          hideProviderGuidePopover?: boolean;
          canvasEdgeRoutingMode?: CanvasEdgeRoutingMode | string;
          autoCheckAppUpdateOnLaunch?: boolean;
          enableUpdateDialog?: boolean;
          enableStoryboardGenGridPreviewShortcut?: boolean;
          showStoryboardGenAdvancedRatioControls?: boolean;
          storyboardGenAutoInferEmptyFrame?: boolean;
          showNodePrice?: boolean;
          priceDisplayCurrencyMode?: PriceDisplayCurrencyMode | string;
          usdToCnyRate?: number | string;
          preferDiscountedPrice?: boolean;
          grsaiCreditTierId?: GrsaiCreditTierId | string;
        };

        const migratedApiKeys = normalizeApiKeys(state.apiKeys);
        const ignoreAtTagWhenCopyingAndGenerating =
          state.ignoreAtTagWhenCopyingAndGenerating ?? true;
        if (Object.keys(migratedApiKeys).length > 0) {
          return {
            ...(persistedState as object),
            isHydrated: true,
            apiKeys: migratedApiKeys,
            kling: normalizeKlingSettings(state.kling),
            videoConcurrency: {
              maxConcurrent: normalizeVideoConcurrencyMaxConcurrent(
                state.videoConcurrency?.maxConcurrent
              ),
            },
            storyboardPlanningSkillId: normalizeStoryboardPlanningSkillId(
              state.storyboardPlanningSkillId
            ),
            ignoreAtTagWhenCopyingAndGenerating,
            grsaiNanoBananaProModel: normalizeGrsaiNanoBananaProModel(
              state.grsaiNanoBananaProModel
            ),
            defaultImageModelId: normalizeDefaultImageModelId(state.defaultImageModelId),
            defaultImageSize: normalizeDefaultImageSize(state.defaultImageSize),
            defaultImageAspectRatio: normalizeDefaultImageAspectRatio(
              state.defaultImageAspectRatio
            ),
            hideProviderGuidePopover: state.hideProviderGuidePopover ?? false,
            canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(state.canvasEdgeRoutingMode),
            autoCheckAppUpdateOnLaunch: state.autoCheckAppUpdateOnLaunch ?? true,
            enableUpdateDialog: state.enableUpdateDialog ?? true,
            enableStoryboardGenGridPreviewShortcut:
              state.enableStoryboardGenGridPreviewShortcut ?? false,
            showStoryboardGenAdvancedRatioControls:
              state.showStoryboardGenAdvancedRatioControls ?? false,
            storyboardGenAutoInferEmptyFrame: state.storyboardGenAutoInferEmptyFrame ?? true,
            showNodePrice: state.showNodePrice ?? true,
            priceDisplayCurrencyMode: normalizePriceDisplayCurrencyMode(
              state.priceDisplayCurrencyMode
            ),
            usdToCnyRate: normalizeUsdToCnyRate(state.usdToCnyRate),
            preferDiscountedPrice: state.preferDiscountedPrice ?? false,
            grsaiCreditTierId: normalizeGrsaiCreditTierId(state.grsaiCreditTierId),
          };
        }

        return {
          ...(persistedState as object),
          isHydrated: true,
          apiKeys: state.apiKey ? { ppio: normalizeApiKey(state.apiKey) } : {},
          kling: normalizeKlingSettings(state.kling),
          videoConcurrency: {
            maxConcurrent: normalizeVideoConcurrencyMaxConcurrent(
              state.videoConcurrency?.maxConcurrent
            ),
          },
          storyboardPlanningSkillId: normalizeStoryboardPlanningSkillId(
            state.storyboardPlanningSkillId
          ),
          ignoreAtTagWhenCopyingAndGenerating,
          grsaiNanoBananaProModel: normalizeGrsaiNanoBananaProModel(
            state.grsaiNanoBananaProModel
          ),
          defaultImageModelId: normalizeDefaultImageModelId(state.defaultImageModelId),
          defaultImageSize: normalizeDefaultImageSize(state.defaultImageSize),
          defaultImageAspectRatio: normalizeDefaultImageAspectRatio(
            state.defaultImageAspectRatio
          ),
          hideProviderGuidePopover: state.hideProviderGuidePopover ?? false,
          canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(state.canvasEdgeRoutingMode),
          autoCheckAppUpdateOnLaunch: state.autoCheckAppUpdateOnLaunch ?? true,
          enableUpdateDialog: state.enableUpdateDialog ?? true,
          enableStoryboardGenGridPreviewShortcut:
            state.enableStoryboardGenGridPreviewShortcut ?? false,
          showStoryboardGenAdvancedRatioControls:
            state.showStoryboardGenAdvancedRatioControls ?? false,
          storyboardGenAutoInferEmptyFrame: state.storyboardGenAutoInferEmptyFrame ?? true,
          showNodePrice: state.showNodePrice ?? true,
          priceDisplayCurrencyMode: normalizePriceDisplayCurrencyMode(
            state.priceDisplayCurrencyMode
          ),
          usdToCnyRate: normalizeUsdToCnyRate(state.usdToCnyRate),
          preferDiscountedPrice: state.preferDiscountedPrice ?? false,
          grsaiCreditTierId: normalizeGrsaiCreditTierId(state.grsaiCreditTierId),
        };
      },
    }
  )
);
