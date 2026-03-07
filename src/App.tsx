import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import CowRoster from "@/pages/CowRoster";
import CowDetail from "@/pages/CowDetail";
import Rankings from "@/pages/Rankings";
import SireAnalysis from "@/pages/SireAnalysis";
import AIAssistant from "@/pages/AIAssistant";
import DataQuality from "@/pages/DataQuality";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/roster" element={<CowRoster />} />
            <Route path="/cow/:lifetime_id" element={<CowDetail />} />
            <Route path="/rankings" element={<Rankings />} />
            <Route path="/sires" element={<SireAnalysis />} />
            <Route path="/assistant" element={<AIAssistant />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
