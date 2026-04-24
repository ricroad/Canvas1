import type { ExtraParamDefinition } from '@/features/canvas/models';
import type { ModelDisplayParts, ModelParamsModel, ParamField } from '@/features/canvas/ui/ModelParamsControls';

export type ParamConfigTranslator = (key: string, options?: Record<string, unknown>) => string;

type ParamValue = boolean | number | string;

export function resolveTranslatedParamText(
  t: ParamConfigTranslator,
  key: string | undefined,
  fallback: string | undefined
): string {
  if (!key) {
    return fallback ?? '';
  }

  const translated = t(key);
  return translated === key ? (fallback ?? key) : translated;
}

export function resolveExtraParamValue(
  definition: ExtraParamDefinition,
  extraParams: Record<string, unknown> | undefined,
  defaultExtraParams: Record<string, unknown> | undefined
): ParamValue {
  const currentValue = extraParams?.[definition.key];
  if (typeof currentValue === 'boolean' || typeof currentValue === 'number' || typeof currentValue === 'string') {
    return currentValue;
  }

  const modelDefaultValue = defaultExtraParams?.[definition.key];
  if (
    typeof modelDefaultValue === 'boolean' ||
    typeof modelDefaultValue === 'number' ||
    typeof modelDefaultValue === 'string'
  ) {
    return modelDefaultValue;
  }

  return definition.defaultValue ?? '';
}

export function buildExtraParamFields(options: {
  t: ParamConfigTranslator;
  definitions?: ExtraParamDefinition[];
  extraParams?: Record<string, unknown>;
  defaultExtraParams?: Record<string, unknown>;
}): ParamField[] {
  const fields: ParamField[] = [];

  (options.definitions ?? []).forEach((definition) => {
    const value = resolveExtraParamValue(definition, options.extraParams, options.defaultExtraParams);
    const label = resolveTranslatedParamText(options.t, definition.labelKey, definition.label);

    if (definition.type === 'enum' && definition.options) {
      const enumOptions = definition.options.map((option) => ({
        value: option.value,
        label: resolveTranslatedParamText(options.t, option.labelKey, option.label),
      }));
      fields.push({
        kind: 'select',
        key: definition.key,
        label,
        value,
        options: enumOptions,
        displayFormat: (nextValue) =>
          enumOptions.find((option) => option.value === nextValue)?.label ?? String(nextValue),
      });
      return;
    }

    if (definition.type === 'boolean') {
      fields.push({
        kind: 'toggle',
        key: definition.key,
        label,
        value,
        displayFormat: (nextValue) => (nextValue ? label : ''),
      });
      return;
    }

    if (definition.type === 'number') {
      fields.push({
        kind: 'number',
        key: definition.key,
        label,
        value: typeof value === 'number' ? value : Number(value) || 0,
        min: definition.min,
        max: definition.max,
        step: definition.step,
        displayFormat: (nextValue) => String(nextValue),
      });
    }
  });

  return fields;
}

export function getGenerationModelDisplayParts(model: ModelParamsModel): ModelDisplayParts {
  const normalizedName = model.displayName.replace(/\s*\([^)]*\)\s*$/u, '').trim() || model.displayName;
  const match = normalizedName.match(/^(.*)\s+(Pro|Lite)$/iu);
  if (!match) {
    return { name: normalizedName };
  }

  return {
    name: match[1].trim(),
    variant: match[2],
  };
}
