import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/hooks/useBrand';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Kanban,
  MessageSquare,
  Calendar,
  Settings,
  Building2,
  UserPlus,
  ChevronLeft,
  ChevronDown,
  TrendingUp,
  Target,
  ScrollText,
  Package,
  CircleDollarSign,
  UserCog,
  User as UserIcon,
  Plug,
  Activity,
  BarChart3,
  Sparkles,
  Zap,
  Bell,
  Brain,
  BookOpen,
  Bot,
  Sparkle,
  ShoppingBag,
  Menu,
  Puzzle,
  Rocket,
  Stethoscope,
  Wallet,
  
  HeartPulse,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SidebarProfile } from './SidebarProfile';

import { useUnreadConversations } from '@/hooks/useUnreadConversations';
import { useCompanyAddons } from '@/hooks/useCompanyAddons';
import { useCompanyVertical } from '@/hooks/useCompanyVertical';
import { usePendingReceivables } from '@/hooks/finance/usePendingReceivables';
import { PulsingLed } from '@/components/ui/PulsingLed';

type NavRole = 'master' | 'admin' | 'gestor' | 'financeiro' | 'agente';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  roles?: NavRole[];
  badgeKey?: 'chat-unread' | 'finance-pending';
  /** Visível somente para master OU quando a empresa está nessa vertical */
  vertical?: 'medical';
}

interface NavSection {
  label: string;
  roles?: NavRole[];
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: 'Operacional',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
      
      { icon: Kanban, label: 'Pipelines', path: '/pipelines', roles: ['master', 'admin', 'gestor', 'financeiro', 'agente'] },
      { icon: Users, label: 'Contatos', path: '/contatos', roles: ['master', 'admin', 'gestor', 'financeiro', 'agente'] },
      { icon: MessageSquare, label: 'Chat', path: '/chat', roles: ['master', 'admin', 'gestor', 'financeiro', 'agente'], badgeKey: 'chat-unread' },
      { icon: Calendar, label: 'Agendamentos', path: '/schedules', roles: ['master', 'admin', 'gestor', 'financeiro', 'agente'] },
      { icon: Sparkles, label: 'Automações', path: '/automations', roles: ['master', 'admin', 'gestor', 'financeiro', 'agente'] },
      { icon: ShoppingBag, label: 'Loja', path: '/store', roles: ['master', 'admin', 'gestor', 'financeiro', 'agente'] },
      { icon: Bell, label: 'Notificações', path: '/notifications', roles: ['master', 'admin', 'gestor'] },
    ],
  },
  {
    label: 'Gestão',
    roles: ['master', 'admin', 'gestor', 'financeiro'],
    items: [
      { icon: UserPlus, label: 'Minha Equipe', path: '/team', roles: ['master', 'admin'] },
      { icon: Target, label: 'Metas', path: '/goals', roles: ['master', 'admin', 'gestor'] },
      { icon: BarChart3, label: 'Relatórios', path: '/reports', roles: ['master', 'admin', 'gestor', 'financeiro'] },
      { icon: Wallet, label: 'Financeiro', path: '/financeiro', roles: ['master', 'admin', 'financeiro', 'gestor'], badgeKey: 'finance-pending' },
      { icon: Bot, label: 'Inteligência Artificial', path: '/ai', roles: ['master', 'admin', 'gestor'] },
      { icon: CircleDollarSign, label: 'Minha Assinatura', path: '/subscription', roles: ['master', 'admin', 'financeiro'] },
      { icon: Settings, label: 'Configurações', path: '/settings', roles: ['master', 'admin'] },
    ],
  },
  {
    label: 'Conta',
    items: [
      { icon: UserIcon, label: 'Perfil', path: '/profile' },
      { icon: Rocket, label: 'Roadmap', path: '/roadmap' },
    ],
  },
];

