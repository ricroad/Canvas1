import {
  cancelVideoBatch,
  generateImage,
  getGenerateImageJob,
  setApiKey,
  testKlingConnection,
  submitVideoBatch,
  submitGenerateImageJob,
} from '@/commands/ai';
import { imageUrlToDataUrl, persistImageLocally } from '@/features/canvas/application/imageData';

import type {
  AiGateway,
  GenerateImagePayload,
  SubmitVideoBatchPayload,
  TestKlingConnectionPayload,
} from '../application/ports';

async function normalizeReferenceImages(payload: GenerateImagePayload): Promise<string[] | undefined> {
  const isKieModel = payload.model.startsWith('kie/');
  const isFalModel = payload.model.startsWith('fal/');
  return payload.referenceImages
    ? await Promise.all(
      payload.referenceImages.map(async (imageUrl) =>
        isKieModel || isFalModel
          ? await imageUrlToDataUrl(imageUrl)
          : await persistImageLocally(imageUrl)
      )
    )
    : undefined;
}

export const tauriAiGateway: AiGateway = {
  setApiKey,
  generateImage: async (payload: GenerateImagePayload) => {
    const normalizedReferenceImages = await normalizeReferenceImages(payload);

    return await generateImage({
      prompt: payload.prompt,
      model: payload.model,
      size: payload.size,
      aspect_ratio: payload.aspectRatio,
      reference_images: normalizedReferenceImages,
      extra_params: payload.extraParams,
      output_count: payload.outputCount,
    });
  },
  submitGenerateImageJob: async (payload: GenerateImagePayload) => {
    const normalizedReferenceImages = await normalizeReferenceImages(payload);
    return await submitGenerateImageJob({
      prompt: payload.prompt,
      model: payload.model,
      size: payload.size,
      aspect_ratio: payload.aspectRatio,
      reference_images: normalizedReferenceImages,
      extra_params: payload.extraParams,
      output_count: payload.outputCount,
    });
  },
  getGenerateImageJob,
  testKlingConnection: async (payload: TestKlingConnectionPayload) => {
    await testKlingConnection(payload);
  },
  submitVideoBatch: async (payload: SubmitVideoBatchPayload) => {
    const firstFrame = await imageUrlToDataUrl(payload.firstFrameRef);
    const tailFrame = payload.tailFrameRef
      ? await imageUrlToDataUrl(payload.tailFrameRef)
      : undefined;
    return await submitVideoBatch({
      providerId: 'kling',
      nodeId: payload.nodeId,
      batchId: payload.batchId,
      prompt: payload.prompt,
      modelId: payload.modelId,
      negativePrompt: payload.negativePrompt,
      duration: payload.duration,
      aspectRatio: payload.aspectRatio,
      slotRefs: {
        'image-first-frame': firstFrame,
        ...(tailFrame ? { 'image-tail-frame': tailFrame } : {}),
      },
      outputCount: payload.outputCount,
      extraParams: payload.extraParams ?? {},
      accessKey: payload.accessKey,
      secretKey: payload.secretKey,
    });
  },
  cancelVideoBatch,
};
