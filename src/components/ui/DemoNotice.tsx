import React from 'react';
import { Info, PlugZap } from 'lucide-react';

interface DemoNoticeProps {
  variant?: 'demo' | 'integration';
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const DemoNotice: React.FC<DemoNoticeProps> = ({
  variant = 'demo',
  title,
  description,
  action,
}) => {
  const isIntegration = variant === 'integration';

  return (
    <div
      role="note"
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        isIntegration
          ? 'bg-slate-50 border-slate-200 text-slate-800'
          : 'bg-amber-50/70 border-amber-200 text-slate-800'
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        {isIntegration ? (
          <PlugZap className="w-4 h-4 text-navy-800 shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="font-semibold text-xs text-navy-900">{title}</p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
