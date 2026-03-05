import { useState } from 'react';
import { LayoutDashboard, List, Trophy, FlaskConical, Menu, X } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useRecordCounts } from '@/hooks/useCattleData';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Cow Roster', url: '/roster', icon: List },
  { title: 'Rankings & Culling', url: '/rankings', icon: Trophy },
  { title: 'Sire Analysis', url: '/sires', icon: FlaskConical },
];

export function AppSidebar() {
  const { data: counts } = useRecordCounts();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-[60] p-2 rounded-md bg-sidebar text-foreground border border-border lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-[55] lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`
        fixed left-0 top-0 h-screen bg-sidebar flex flex-col z-[60] border-r border-border transition-all duration-200
        w-[220px]
        max-lg:${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Mobile close */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 p-1 rounded text-muted-foreground hover:text-foreground lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Branding */}
        <div className="px-5 py-6 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐂</span>
            <div>
              <h1 className="text-lg font-bold text-primary leading-tight">AI²</h1>
              <p className="text-[10px] text-muted-foreground tracking-wide uppercase">Blair Bros Angus</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === '/'}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:bg-hover hover:text-foreground transition-colors"
              activeClassName="!bg-primary/10 !text-primary border-l-2 !border-primary font-medium"
              onClick={() => setMobileOpen(false)}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.title}</span>
            </NavLink>
          ))}
        </nav>

        {/* Live counts */}
        <div className="px-5 py-4 border-t border-border">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Live</span>
          </div>
          {counts && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Animals</span>
                <span className="text-foreground font-medium">{counts.animals.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Calving Records</span>
                <span className="text-foreground font-medium">{counts.breeding_calving.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Ultrasounds</span>
                <span className="text-foreground font-medium">{counts.ultrasound.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
