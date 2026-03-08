import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Scissors, Download, Search, ArrowUpDown, GitBranch } from 'lucide-react';
import { useActiveAnimals, useAnimals, useBlairCombined } from '@/hooks/useCattleData';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell, Line, ComposedChart, Scatter } from 'recharts';
import { exportToCSV } from '@/lib/calculations';
import { useNavigate } from 'react-router-dom';

interface CullFlag {
  id: number;
  label: string;
  short: string;
  active: boolean;
  color: string;
}

const FLAG_DEFS: CullFlag[] = [
  { id: 1, label: 'Open event in history', short: 'OPEN', active: true, color: 'text-red-400' },
  { id: 2, label: 'Heavy calves (BW > 90 on 2+)', short: 'HVY', active: true, color: 'text-orange-400' },
  { id: 3, label: 'Light calves (BW < 60 on 2+)', short: 'LGT', active: true, color: 'text-blue-400' },
  { id: 4, label: 'Increasing calving interval', short: 'ICI', active: true, color: 'text-yellow-400' },
  { id: 5, label: 'Chronic long interval (avg > 395d)', short: 'LNG', active: true, color: 'text-orange-400' },
  { id: 6, label: 'Age > 10 years', short: 'OLD', active: true, color: 'text-purple-400' },
  { id: 7, label: 'Low composite (< 25th pctl)', short: 'LOW', active: true, color: 'text-red-400' },
  { id: 8, label: 'One dead calf', short: 'DED', active: true, color: 'text-red-400' },
  { id: 9, label: 'Multiple dead calves (2+)', short: 'DED+', active: true, color: 'text-red-500' },
  { id: 10, label: 'Did not wean (placeholder)', short: 'DNW', active: false, color: 'text-muted-foreground' },
];

type SortKey = 'tag' | 'lifetime_id' | 'age' | 'flagCount' | 'priority' | 'score';

