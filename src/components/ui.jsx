import { forwardRef, useEffect, useState } from 'react';
import { Icon } from './icons';

export function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

const BUTTON_VARIANTS = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
  outline: 'border border-border bg-transparent text-foreground hover:bg-accent',
  ghost: 'text-foreground hover:bg-accent',
  destructive: 'bg-destructive text-white hover:bg-destructive/90',
};

const BUTTON_SIZES = {
  default: 'h-9 px-4 text-sm',
  sm: 'h-8 px-3 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-9 w-9',
  iconSm: 'h-8 w-8',
};

export function Button({
  variant = 'default',
  size = 'default',
  className,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...props}
    />
  );
}

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-md border border-border bg-transparent px-3 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'min-h-16 w-full rounded-md border border-border bg-transparent px-3 py-2 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 md:text-sm',
        className
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }) {
  return (
    <label
      className={cn('flex items-center gap-2 text-sm leading-none font-normal select-none', className)}
      {...props}
    />
  );
}

export function Field({ label, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <Label>{label}</Label>}
      {children}
    </div>
  );
}

export function Card({ className, ...props }) {
  return <div className={cn('rounded-xl border border-border bg-card shadow-sm', className)} {...props} />;
}

const BADGE_VARIANTS = {
  success: 'border-[hsl(145_65%_42%)] bg-[hsl(145_55%_95%)] text-[hsl(145_70%_28%)]',
  destructive: 'border-[hsl(0_72%_51%)] bg-[hsl(0_65%_95%)] text-[hsl(0_80%_35%)]',
  outline: 'border-border bg-transparent text-foreground',
  muted: 'border-transparent bg-muted text-muted-foreground',
};

export function Badge({ variant = 'outline', className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        BADGE_VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}

export function SegmentedTabs({ options, value, onChange, className }) {
  return (
    <div className={cn('flex w-fit items-stretch rounded-lg border border-border bg-accent p-1', className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.icon && <Icon name={opt.icon} className="size-4" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Spinner({ className = 'size-6' }) {
  return <span className={cn('inline-block animate-spin rounded-full border-2 border-primary/30 border-t-primary', className)} />;
}

export function EmptyState({ icon = 'list', title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1 py-12 text-center', className)}>
      <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-accent text-muted-foreground">
        <Icon name={icon} className="size-6" />
      </div>
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, className }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          'relative w-full max-w-md rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl',
          className
        )}
      >
        {title && <h2 className="mb-3 text-lg font-semibold text-foreground">{title}</h2>}
        {children}
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, title, description, confirmText = '确认', onConfirm, busy }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? '删除中...' : confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">{description}</p>
    </Modal>
  );
}

export function DateInput({ className, ...props }) {
  return <Input type="date" className={className} {...props} />;
}

export function toast(message, type = 'success', options) {
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, type, ...options } }));
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const handler = (e) => {
      const id = Date.now() + Math.random();
      const detail = e.detail || {};
      const timeout = detail.action ? 8000 : 2600;
      setItems((prev) => [...prev, { id, ...detail }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, timeout);
    };
    window.addEventListener('app:toast', handler);
    return () => window.removeEventListener('app:toast', handler);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg',
            t.type === 'error' ? 'bg-destructive' : 'bg-foreground'
          )}
        >
          <Icon name={t.type === 'error' ? 'alert' : 'circleCheck'} className="size-4" />
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action.onClick?.();
                setItems((prev) => prev.filter((x) => x.id !== t.id));
              }}
              className="ml-1 rounded-md border border-white/40 px-2 py-0.5 text-xs font-semibold whitespace-nowrap active:scale-95"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
