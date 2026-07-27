import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/contexts/AuthContext";
import { TrackingProvider } from "@/contexts/TrackingProvider";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

const PresenceMount = () => {
  usePresenceHeartbeat();
  return null;
};
import { UIScaleProvider } from "@/contexts/UIScaleContext";

import { GlobalErrorBoundary } from "@/components/common/GlobalErrorBoundary";

// Eager: rota pública / (LCP). Tudo o mais é lazy para não inflar o bundle inicial.
import Index from "./pages/Index";

const DashboardLayout = lazy(lazyWithRetry(() => import("@/components/layout/DashboardLayout").then((m) => ({ default: m.DashboardLayout }))));
const RequireRole = lazy(lazyWithRetry(() => import("@/components/auth/RequireRole").then((m) => ({ default: m.RequireRole }))));
const Auth = lazy(lazyWithRetry(() => import("./pages/Auth")));
const NotFound = lazy(lazyWithRetry(() => import("./pages/NotFound")));

// Lazy: rotas autenticadas, legais e admin (não carregam no primeiro paint)
const ForgotPassword = lazy(lazyWithRetry(() => import("./pages/ForgotPassword")));
const ResetPassword = lazy(lazyWithRetry(() => import("./pages/ResetPassword")));
const TermsOfUse = lazy(lazyWithRetry(() => import("./pages/legal/TermsOfUse")));
const PrivacyPolicy = lazy(lazyWithRetry(() => import("./pages/legal/PrivacyPolicy")));
const DataDeletion = lazy(lazyWithRetry(() => import("./pages/legal/DataDeletion")));

const Dashboard = lazy(lazyWithRetry(() => import("./pages/Dashboard")));
const Profile = lazy(lazyWithRetry(() => import("./pages/Profile")));
const Roadmap = lazy(lazyWithRetry(() => import("./pages/Roadmap")));
const Opportunities = lazy(lazyWithRetry(() => import("./pages/Opportunities")));
const Contacts = lazy(lazyWithRetry(() => import("./pages/Contacts")));
const Chat = lazy(lazyWithRetry(() => import("./pages/Chat")));
const Schedules = lazy(lazyWithRetry(() => import("./pages/Schedules")));
const Automations = lazy(lazyWithRetry(() => import("./pages/Automations")));
const AutomationNotifications = lazy(lazyWithRetry(() => import("./pages/AutomationNotifications")));
const Store = lazy(lazyWithRetry(() => import("./pages/Store")));
const ProviderSetup = lazy(lazyWithRetry(() => import("./pages/Setup/ProviderSetup")));

const Team = lazy(lazyWithRetry(() => import("./pages/Team")));
const Goals = lazy(lazyWithRetry(() => import("./pages/Goals")));
const Settings = lazy(lazyWithRetry(() => import("./pages/Settings")));
const Subscription = lazy(lazyWithRetry(() => import("./pages/Subscription")));
const PipelineReports = lazy(lazyWithRetry(() => import("./pages/PipelineReports")));
const AttendanceReports = lazy(lazyWithRetry(() => import("./pages/AttendanceReports")));
const AutomationDebug = lazy(lazyWithRetry(() => import("./pages/AutomationDebug")));
const AdminMessageAudit = lazy(lazyWithRetry(() => import("./pages/AdminMessageAudit")));
const AiHub = lazy(lazyWithRetry(() => import("./pages/AiHub")));
const Financeiro = lazy(lazyWithRetry(() => import("./pages/Financeiro")));

// Master-only (impacto bundle alto — sempre lazy)
const AdminCompanies = lazy(lazyWithRetry(() => import("./pages/AdminCompanies")));
const AdminPlans = lazy(lazyWithRetry(() => import("./pages/AdminPlans")));
const AdminUsers = lazy(lazyWithRetry(() => import("./pages/AdminUsers")));
const AdminIntegrations = lazy(lazyWithRetry(() => import("./pages/AdminIntegrations")));

const AdminAddons = lazy(lazyWithRetry(() => import("./pages/AdminAddons")));
const Logs = lazy(lazyWithRetry(() => import("./pages/Logs")));
const AdminRoadmap = lazy(lazyWithRetry(() => import("./pages/AdminRoadmap")));
const AdminBilling = lazy(lazyWithRetry(() => import("./pages/AdminBilling")));
const AdminMessaging = lazy(lazyWithRetry(() => import("./pages/AdminMessaging")));
const AdminDbCapacity = lazy(lazyWithRetry(() => import("./pages/AdminDbCapacity")));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

const RouteFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]" aria-live="polite" aria-busy="true">
    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
  </div>
);

