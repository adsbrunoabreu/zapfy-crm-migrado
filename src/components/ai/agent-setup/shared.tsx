import { memo } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

export const StepBody = memo(function StepBody({ desc, children }: { desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
      <div className="space-y-5">{children}</div>
    </div>
  );
});

export const FieldGroup = memo(function FieldGroup({
  label, hint, action, children,
}: { label: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</Label>
        {action}
      </div>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
});

export const ToggleRow = memo(function ToggleRow({
  label, hint, checked, onChange,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-2.5 rounded-md border border-border">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
});

export const ReviewRow = memo(function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded border border-border/50 bg-muted/20">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium truncate ml-3">{value}</span>
    </div>
  );
});

export const Section = memo(function Section({
  value, icon, label, children,
}: { value: string; icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={value} className="border border-border rounded-md px-4 bg-card">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {label}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pt-2 pb-4 space-y-3">{children}</AccordionContent>
    </AccordionItem>
  );
});
