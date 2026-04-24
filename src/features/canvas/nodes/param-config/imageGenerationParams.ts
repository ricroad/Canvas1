import type { ImageModelDefinition, ResolutionOption } from '@/features/canvas/models';
import type { ParamField } from '@/features/canvas/ui/ModelParamsControls';
import {
  buildExtraParamFields,
  getGenerationModelDisplayParts,
  type ParamConfigTranslator,
} from './common';

export interface ImageParamChoice {
  value: string;
  label: string;
}

export function buildImageGenerationParamFields(options: {
  t: ParamConfigTranslator;
  selectedModel: ImageModelDefinition;
  selectedResolution: ResolutionOption;
  resolutionOptions: ResolutionOption[];
  selectedAspectRatio: ImageParamChoice;
  aspectRatioOptions: ImageParamChoice[];
  extraParams?: Record<string, unknown>;
}): ParamField[] {
  const fields: ParamField[] = [
    {
      kind: 'select',
      key: 'size',
      label: options.t('modelParams.quality'),
      value: options.selectedResolution.value,
      options: options.resolutionOptions.map((option) => ({
        value: option.value,
        label: option.label,
      })),
      displayFormat: (value) =>
        options.resolutionOptions.find((option) => option.value === value)?.label ?? String(value),
    },
    {
      kind: 'select',
      key: 'aspectRatio',
      label: options.t('modelParams.aspectRatio'),
      value: options.selectedAspectRatio.value,
      options: options.aspectRatioOptions.map((option) => ({
        value: option.value,
        label: option.label,
      })),
      displayFormat: (value) =>
        options.aspectRatioOptions.find((option) => option.value === value)?.label ?? String(value),
    },
  ];

  fields.push(
    ...buildExtraParamFields({
      t: options.t,
      definitions: options.selectedModel.extraParamsSchema,
      extraParams: options.extraParams,
      defaultExtraParams: options.selectedModel.defaultExtraParams,
    })
  );

  return fields;
}

export const getImageGenerationModelDisplayParts = getGenerationModelDisplayParts;
