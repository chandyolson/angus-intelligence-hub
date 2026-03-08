import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, ArrowUpDown } from 'lucide-react';

interface SireOverviewRow {
  sire: string;
  totalUses: number;
  totalCalves: number;
  rate1st: number;
  n1st: number;
  rate2nd: number;
  n2nd: number;
  overallRate: number;
  nOverall: number;
  avgBW: number;
  nBW: number;
  avgGest: number;
  nGest: number;
  survivalPct: number;
  nSurvival: number;
  grade: number;
  gradeLetter: string;
}

type SortKey = keyof Pick<SireOverviewRow, 'sire' | 'totalUses' | 'totalCalves' | 'rate1st' | 'rate2nd' | 'overallRate' | 'avgBW' | 'avgGest' | 'survivalPct' | 'grade'>;

function computeSireOverview(records: BreedingCalvingRecord[]): SireOverviewRow[] {
  // Filter Blair only
  const blairRecords = records.filter(r => (r as any).operation === 'Blair');

  // 1st service map (by ai_sire_1)
  const first = new Map<string, { attempts: number; conceived: number }>();
  // 2nd service map (by ai_sire_2)
  const second = new Map<string, { attempts: number; conceived: number }>();
  // Calf outcome map (by calf_sire)
  const calfMap = new Map<string, { bws: number[]; gests: number[]; alive: number; withStatus: number; totalCalves: number }>();

  blairRecords.forEach(r => {
    // 1st service
    if (r.ai_sire_1 && r.ai_date_1) {
      const e = first.get(r.ai_sire_1) || { attempts: 0, conceived: 0 };
      e.attempts++;
      if (r.preg_stage?.toLowerCase() === 'ai') e.conceived++;
      first.set(r.ai_sire_1, e);
    }

    // 2nd service
    if (r.ai_sire_2 && r.ai_date_2) {
      const e = second.get(r.ai_sire_2) || { attempts: 0, conceived: 0 };
      e.attempts++;
      if (r.preg_stage?.toLowerCase() === 'second ai') e.conceived++;
      second.set(r.ai_sire_2, e);
    }

    // Calf outcomes by calf_sire
    if (r.calf_sire) {
      const e = calfMap.get(r.calf_sire) || { bws: [], gests: [], alive: 0, withStatus: 0, totalCalves: 0 };
      e.totalCalves++;
      if (r.calf_bw != null && r.calf_bw > 0) e.bws.push(r.calf_bw);
      if (r.gestation_days != null && r.gestation_days >= 260 && r.gestation_days <= 295) e.gests.push(r.gestation_days);
      if (r.calf_status) {
        e.withStatus++;
        if (r.calf_status.toLowerCase() === 'alive') e.alive++;
      }
      calfMap.set(r.calf_sire, e);
    }
  });

  // Collect all sire names
  const allSires = new Set<string>();
  first.forEach((_, s) => allSires.add(s));
  second.forEach((_, s) => allSires.add(s));

  const rows: SireOverviewRow[] = [];

  allSires.forEach(sire => {
    const f = first.get(sire);
    const s = second.get(sire);
    const totalUses = (f?.attempts || 0) + (s?.attempts || 0);
    if (totalUses < 10) return;

    const n1st = f?.attempts || 0;
    const conceived1st = f?.conceived || 0;
    const rate1st = n1st > 0 ? Math.round((conceived1st / n1st) * 1000) / 10 : 0;

    const n2nd = s?.attempts || 0;
    const conceived2nd = s?.conceived || 0;
    const rate2nd = n2nd > 0 ? Math.round((conceived2nd / n2nd) * 1000) / 10 : 0;

    const nOverall = n1st + n2nd;
    const conceivedOverall = conceived1st + conceived2nd;
    const overallRate = nOverall > 0 ? Math.round((conceivedOverall / nOverall) * 1000) / 10 : 0;

    const calf = calfMap.get(sire);
    const avgBW = calf && calf.bws.length > 0 ? Math.round((calf.bws.reduce((a, b) => a + b, 0) / calf.bws.length) * 10) / 10 : 0;
    const avgGest = calf && calf.gests.length > 0 ? Math.round((calf.gests.reduce((a, b) => a + b, 0) / calf.gests.length) * 10) / 10 : 0;
    const survivalPct = calf && calf.withStatus > 0 ? Math.round((calf.alive / calf.withStatus) * 1000) / 10 : 0;
    const nSurvival = calf?.withStatus || 0;

    const hasSurvival = nSurvival >= MIN_METRIC;
    const grade = hasSurvival ? survivalPct * 0.75 + overallRate * 0.25 : 0;
    let gradeLetter = '—';
    if (hasSurvival) {
      if (grade >= 85) gradeLetter = 'A';
      else if (grade >= 75) gradeLetter = 'B';
      else if (grade >= 65) gradeLetter = 'C';
      else if (grade >= 55) gradeLetter = 'D';
      else gradeLetter = 'F';
    }

    rows.push({
      sire,
      totalCalves: calf?.totalCalves || 0,
      totalUses,
      rate1st, n1st,
      rate2nd, n2nd,
      overallRate, nOverall,
      avgBW, nBW: calf?.bws.length || 0,
      avgGest, nGest: calf?.gests.length || 0,
      survivalPct, nSurvival,
      grade,
      gradeLetter,
    });
  });

  return rows;
}

const rateColor = (rate: number) => {
  if (rate >= 70) return 'hsl(142, 71%, 45%)';
  if (rate >= 55) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 72%, 51%)';
};

