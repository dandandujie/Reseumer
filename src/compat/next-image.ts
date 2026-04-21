/**
 * Compatibility layer for next/image.
 * Replaces Next.js Image with a plain <img> tag.
 */
import React from 'react';

interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  placeholder?: string;
  blurDataURL?: string;
}

function Image({ src, alt, width, height, fill, priority, quality, placeholder, blurDataURL, ...rest }: ImageProps) {
  const style: React.CSSProperties = fill
    ? { objectFit: 'cover', position: 'absolute', width: '100%', height: '100%', ...rest.style }
    : rest.style || {};

  return React.createElement('img', {
    src,
    alt,
    width,
    height,
    loading: priority ? 'eager' : 'lazy',
    style,
    ...rest,
  });
}

export default Image;