interface MasterGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const masterGroups: MasterGroup[] = [
  {
    id: 'revenue',
    label: 'Clientes & Receita',
    items: [
      { icon: Building2, label: 'Empresas', path: '/admin/companies', roles: ['master'] },
      { icon: Wallet, label: 'Faturamento', path: '/admin/billing', roles: ['master'] },
      { icon: Package, label: 'Planos', path: '/admin/plans', roles: ['master'] },
      { icon: Puzzle, label: 'Add-ons', path: '/admin/addons', roles: ['master'] },
    ],
  },
  {
    id: 'access',
    label: 'Acesso & Integrações',
    items: [
      { icon: UserCog, label: 'Usuários', path: '/admin/users', roles: ['master'] },
      { icon: Plug, label: 'Integrações globais', path: '/admin/integrations', roles: ['master'] },
    ],
  },
  {
    id: 'observability',
    label: 'Observabilidade',
    items: [
      { icon: Activity, label: 'Mensageria', path: '/admin/messaging', roles: ['master'] },
      { icon: ScrollText, label: 'Logs do sistema', path: '/admin/logs', roles: ['master'] },
      { icon: HeartPulse, label: 'Capacidade do banco', path: '/admin/db-capacity', roles: ['master'] },
      { icon: Bell, label: 'Notificações', path: '/admin/notifications', roles: ['master'] },
    ],
  },
  {
    id: 'product',
    label: 'Produto',
    items: [
      { icon: Rocket, label: 'Roadmap', path: '/admin/roadmap', roles: ['master'] },
    ],
  },
];

const SIDEBAR_PREF_KEY = 'sidebar-collapsed';

