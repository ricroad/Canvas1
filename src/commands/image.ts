import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv } from './platform';
import {
  webSplitImage,
  webPrepareNodeImageSource,
  webPrepareNodeImageBinary,
  webCropImageSource,
  webPersistImageSource,
  webLoadImage,
  webDownloadImage,
  webCopyImageToClipboard,
} from './web/image';

// ── Types (unchanged) ────────────────────────────────────────────────────────

export interface MergeStoryboardImagesPayload {
  frameSources: string[];
  rows: number;
  cols: number;
  cellGap: number;
  outerPadding: number;
  noteHeight: number;
  fontSize: number;
  backgroundColor: string;
  maxDimension: number;
  showFrameIndex?: boolean;
  showFrameNote?: boolean;
  notePlacement?: 'overlay' | 'bottom';
  imageFit?: 'cover' | 'contain';
  frameIndexPrefix?: string;
  textColor?: string;
  frameNotes?: string[];
}

export interface StoryboardImageMetadata {
  gridRows: number;
  gridCols: number;
  frameNotes: string[];
}

export interface PrepareNodeImageSourceResult {
  imagePath: string;
  previewImagePath: string;
  aspectRatio: string;
}

export interface CropImageSourcePayload {
  source: string;
  aspectRatio?: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
}

export interface MergeStoryboardImagesResult {
  imagePath: string;
  canvasWidth: number;
  canvasHeight: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
  padding: number;
  noteHeight: number;
  fontSize: number;
  textOverlayApplied: boolean;
}

// ── Split ────────────────────────────────────────────────────────────────────

export async function splitImage(
  imageBase64: string,
  rows: number,
  cols: number,
  lineThickness = 0
): Promise<string[]> {
  if (!isTauriEnv()) return webSplitImage(imageBase64, rows, cols, lineThickness);
  return await invoke('split_image', { imageBase64, rows, cols, lineThickness });
}

export async function splitImageSource(
  source: string,
  rows: number,
  cols: number,
  lineThickness = 0
): Promise<string[]> {
  if (!isTauriEnv()) return webSplitImage(source, rows, cols, lineThickness);
  return await invoke('split_image_source', { source, rows, cols, lineThickness });
}

// ── Merge storyboard ─────────────────────────────────────────────────────────

export async function mergeStoryboardImages(
  payload: MergeStoryboardImagesPayload
): Promise<MergeStoryboardImagesResult> {
  if (!isTauriEnv()) {
    throw new Error('分镜合并导出功能暂不支持 Web 版本，请使用桌面客户端');
  }
  return await invoke('merge_storyboard_images', { payload });
}

// ── Metadata ─────────────────────────────────────────────────────────────────

export async function readStoryboardImageMetadata(
  source: string
): Promise<StoryboardImageMetadata | null> {
  if (!isTauriEnv()) return null;
  return await invoke('read_storyboard_image_metadata', { source });
}

export async function embedStoryboardImageMetadata(
  source: string,
  metadata: StoryboardImageMetadata
): Promise<string> {
  if (!isTauriEnv()) return source; // No-op in web, return original
  return await invoke('embed_storyboard_image_metadata', { source, metadata });
}

// ── Prepare node image ───────────────────────────────────────────────────────

export async function prepareNodeImageSource(
  source: string,
  maxPreviewDimension = 512
): Promise<PrepareNodeImageSourceResult> {
  if (!isTauriEnv()) return webPrepareNodeImageSource(source, maxPreviewDimension);
  return await invoke('prepare_node_image_source', { source, maxPreviewDimension });
}

export async function prepareNodeImageBinary(
  bytes: Uint8Array,
  extension?: string,
  maxPreviewDimension = 512
): Promise<PrepareNodeImageSourceResult> {
  if (!isTauriEnv()) return webPrepareNodeImageBinary(bytes, extension, maxPreviewDimension);
  return await invoke('prepare_node_image_binary', {
    bytes: Array.from(bytes),
    extension,
    maxPreviewDimension,
  });
}

// ── Crop ─────────────────────────────────────────────────────────────────────

export async function cropImageSource(
  payload: CropImageSourcePayload
): Promise<string> {
  if (!isTauriEnv()) return webCropImageSource(payload);
  return await invoke('crop_image_source', { payload });
}

// ── Load / Persist ───────────────────────────────────────────────────────────

export async function loadImage(filePath: string): Promise<string> {
  if (!isTauriEnv()) return webLoadImage(filePath);
  return await invoke('load_image', { filePath });
}

export async function persistImageSource(source: string): Promise<string> {
  if (!isTauriEnv()) return webPersistImageSource(source);
  return await invoke('persist_image_source', { source });
}

export async function persistImageBinary(
  bytes: Uint8Array,
  extension = 'png'
): Promise<string> {
  if (!isTauriEnv()) {
    const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  }
  return await invoke('persist_image_binary', {
    bytes: Array.from(bytes),
    extension,
  });
}

// ── Save / Download ──────────────────────────────────────────────────────────

export async function saveImageSourceToDownloads(
  source: string,
  suggestedFileName?: string
): Promise<string> {
  if (!isTauriEnv()) return webDownloadImage(source, suggestedFileName);
  return await invoke('save_image_source_to_downloads', { source, suggestedFileName });
}

export async function saveImageSourceToPath(
  source: string,
  targetPath: string
): Promise<string> {
  if (!isTauriEnv()) return webDownloadImage(source, targetPath.split(/[\\/]/).pop());
  return await invoke('save_image_source_to_path', { source, targetPath });
}

export async function saveImageSourceToDirectory(
  source: string,
  targetDir: string,
  suggestedFileName?: string
): Promise<string> {
  if (!isTauriEnv()) return webDownloadImage(source, suggestedFileName);
  return await invoke('save_image_source_to_directory', { source, targetDir, suggestedFileName });
}

export async function saveSourceToDirectory(
  source: string,
  targetDir: string,
  suggestedFileName?: string,
  extension?: string
): Promise<string> {
  if (!isTauriEnv()) return webDownloadImage(source, suggestedFileName);
  return await invoke('save_source_to_directory', {
    source,
    targetDir,
    suggestedFileName,
    extension,
  });
}

export async function saveImageSourceToAppDebugDir(
  source: string,
  category = 'grid',
  suggestedFileName?: string
): Promise<string> {
  if (!isTauriEnv()) return webDownloadImage(source, suggestedFileName ?? `debug-${category}.png`);
  return await invoke('save_image_source_to_app_debug_dir', { source, category, suggestedFileName });
}

// ── Clipboard ────────────────────────────────────────────────────────────────

export async function copyImageSourceToClipboard(source: string): Promise<void> {
  if (!isTauriEnv()) return webCopyImageToClipboard(source);
  await invoke('copy_image_source_to_clipboard', { source });
}
