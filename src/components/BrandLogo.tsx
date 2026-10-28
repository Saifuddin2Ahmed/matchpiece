import React from 'react';
import { BRAND_NAME } from '../lib/brand';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | number;
  showText?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showText = true,
  className = ''
}) => {
  const pixelSize = typeof size === 'number' ? size : size === 'sm' ? 26 : size === 'lg' ? 42 : 32;

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Brand mark (drawn in src/lib/brandMark.ts) */}
      <img
        src="/matchpiece-mark.svg"
        alt={`${BRAND_NAME} mark`}
        width={pixelSize}
        height={pixelSize}
        className="flex-shrink-0 object-contain"
        style={{ width: pixelSize, height: pixelSize }}
      />

      {showText && (
        <span className="font-display font-bold tracking-tight text-base sm:text-lg text-[var(--fg)]">
          {BRAND_NAME}
        </span>
      )}
    </div>
  );
};
