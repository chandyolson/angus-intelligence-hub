import { useState, useMemo, useCallback } from 'react';
import { useAnimals, useBlairCombined } from '@/hooks/useCattleData';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, AlertOctagon, Info, ShieldAlert, Download, Pencil, CheckCircle2 } from 'lucide-react';
import { ShimmerCard } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { RecordEditPanel, MarkReviewedDialog } from '@/components/data-quality/RecordEditPanel';
import { cn } from '@/lib/utils';

type Severity = 'critical' | 'high' | 'medium' | 'low';
type TableSource = 'combined' | 'animals';

interface Violation {
  checkId: string;
  rule: string;
  severity: Severity;
  lifetime_id: string;
  breeding_year: number | null;
  currentValue: string;
  tableSource: TableSource;
  flaggedField: string;
}

const SEV_CFG: Record<Severity, { label: string; bg: string; border: string; text: string; badgeCls: string; icon: React.ElementType }> = {
  critical: { label: 'Critical', bg: 'bg-destructive/15', border: 'border-destructive/60', text: 'text-destructive', badgeCls: 'bg-destructive text-destructive-foreground', icon: AlertOctagon },
  high:     { label: 'High',     bg: 'bg-[hsl(25,95%,53%)]/15', border: 'border-[hsl(25,95%,53%)]/60', text: 'text-[hsl(25,95%,53%)]', badgeCls: 'bg-[hsl(25,95%,53%)] text-white', icon: AlertTriangle },
  medium:   { label: 'Medium',   bg: 'bg-[hsl(45,93%,47%)]/15', border: 'border-[hsl(45,93%,47%)]/60', text: 'text-[hsl(45,93%,47%)]', badgeCls: 'bg-[hsl(45,93%,47%)] text-black', icon: Info },
  low:      { label: 'Low',      bg: 'bg-muted/30', border: 'border-muted-foreground/40', text: 'text-muted-foreground', badgeCls: 'bg-muted text-muted-foreground', icon: ShieldAlert },
};

const VALID_PREG_STAGES = new Set([
  'AI', 'Second AI', 'Cleanup', 'Short', 'Medium', 'Long',
  'Open', 'Bull', 'ET', 'Exposed', 'Not Exposed',
]);

let checkCounter = 0;
function nextCheckId(prefix: string) { return `${prefix}-${++checkCounter}`; }