const App = () => (
  <GlobalErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <UIScaleProvider>
    <AuthProvider>
      <PresenceMount />
      <MedicalProvider>
      <RealtimeProvider>
      <BrandingProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <TrackingProvider>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/termos" element={<TermsOfUse />} />
            <Route path="/privacidade" element={<PrivacyPolicy />} />
            <Route path="/exclusao-de-dados" element={<DataDeletion />} />
            <Route path="/terms" element={<Navigate to="/termos" replace />} />
            <Route path="/privacy" element={<Navigate to="/privacidade" replace />} />
            <Route path="/data-deletion" element={<Navigate to="/exclusao-de-dados" replace />} />

            {/* Protected Routes */}
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/roadmap" element={<Roadmap />} />

              {/* Company-scoped routes (admin + user) */}
              <Route element={<RequireRole roles={['master', 'company_admin', 'user']} />}>
                <Route path="/pipelines" element={<Opportunities />} />
                <Route path="/pipelines/:pipelineId" element={<Opportunities />} />
                {/* Aliases legacy → rota canonical /pipelines */}
                <Route path="/oportunidades" element={<Navigate to="/pipelines?view=kanban" replace />} />
                <Route path="/oportunidades/:pipelineId" element={<Navigate to="/pipelines?view=kanban" replace />} />
                <Route path="/leads" element={<Navigate to="/pipelines?view=list" replace />} />
                <Route path="/medical/dashboard" element={<MedicalDashboard />} />
              </Route>

              <Route element={<RequireRole roles={['company_admin', 'user']} />}>
                <Route path="/contatos" element={<Contacts />} />
                <Route path="/contatos/:id" element={<Contacts />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/schedules" element={<Schedules />} />
                <Route path="/automations" element={<Automations />} />
                <Route path="/notifications" element={<AutomationNotifications />} />
                <Route path="/store" element={<Store />} />
                <Route path="/setup/:provider" element={<ProviderSetup />} />
              </Route>

              {/* Company admin routes (per-company management) */}
              {/* Financeiro (admin + financeiro + gestor) */}
              <Route element={<RequireRole roles={['master', 'admin', 'financeiro', 'gestor']} />}>
                <Route path="/financeiro" element={<Financeiro />} />
              </Route>

              {/* Company admin routes (per-company management) */}
              <Route element={<RequireRole roles={['company_admin']} />}>
                <Route path="/team" element={<Team />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/ai" element={<AiHub />} />
                <Route path="/knowledge-base" element={<Navigate to="/ai" replace />} />
                <Route path="/agent-config" element={<Navigate to="/ai" replace />} />
                <Route path="/qualified-leads" element={<Navigate to="/ai?tab=leads" replace />} />
                <Route path="/subscription" element={<Subscription />} />
                <Route path="/reports" element={<PipelineReports />} />
                <Route path="/reports/attendance" element={<AttendanceReports />} />
                <Route path="/automations/debug" element={<AutomationDebug />} />
                <Route path="/message-audit" element={<AdminMessageAudit />} />

                {/* Legacy redirects */}
                <Route path="/templates" element={<Navigate to="/automations?tab=templates" replace />} />
                <Route path="/automation-status" element={<Navigate to="/automations?tab=status" replace />} />
                <Route path="/automation-audit" element={<Navigate to="/automations?tab=audit" replace />} />
              </Route>

              {/* Master-only routes (platform admin) — all under /admin/* */}
              <Route element={<RequireRole roles={['master']} />}>
                <Route path="/admin/companies" element={<AdminCompanies />} />
                <Route path="/admin/plans" element={<AdminPlans />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/integrations" element={<AdminIntegrations />} />
                <Route path="/admin/notifications" element={<AutomationNotifications />} />
                <Route path="/admin/addons" element={<AdminAddons />} />
                <Route path="/admin/roadmap" element={<AdminRoadmap />} />
                <Route path="/admin/billing" element={<AdminBilling />} />

                {/* Centrais unificadas */}
                <Route path="/admin/logs" element={<Logs />} />
                <Route path="/admin/messaging" element={<AdminMessaging />} />
                <Route path="/admin/db-capacity" element={<AdminDbCapacity />} />

                {/* Legacy redirects para as duas centrais */}
                <Route path="/admin/subscriptions" element={<Navigate to="/admin/billing?tab=subscriptions" replace />} />
                <Route path="/admin/trials" element={<Navigate to="/admin/billing?tab=trials" replace />} />
                <Route path="/admin/audit" element={<Navigate to="/admin/messaging?tab=messages" replace />} />
                <Route path="/admin/health" element={<Navigate to="/admin/messaging" replace />} />
                <Route path="/admin/message-audit" element={<Navigate to="/admin/messaging?tab=messages" replace />} />
                <Route path="/admin/webhook-audit" element={<Navigate to="/admin/messaging?tab=webhooks" replace />} />
                <Route path="/admin/retry-queue" element={<Navigate to="/admin/messaging?tab=retries" replace />} />
                <Route path="/admin/messaging-health" element={<Navigate to="/admin/messaging" replace />} />
                <Route path="/admin/evolution-metrics" element={<Navigate to="/admin/messaging?tab=evolution" replace />} />
                <Route path="/admin/jobs-metrics" element={<Navigate to="/admin/messaging?tab=jobs" replace />} />
                <Route path="/admin/instances" element={<Navigate to="/admin/messaging?tab=instances" replace />} />
                <Route path="/admin/instance-status" element={<Navigate to="/admin/messaging?tab=instances" replace />} />
                <Route path="/admin/automations" element={<Navigate to="/admin/addons?tab=automations" replace />} />
                <Route path="/admin/ai-global" element={<Navigate to="/admin/addons?tab=ai" replace />} />
                <Route path="/admin/automation-control" element={<Navigate to="/admin/addons?tab=automations" replace />} />
                <Route path="/logs" element={<Navigate to="/admin/logs" replace />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </TrackingProvider>
        </BrowserRouter>
      </TooltipProvider>
      </BrandingProvider>
      </RealtimeProvider>
      </MedicalProvider>
    </AuthProvider>
    </UIScaleProvider>
    </ThemeProvider>
  </QueryClientProvider>
  </GlobalErrorBoundary>
);

export default App;
