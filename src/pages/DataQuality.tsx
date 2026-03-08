import { useState, useMemo } from 'react';
import { useAnimals, useBlairCombined } from '@/hooks/useCattleData';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, AlertOctagon, Info, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { ShimmerCard } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { cn } from '@/lib/utils';

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface Violation {
  rule: string;
  severity: Severity;
  lifetime_id: string;
  detail: string;
  breeding_year?: number | null;
}

const SEVERITY_CONFIG: Record<Severity, { label: string; bg: string; border: string; text: string; icon: React.ElementType }> = {
  critical: { label: 'Critical', bg: 'bg-destructive/15', border: 'border-destructive/60', text: 'text-destructive', icon: AlertOctagon },
  high:     { label: 'High',     bg: 'bg-[hsl(25,95%,53%)]/15', border: 'border-[hsl(25,95%,53%)]/60', text: 'text-[hsl(25,95%,53%)]', icon: AlertTriangle },
  medium:   { label: 'Medium',   bg: 'bg-[hsl(45,93%,47%)]/15', border: 'border-[hsl(45,93%,47%)]/60', text: 'text-[hsl(45,93%,47%)]', icon: Info },
  low:      { label: 'Low',      bg: 'bg-muted/30', border: 'border-muted-foreground/40', text: 'text-muted-foreground', icon: ShieldAlert },
};

const VALID_PREG_STAGES = new Set([
  'AI', 'Second AI', 'Cleanup', 'Short', 'Medium', 'Long',
  'Open', 'Bull', 'ET', 'Exposed', 'Not Exposed',
]);

