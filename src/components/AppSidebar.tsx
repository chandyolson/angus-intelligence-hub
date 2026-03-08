import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShieldAlert, FlaskConical, Beef, TrendingUp,
  Baby, Weight, Scissors, HeartPulse, Users, Menu, X, ChevronDown,
  Bot, BarChart3, Clock, Ban, ClipboardList,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useRecordCounts } from '@/hooks/useCattleData';
import { useDataQualityCount } from '@/hooks/useDataQualityCount';
import { cn } from '@/lib/utils';

interface NavSection {
  title: string;
  icon: React.ElementType;
  url?: string;
  badge?: number;
  badgeColor?: string;
  children?: { title: string; url: string; icon: React.ElementType }[];
}

export function AppSidebar() {
  const { data: counts } = useRecordCounts();
  const qualityCount = useDataQualityCount();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ 'Cow Performance': true });
  const navigate = useNavigate();

  const sections: NavSection[] = [
    { title: 'Overview', icon: LayoutDashboard, url: '/' },
    {
      title: 'Data Management', icon: ShieldAlert,
      children: [
        { title: 'Data Quality', url: '/data-quality', icon: ShieldAlert },
        { title: 'Group Reconciliation', url: '/reconciliation', icon: Users },
      ],
    },
    {
      title: 'Sire Analysis', icon: FlaskConical,
      children: [
        { title: 'Overview', url: '/sires', icon: FlaskConical },
        { title: 'Gestation', url: '/gestation', icon: HeartPulse },
        { title: 'Birth Weight', url: '/birth-weight', icon: Weight },
      ],
    },
    {
      title: 'Cow Performance', icon: Beef,
      children: [
        { title: 'Cow List', url: '/roster', icon: ClipboardList },
        { title: 'Composite Score', url: '/rankings', icon: BarChart3 },
        { title: 'Calving Interval', url: '/calving-interval', icon: Clock },
        { title: 'Open Cows', url: '/open-cows', icon: Ban },
        { title: 'Culling & Retention', url: '/culling', icon: Scissors },
        { title: 'Replacement Heifers', url: '/replacements', icon: Baby },
      ],
    },
    {
      title: 'Herd Trends', icon: TrendingUp,
      children: [
        { title: 'Demographics', url: '/herd-trends', icon: TrendingUp },
        { title: 'Calving Distribution', url: '/calving-distribution', icon: Baby },
      ],
    },
    
  ];

  const toggle = (title: string) =>
    setOpenSections(prev => ({ ...prev, [title]: !prev[title] }));

  const renderItem = (url: string, icon: React.ElementType, title: string) => {
    const Icon = icon;
    return (
      <NavLink
        key={url}
        to={url}
        end={url === '/'}
        className="flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-muted-foreground hover:bg-hover hover:text-foreground transition-colors"
        activeClassName="!bg-primary/10 !text-primary border-l-2 !border-primary font-medium"
        onClick={() => setMobileOpen(false)}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span>{title}</span>
      </NavLink>
    );
  };

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-[60] p-2 rounded-md bg-sidebar text-foreground border border-border lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-[55] lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-screen flex flex-col z-[60] border-r border-border transition-all duration-200 w-[220px]',
          mobileOpen ? 'translate-x-0' : 'max-lg:-translate-x-full lg:translate-x-0',
        )}
        style={{ background: 'linear-gradient(180deg, hsl(224, 52%, 8%) 0%, hsl(190, 40%, 12%) 60%, hsl(40, 50%, 14%) 100%)' }}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 p-1 rounded text-muted-foreground hover:text-foreground lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Branding */}
        <div className="px-5 py-6 border-b border-border cursor-pointer" onClick={() => navigate('/')}>
          <h1 className="text-lg font-bold text-primary leading-tight drop-shadow-[0_0_8px_hsl(40,63%,49%,0.6)]">AI²</h1>
          <p className="text-[10px] text-muted-foreground tracking-wide uppercase">Blair Bros Angus</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
          {sections.map((section) => {
            if (section.children) {
              const isOpen = openSections[section.title] ?? false;
              return (
                <div key={section.title}>
                  <button
                    onClick={() => toggle(section.title)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-muted-foreground hover:bg-hover hover:text-foreground transition-colors"
                  >
                    <section.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{section.title}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', isOpen && 'rotate-180')} />
                  </button>
                  <div className={cn('overflow-hidden transition-all duration-200', isOpen ? 'max-h-60' : 'max-h-0')}>
                    <div className="ml-4 pl-3 border-l border-border/50 space-y-0.5 py-1">
                      {section.children.map(child => renderItem(child.url, child.icon, child.title))}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={section.title} className="relative">
                {renderItem(section.url!, section.icon, section.title)}
                {section.badge != null && section.badge > 0 && (
                  <span className={cn(
                    'absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
                    section.badgeColor,
                  )}>
                    {section.badge}
                  </span>
                )}
              </div>
            );
          })}

          {/* AI Assistant at bottom of nav */}
          <div className="pt-2 mt-2 border-t border-border/50">
            {renderItem('/assistant', Bot, 'AI Assistant')}
          </div>
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
