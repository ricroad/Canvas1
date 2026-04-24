import type { NodeTypes } from '@xyflow/react';

import { GroupNode } from './GroupNode';
import { ImageEditNode } from './ImageEditNode';
import { ImageNode } from './ImageNode';
import { ImageResultNode } from './ImageResultNode';
import { StoryboardGenNode } from './StoryboardGenNode';
import { StoryboardNode } from './StoryboardNode';
import { TextAnnotationNode } from './TextAnnotationNode';
import { UploadNode } from './UploadNode';
import { VideoGenNode } from './VideoGenNode';
import { VideoResultNode } from './VideoResultNode';
import { SceneComposerNode } from '../scene-composer/SceneComposerNode';

export const nodeTypes: NodeTypes = {
  exportImageNode: ImageNode,
  groupNode: GroupNode,
  imageNode: ImageEditNode,
  imageResultNode: ImageResultNode,
  storyboardGenNode: StoryboardGenNode,
  storyboardNode: StoryboardNode,
  textAnnotationNode: TextAnnotationNode,
  uploadNode: UploadNode,
  videoGenNode: VideoGenNode,
  videoResultNode: VideoResultNode,
  sceneComposerNode: SceneComposerNode,
};

export { GroupNode, ImageEditNode, ImageNode, ImageResultNode, SceneComposerNode, StoryboardGenNode, StoryboardNode, TextAnnotationNode, UploadNode, VideoGenNode, VideoResultNode };
