import type { VideoResultNodeData, VideoVariant } from '@/features/canvas/domain/canvasNodes';
import { getVideoModel } from '@/features/canvas/models';

const MOCK_THUMBNAIL_COLORS = [
  ['#2563eb', '#0f172a'],
  ['#16a34a', '#052e16'],
  ['#e11d48', '#450a0a'],
  ['#d97706', '#431407'],
  ['#7c3aed', '#2e1065'],
  ['#0891b2', '#083344'],
];

interface CreateMockVideoVariantsParams {
  modelIds: string[];
  prompt: string;
  negativePrompt?: string;
  duration: number;
  aspectRatio: string;
  extraParams?: Record<string, unknown>;
  firstFrameRef: string;
  tailFrameRef?: string;
}

function createMockThumbnail(modelName: string, index: number, prompt: string): string {
  const [accent, background] = MOCK_THUMBNAIL_COLORS[index % MOCK_THUMBNAIL_COLORS.length];
  const label = prompt.trim() || 'Mock video result';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${accent}" />
          <stop offset="100%" stop-color="${background}" />
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#bg)" />
      <circle cx="520" cy="86" r="72" fill="rgba(255,255,255,0.12)" />
      <circle cx="96" cy="286" r="112" fill="rgba(255,255,255,0.08)" />
      <text x="40" y="70" fill="white" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="700">${modelName}</text>
      <text x="40" y="118" fill="rgba(255,255,255,0.82)" font-family="Inter, Arial, sans-serif" font-size="20">Mock variant #${index + 1}</text>
      <foreignObject x="40" y="168" width="520" height="96">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font: 18px Inter, Arial, sans-serif; color: rgba(255,255,255,0.88); line-height: 1.35;">
          ${label.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char] ?? char)}
        </div>
      </foreignObject>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createMockVideoVariants({
  modelIds,
  prompt,
  negativePrompt,
  duration,
  aspectRatio,
  extraParams,
  firstFrameRef,
  tailFrameRef,
}: CreateMockVideoVariantsParams): VideoVariant[] {
  const now = Date.now();
  return modelIds.map((modelId, index) => {
    const model = getVideoModel(modelId);
    const variantId = `mock-${model.id}-${now}-${index}`;
    const thumbnailRef = createMockThumbnail(model.displayName, index, prompt);
    const snapshotParams: VideoResultNodeData['snapshotParams'] = {
      modelId: model.id,
      prompt,
      negativePrompt,
      duration: model.supportedDurations.includes(duration)
        ? duration
        : model.supportedDurations[0] ?? duration,
      aspectRatio: model.supportedAspectRatios.includes(aspectRatio)
        ? aspectRatio
        : model.defaultAspectRatio,
      extraParams: {
        ...(model.defaultExtraParams ?? {}),
        ...(extraParams ?? {}),
      },
      firstFrameRef,
      tailFrameRef,
    };

    return {
      variantId,
      klingTaskId: `mock-task-${variantId}`,
      klingVideoId: `mock-video-${variantId}`,
      videoRef: thumbnailRef,
      thumbnailRef,
      videoDurationSeconds: snapshotParams.duration,
      generatedAt: now + index,
      snapshotParams,
    };
  });
}
