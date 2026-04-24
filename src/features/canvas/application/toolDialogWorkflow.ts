import { readStoryboardImageMetadata } from '@/commands/image';
import type { ToolOptions } from '../tools';
import { prepareNodeImage } from './imageData';
import type { ToolProcessorResult } from './ports';

export async function preloadSplitToolOptions(
  sourceImageUrl: string,
  initialOptions: ToolOptions
): Promise<ToolOptions> {
  const metadata = await readStoryboardImageMetadata(sourceImageUrl);
  if (!metadata) {
    return initialOptions;
  }

  const nextRows = Math.max(1, Math.min(8, Math.floor(metadata.gridRows)));
  const nextCols = Math.max(1, Math.min(8, Math.floor(metadata.gridCols)));
  if (!Number.isFinite(nextRows) || !Number.isFinite(nextCols)) {
    return initialOptions;
  }

  return {
    ...initialOptions,
    rows: nextRows,
    cols: nextCols,
  };
}

export type ResolvedToolDialogResult =
  | {
      kind: 'storyboardSplit';
      rows: number;
      cols: number;
      frameAspectRatio?: string;
      storyboardFrames: NonNullable<ToolProcessorResult['storyboardFrames']>;
    }
  | {
      kind: 'exportImage';
      imageUrl: string;
      previewImageUrl: string;
      aspectRatio: string;
    }
  | {
      kind: 'none';
    };

export async function resolveToolDialogResult(
  result: ToolProcessorResult
): Promise<ResolvedToolDialogResult> {
  if (result.storyboardFrames && result.rows && result.cols) {
    return {
      kind: 'storyboardSplit',
      rows: result.rows,
      cols: result.cols,
      frameAspectRatio: result.frameAspectRatio,
      storyboardFrames: result.storyboardFrames,
    };
  }

  if (result.outputImageUrl) {
    const prepared = await prepareNodeImage(result.outputImageUrl);
    return {
      kind: 'exportImage',
      imageUrl: prepared.imageUrl,
      previewImageUrl: prepared.previewImageUrl ?? prepared.imageUrl,
      aspectRatio: prepared.aspectRatio,
    };
  }

  return { kind: 'none' };
}
