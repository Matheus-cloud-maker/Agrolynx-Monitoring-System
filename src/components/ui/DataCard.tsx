import React from 'react';

interface DataCardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const DataCard: React.FC<DataCardProps> = ({
  title,
  subtitle,
  action,
  children,
  className = '',
  noPadding = false,
}) => {
  return (
    <section
      className={`bg-white border border-slate-200 rounded-xl ${className}`}
    >
      {(title || subtitle || action) && (
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base font-semibold text-navy-900 font-display">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5'}>{children}</div>
    </section>
  );
};
