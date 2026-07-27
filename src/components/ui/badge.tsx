import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Tokens (definidos em index.css):
 * --brand-blue, --brand-blue-glow, --emerald, --amber, --cyan, --rose
 * --badge-bg-opacity, --badge-border-opacity
 *
 * Variantes "tinted" (bg/border translúcido + texto claro)
 *   → use sobre fundos ESCUROS (página, cards dark).
 * Variantes "*-on-light" (bg sólido claro + texto escuro)
 *   → use sobre fundos CLAROS (mockups brancos, prints da app).
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 whitespace-nowrap",
  {
    variants: {
      variant: {
        // shadcn defaults
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground border-border",
        muted: "border-border bg-muted text-muted-foreground",

        // === Padrão: fundo claro + texto/ícone na cor da marca ===
        // Funciona sobre fundos escuros e claros, mantendo alto contraste.
        brand:
          "border-[hsl(var(--brand-blue)/0.35)] bg-[hsl(var(--brand-blue)/0.12)] text-[hsl(var(--brand-blue-glow))] backdrop-blur-sm",
        success:
          "border-[hsl(var(--emerald)/0.4)] bg-[hsl(var(--emerald)/0.12)] text-[hsl(var(--emerald-glow))] backdrop-blur-sm",
        warning:
          "border-[hsl(var(--amber)/0.4)] bg-[hsl(var(--amber)/0.12)] text-[hsl(var(--amber-glow))] backdrop-blur-sm",
        info: "border-[hsl(var(--cyan)/0.4)] bg-[hsl(var(--cyan)/0.12)] text-[hsl(var(--cyan))] backdrop-blur-sm",

        // === Sobre fundo CLARO (mockups brancos) ===
        "brand-on-light":
          "border-[hsl(var(--brand-blue)/0.35)] bg-white text-[hsl(var(--brand-blue))] shadow-sm",
        "success-on-light":
          "border-[hsl(var(--emerald)/0.35)] bg-white text-[hsl(var(--emerald))] shadow-sm",
        "warning-on-light":
          "border-[hsl(var(--amber)/0.35)] bg-white text-[hsl(var(--amber))] shadow-sm",
      },
      size: {
        xs: "px-1.5 py-0.5 text-[10px]",
        sm: "px-2.5 py-0.5 text-xs",
        md: "px-3 py-1 text-xs",
        lg: "px-4 py-1.5 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
