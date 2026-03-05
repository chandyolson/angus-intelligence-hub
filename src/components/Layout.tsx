import { AppSidebar } from '@/components/AppSidebar';

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
      <main className="lg:ml-[220px] p-6 pt-14 lg:pt-6 flex-1">
        {children}
      </main>
      <div className="lg:ml-[220px]">
        <Footer />
      </div>
    </div>
  );
}
