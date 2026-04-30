import type { VideoVariant } from '@/features/canvas/domain/canvasNodes';

export interface VideoResultStackProps {
  variants: VideoVariant[];
  selectedIndex: number;
  contentHeight: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelect: (index: number) => void;
  onPreview: (index: number) => void;
  onAdopt: (index: number) => void;
}

export function VideoResultStack({
  variants,
  contentHeight,
  isExpanded,
}: VideoResultStackProps) {
  if (variants.length === 0) {
    return null;
  }

  return (
    <div
      className="relative overflow-hidden"
      style={{ height: `${contentHeight}px` }}
      data-expanded={isExpanded}
    />
  );
}
