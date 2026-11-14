import React, { useState } from 'react';
import { Sprout } from 'lucide-react';

interface ImageWithFallbackProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({
  src,
  alt,
  className = '',
  fallbackTitle = 'AGROLYNX',
}) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-agro-800 text-white p-6 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Sprout className="w-10 h-10 text-emerald-300 mb-2" aria-hidden="true" />
        <span className="text-sm font-medium text-slate-100">{fallbackTitle}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
