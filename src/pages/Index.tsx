import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import ProblemSection from "@/components/landing/ProblemSection";
import SolutionSection from "@/components/landing/SolutionSection";
import DiscoveryPreviewSection from "@/components/landing/DiscoveryPreviewSection";
import AIFeaturesSection from "@/components/landing/AIFeaturesSection";
import PlatformSection from "@/components/landing/PlatformSection";
import AudienceSection from "@/components/landing/AudienceSection";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <DiscoveryPreviewSection />
      <AIFeaturesSection />
      <PlatformSection />
      <AudienceSection />
      <CTASection />
      <Footer />
    </div>
  );
};

export default Index;