export default function DataQuality() {
  const { data: animals, isLoading: loadingAnimals, error: animalsError } = useAnimals();
  const { data: combined, isLoading: loadingCombined, error: combinedError } = useBlairCombined();
  const loading = loadingAnimals || loadingCombined;
  const [activeSeverity, setActiveSeverity] = useState<Severity | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  const violations: Violation[] = useMemo(() => {
    if (!animals || !combined) return [];

    const v: Violation[] = [];
    const currentYear = new Date().getFullYear();

    // Build lookup maps
    const animalByLid = new Map<string, typeof animals[0]>();
    animals.forEach(a => { if (a.lifetime_id) animalByLid.set(a.lifetime_id, a); });

    const combinedLids = new Set<string>();
    combined.forEach(r => { if (r.lifetime_id) combinedLids.add(r.lifetime_id); });

    const blairActive = animals.filter(a => a.operation === 'Blair' && a.status?.toLowerCase() === 'active');

    // Duplicate check: lifetime_id + breeding_year
    const dupKey = new Map<string, number>();
    combined.forEach(r => {
      if (!r.lifetime_id || r.breeding_year == null) return;
      const k = `${r.lifetime_id}|${r.breeding_year}`;
      dupKey.set(k, (dupKey.get(k) ?? 0) + 1);
    });

    // Combined records by lid+year for cross-checks
    const byLidYear = new Map<string, typeof combined>();
    combined.forEach(r => {
      if (!r.lifetime_id || r.breeding_year == null) return;
      const k = `${r.lifetime_id}|${r.breeding_year}`;
      const arr = byLidYear.get(k) ?? [];
      arr.push(r);
      byLidYear.set(k, arr);
    });

    // Sire name variants (for inconsistency check)
    const sireVariants = new Map<string, Set<string>>();
    combined.forEach(r => {
      if (!r.ai_sire_1) return;
      const normalized = r.ai_sire_1.trim().toUpperCase().replace(/\s+/g, ' ');
      if (!sireVariants.has(normalized)) sireVariants.set(normalized, new Set());
      sireVariants.get(normalized)!.add(r.ai_sire_1.trim());
    });

    // Track which active cows appear in current breeding year
    const activeLidsInCurrentYear = new Set<string>();
    combined.forEach(r => {
      if (r.lifetime_id && r.breeding_year === currentYear) activeLidsInCurrentYear.add(r.lifetime_id);
    });

    // ─── CRITICAL ───
    // Null lifetime_id in animals
    animals.forEach(a => {
      if (!a.lifetime_id) {
        v.push({ rule: 'Null Lifetime ID (animals)', severity: 'critical', lifetime_id: `ID:${a.id}`, detail: `Tag: ${a.tag ?? '—'}, Status: ${a.status ?? '—'}` });
      }
    });

    combined.forEach(r => {
      const lid = r.lifetime_id ?? '(null)';

      // Null lifetime_id in combined
      if (!r.lifetime_id) {
        v.push({ rule: 'Null Lifetime ID (combined)', severity: 'critical', lifetime_id: '(null)', detail: `Year: ${r.breeding_year ?? '?'}, Calving: ${r.calving_date ?? '—'}`, breeding_year: r.breeding_year });
      }

      // Calving date before AI date
      if (r.calving_date && r.ai_date_1 && r.calving_date < r.ai_date_1) {
        v.push({ rule: 'Calving before AI date', severity: 'critical', lifetime_id: lid, detail: `AI: ${r.ai_date_1}, Calving: ${r.calving_date}`, breeding_year: r.breeding_year });
      }

      // ─── HIGH ───
      if (r.ai_date_1 && !r.ai_sire_1) {
        v.push({ rule: 'AI date without AI sire', severity: 'high', lifetime_id: lid, detail: `AI Date: ${r.ai_date_1}, Year: ${r.breeding_year ?? '?'}`, breeding_year: r.breeding_year });
      }

      if (r.calving_date && r.calf_bw == null) {
        v.push({ rule: 'Calving without birth weight', severity: 'high', lifetime_id: lid, detail: `Calving: ${r.calving_date}, Sire: ${r.calf_sire ?? '?'}`, breeding_year: r.breeding_year });
      }

      if (r.calving_date && !r.calf_status) {
        v.push({ rule: 'Calving without calf status', severity: 'high', lifetime_id: lid, detail: `Calving: ${r.calving_date}`, breeding_year: r.breeding_year });
      }

      if (!r.preg_stage && (r.ai_date_1 || r.calving_date)) {
        v.push({ rule: 'Missing preg stage', severity: 'high', lifetime_id: lid, detail: `Year: ${r.breeding_year ?? '?'}`, breeding_year: r.breeding_year });
      }

      if (r.gestation_days != null && (r.gestation_days < 260 || r.gestation_days > 295)) {
        v.push({ rule: 'Abnormal gestation days', severity: 'high', lifetime_id: lid, detail: `${r.gestation_days} days, Year: ${r.breeding_year ?? '?'}`, breeding_year: r.breeding_year });
      }

      if (r.calf_bw != null && r.calf_bw === 0) {
        v.push({ rule: 'Birth weight = 0', severity: 'high', lifetime_id: lid, detail: `Calving: ${r.calving_date ?? '?'}`, breeding_year: r.breeding_year });
      }

      if (r.calf_bw != null && r.calf_bw > 0 && (r.calf_bw < 40 || r.calf_bw > 150)) {
        v.push({ rule: 'Birth weight out of range', severity: 'high', lifetime_id: lid, detail: `${r.calf_bw} lbs, Calving: ${r.calving_date ?? '?'}`, breeding_year: r.breeding_year });
      }

      // Duplicate lifetime_id + breeding_year
      if (r.lifetime_id && r.breeding_year != null) {
        const k = `${r.lifetime_id}|${r.breeding_year}`;
        if ((dupKey.get(k) ?? 0) > 1) {
          v.push({ rule: 'Duplicate LID + breeding year', severity: 'high', lifetime_id: lid, detail: `Year: ${r.breeding_year}, Count: ${dupKey.get(k)}`, breeding_year: r.breeding_year });
        }
      }

      // Breeding year mismatches AI date year
      if (r.ai_date_1 && r.breeding_year != null) {
        const aiYear = parseInt(r.ai_date_1.slice(0, 4), 10);
        if (aiYear !== r.breeding_year) {
          v.push({ rule: 'Breeding year ≠ AI date year', severity: 'high', lifetime_id: lid, detail: `Breeding Year: ${r.breeding_year}, AI Year: ${aiYear}`, breeding_year: r.breeding_year });
        }
      }

      // Calf sire CLEANUP but preg stage AI
      if (r.calf_sire === 'CLEANUP' && (r.preg_stage === 'AI' || r.preg_stage === 'Second AI')) {
        v.push({ rule: 'CLEANUP calf with AI preg stage', severity: 'high', lifetime_id: lid, detail: `Preg: ${r.preg_stage}, Sire: ${r.calf_sire}, Year: ${r.breeding_year ?? '?'}`, breeding_year: r.breeding_year });
      }

      // ─── MEDIUM ───
      if (r.lifetime_id && !animalByLid.has(r.lifetime_id)) {
        v.push({ rule: 'Combined LID not in animals', severity: 'medium', lifetime_id: lid, detail: `Year: ${r.breeding_year ?? '?'}`, breeding_year: r.breeding_year });
      }

      if (r.ai_date_2 && !r.ai_sire_2) {
        v.push({ rule: 'AI date 2 without sire 2', severity: 'medium', lifetime_id: lid, detail: `AI Date 2: ${r.ai_date_2}`, breeding_year: r.breeding_year });
      }

      if (r.preg_stage && !VALID_PREG_STAGES.has(r.preg_stage)) {
        v.push({ rule: 'Invalid preg stage value', severity: 'medium', lifetime_id: lid, detail: `"${r.preg_stage}", Year: ${r.breeding_year ?? '?'}`, breeding_year: r.breeding_year });
      }
    });

    // Active cow has calving_date but no ai_date_1 same year (HIGH)
    blairActive.forEach(a => {
      if (!a.lifetime_id) return;
      const recs = combined.filter(r => r.lifetime_id === a.lifetime_id);
      const years = new Set(recs.filter(r => r.calving_date).map(r => r.breeding_year));
      years.forEach(yr => {
        if (yr == null) return;
        const yearRecs = recs.filter(r => r.breeding_year === yr);
        const hasCalving = yearRecs.some(r => r.calving_date);
        const hasAI = yearRecs.some(r => r.ai_date_1);
        if (hasCalving && !hasAI) {
          v.push({ rule: 'Calving without AI record', severity: 'high', lifetime_id: a.lifetime_id!, detail: `Year: ${yr}`, breeding_year: yr });
        }
      });
    });

    // Active cow has ai_date_1 but no ultrasound_date same year (HIGH)
    blairActive.forEach(a => {
      if (!a.lifetime_id) return;
      const recs = combined.filter(r => r.lifetime_id === a.lifetime_id);
      const years = new Set(recs.filter(r => r.ai_date_1).map(r => r.breeding_year));
      years.forEach(yr => {
        if (yr == null) return;
        const yearRecs = recs.filter(r => r.breeding_year === yr);
        const hasAI = yearRecs.some(r => r.ai_date_1);
        const hasUS = yearRecs.some(r => r.ultrasound_date);
        if (hasAI && !hasUS) {
          v.push({ rule: 'AI without ultrasound', severity: 'high', lifetime_id: a.lifetime_id!, detail: `Year: ${yr}`, breeding_year: yr });
        }
      });
    });

    // Confirmed pregnant but no calving_date following year (HIGH)
    combined.forEach(r => {
      if (!r.lifetime_id || !r.preg_stage || r.breeding_year == null) return;
      const isPregnant = ['AI', 'Second AI', 'Cleanup', 'Short', 'Medium', 'Long', 'Bull', 'ET'].includes(r.preg_stage);
      if (!isPregnant) return;
      const nextYearKey = `${r.lifetime_id}|${r.breeding_year + 1}`;
      const nextYearRecs = byLidYear.get(nextYearKey);
      // Only check if next year would be <= currentYear
      if (r.breeding_year + 1 <= currentYear) {
        // Check if there's a calving record for this conception in the data
        const hasFollowUpCalving = r.calving_date != null;
        if (!hasFollowUpCalving && (!nextYearRecs || !nextYearRecs.some(nr => nr.calving_date))) {
          v.push({ rule: 'Pregnant but no calving', severity: 'high', lifetime_id: r.lifetime_id, detail: `Preg: ${r.preg_stage}, Year: ${r.breeding_year}`, breeding_year: r.breeding_year });
        }
      }
    });

    // year_born null in animals (MEDIUM)
    animals.forEach(a => {
      if (a.lifetime_id && a.year_born == null) {
        v.push({ rule: 'Missing year born', severity: 'medium', lifetime_id: a.lifetime_id, detail: `Tag: ${a.tag ?? '—'}, Status: ${a.status ?? '—'}` });
      }
    });

    // value_score null for active cow (MEDIUM)
    blairActive.forEach(a => {
      if (a.lifetime_id && a.value_score == null) {
        v.push({ rule: 'Missing value score', severity: 'medium', lifetime_id: a.lifetime_id!, detail: `Tag: ${a.tag ?? '—'}, Born: ${a.year_born ?? '?'}` });
      }
    });

    // Active cow missing from current breeding year entirely (MEDIUM)
    blairActive.forEach(a => {
      if (a.lifetime_id && !activeLidsInCurrentYear.has(a.lifetime_id) && a.year_born != null && a.year_born <= currentYear - 1) {
        v.push({ rule: 'Active cow not in current year', severity: 'medium', lifetime_id: a.lifetime_id!, detail: `Born: ${a.year_born}, Tag: ${a.tag ?? '—'}` });
      }
    });

    // Sire name inconsistency (MEDIUM)
    sireVariants.forEach((variants, _normalized) => {
      if (variants.size > 1) {
        const names = Array.from(variants);
        names.forEach(name => {
          v.push({ rule: 'Sire name inconsistency', severity: 'medium', lifetime_id: '—', detail: `Variants: ${names.join(', ')}` });
        });
      }
    });

    return v;
  }, [animals, combined]);

  // Group by severity
  const bySeverity = useMemo(() => {
    const map: Record<Severity, Violation[]> = { critical: [], high: [], medium: [], low: [] };
    violations.forEach(v => map[v.severity].push(v));
    return map;
  }, [violations]);

  // Group filtered violations by rule
  const filteredByRule = useMemo(() => {
    const filtered = activeSeverity ? bySeverity[activeSeverity] : violations;
    const map = new Map<string, { severity: Severity; records: Violation[] }>();
    filtered.forEach(v => {
      if (!map.has(v.rule)) map.set(v.rule, { severity: v.severity, records: [] });
      map.get(v.rule)!.records.push(v);
    });
    return Array.from(map.entries()).sort((a, b) => {
      const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a[1].severity] - order[b[1].severity]) || (b[1].records.length - a[1].records.length);
    });
  }, [violations, bySeverity, activeSeverity]);

  const totalFlagged = new Set(violations.map(v => v.lifetime_id)).size;

  if (animalsError || combinedError) return <ErrorBox />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="-mx-6 -mt-6 px-6 pt-6 pb-4 mb-2" style={{ background: 'linear-gradient(180deg, hsl(224, 52%, 14%) 0%, hsl(224, 48%, 11%) 100%)' }}>
        <h1 className="text-[20px] font-semibold text-foreground">Data Quality</h1>
        <p className="text-sm text-muted-foreground mt-1">Automated integrity checks across breeding & animal records</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <ShimmerCard key={i} />)}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(['critical', 'high', 'medium', 'low'] as Severity[]).map(sev => {
              const cfg = SEVERITY_CONFIG[sev];
              const count = bySeverity[sev].length;
              const isActive = activeSeverity === sev;
              const Icon = cfg.icon;

              return (
                <Card
                  key={sev}
                  className={cn(
                    'cursor-pointer transition-all border-l-4',
                    cfg.border,
                    isActive ? `${cfg.bg} ring-1 ring-current ${cfg.text}` : 'bg-card hover:scale-[1.02]',
                  )}
                  onClick={() => setActiveSeverity(isActive ? null : sev)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Icon className={cn('h-5 w-5', cfg.text)} />
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider', cfg.text)}>{cfg.label}</span>
                    </div>
                    <p className={cn('text-3xl font-bold', cfg.text)}>{count.toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">violations found</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Total flagged subtitle */}
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{totalFlagged.toLocaleString()}</span> unique records flagged across{' '}
            <span className="font-medium text-foreground">{violations.length.toLocaleString()}</span> total violations
            {activeSeverity && (
              <button onClick={() => setActiveSeverity(null)} className="ml-3 text-xs text-primary hover:underline">
                Clear filter
              </button>
            )}
          </p>

          {/* Violations grouped by rule */}
          <div className="space-y-3">
            {filteredByRule.map(([rule, { severity, records }]) => {
              const cfg = SEVERITY_CONFIG[severity];
              const isExpanded = expandedRule === rule;
              const Icon = cfg.icon;

              return (
                <Card key={rule} className={cn('bg-card border-l-4', cfg.border)}>
                  <CardContent className="p-0">
                    <button
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-hover/50 transition-colors"
                      onClick={() => setExpandedRule(isExpanded ? null : rule)}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', cfg.text)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{rule}</p>
                        <p className="text-xs text-muted-foreground">{records.length} violation{records.length !== 1 ? 's' : ''}</p>
                      </div>
                      <span className={cn('text-lg font-bold mr-2', cfg.text)}>{records.length}</span>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border max-h-[400px] overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Lifetime ID</TableHead>
                              <TableHead className="text-xs">Detail</TableHead>
                              <TableHead className="text-xs">Year</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {records.slice(0, 200).map((r, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-mono">{r.lifetime_id}</TableCell>
                                <TableCell className="text-xs">{r.detail}</TableCell>
                                <TableCell className="text-xs">{r.breeding_year ?? '—'}</TableCell>
                              </TableRow>
                            ))}
                            {records.length > 200 && (
                              <TableRow>
                                <TableCell colSpan={3} className="text-xs text-muted-foreground text-center">
                                  Showing 200 of {records.length} records
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