function linearSlope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (ys[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export default function Culling() {
  const { data: animals, isLoading: loadingAnimals } = useActiveAnimals();
  const { data: allAnimals } = useAnimals();
  const { data: records, isLoading: loadingRecords } = useBlairCombined();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('flagCount');
  const [sortAsc, setSortAsc] = useState(false);

  const currentYear = new Date().getFullYear();

  const evaluated = useMemo(() => {
    if (!animals || !records) return [];

    const recsByLid = new Map<string, typeof records>();
    records.forEach(r => {
      if (!r.lifetime_id) return;
      const arr = recsByLid.get(r.lifetime_id) || [];
      arr.push(r);
      recsByLid.set(r.lifetime_id, arr);
    });

    return animals.map(animal => {
      const lid = animal.lifetime_id ?? '';
      const cowRecs = recsByLid.get(lid) || [];
      const flags: number[] = [];
      const age = animal.year_born ? currentYear - animal.year_born : 0;

      // FLAG 1 — Any open event
      if (cowRecs.some(r => r.preg_stage?.toLowerCase() === 'open')) {
        flags.push(1);
      }

      // FLAG 2 — Heavy calves
      const heavyCount = cowRecs.filter(r => r.calf_bw != null && r.calf_bw > 90).length;
      if (heavyCount >= 2) flags.push(2);

      // FLAG 3 — Light calves (exclude bw=0)
      const lightCount = cowRecs.filter(r => r.calf_bw != null && r.calf_bw > 0 && r.calf_bw < 60).length;
      if (lightCount >= 2) flags.push(3);

      // FLAG 4 & 5 — Calving interval flags
      const calvingDates = cowRecs
        .filter(r => r.calving_date)
        .map(r => new Date(r.calving_date!).getTime())
        .sort((a, b) => a - b);
      const intervals: number[] = [];
      for (let i = 1; i < calvingDates.length; i++) {
        const d = Math.round((calvingDates[i] - calvingDates[i - 1]) / (1000 * 60 * 60 * 24));
        if (d > 200 && d < 800) intervals.push(d);
      }

      if (intervals.length >= 2) {
        const slope = linearSlope(intervals);
        const latest = intervals[intervals.length - 1];
        if (slope > 0 && latest > 390) flags.push(4);

        const avgInt = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        if (avgInt > 395) flags.push(5);
      } else if (intervals.length === 1 && intervals[0] > 395) {
        flags.push(5);
      }

      // FLAG 6 — Age > 10
      if (age > 10) flags.push(6);

      // FLAG 7 — Low composite
      if (animal.value_score_percentile != null && animal.value_score_percentile < 25) {
        flags.push(7);
      }

      // FLAG 8 & 9 — Dead calves
      const deadCount = cowRecs.filter(r => r.calf_status?.toLowerCase() === 'dead').length;
      if (deadCount >= 2) flags.push(9);
      else if (deadCount === 1) flags.push(8);

      // Priority
      const hasUrgent = flags.includes(1) || flags.includes(9) || flags.length >= 3;
      const priority = hasUrgent ? 'URGENT' : flags.length >= 2 ? 'REVIEW' : flags.length === 1 ? 'MONITOR' : null;

      return {
        lid,
        tag: animal.tag ?? '',
        age,
        flags,
        flagCount: flags.length,
        priority,
        score: animal.value_score ?? 0,
        percentile: animal.value_score_percentile ?? 0,
      };
    }).filter(c => c.flagCount > 0);
  }, [animals, records, currentYear]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = q ? evaluated.filter(c => c.tag.toLowerCase().includes(q) || c.lid.toLowerCase().includes(q)) : evaluated;

    const priorityOrder = { URGENT: 0, REVIEW: 1, MONITOR: 2 };
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'tag': cmp = a.tag.localeCompare(b.tag); break;
        case 'lifetime_id': cmp = a.lid.localeCompare(b.lid); break;
        case 'age': cmp = a.age - b.age; break;
        case 'flagCount': cmp = a.flagCount - b.flagCount; break;
        case 'priority': cmp = (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3) - (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3); break;
        case 'score': cmp = a.score - b.score; break;
      }
      if (cmp === 0) {
        cmp = b.flagCount - a.flagCount || a.score - b.score;
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [evaluated, search, sortKey, sortAsc]);

  const summary = useMemo(() => {
    let urgent = 0, review = 0, monitor = 0;
    evaluated.forEach(c => {
      if (c.priority === 'URGENT') urgent++;
      else if (c.priority === 'REVIEW') review++;
      else if (c.priority === 'MONITOR') monitor++;
    });
    return { urgent, review, monitor, total: evaluated.length };
  }, [evaluated]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'tag' || key === 'lifetime_id'); }
  };

  const handleExport = () => {
    exportToCSV(filtered.map(c => ({
      tag: c.tag,
      lifetime_id: c.lid,
      age: c.age,
      flag_count: c.flagCount,
      flags: c.flags.map(f => FLAG_DEFS.find(d => d.id === f)?.short).join(', '),
      priority: c.priority,
      value_score: c.score,
      percentile: c.percentile,
    })), 'cull_candidates.csv');
  };

  const loading = loadingAnimals || loadingRecords;

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => handleSort(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k && <ArrowUpDown className="h-3 w-3 text-primary" />}
      </span>
    </TableHead>
  );

  const priorityBadge = (p: string | null) => {
    if (!p) return null;
    const cls = p === 'URGENT' ? 'bg-destructive text-destructive-foreground' : p === 'REVIEW' ? 'bg-yellow-600 text-white' : 'bg-muted text-muted-foreground';
    return <Badge className={cls}>{p}</Badge>;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Culling & Retention</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-destructive">{summary.urgent}</p>
            <p className="text-sm text-muted-foreground">URGENT</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-yellow-500">{summary.review}</p>
            <p className="text-sm text-muted-foreground">REVIEW</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-muted-foreground">{summary.monitor}</p>
            <p className="text-sm text-muted-foreground">MONITOR</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-foreground">{summary.total}</p>
            <p className="text-sm text-muted-foreground">Total Flagged</p>
          </CardContent>
        </Card>
      </div>

      {/* Flag Legend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Flag Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {FLAG_DEFS.map(f => (
              <span key={f.id} className={`text-xs font-mono px-2 py-1 rounded border ${f.active ? f.color + ' border-current/20' : 'text-muted-foreground/40 border-muted line-through'}`}>
                F{f.id} {f.short}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-primary" /> Cull Candidate List
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tag or ID…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 w-56"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground py-8 text-center">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader label="Tag" k="tag" />
                    <SortHeader label="Lifetime ID" k="lifetime_id" />
                    <SortHeader label="Age" k="age" />
                    <SortHeader label="Flags" k="flagCount" />
                    <TableHead>Flag Details</TableHead>
                    <SortHeader label="Priority" k="priority" />
                    <SortHeader label="Score" k="score" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(cow => (
                    <TableRow
                      key={cow.lid}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/cow/${cow.lid}`)}
                    >
                      <TableCell className="font-medium">{cow.tag || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{cow.lid}</TableCell>
                      <TableCell>{cow.age > 0 ? cow.age : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={cow.flagCount >= 3 ? 'destructive' : 'secondary'}>{cow.flagCount}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {cow.flags.map(fId => {
                            const def = FLAG_DEFS.find(d => d.id === fId)!;
                            return (
                              <Tooltip key={fId}>
                                <TooltipTrigger>
                                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded border border-current/20 ${def.color}`}>
                                    F{fId}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{def.label}</TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>{priorityBadge(cow.priority)}</TableCell>
                      <TableCell>{cow.score > 0 ? cow.score.toFixed(1) : '—'}</TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No cull candidates found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sire Line Longevity */}
      <SireLineLongevity allAnimals={allAnimals} records={records} currentYear={currentYear} />
    </div>
  );
}

