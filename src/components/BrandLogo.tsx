type Props = {
  size?: number;
  className?: string;
  variant?: 'horizontal' | 'mark';
};

export function BrandLogo({ size = 20, className, variant = 'mark' }: Props) {
  const isHorizontal = variant === 'horizontal';
  const src = isHorizontal ? '/brand/logo.jpg' : '/brand/app-icon.png';
  const aspect = isHorizontal ? 0.85 : 1;
  return (
    <img
      src={src}
      alt="ReelForce Studio"
      width={size}
      height={Math.round(size * aspect)}
      className={className}
      draggable={false}
      style={{ objectFit: 'contain', pointerEvents: 'none' }}
    />
  );
}
