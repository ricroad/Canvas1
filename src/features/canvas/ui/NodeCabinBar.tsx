import {
  NODE_CABIN_BAR_CLASS,
  NODE_CABIN_DOT_BASE_CLASS,
  NODE_CABIN_DOT_STATUS_CLASS,
} from './nodeControlStyles';

export type NodeCabinStatus = 'idle' | 'generating' | 'complete' | 'error';

interface NodeCabinBarProps {
  status: NodeCabinStatus;
  className?: string;
}

export function NodeCabinBar({ status, className = '' }: NodeCabinBarProps) {
  return (
    <div className={`${NODE_CABIN_BAR_CLASS} ${className}`} aria-hidden="true">
      <span
        className={`${NODE_CABIN_DOT_BASE_CLASS} ${NODE_CABIN_DOT_STATUS_CLASS[status]}`}
      />
    </div>
  );
}
