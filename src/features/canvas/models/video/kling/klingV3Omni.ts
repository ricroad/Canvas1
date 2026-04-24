import type { VideoModelDefinition } from '../../types';

export const videoModel: VideoModelDefinition = {
  id: 'kling-v3-omni',
  mediaType: 'video',
  displayName: 'Kling V3 Omni',
  providerId: 'kling',
  description: 'Omni image-to-video generation for storyboard keyframes.',
  eta: '2-10min',
  expectedDurationMs: 180000,
  defaultAspectRatio: '16:9',
  supportedAspectRatios: ['16:9', '9:16', '1:1'],
  supportedDurations: [3, 5, 10, 15],
  supportedModes: ['std', 'pro'],
  inputSlots: [
    {
      key: 'firstFrame',
      handleId: 'image-first-frame',
      label: 'First Frame',
      labelKey: 'node.videoGen.firstFrameSlotLabel',
      emptyLabel: 'Connect first frame',
      emptyLabelKey: 'node.videoGen.firstFrameSlotEmpty',
      required: true,
    },
    {
      key: 'tailFrame',
      handleId: 'image-tail-frame',
      label: 'Tail Frame',
      labelKey: 'node.videoGen.tailFrameSlotLabel',
      emptyLabel: 'Connect tail frame',
      emptyLabelKey: 'node.videoGen.tailFrameSlotEmpty',
      required: false,
    },
  ],
  params: [
    {
      key: 'mode',
      label: 'Mode',
      type: 'enum',
      defaultValue: 'pro',
      options: [
        { value: 'std', label: 'std' },
        { value: 'pro', label: 'pro' },
      ],
    },
    {
      key: 'cfgScale',
      label: 'CFG Scale',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.05,
    },
  ],
  defaultExtraParams: {
    mode: 'pro',
  },
  providerConfig: {
    klingModelName: 'kling-v3-omni',
    klingEndpoint: 'image2video',
  },
  maxPromptLength: 2500,
  creditsPerSecond: 15,
};
