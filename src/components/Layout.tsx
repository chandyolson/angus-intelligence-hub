import { AppSidebar } from '@/components/AppSidebar';
import { useOperation, OperationFilter } from '@/hooks/useOperationContext';
import { AlertTriangle } from 'lucide-react';

function OperationSelector() {
  const { operation, setOperation } = useOperation();
  const options: { value: OperationFilter; label: string }[] = [
    { value: 'Blair', label: 'Blair' },
    { value: 'Snyder', label: 'Snyder' },
    { value: 'Both', label: 'Both' },
  ];

  const colorTag: Record<OperationFilter, string> = {
    Blair: 'bg-primary/20 text-primary border-primary/40',
    Snyder: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    Both: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium hidden sm:inline">Operation</span>
      <div className="flex rounded-md border border-border overflow-hidden">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => setOperation(opt.value)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              operation === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${colorTag[operation]}`}>
        {operation === 'Both' ? 'ALL OPS' : operation.toUpperCase()}
      </span>
    </div>
  );
}

function OperationWarningBanner() {
  const { operation } = useOperation();
  if (operation !== 'Both') return null;
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md px-4 py-2 flex items-center gap-2 mx-6 mt-2">
      <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
      <p className="text-xs text-yellow-400">
        Viewing combined data from both operations — some metrics may not be comparable across operations.
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="bg-sidebar border-t border-border px-6 py-2 flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground tracking-wide">BLAIR BROS ANGUS · AI² ANALYTICS PLATFORM</span>
      <span className="text-[10px] text-muted-foreground tracking-wide">DATA: SUPABASE · 2017–2025</span>
    </footer>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppSidebar />
      {/* Top header bar with operation selector */}
      <div className="lg:ml-[220px] bg-sidebar/50 border-b border-border px-6 py-2 flex items-center justify-between pt-14 lg:pt-2">
        <OperationSelector />
      </div>
      <OperationWarningBanner />
      <main className="lg:ml-[220px] p-6 flex-1">
        {children}
      </main>
      <div className="lg:ml-[220px]">
        <Footer />
      </div>
    </div>
  );
}
