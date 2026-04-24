import type { VideoModelDefinition } from '@/features/canvas/models';
import type { ParamField } from '@/features/canvas/ui/ModelParamsControls';
import {
  buildExtraParamFields,
  getGenerationModelDisplayParts,
  type ParamConfigTranslator,
} from './common';

export function buildVideoGenerationParamFields(options: {
  t: ParamConfigTranslator;
  selectedModel: VideoModelDefinition;
  duration: number;
  aspectRatio: string;
  outputCount: number;
  extraParams?: Record<string, unknown>;
}): ParamField[] {
  const fields: ParamField[] = [
    {
      kind: 'select',
      key: 'duration',
      label: options.t('node.videoGen.duration'),
      value: options.duration,
      options: options.selectedModel.supportedDurations.map((duration) => ({
        value: duration,
        label: `${duration}s`,
      })),
      displayFormat: (value) => `${value}s`,
    },
    {
      kind: 'select',
      key: 'aspectRatio',
      label: options.t('node.videoGen.aspectRatio'),
      value: options.aspectRatio,
      options: options.selectedModel.supportedAspectRatios.map((ratio) => ({
        value: ratio,
        label: ratio,
      })),
      displayFormat: (value) => String(value),
    },
  ];

  fields.push(
    ...buildExtraParamFields({
      t: options.t,
      definitions: options.selectedModel.params,
      extraParams: options.extraParams,
      defaultExtraParams: options.selectedModel.defaultExtraParams,
    }),
    {
      kind: 'select',
      key: 'outputCount',
      label: options.t('node.videoGen.outputCount'),
      value: options.outputCount || 1,
      options: [1, 2, 3, 4].map((count) => ({
        value: count,
        label: options.t('node.videoGen.outputCountOption', { count }),
      })),
      displayFormat: (value) => `${value}x`,
    }
  );

  return fields;
}

export const getVideoGenerationModelDisplayParts = getGenerationModelDisplayParts;