export function AppSidebar() {
  const brand = useBrand();
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(SIDEBAR_PREF_KEY);
    if (stored !== null) return stored === 'true';
    return window.innerWidth < 1366;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const setCollapsed = (value: boolean | ((prev: boolean) => boolean)) => {
    setCollapsedState((prev) => {
      const next = typeof value === 'function' ? (value as (p: boolean) => boolean)(prev) : value;
      try { localStorage.setItem(SIDEBAR_PREF_KEY, String(next)); } catch {}
      return next;
    });
  };

  const location = useLocation();
  const { profile, roles } = useAuth();
  const chatUnread = useUnreadConversations();
  const { data: pendingReceivables } = usePendingReceivables();
  const financePending = pendingReceivables?.pending_count ?? 0;
  const { addons } = useCompanyAddons();
  const { data: companyVertical } = useCompanyVertical();
  const isMaster = roles.includes('master');

  // Fecha o drawer ao trocar de rota
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const canAccess = (item: NavItem) => {
    if (!item.roles) return true;
    if (!profile) return false;
    if (!item.roles.some(role => roles.includes(role))) return false;
    // Vertical gating (Master sempre vê)
    if (!isMaster && item.vertical === 'medical' && companyVertical !== 'medical') return false;
    // Add-on gating (Master sempre vê)
    if (!isMaster && item.path === '/automations' && !addons.automations) return false;
    if (!isMaster && item.path === '/ai' && !addons.ai_agent) return false;
    if (!isMaster && item.path === '/store' && !addons.ecommerce) return false;
    return true;
  };

  const NavLink = ({ item, forceExpanded = false }: { item: NavItem; forceExpanded?: boolean }) => {
    if (!canAccess(item)) return null;
    const badgeCount =
      item.badgeKey === 'chat-unread' ? chatUnread :
      item.badgeKey === 'finance-pending' ? financePending : 0;
    const showLabel = forceExpanded || !collapsed;

    const link = (
      <Link
        to={item.path}
        className={cn(
          'sidebar-item relative',
          isActive(item.path) && 'sidebar-item-active'
        )}
      >
        <div className="relative shrink-0">
          <item.icon className="w-4 h-4" />
          {!showLabel && badgeCount > 0 && (
            <PulsingLed
              size="sm"
              className="absolute -top-1 -right-1 ring-2 ring-background transition-opacity duration-200"
              label={`${badgeCount} ${badgeCount === 1 ? 'conversa não lida' : 'conversas não lidas'}`}
            />
          )}
        </div>
        {showLabel && <span className="truncate">{item.label}</span>}
        {showLabel && badgeCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold transition-opacity duration-200">
            <PulsingLed size="sm" className="bg-primary-foreground" label="" />
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </Link>
    );

    if (showLabel) return link;

    return (
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          <span>{item.label}</span>
          {badgeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  // Which master sub-groups are open. Defaults: only the one containing the active route.
  const initialOpenGroups = useMemo(() => {
    const set = new Set<string>();
    masterGroups.forEach((g) => {
      if (g.items.some((it) => location.pathname.startsWith(it.path))) set.add(g.id);
    });
    if (set.size === 0) set.add('revenue');
    return set;
  }, [location.pathname]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(initialOpenGroups);

  useEffect(() => {
    // Auto-open the group that matches the current route, without closing others the user opened.
    setOpenGroups((prev) => {
      const next = new Set(prev);
      masterGroups.forEach((g) => {
        if (g.items.some((it) => location.pathname.startsWith(it.path))) next.add(g.id);
      });
      return next;
    });
  }, [location.pathname]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const SidebarBody = ({ forceExpanded = false }: { forceExpanded?: boolean }) => {
    const isCollapsed = !forceExpanded && collapsed;
    return (
      <>
        {/* Header */}
        <div className="px-3 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0 shadow-[0_0_18px_-6px_hsl(var(--primary))]">
              <brand.Icon className="w-4 h-4 text-primary-foreground fill-primary-foreground" strokeWidth={2.5} />
            </div>
            {!isCollapsed && (
              <span className="font-display text-base font-bold tracking-tight truncate text-foreground lowercase">
                {brand.displayName}
              </span>
            )}
          </Link>
          {!forceExpanded && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-7 w-7 hidden md:inline-flex"
              onClick={() => setCollapsed(!collapsed)}
            >
              <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto">
          <div className="space-y-0.5">
            {/* Operacional + Gestão (oculto para Master) */}
            {!isMaster && navSections.slice(0, 2).map((section) => {
              if (section.roles && (!profile || !section.roles.some((r) => roles.includes(r)))) {
                return null;
              }
              const visibleItems = section.items.filter((item) => canAccess(item));
              if (visibleItems.length === 0) return null;
              return visibleItems.map((item) => (
                <NavLink key={item.path} item={item} forceExpanded={forceExpanded} />
              ));
            })}

            {/* Master groups */}
            {isMaster && (
              <div className="space-y-0.5">
                {!isCollapsed && (
                  <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                    Administração Master
                  </div>
                )}
                {masterGroups.map((group) => {
                  if (isCollapsed) {
                    return group.items.map((item) => (
                      <NavLink key={item.path} item={item} forceExpanded={forceExpanded} />
                    ));
                  }
                  const isOpen = openGroups.has(group.id);
                  return (
                    <div key={group.id}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <span className="truncate">{group.label}</span>
                        <ChevronDown
                          className={cn(
                            'w-3 h-3 transition-transform shrink-0',
                            !isOpen && '-rotate-90'
                          )}
                        />
                      </button>
                      {isOpen && (
                        <div className="space-y-0.5 pl-1">
                          {group.items.map((item) => (
                            <NavLink key={item.path} item={item} forceExpanded={forceExpanded} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Conta — para Master mostra apenas Perfil */}
            <div className={cn(isMaster && 'mt-2 pt-2 border-t border-border/40')}>
              {navSections.slice(2).map((section) => {
                if (section.roles && (!profile || !section.roles.some((r) => roles.includes(r)))) {
                  return null;
                }
                const visibleItems = section.items
                  .filter((item) => canAccess(item))
                  .filter((item) => !isMaster || item.path === '/profile');
                if (visibleItems.length === 0) return null;
                return visibleItems.map((item) => (
                  <NavLink key={item.path} item={item} forceExpanded={forceExpanded} />
                ));
              })}
            </div>
          </div>
        </nav>

        {/* User Section */}
        <div className="mt-auto px-2 py-3 border-t border-border space-y-2">
          <SidebarProfile collapsed={isCollapsed} />
        </div>
      </>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      {/* Desktop / tablet sidebar */}
      <aside
        className={cn(
          'h-screen bg-background border-r border-border flex-col transition-all duration-200 sticky top-0 hidden md:flex',
          collapsed ? 'w-14' : 'w-[200px] 2xl:w-[230px]'
        )}
      >
        <SidebarBody />
      </aside>

      {/* Mobile drawer trigger (fixed) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="md:hidden fixed top-3 left-3 z-50 h-9 w-9 bg-background/80 backdrop-blur"
            aria-label="Abrir menu"
          >
            <Menu className="w-4 h-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[260px] bg-background border-r border-border flex flex-col">
          <SidebarBody forceExpanded />
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