export default function DataQuality() {
  const { data: animals, isLoading: loadingAnimals, error: animalsError } = useAnimals();
  const { data: combined, isLoading: loadingCombined, error: combinedError } = useBlairCombined();
  const queryClient = useQueryClient();

  // Fetch reviewed flags
  const { data: reviewedFlags } = useQuery({
    queryKey: ['reviewed_flags'],
    queryFn: async () => {
      const { data } = await (supabase.from('reviewed_flags') as any).select('rule, lifetime_id, breeding_year');
      return new Set((data ?? []).map((r: any) => `${r.rule}|${r.lifetime_id}|${r.breeding_year ?? ''}`));
    },
  });

  const loading = loadingAnimals || loadingCombined;

  // Filters
  const [sevFilter, setSevFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Edit panel state
  const [editTarget, setEditTarget] = useState<Violation | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Violation | null>(null);

  const violations: Violation[] = useMemo(() => {
    if (!animals || !combined) return [];
    checkCounter = 0;

    const v: Violation[] = [];
    const currentYear = new Date().getFullYear();

    const animalByLid = new Map<string, typeof animals[0]>();
    animals.forEach(a => { if (a.lifetime_id) animalByLid.set(a.lifetime_id, a); });

    const blairActive = animals.filter(a => a.operation === 'Blair' && a.status?.toLowerCase() === 'active');

    const dupKey = new Map<string, number>();
    combined.forEach(r => {
      if (!r.lifetime_id || r.breeding_year == null) return;
      const k = `${r.lifetime_id}|${r.breeding_year}`;
      dupKey.set(k, (dupKey.get(k) ?? 0) + 1);
    });

    const byLidYear = new Map<string, typeof combined>();
    combined.forEach(r => {
      if (!r.lifetime_id || r.breeding_year == null) return;
      const k = `${r.lifetime_id}|${r.breeding_year}`;
      const arr = byLidYear.get(k) ?? [];
      arr.push(r);
      byLidYear.set(k, arr);
    });

    const sireVariants = new Map<string, Set<string>>();
    combined.forEach(r => {
      if (!r.ai_sire_1) return;
      const normalized = r.ai_sire_1.trim().toUpperCase().replace(/\s+/g, ' ');
      if (!sireVariants.has(normalized)) sireVariants.set(normalized, new Set());
      sireVariants.get(normalized)!.add(r.ai_sire_1.trim());
    });

    const activeLidsInCurrentYear = new Set<string>();
    combined.forEach(r => {
      if (r.lifetime_id && r.breeding_year === currentYear) activeLidsInCurrentYear.add(r.lifetime_id);
    });

    // ─── CRITICAL ───
    animals.forEach(a => {
      if (!a.lifetime_id) {
        v.push({ checkId: nextCheckId('C'), rule: 'Null Lifetime ID (animals)', severity: 'critical', lifetime_id: `ID:${a.id}`, breeding_year: null, currentValue: '(null)', tableSource: 'animals', flaggedField: 'lifetime_id' });
      }
    });

    combined.forEach(r => {
      const lid = r.lifetime_id ?? '(null)';
      const yr = r.breeding_year ?? null;

      if (!r.lifetime_id) {
        v.push({ checkId: nextCheckId('C'), rule: 'Null Lifetime ID (combined)', severity: 'critical', lifetime_id: '(null)', breeding_year: yr, currentValue: '(null)', tableSource: 'combined', flaggedField: 'lifetime_id' });
      }

      if (r.calving_date && r.ai_date_1 && r.calving_date < r.ai_date_1) {
        v.push({ checkId: nextCheckId('C'), rule: 'Calving before AI date', severity: 'critical', lifetime_id: lid, breeding_year: yr, currentValue: `AI:${r.ai_date_1} Calv:${r.calving_date}`, tableSource: 'combined', flaggedField: 'calving_date' });
      }

      // ─── HIGH ───
      if (r.ai_date_1 && !r.ai_sire_1) {
        v.push({ checkId: nextCheckId('H'), rule: 'AI date without AI sire', severity: 'high', lifetime_id: lid, breeding_year: yr, currentValue: `ai_sire_1: (null)`, tableSource: 'combined', flaggedField: 'ai_sire_1' });
      }

      if (r.calving_date && r.calf_bw == null) {
        v.push({ checkId: nextCheckId('H'), rule: 'Calving without birth weight', severity: 'high', lifetime_id: lid, breeding_year: yr, currentValue: 'calf_bw: (null)', tableSource: 'combined', flaggedField: 'calf_bw' });
      }

      if (r.calving_date && !r.calf_status) {
        v.push({ checkId: nextCheckId('H'), rule: 'Calving without calf status', severity: 'high', lifetime_id: lid, breeding_year: yr, currentValue: 'calf_status: (null)', tableSource: 'combined', flaggedField: 'calf_status' });
      }

      if (!r.preg_stage && (r.ai_date_1 || r.calving_date)) {
        v.push({ checkId: nextCheckId('H'), rule: 'Missing preg stage', severity: 'high', lifetime_id: lid, breeding_year: yr, currentValue: 'preg_stage: (null)', tableSource: 'combined', flaggedField: 'preg_stage' });
      }

      if (r.gestation_days != null && (r.gestation_days < 260 || r.gestation_days > 295)) {
        v.push({ checkId: nextCheckId('H'), rule: 'Abnormal gestation days', severity: 'high', lifetime_id: lid, breeding_year: yr, currentValue: `${r.gestation_days} days`, tableSource: 'combined', flaggedField: 'gestation_days' });
      }

      if (r.calf_bw != null && r.calf_bw === 0) {
        v.push({ checkId: nextCheckId('H'), rule: 'Birth weight = 0', severity: 'high', lifetime_id: lid, breeding_year: yr, currentValue: '0', tableSource: 'combined', flaggedField: 'calf_bw' });
      }

      if (r.calf_bw != null && r.calf_bw > 0 && (r.calf_bw < 40 || r.calf_bw > 150)) {
        v.push({ checkId: nextCheckId('H'), rule: 'Birth weight out of range', severity: 'high', lifetime_id: lid, breeding_year: yr, currentValue: `${r.calf_bw} lbs`, tableSource: 'combined', flaggedField: 'calf_bw' });
      }

      if (r.lifetime_id && r.breeding_year != null) {
        const k = `${r.lifetime_id}|${r.breeding_year}`;
        if ((dupKey.get(k) ?? 0) > 1) {
          v.push({ checkId: nextCheckId('H'), rule: 'Duplicate LID + breeding year', severity: 'high', lifetime_id: lid, breeding_year: yr, currentValue: `count: ${dupKey.get(k)}`, tableSource: 'combined', flaggedField: 'lifetime_id' });
        }
      }

      if (r.ai_date_1 && r.breeding_year != null) {
        const aiYear = parseInt(r.ai_date_1.slice(0, 4), 10);
        if (aiYear !== r.breeding_year) {
          v.push({ checkId: nextCheckId('H'), rule: 'Breeding year ≠ AI date year', severity: 'high', lifetime_id: lid, breeding_year: yr, currentValue: `by:${r.breeding_year} ai:${aiYear}`, tableSource: 'combined', flaggedField: 'breeding_year' });
        }
      }

      if (r.calf_sire === 'CLEANUP' && (r.preg_stage === 'AI' || r.preg_stage === 'Second AI')) {
        v.push({ checkId: nextCheckId('H'), rule: 'CLEANUP calf with AI preg stage', severity: 'high', lifetime_id: lid, breeding_year: yr, currentValue: `preg:${r.preg_stage} sire:CLEANUP`, tableSource: 'combined', flaggedField: 'preg_stage' });
      }

      // ─── MEDIUM ───
      if (r.lifetime_id && !animalByLid.has(r.lifetime_id)) {
        v.push({ checkId: nextCheckId('M'), rule: 'Combined LID not in animals', severity: 'medium', lifetime_id: lid, breeding_year: yr, currentValue: 'not found in animals', tableSource: 'combined', flaggedField: 'lifetime_id' });
      }

      if (r.ai_date_2 && !r.ai_sire_2) {
        v.push({ checkId: nextCheckId('M'), rule: 'AI date 2 without sire 2', severity: 'medium', lifetime_id: lid, breeding_year: yr, currentValue: 'ai_sire_2: (null)', tableSource: 'combined', flaggedField: 'ai_sire_2' });
      }

      if (r.preg_stage && !VALID_PREG_STAGES.has(r.preg_stage)) {
        v.push({ checkId: nextCheckId('M'), rule: 'Invalid preg stage value', severity: 'medium', lifetime_id: lid, breeding_year: yr, currentValue: `"${r.preg_stage}"`, tableSource: 'combined', flaggedField: 'preg_stage' });
      }
    });

    // Active cow cross-checks (HIGH)
    blairActive.forEach(a => {
      if (!a.lifetime_id) return;
      const recs = combined.filter(r => r.lifetime_id === a.lifetime_id);

      const calvingYears = new Set(recs.filter(r => r.calving_date).map(r => r.breeding_year));
      calvingYears.forEach(yr => {
        if (yr == null) return;
        const yearRecs = recs.filter(r => r.breeding_year === yr);
        if (yearRecs.some(r => r.calving_date) && !yearRecs.some(r => r.ai_date_1)) {
          v.push({ checkId: nextCheckId('H'), rule: 'Calving without AI record', severity: 'high', lifetime_id: a.lifetime_id!, breeding_year: yr, currentValue: 'ai_date_1: missing', tableSource: 'combined', flaggedField: 'ai_date_1' });
        }
      });

      const aiYears = new Set(recs.filter(r => r.ai_date_1).map(r => r.breeding_year));
      aiYears.forEach(yr => {
        if (yr == null) return;
        const yearRecs = recs.filter(r => r.breeding_year === yr);
        if (yearRecs.some(r => r.ai_date_1) && !yearRecs.some(r => r.ultrasound_date)) {
          v.push({ checkId: nextCheckId('H'), rule: 'AI without ultrasound', severity: 'high', lifetime_id: a.lifetime_id!, breeding_year: yr, currentValue: 'ultrasound_date: missing', tableSource: 'combined', flaggedField: 'ultrasound_date' });
        }
      });
    });

    // Pregnant but no calving (HIGH)
    combined.forEach(r => {
      if (!r.lifetime_id || !r.preg_stage || r.breeding_year == null) return;
      const isPregnant = ['AI', 'Second AI', 'Cleanup', 'Short', 'Medium', 'Long', 'Bull', 'ET'].includes(r.preg_stage);
      if (!isPregnant) return;
      if (r.breeding_year + 1 <= currentYear) {
        const hasCalving = r.calving_date != null;
        const nextKey = `${r.lifetime_id}|${r.breeding_year + 1}`;
        const nextRecs = byLidYear.get(nextKey);
        if (!hasCalving && (!nextRecs || !nextRecs.some(nr => nr.calving_date))) {
          v.push({ checkId: nextCheckId('H'), rule: 'Pregnant but no calving', severity: 'high', lifetime_id: r.lifetime_id, breeding_year: r.breeding_year, currentValue: `preg:${r.preg_stage}`, tableSource: 'combined', flaggedField: 'calving_date' });
        }
      }
    });

    // Animals checks (MEDIUM)
    animals.forEach(a => {
      if (a.lifetime_id && a.year_born == null) {
        v.push({ checkId: nextCheckId('M'), rule: 'Missing year born', severity: 'medium', lifetime_id: a.lifetime_id, breeding_year: null, currentValue: '(null)', tableSource: 'animals', flaggedField: 'year_born' });
      }
    });

    blairActive.forEach(a => {
      if (a.lifetime_id && a.value_score == null) {
        v.push({ checkId: nextCheckId('M'), rule: 'Missing value score', severity: 'medium', lifetime_id: a.lifetime_id!, breeding_year: null, currentValue: '(null)', tableSource: 'animals', flaggedField: 'value_score' });
      }
      if (a.lifetime_id && !activeLidsInCurrentYear.has(a.lifetime_id) && a.year_born != null && a.year_born <= currentYear - 1) {
        v.push({ checkId: nextCheckId('M'), rule: 'Active cow not in current year', severity: 'medium', lifetime_id: a.lifetime_id!, breeding_year: currentYear, currentValue: 'no records', tableSource: 'combined', flaggedField: 'lifetime_id' });
      }
    });

    sireVariants.forEach((variants) => {
      if (variants.size > 1) {
        const names = Array.from(variants);
        v.push({ checkId: nextCheckId('M'), rule: 'Sire name inconsistency', severity: 'medium', lifetime_id: '—', breeding_year: null, currentValue: names.join(' / '), tableSource: 'combined', flaggedField: 'ai_sire_1' });
      }
    });

    return v;
  }, [animals, combined]);

  // Filter out reviewed violations
  const activeViolations = useMemo(() => {
    if (!reviewedFlags) return violations;
    return violations.filter(v => {
      const key = `${v.rule}|${v.lifetime_id}|${v.breeding_year ?? ''}`;
      return !reviewedFlags.has(key);
    });
  }, [violations, reviewedFlags]);

  const bySeverity = useMemo(() => {
    const map: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    activeViolations.forEach(v => map[v.severity]++);
    return map;
  }, [activeViolations]);

  // Apply filters
  const filtered = useMemo(() => {
    let list = activeViolations;
    if (sevFilter !== 'all') list = list.filter(v => v.severity === sevFilter);
    if (sourceFilter !== 'all') list = list.filter(v => v.tableSource === sourceFilter);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(v => v.lifetime_id.toLowerCase().includes(q));
    }
    return list;
  }, [activeViolations, sevFilter, sourceFilter, searchText]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalFlagged = new Set(activeViolations.map(v => v.lifetime_id)).size;

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['animals'] });
    queryClient.invalidateQueries({ queryKey: ['blair_combined'] });
    queryClient.invalidateQueries({ queryKey: ['reviewed_flags'] });
  }, [queryClient]);

  function exportCSV() {
    const headers = ['Check ID', 'Severity', 'Rule', 'Lifetime ID', 'Breeding Year', 'Current Value', 'Table Source'];
    const rows = filtered.map(v => [v.checkId, v.severity, v.rule, v.lifetime_id, String(v.breeding_year ?? ''), v.currentValue, v.tableSource]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `data-quality-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

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
              const cfg = SEV_CFG[sev];
              const count = bySeverity[sev];
              const isActive = sevFilter === sev;
              const Icon = cfg.icon;

              return (
                <Card
                  key={sev}
                  className={cn(
                    'cursor-pointer transition-all border-l-4',
                    cfg.border,
                    isActive ? `${cfg.bg} ring-1 ring-current ${cfg.text}` : 'bg-card hover:scale-[1.02]',
                  )}
                  onClick={() => { setSevFilter(isActive ? 'all' : sev); setPage(0); }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Icon className={cn('h-5 w-5', cfg.text)} />
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider', cfg.text)}>{cfg.label}</span>
                    </div>
                    <p className={cn('text-3xl font-bold', cfg.text)}>{count.toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">violations</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Total flagged subtitle */}
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{totalFlagged.toLocaleString()}</span> unique records flagged · <span className="font-medium text-foreground">{activeViolations.length.toLocaleString()}</span> total violations
          </p>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={sevFilter} onValueChange={v => { setSevFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[140px] bg-card text-sm"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={v => { setSourceFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[140px] bg-card text-sm"><SelectValue placeholder="Table" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tables</SelectItem>
                <SelectItem value="combined">combined</SelectItem>
                <SelectItem value="animals">animals</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Search Lifetime ID…"
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setPage(0); }}
              className="w-[200px] bg-card text-sm"
            />

            <div className="flex-1" />

            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>

          {/* Results count */}
          <p className="text-xs text-muted-foreground">
            Showing {pageData.length} of {filtered.length} violations
            {sevFilter !== 'all' && <span> · Filtered by <span className="font-medium capitalize">{sevFilter}</span></span>}
          </p>

          {/* Data table */}
          <Card className="bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[80px]">Check ID</TableHead>
                    <TableHead className="text-xs w-[90px]">Severity</TableHead>
                    <TableHead className="text-xs">Rule</TableHead>
                    <TableHead className="text-xs">Lifetime ID</TableHead>
                    <TableHead className="text-xs w-[80px]">Year</TableHead>
                    <TableHead className="text-xs">Current Value</TableHead>
                    <TableHead className="text-xs w-[80px]">Source</TableHead>
                    <TableHead className="text-xs w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageData.map(v => {
                    const cfg = SEV_CFG[v.severity];
                    return (
                      <TableRow key={v.checkId} className="hover:bg-hover/30">
                        <TableCell className="text-xs font-mono text-muted-foreground">{v.checkId}</TableCell>
                        <TableCell>
                          <Badge className={cn('text-[10px] px-2 py-0.5', cfg.badgeCls)}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground">{v.rule}</TableCell>
                        <TableCell className="text-xs font-mono text-primary">{v.lifetime_id}</TableCell>
                        <TableCell className="text-xs">{v.breeding_year ?? '—'}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground max-w-[200px] truncate">{v.currentValue}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px]">{v.tableSource}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => setEditTarget(v)}
                              disabled={v.lifetime_id === '(null)' || v.lifetime_id === '—'}
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 px-2 text-xs gap-1 text-muted-foreground"
                              onClick={() => setReviewTarget(v)}
                              disabled={v.lifetime_id === '(null)' || v.lifetime_id === '—'}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {pageData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                        No violations match your filters
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
              </div>
            </div>
          )}

          {/* Edit panel */}
          {editTarget && (
            <RecordEditPanel
              open={!!editTarget}
              onClose={() => setEditTarget(null)}
              lifetime_id={editTarget.lifetime_id}
              breeding_year={editTarget.breeding_year}
              tableSource={editTarget.tableSource}
              flaggedField={editTarget.flaggedField}
              currentValue={editTarget.currentValue}
              rule={editTarget.rule}
              onSaved={handleRefresh}
            />
          )}

          {/* Mark reviewed panel */}
          {reviewTarget && (
            <MarkReviewedDialog
              open={!!reviewTarget}
              onClose={() => setReviewTarget(null)}
              rule={reviewTarget.rule}
              lifetime_id={reviewTarget.lifetime_id}
              breeding_year={reviewTarget.breeding_year}
              onSaved={handleRefresh}
            />
          )}
        </>
      )}
    </div>
  );
}
