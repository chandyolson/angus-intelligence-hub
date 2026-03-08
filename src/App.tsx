import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { OperationProvider } from "@/hooks/useOperationContext";
import Overview from "@/pages/Overview";
import Dashboard from "@/pages/Dashboard";
import CowRoster from "@/pages/CowRoster";
import CowDetail from "@/pages/CowDetail";
import Rankings from "@/pages/Rankings";
import SireAnalysis from "@/pages/SireAnalysis";
import SireDetail from "@/pages/SireDetail";
import AIAssistant from "@/pages/AIAssistant";
import DataQuality from "@/pages/DataQuality";
import CalvingInterval from "@/pages/CalvingInterval";
import OpenCows from "@/pages/OpenCows";
import HerdTrends from "@/pages/HerdTrends";
import Gestation from "@/pages/Gestation";
import BirthWeight from "@/pages/BirthWeight";
import Culling from "@/pages/Culling";
import Replacements from "@/pages/Replacements";
import Reconciliation from "@/pages/Reconciliation";
import CalvingDistribution from "@/pages/CalvingDistribution";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <OperationProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/roster" element={<CowRoster />} />
              <Route path="/cow/:lifetime_id" element={<CowDetail />} />
              <Route path="/rankings" element={<Rankings />} />
              <Route path="/sires" element={<SireAnalysis />} />
              <Route path="/sires/:sire_name" element={<SireDetail />} />
              <Route path="/assistant" element={<AIAssistant />} />
              <Route path="/data-quality" element={<DataQuality />} />
              <Route path="/calving-interval" element={<CalvingInterval />} />
              <Route path="/open-cows" element={<OpenCows />} />
              <Route path="/herd-trends" element={<HerdTrends />} />
              <Route path="/calving-distribution" element={<CalvingDistribution />} />
              <Route path="/gestation" element={<Gestation />} />
              <Route path="/birth-weight" element={<BirthWeight />} />
              <Route path="/culling" element={<Culling />} />
              <Route path="/replacements" element={<Replacements />} />
              <Route path="/reconciliation" element={<Reconciliation />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </OperationProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
