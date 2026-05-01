type Props = { size?: number; className?: string };
export function BrandLogo({ size = 20, className }: Props) {
  return (
    <img
      src="/brand/logo.jpg"
      alt="ReelForce Studio"
      width={size}
      height={Math.round(size * 0.85)}
      className={className}
      draggable={false}
      style={{ objectFit: 'contain', pointerEvents: 'none' }}
    />
  );
}
