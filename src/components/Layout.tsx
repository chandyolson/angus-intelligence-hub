import { AppSidebar } from '@/components/AppSidebar';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-[220px] p-6 min-h-screen">
        {children}
      </main>
    </div>
  );
}
