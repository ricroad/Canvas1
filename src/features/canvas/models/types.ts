import type { ModelPricingDefinition } from '@/features/canvas/pricing/types';

export type MediaModelType = 'image' | 'video' | 'audio';

export interface ModelProviderDefinition {
  id: string;
  name: string;
  label: string;
}

export interface AspectRatioOption {
  value: string;
  label: string;
}

export interface ResolutionOption {
  value: string;
  label: string;
}

export interface ImageModelRuntimeContext {
  extraParams?: Record<string, unknown>;
}

export type ExtraParamType = 'boolean' | 'enum' | 'number' | 'string';

export interface ExtraParamDefinition {
  key: string;
  label: string;
  labelKey?: string;
  type: ExtraParamType;
  description?: string;
  descriptionKey?: string;
  defaultValue?: boolean | number | string;
  options?: Array<{ value: string; label: string; labelKey?: string }>;
  min?: number;
  max?: number;
  step?: number;
}

export interface VideoInputSlotDef {
  key: string;
  handleId: string;
  label: string;
  labelKey?: string;
  emptyLabel: string;
  emptyLabelKey?: string;
  required?: boolean;
}

export interface ImageModelDefinition {
  id: string;
  mediaType: 'image';
  displayName: string;
  providerId: string;
  description: string;
  eta: string;
  expectedDurationMs?: number;
  defaultAspectRatio: string;
  defaultResolution: string;
  aspectRatios: AspectRatioOption[];
  resolutions: ResolutionOption[];
  resolveResolutions?: (context: ImageModelRuntimeContext) => ResolutionOption[];
  extraParamsSchema?: ExtraParamDefinition[];
  defaultExtraParams?: Record<string, unknown>;
  pricing?: ModelPricingDefinition;
  resolveRequest: (context: { referenceImageCount: number }) => {
    requestModel: string;
    modeLabel: string;
  };
}

export interface VideoModelDefinition {
  id: string;
  mediaType: 'video';
  displayName: string;
  providerId: string;
  description: string;
  eta: string;
  expectedDurationMs?: number;
  defaultAspectRatio: string;
  supportedAspectRatios: string[];
  supportedDurations: number[];
  supportedModes: Array<'std' | 'pro'>;
  inputSlots: VideoInputSlotDef[];
  params?: ExtraParamDefinition[];
  defaultExtraParams?: Record<string, unknown>;
  providerConfig?: Record<string, unknown>;
  maxPromptLength: number;
  creditsPerSecond: number;
  pricing?: ModelPricingDefinition;
}
