/**
 * Mapa de ícones permitidos para itens do roadmap (gerenciados pelo Master).
 * Mantém o conjunto pequeno e previsível — novos ícones devem ser adicionados aqui.
 */
import {
  Bot, Sparkles, Calendar, ShoppingBag, Code2, Workflow,
  Rocket, Zap, Brain, MessageSquare, Bell, Plug, Smartphone,
  CreditCard, BarChart3, ShieldCheck, Globe, Users, Settings,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';

export const ROADMAP_ICONS: Record<string, LucideIcon> = {
  Bot, Sparkles, Calendar, ShoppingBag, Code2, Workflow,
  Rocket, Zap, Brain, MessageSquare, Bell, Plug, Smartphone,
  CreditCard, BarChart3, ShieldCheck, Globe, Users, Settings,
  CheckCircle2,
};

export const ROADMAP_ICON_KEYS = Object.keys(ROADMAP_ICONS);

export function getRoadmapIcon(key?: string | null): LucideIcon {
  if (key && ROADMAP_ICONS[key]) return ROADMAP_ICONS[key];
  return Sparkles;
}

export type RoadmapStatus = 'done' | 'in_progress' | 'soon';

export interface RoadmapItemRow {
  id: string;
  title: string;
  description: string;
  icon: string;
  status: RoadmapStatus;
  addon: boolean;
  sort_order: number;
  progress: number;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

export const STATUS_LABEL: Record<RoadmapStatus, string> = {
  done: 'Pronto',
  in_progress: 'Em desenvolvimento',
  soon: 'Em breve',
};