function SireLineLongevity({ allAnimals, records, currentYear }: {
  allAnimals: any[] | undefined;
  records: any[] | undefined;
  currentYear: number;
}) {
  const data = useMemo(() => {
    if (!allAnimals || !records) return [];

    // Count lifetime calves per cow from blair_combined
    const calvesByLid = new Map<string, number>();
    records.forEach(r => {
      if (!r.lifetime_id || !r.calving_date) return;
      calvesByLid.set(r.lifetime_id, (calvesByLid.get(r.lifetime_id) || 0) + 1);
    });

    // Last ultrasound year per cow (for inactive cows as proxy for last active year)
    const lastUltraYear = new Map<string, number>();
    records.forEach(r => {
      if (!r.lifetime_id || !r.breeding_year) return;
      const prev = lastUltraYear.get(r.lifetime_id) || 0;
      if (r.breeding_year > prev) lastUltraYear.set(r.lifetime_id, r.breeding_year);
    });

    // Group by sire
    const bySire = new Map<string, typeof allAnimals>();
    allAnimals.forEach(a => {
      if (!a.sire || !a.year_born) return;
      const arr = bySire.get(a.sire) || [];
      arr.push(a);
      bySire.set(a.sire, arr);
    });

    const rows: { sire: string; avgTenure: number; avgCalves: number; pctActive: number; count: number }[] = [];

    bySire.forEach((cows, sire) => {
      if (cows.length < 10) return;

      let tenureSum = 0;
      let calvesSum = 0;
      let activeCount = 0;

      cows.forEach((c: any) => {
        const isActive = c.status?.toLowerCase() === 'active';
        if (isActive) {
          tenureSum += currentYear - c.year_born;
          activeCount++;
        } else {
          const lastYear = lastUltraYear.get(c.lifetime_id ?? '') || currentYear;
          tenureSum += lastYear - c.year_born;
        }
        calvesSum += calvesByLid.get(c.lifetime_id ?? '') || 0;
      });

      rows.push({
        sire,
        avgTenure: Math.round((tenureSum / cows.length) * 10) / 10,
        avgCalves: Math.round((calvesSum / cows.length) * 10) / 10,
        pctActive: Math.round((activeCount / cows.length) * 100),
        count: cows.length,
      });
    });

    return rows.sort((a, b) => b.avgTenure - a.avgTenure);
  }, [allAnimals, records, currentYear]);

  if (!data.length) return null;

  // Determine color thresholds using medians
  const medTenure = [...data].sort((a, b) => a.avgTenure - b.avgTenure)[Math.floor(data.length / 2)]?.avgTenure ?? 5;
  const medCalves = [...data].sort((a, b) => a.avgCalves - b.avgCalves)[Math.floor(data.length / 2)]?.avgCalves ?? 3;

  const getColor = (row: typeof data[0]) => {
    if (row.avgTenure >= medTenure && row.avgCalves >= medCalves) return '#22c55e'; // green
    if (row.avgTenure < medTenure && row.avgCalves < medCalves) return '#ef4444'; // red
    return '#eab308'; // yellow
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" /> Cow Sire Line Longevity
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Average herd tenure and lifetime calves by sire line (min 10 daughters). Green = high tenure + high calves. Red = short tenure + few calves.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(400, data.length * 36)}>
          <ComposedChart layout="vertical" data={data} margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" domain={[0, 'auto']} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} label={{ value: 'Avg Tenure (yrs)', position: 'insideBottom', offset: -2, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis dataKey="sire" type="category" width={130} tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }} />
            <RTooltip
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(value: any, name: string) => {
                if (name === 'avgTenure') return [`${value} yrs`, 'Avg Tenure'];
                if (name === 'avgCalves') return [value, 'Avg Calves'];
                return [value, name];
              }}
            />
            <Bar dataKey="avgTenure" barSize={20} radius={[0, 4, 4, 0]}
              label={({ x, y, width, value, index }: any) => (
                <text x={x + width + 4} y={y + 14} fill="hsl(var(--muted-foreground))" fontSize={10}>
                  n={data[index]?.count} | {data[index]?.pctActive}% active
                </text>
              )}
            >
              {data.map((row, i) => (
                <Cell key={i} fill={getColor(row)} fillOpacity={0.75} />
              ))}
            </Bar>
            <Scatter dataKey="avgCalves" fill="hsl(var(--foreground))" shape="circle" legendType="circle" />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
