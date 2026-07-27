import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { HeroSectionV2 } from '@/components/landing/HeroSectionV2';
import { LandingFooter } from '@/components/landing/LandingFooter';

// Below-the-fold: lazy load para não bloquear FCP
const SocialProofBar = lazy(() => import('@/components/landing/SocialProofBar').then(m => ({ default: m.SocialProofBar })));
const PainSolutionSection = lazy(() => import('@/components/landing/PainSolutionSection').then(m => ({ default: m.PainSolutionSection })));
const PillarsSection = lazy(() => import('@/components/landing/PillarsSection').then(m => ({ default: m.PillarsSection })));
const MultiAttendanceSection = lazy(() => import('@/components/landing/MultiAttendanceSection').then(m => ({ default: m.MultiAttendanceSection })));
const AIShowcaseSection = lazy(() => import('@/components/landing/AIShowcaseSection').then(m => ({ default: m.AIShowcaseSection })));
const AutomationFlowSection = lazy(() => import('@/components/landing/AutomationFlowSection').then(m => ({ default: m.AutomationFlowSection })));
const CRMShowcaseSection = lazy(() => import('@/components/landing/CRMShowcaseSection').then(m => ({ default: m.CRMShowcaseSection })));
const HowItWorksSection = lazy(() => import('@/components/landing/HowItWorksSection').then(m => ({ default: m.HowItWorksSection })));
const TestimonialsSection = lazy(() => import('@/components/landing/TestimonialsSection').then(m => ({ default: m.TestimonialsSection })));
const PricingSection = lazy(() => import('@/components/landing/PricingSection').then(m => ({ default: m.PricingSection })));
const ComparisonTable = lazy(() => import('@/components/landing/ComparisonTable').then(m => ({ default: m.ComparisonTable })));
const FAQSection = lazy(() => import('@/components/landing/FAQSection').then(m => ({ default: m.FAQSection })));
const CTASection = lazy(() => import('@/components/landing/CTASection').then(m => ({ default: m.CTASection })));

const SectionFallback = () => <div className="min-h-[200px]" aria-hidden="true" />;

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <LandingHeader />
      <HeroSectionV2 />
      <Suspense fallback={<SectionFallback />}>
        <SocialProofBar />
        <PainSolutionSection />
        <PillarsSection />
        <MultiAttendanceSection />
        <AIShowcaseSection />
        <AutomationFlowSection />
        <CRMShowcaseSection />
        <HowItWorksSection />
        <TestimonialsSection />
        <PricingSection />
        <ComparisonTable />
        <FAQSection />
        <CTASection />
      </Suspense>
      <LandingFooter />
    </div>
  );
}