const bwColor = (bw: number) => {
  if (bw >= 65 && bw <= 85) return 'hsl(142, 71%, 45%)';
  if ((bw >= 60 && bw < 65) || (bw > 85 && bw <= 90)) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 72%, 51%)';
};

const gestColor = (g: number) => {
  if (g >= 270 && g <= 285) return 'hsl(142, 71%, 45%)';
  if ((g >= 265 && g < 270) || (g > 285 && g <= 290)) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 72%, 51%)';
};

const gradeStyle = (letter: string) => {
  switch (letter) {
    case 'A':
    case 'B': return 'bg-success/20 text-success border-success/30';
    case 'C': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'D':
    case 'F': return 'bg-destructive/20 text-destructive border-destructive/30';
    default: return '';
  }
};

const MIN_METRIC = 5;

const columns: { key: SortKey; label: string }[] = [
  { key: 'sire', label: 'Sire Name' },
  { key: 'totalUses', label: 'Total Uses' },
  { key: 'totalCalves', label: 'Calves Born' },
  { key: 'rate1st', label: '1st Service %' },
  { key: 'rate2nd', label: '2nd Service %' },
  { key: 'overallRate', label: 'Overall AI %' },
  { key: 'avgBW', label: 'Avg BW (lbs)' },
  { key: 'avgGest', label: 'Avg Gestation' },
  { key: 'survivalPct', label: 'Survival %' },
  { key: 'grade', label: 'Grade' },
];

function exportCSV(rows: SireOverviewRow[]) {
  const header = 'Sire,Total Uses,Calves Born,1st Service %,n (1st),2nd Service %,n (2nd),Overall AI %,Avg BW (lbs),Avg Gestation,Survival %,Grade\n';
  const body = rows.map(r =>
    `"${r.sire}",${r.totalUses},${r.totalCalves},${r.n1st >= MIN_METRIC ? r.rate1st : ''},${r.n1st},${r.n2nd >= MIN_METRIC ? r.rate2nd : ''},${r.n2nd},${r.overallRate},${r.nBW >= MIN_METRIC ? r.avgBW : ''},${r.nGest >= MIN_METRIC ? r.avgGest : ''},${r.nSurvival >= MIN_METRIC ? r.survivalPct : ''},${r.gradeLetter}`
  ).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sire_overview.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function SireOverviewTable({ records }: { records: BreedingCalvingRecord[] }) {
  const navigate = useNavigate();
  const allRows = useMemo(() => computeSireOverview(records), [records]);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('overallRate');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return allRows;
    const q = search.toLowerCase();
    return allRows.filter(r => r.sire.toLowerCase().includes(q));
  }, [allRows, search]);

  const sorted = useMemo(() => {
    const s = [...filtered];
    s.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return s;
  }, [filtered, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  if (allRows.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Sire Overview</CardTitle>
        </CardHeader>
        <CardContent><EmptyState message="No sires with 10+ total uses." /></CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">Sire Overview — Blair Operation</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search sire…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 w-48 text-xs"
            />
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => exportCSV(sorted)}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Conception uses ai_sire_1/ai_sire_2. BW, gestation & survival use calf_sire. Min 10 total uses. "—" = fewer than 5 records.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[600px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                {columns.map(col => (
                  <TableHead
                    key={col.key}
                    className="text-[11px] cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}{arrow(col.key)}
                      {sortKey !== col.key && <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r, i) => (
                <TableRow
                  key={r.sire}
                  className="border-border text-[12px] cursor-pointer hover:bg-muted/50 transition-colors"
                  style={{ backgroundColor: i % 2 === 1 ? 'hsl(var(--sidebar-background))' : undefined }}
                  onClick={() => navigate(`/sires/${encodeURIComponent(r.sire)}`)}
                >
                  <TableCell className="font-medium text-foreground">{r.sire}</TableCell>
                  <TableCell className="text-muted-foreground">{r.totalUses}</TableCell>
                  <TableCell className="text-muted-foreground">{r.totalCalves || '—'}</TableCell>

                  {/* 1st Service */}
                  <TableCell>
                    {r.n1st >= MIN_METRIC ? (
                      <span className="font-semibold" style={{ color: rateColor(r.rate1st) }}>{r.rate1st}%</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>

                  {/* 2nd Service */}
                  <TableCell>
                    {r.n2nd >= MIN_METRIC ? (
                      <span className="font-semibold" style={{ color: rateColor(r.rate2nd) }}>{r.rate2nd}%</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>

                  {/* Overall */}
                  <TableCell>
                    <span className="font-semibold" style={{ color: rateColor(r.overallRate) }}>{r.overallRate}%</span>
                  </TableCell>

                  {/* Avg BW */}
                  <TableCell>
                    {r.nBW >= MIN_METRIC ? (
                      <span style={{ color: bwColor(r.avgBW) }}>{r.avgBW}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>

                  {/* Avg Gestation */}
                  <TableCell>
                    {r.nGest >= MIN_METRIC ? (
                      <span style={{ color: gestColor(r.avgGest) }}>{r.avgGest}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>

                  {/* Survival */}
                  <TableCell>
                    {r.nSurvival >= MIN_METRIC ? (
                      <span>{r.survivalPct}%</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>

                  {/* Grade */}
                  <TableCell>
                    {r.gradeLetter !== '—' ? (
                      <Badge variant="outline" className={`text-[10px] ${gradeStyle(r.gradeLetter)}`}>{r.gradeLetter}</Badge>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
