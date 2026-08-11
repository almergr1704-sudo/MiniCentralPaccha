import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("glass-card overflow-hidden", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-5 border-b border-slate-800", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-semibold leading-6 text-slate-100", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}

// Button
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'cancel' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-95 cursor-pointer";
    const variants = {
      primary: "bg-emerald-600 text-white hover:bg-emerald-500 focus:ring-emerald-500 border border-emerald-500/30 shadow-md shadow-emerald-950/40",
      secondary: "bg-slate-700 text-white hover:bg-slate-600 focus:ring-slate-500 shadow-sm",
      outline: "border border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 focus:ring-slate-500",
      danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 border border-red-500/30 shadow-sm shadow-red-950/40",
      cancel: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 border border-red-500/30 shadow-sm shadow-red-950/40",
      ghost: "bg-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus:ring-slate-500",
    };
    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-3 text-base",
    };

    return (
      <button ref={ref} className={cn(baseStyles, variants[variant], sizes[size], className)} {...props} />
    );
  }
);
Button.displayName = 'Button';

// Badge
export function Badge({ className, variant = 'default', children }: { className?: string, variant?: 'default' | 'success' | 'warning' | 'danger' | 'info', children: React.ReactNode }) {
  const variants = {
    default: "bg-slate-800 text-slate-300 border border-slate-700",
    success: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
    warning: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
    danger: "bg-red-500/10 text-red-500 border border-red-500/20",
    info: "bg-blue-500/10 text-blue-500 border border-blue-500/20",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 text-xs font-medium rounded", variants[variant], className)}>
      {children}
    </span>
  );
}

export { Pagination } from './Pagination';
export { ImportSummaryModal } from './ImportSummaryModal';
export { ConfirmProvider, useConfirm } from './ConfirmDialog';
