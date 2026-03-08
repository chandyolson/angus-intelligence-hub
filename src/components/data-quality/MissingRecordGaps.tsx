import { useMemo, useState } from 'react';
import { useAnimals, useBlairCombined } from '@/hooks/useCattleData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GapRecord {
  check: string;
  checkKey: string;
  lifetime_id: string;
  tag: string;
  breeding_year: number;
  lastKnown: string;
}

const CHECK_COLORS: Record<string, string> = {
  'Calved but not bred': 'text-[hsl(25,95%,53%)]',
  'Bred but not preg-checked': 'text-[hsl(45,93%,47%)]',
  'Pregnant, no calf recorded': 'text-destructive',
  'Absent from current season': 'text-destructive',
  'Unexplained gap year': 'text-[hsl(25,95%,53%)]',
};

export function MissingRecordGaps() {
  const { data: animals } = useAnimals();
  const { data: combined } = useBlairCombined();
  const [open, setOpen] = useState(true);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  const gaps: GapRecord[] = useMemo(() => {
    if (!animals || !combined) return [];

    const currentYear = new Date().getFullYear();
    const blairActive = animals.filter(a => a.operation === 'Blair' && a.status?.toLowerCase() === 'active' && a.lifetime_id);
    const tagMap = new Map<string, string>();
    blairActive.forEach(a => tagMap.set(a.lifetime_id!, a.tag ?? '—'));
    const activeLids = new Set(blairActive.map(a => a.lifetime_id!));

    // Index combined by lid → year → record fields
    type YearData = { hasAI: boolean; hasUS: boolean; hasCalving: boolean; pregStage: string | null; calvingDate: string | null; aiDate: string | null; usDate: string | null };
    const lidYears = new Map<string, Map<number, YearData>>();

    combined.forEach(r => {
      if (!r.lifetime_id || r.breeding_year == null) return;
      if (!lidYears.has(r.lifetime_id)) lidYears.set(r.lifetime_id, new Map());
      const ym = lidYears.get(r.lifetime_id)!;
      if (!ym.has(r.breeding_year)) {
        ym.set(r.breeding_year, { hasAI: false, hasUS: false, hasCalving: false, pregStage: null, calvingDate: null, aiDate: null, usDate: null });
      }
      const d = ym.get(r.breeding_year)!;
      if (r.ai_date_1) { d.hasAI = true; d.aiDate = r.ai_date_1; }
      if (r.ultrasound_date) { d.hasUS = true; d.usDate = r.ultrasound_date; }
      if (r.calving_date) { d.hasCalving = true; d.calvingDate = r.calving_date; }
      if (r.preg_stage) d.pregStage = r.preg_stage;
    });

    const results: GapRecord[] = [];
    const pregnantStages = new Set(['AI', 'Second AI', 'Early', 'Middle', 'Late', 'Short', 'Medium', 'Long']);

    activeLids.forEach(lid => {
      const tag = tagMap.get(lid) ?? '—';
      const years = lidYears.get(lid);

      if (!years) {
        // Check 4: no records at all
        results.push({ check: 'Absent from current season', checkKey: 'absent', lifetime_id: lid, tag, breeding_year: currentYear, lastKnown: 'No records found' });
        return;
      }

      const allYears = Array.from(years.keys()).sort((a, b) => a - b);

      allYears.forEach(yr => {
        const d = years.get(yr)!;

        // Check 1: calving but no AI
        if (d.hasCalving && !d.hasAI) {
          results.push({ check: 'Calved but not bred', checkKey: 'no-ai', lifetime_id: lid, tag, breeding_year: yr, lastKnown: `Calving: ${d.calvingDate ?? '?'}` });
        }

        // Check 2: AI but no ultrasound
        if (d.hasAI && !d.hasUS) {
          results.push({ check: 'Bred but not preg-checked', checkKey: 'no-us', lifetime_id: lid, tag, breeding_year: yr, lastKnown: `AI: ${d.aiDate ?? '?'}` });
        }

        // Check 3: pregnant but no calving next year
        if (d.pregStage && pregnantStages.has(d.pregStage) && yr + 1 <= currentYear) {
          const nextYear = years.get(yr + 1);
          if (!d.hasCalving && (!nextYear || !nextYear.hasCalving)) {
            results.push({ check: 'Pregnant, no calf recorded', checkKey: 'no-calf', lifetime_id: lid, tag, breeding_year: yr, lastKnown: `Preg: ${d.pregStage}` });
          }
        }
      });

      // Check 4: absent from most recent breeding year
      if (!years.has(currentYear)) {
        const maxYear = Math.max(...allYears);
        const lastData = years.get(maxYear)!;
        const lastDate = lastData.calvingDate ?? lastData.usDate ?? lastData.aiDate ?? '?';
        results.push({ check: 'Absent from current season', checkKey: 'absent', lifetime_id: lid, tag, breeding_year: currentYear, lastKnown: `Last: ${maxYear} (${lastDate})` });
      }

      // Check 5: gap year (X and X+2 present, X+1 missing)
      for (let i = 0; i < allYears.length - 1; i++) {
        const yrA = allYears[i];
        const yrB = allYears[i + 1];
        if (yrB - yrA === 2) {
          // Year in between is missing
          const gapYr = yrA + 1;
          const prevData = years.get(yrA)!;
          const lastDate = prevData.calvingDate ?? prevData.usDate ?? prevData.aiDate ?? '?';
          results.push({ check: 'Unexplained gap year', checkKey: 'gap', lifetime_id: lid, tag, breeding_year: gapYr, lastKnown: `Prev: ${yrA} (${lastDate})` });
        }
      }
    });

    return results.sort((a, b) => a.check.localeCompare(b.check) || b.breeding_year - a.breeding_year);
  }, [animals, combined]);

  // Group by check
  const grouped = useMemo(() => {
    const map = new Map<string, GapRecord[]>();
    gaps.forEach(g => {
      if (!map.has(g.check)) map.set(g.check, []);
      map.get(g.check)!.push(g);
    });
    return Array.from(map.entries());
  }, [gaps]);

  function exportCSV() {
    const headers = ['Check', 'Lifetime ID', 'Tag', 'Breeding Year', 'Last Known Record'];
    const rows = gaps.map(g => [g.check, g.lifetime_id, g.tag, String(g.breeding_year), g.lastKnown]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `missing-record-gaps-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (!animals || !combined) return null;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-[hsl(25,95%,53%)]" />
            <div>
              <CardTitle className="text-base text-foreground">Missing Record Gaps</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {gaps.length} cross-year gap{gaps.length !== 1 ? 's' : ''} detected across {new Set(gaps.map(g => g.lifetime_id)).size} active cows
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-[hsl(25,95%,53%)]/20 text-[hsl(25,95%,53%)] border-[hsl(25,95%,53%)]/30">{gaps.length}</Badge>
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="pt-0 space-y-4">
          {/* Export button */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2 text-xs">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>

          {/* Grouped check sections */}
          {grouped.map(([check, records]) => {
            const isExpanded = expandedCheck === check;
            const colorCls = CHECK_COLORS[check] ?? 'text-muted-foreground';

            return (
              <div key={check} className="border border-border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-hover/50 transition-colors"
                  onClick={() => setExpandedCheck(isExpanded ? null : check)}
                >
                  <AlertTriangle className={cn('h-4 w-4 shrink-0', colorCls)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{check}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{records.length}</Badge>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-border max-h-[400px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Lifetime ID</TableHead>
                          <TableHead className="text-xs">Tag</TableHead>
                          <TableHead className="text-xs">Breeding Year</TableHead>
                          <TableHead className="text-xs">Last Known Record</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.slice(0, 200).map((r, i) => (
                          <TableRow key={i} className="hover:bg-hover/30">
                            <TableCell className="text-xs font-mono text-primary">{r.lifetime_id}</TableCell>
                            <TableCell className="text-xs">{r.tag}</TableCell>
                            <TableCell className="text-xs">{r.breeding_year}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.lastKnown}</TableCell>
                          </TableRow>
                        ))}
                        {records.length > 200 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-xs text-muted-foreground text-center">
                              Showing 200 of {records.length} records
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}

          {gaps.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No missing record gaps detected ✓</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
