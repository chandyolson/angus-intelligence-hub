import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Baby, Download, Search, ArrowUpDown, ChevronDown } from 'lucide-react';
import { useAnimals, useBlairCombined } from '@/hooks/useCattleData';
import { exportToCSV } from '@/lib/calculations';
import { useNavigate } from 'react-router-dom';
import { anonymizeSire } from '@/utils/anonymize';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend, ReferenceLine, LabelList,
  BarChart, Bar, Cell, ScatterChart, Scatter, ZAxis,
} from 'recharts';

type SortKey = 'heiferTag' | 'heiferYear' | 'damTag' | 'damScore' | 'damCalves' | 'damConception' | 'damInterval' | 'damGestation';

export default function Replacements() {
  const { data: allAnimals, isLoading: loadingAnimals } = useAnimals();
  const { data: records, isLoading: loadingRecords } = useBlairCombined();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('damScore');
  const [sortAsc, setSortAsc] = useState(false);

  const currentYear = new Date().getFullYear();
  const loading = loadingAnimals || loadingRecords;

  // ── Section 1: Heifer Candidates by Dam Score ──
  const { heiferRows, yearOptions, q75 } = useMemo(() => {
    if (!allAnimals || !records) return { heiferRows: [], yearOptions: [] as number[], q75: 0 };

    const animalMap = new Map<string, (typeof allAnimals)[0]>();
    allAnimals.forEach(a => { if (a.lifetime_id) animalMap.set(a.lifetime_id, a); });

    // Records grouped by lifetime_id
    const recsByLid = new Map<string, (typeof records)>();
    records.forEach(r => {
      if (!r.lifetime_id) return;
      const arr = recsByLid.get(r.lifetime_id) || [];
      arr.push(r);
      recsByLid.set(r.lifetime_id, arr);
    });

    // Identify heifers born in last 2 years
    const heifers = allAnimals.filter(a =>
      a.year_born != null &&
      a.year_born >= currentYear - 2 &&
      (a.sex?.toLowerCase() === 'heifer' || a.animal_type?.toLowerCase() === 'heifer' ||
       a.sex?.toLowerCase() === 'female' || a.sex?.toLowerCase() === 'f')
    );

    const years = new Set<number>();
    const rows: {
      heiferId: string;
      heiferTag: string;
      heiferYear: number;
      damLid: string;
      damTag: string;
      damScore: number;
      damPercentile: number;
      damCalves: number;
      damConception: number;
      damInterval: number;
      damGestation: number;
    }[] = [];

    heifers.forEach(h => {
      if (!h.dam_lid) return;
      const dam = animalMap.get(h.dam_lid);
      if (!dam) return;

      years.add(h.year_born!);

      const damRecs = recsByLid.get(h.dam_lid) || [];

      // Dam total calves
      const calvingRecs = damRecs.filter(r => r.calving_date != null && r.calf_status != null);
      const damCalves = calvingRecs.length;

      // Dam AI conception rate
      const withAi = damRecs.filter(r => r.ai_date_1 != null);
      const aiConceived = withAi.filter(r => r.preg_stage?.toLowerCase() === 'ai');
      const damConception = withAi.length > 0 ? (aiConceived.length / withAi.length) * 100 : 0;

      // Dam avg calving interval
      const calvDates = damRecs
        .filter(r => r.calving_date)
        .map(r => new Date(r.calving_date!).getTime())
        .sort((a, b) => a - b);
      const intervals: number[] = [];
      for (let i = 1; i < calvDates.length; i++) {
        const d = Math.round((calvDates[i] - calvDates[i - 1]) / (1000 * 60 * 60 * 24));
        if (d > 200 && d < 800) intervals.push(d);
      }
      const damInterval = intervals.length > 0
        ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        : 0;

      // Dam avg gestation
      const gestDays = damRecs
        .map(r => r.gestation_days)
        .filter((v): v is number => v != null && v >= 250 && v <= 310);
      const damGestation = gestDays.length > 0
        ? Math.round((gestDays.reduce((a, b) => a + b, 0) / gestDays.length) * 10) / 10
        : 0;

      const damScore = dam.value_score ?? 0;
      const damPercentile = dam.value_score_percentile ?? 0;

      rows.push({
        heiferId: h.lifetime_id ?? '',
        heiferTag: h.tag ?? '',
        heiferYear: h.year_born!,
        damLid: h.dam_lid,
        damTag: dam.tag ?? '',
        damScore,
        damPercentile,
        damCalves,
        damConception: Math.round(damConception * 10) / 10,
        damInterval,
        damGestation,
      });
    });

    // Q75 for dam score highlighting
    const scores = rows.map(r => r.damScore).filter(s => s > 0).sort((a, b) => a - b);
    const q75val = scores.length > 0 ? scores[Math.floor(scores.length * 0.75)] : 0;

    return { heiferRows: rows, yearOptions: [...years].sort(), q75: q75val };
  }, [allAnimals, records, currentYear]);

  const filteredHeifers = useMemo(() => {
    let list = heiferRows;
    if (yearFilter !== 'all') list = list.filter(r => r.heiferYear === Number(yearFilter));
    const q = search.toLowerCase();
    if (q) list = list.filter(r => r.heiferTag.toLowerCase().includes(q) || r.heiferId.toLowerCase().includes(q) || r.damTag.toLowerCase().includes(q));

    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'heiferTag': cmp = a.heiferTag.localeCompare(b.heiferTag); break;
        case 'heiferYear': cmp = a.heiferYear - b.heiferYear; break;
        case 'damTag': cmp = a.damTag.localeCompare(b.damTag); break;
        case 'damScore': cmp = a.damScore - b.damScore; break;
        case 'damCalves': cmp = a.damCalves - b.damCalves; break;
        case 'damConception': cmp = a.damConception - b.damConception; break;
        case 'damInterval': cmp = a.damInterval - b.damInterval; break;
        case 'damGestation': cmp = a.damGestation - b.damGestation; break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [heiferRows, yearFilter, search, sortKey, sortAsc]);

  // ── Section 2: First-Calf Heifer vs Mature Cow Conception ──
  const conceptionData = useMemo(() => {
    if (!allAnimals || !records) return [];

    const animalYearBorn = new Map<string, number>();
    allAnimals.forEach(a => {
      if (a.lifetime_id && a.year_born) animalYearBorn.set(a.lifetime_id, a.year_born);
    });

    const byYear = new Map<number, { heiferAi: number; heiferAiTotal: number; heiferPreg: number; heiferPregTotal: number; matureAi: number; matureAiTotal: number; maturePreg: number; maturePregTotal: number }>();

    records.forEach(r => {
      if (!r.lifetime_id || !r.breeding_year) return;
      const yb = animalYearBorn.get(r.lifetime_id);
      if (!yb) return;

      const ageAtBreeding = r.breeding_year - yb;
      const isHeifer = ageAtBreeding === 2;

      let bucket = byYear.get(r.breeding_year);
      if (!bucket) {
        bucket = { heiferAi: 0, heiferAiTotal: 0, heiferPreg: 0, heiferPregTotal: 0, matureAi: 0, matureAiTotal: 0, maturePreg: 0, maturePregTotal: 0 };
        byYear.set(r.breeding_year, bucket);
      }

      const hasAi = r.ai_date_1 != null;
      const aiConceived = r.preg_stage?.toLowerCase() === 'ai';
      const isPreg = r.preg_stage != null && r.preg_stage.toLowerCase() !== 'open';

      if (isHeifer) {
        if (hasAi) { bucket.heiferAiTotal++; if (aiConceived) bucket.heiferAi++; }
        bucket.heiferPregTotal++;
        if (isPreg) bucket.heiferPreg++;
      } else if (ageAtBreeding > 2) {
        if (hasAi) { bucket.matureAiTotal++; if (aiConceived) bucket.matureAi++; }
        bucket.maturePregTotal++;
        if (isPreg) bucket.maturePreg++;
      }
    });

    return [...byYear.entries()]
      .filter(([, v]) => v.heiferPregTotal >= 5 && v.maturePregTotal >= 5)
      .map(([year, v]) => {
        const heiferRate = v.heiferAiTotal > 0 ? Math.round((v.heiferAi / v.heiferAiTotal) * 1000) / 10 : null;
        const matureRate = v.matureAiTotal > 0 ? Math.round((v.matureAi / v.matureAiTotal) * 1000) / 10 : null;
        const gap = heiferRate != null && matureRate != null ? Math.round((matureRate - heiferRate) * 10) / 10 : null;
        return { year, heiferRate, matureRate, gap };
      })
      .sort((a, b) => a.year - b.year);
  }, [allAnimals, records]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'heiferTag' || key === 'damTag'); }
  };

  const handleExport = () => {
    exportToCSV(filteredHeifers.map(r => ({
      heifer_tag: r.heiferTag,
      heifer_id: r.heiferId,
      heifer_year: r.heiferYear,
      dam_tag: r.damTag,
      dam_id: r.damLid,
      dam_score: r.damScore,
      dam_calves: r.damCalves,
      dam_ai_conception: r.damConception,
      dam_avg_interval: r.damInterval,
      dam_avg_gestation: r.damGestation,
    })), 'replacement_heifers.csv');
  };

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k && <ArrowUpDown className="h-3 w-3 text-primary" />}
      </span>
    </TableHead>
  );

  const scoreColor = (score: number) => {
    if (score <= 0) return '';
    return score >= q75 ? 'text-green-400 font-semibold' : '';
  };

  const intervalColor = (d: number) => {
    if (d <= 0) return '';
    if (d < 366) return 'text-green-400';
    if (d <= 390) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Replacement Heifers</h1>

      {/* Section 1 — Heifer Candidates by Dam Score (Collapsible) */}
      <Collapsible defaultOpen={false}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CollapsibleTrigger className="flex items-center gap-2 group cursor-pointer">
                <Baby className="h-5 w-5 text-primary" />
                <CardTitle className="text-2xl">Heifer Candidates by Dam Score</CardTitle>
                <Badge variant="secondary" className="text-xs">{filteredHeifers.length}</Badge>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {yearOptions.map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tag or ID…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 w-52"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-1" /> Export CSV
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Heifers born in the last 2 years ranked by dam's composite score. Top 25% dam scores highlighted in green.
            </p>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground py-8 text-center">Loading…</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortHeader label="Heifer Tag" k="heiferTag" />
                        <SortHeader label="Born" k="heiferYear" />
                        <SortHeader label="Dam Tag" k="damTag" />
                        <SortHeader label="Dam Score" k="damScore" />
                        <SortHeader label="Dam Calves" k="damCalves" />
                        <SortHeader label="Dam AI %" k="damConception" />
                        <SortHeader label="Dam Avg Interval" k="damInterval" />
                        <SortHeader label="Dam Avg Gest" k="damGestation" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHeifers.map(r => (
                        <TableRow
                          key={r.heiferId}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/cow/${r.heiferId}`)}
                        >
                          <TableCell className="font-medium">{r.heiferTag || '—'}</TableCell>
                          <TableCell>{r.heiferYear}</TableCell>
                          <TableCell
                            className="cursor-pointer text-primary underline-offset-2 hover:underline"
                            onClick={e => { e.stopPropagation(); navigate(`/cow/${r.damLid}`); }}
                          >
                            {r.damTag || r.damLid}
                          </TableCell>
                          <TableCell className={scoreColor(r.damScore)}>
                            {r.damScore > 0 ? r.damScore.toFixed(1) : '—'}
                          </TableCell>
                          <TableCell>{r.damCalves}</TableCell>
                          <TableCell>{r.damConception > 0 ? `${r.damConception}%` : '—'}</TableCell>
                          <TableCell className={intervalColor(r.damInterval)}>
                            {r.damInterval > 0 ? `${r.damInterval}d` : '—'}
                          </TableCell>
                          <TableCell>{r.damGestation > 0 ? `${r.damGestation}d` : '—'}</TableCell>
                        </TableRow>
                      ))}
                      {filteredHeifers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No heifer candidates found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground mt-2">{filteredHeifers.length} heifer candidates</p>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Section 2 — First-Calf Heifer vs Mature Cow Conception */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Baby className="h-5 w-5 text-primary" /> First-Calf Heifer vs Mature Cow AI Conception
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            First-service AI conception rate comparison. Gap annotations show the mature cow advantage each year.
          </p>
        </CardHeader>
        <CardContent>
          {conceptionData.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">Insufficient data for comparison.</p>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={conceptionData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="year"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  label={{ value: 'AI Conception %', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
                />
                <RTooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: any, name: string) => {
                    if (name === 'heiferRate') return [`${value}%`, 'First-Calf Heifer'];
                    if (name === 'matureRate') return [`${value}%`, 'Mature Cow'];
                    return [value, name];
                  }}
                />
                <Legend
                  formatter={(value) => value === 'heiferRate' ? 'First-Calf Heifer' : value === 'matureRate' ? 'Mature Cow' : value}
                  wrapperStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Line
                  type="monotone"
                  dataKey="matureRate"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  dot={{ r: 5, fill: '#22c55e' }}
                  connectNulls
                >
                  <LabelList
                    dataKey="gap"
                    position="top"
                    formatter={(v: any) => v != null ? `+${v}` : ''}
                    style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  />
                </Line>
                <Line
                  type="monotone"
                  dataKey="heiferRate"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={{ r: 5, fill: '#f97316' }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Section 3 — Heifer Pregnancy Rate by Management Group */}
      <HeiferGroupSection records={records} />

      {/* Section 4 — Sire Selection for Heifers */}
      <SireHeiferSection records={records} allAnimals={allAnimals} />
    </div>
  );
}

const HEIFER_GROUPS = ['homeheifers', 'homeheifer', 'regheifers', 'purchasedheifers', 'purchasedheifer', 'showheifers', 'lateheifers'];
const isHeiferGroup = (g: string | null) => g != null && HEIFER_GROUPS.includes(g.toLowerCase().replace(/\s+/g, ''));

const GROUP_COLORS: Record<string, string> = {
  homeheifers: '#22c55e', homeheifer: '#22c55e',
  regheifers: '#3b82f6',
  purchasedheifers: '#f97316', purchasedheifer: '#f97316',
  showheifers: '#a855f7',
  lateheifers: '#eab308',
};
const groupColor = (g: string) => GROUP_COLORS[g.toLowerCase().replace(/\s+/g, '')] ?? '#94a3b8';

function HeiferGroupSection({ records }: { records: any[] | undefined }) {
  const { chartData, tableData, groups, years } = useMemo(() => {
    if (!records) return { chartData: [], tableData: [], groups: [] as string[], years: [] as number[] };

    const heiferRecs = records.filter(r => isHeiferGroup(r.ultrasound_group) && r.breeding_year);

    // Per group per year
    type Bucket = { ai: number; aiTotal: number; secondAi: number; total: number };
    const map = new Map<string, Bucket>(); // key = `group|year`

    heiferRecs.forEach(r => {
      const g = r.ultrasound_group!;
      const key = `${g}|${r.breeding_year}`;
      let b = map.get(key);
      if (!b) { b = { ai: 0, aiTotal: 0, secondAi: 0, total: 0 }; map.set(key, b); }
      b.total++;
      if (r.ai_date_1) {
        b.aiTotal++;
        if (r.preg_stage?.toLowerCase() === 'ai') b.ai++;
      }
      if (r.preg_stage?.toLowerCase() === 'second ai') b.secondAi++;
    });

    const allGroups = [...new Set(heiferRecs.map(r => r.ultrasound_group!))].sort();
    const allYears = [...new Set(heiferRecs.map(r => r.breeding_year as number))].sort();

    // Chart data: one row per year, one bar per group (overall preg rate)
    const cData = allYears.map(year => {
      const row: any = { year };
      allGroups.forEach(g => {
        const b = map.get(`${g}|${year}`);
        if (b && b.total >= 3) {
          const pregRate = ((b.ai + b.secondAi) / b.aiTotal) * 100;
          row[g] = Math.round(pregRate * 10) / 10;
        }
      });
      return row;
    });

    // Table data
    const tData: any[] = [];
    allGroups.forEach(g => {
      allYears.forEach(year => {
        const b = map.get(`${g}|${year}`);
        if (!b || b.total < 3) return;
        const firstAi = b.aiTotal > 0 ? Math.round((b.ai / b.aiTotal) * 1000) / 10 : 0;
        const overallPreg = b.aiTotal > 0 ? Math.round(((b.ai + b.secondAi) / b.aiTotal) * 1000) / 10 : 0;
        const openRate = Math.round(((b.total - b.ai - b.secondAi) / b.total) * 1000) / 10;
        tData.push({ group: g, year, firstAi, overallPreg, openRate, n: b.total });
      });
    });

    return { chartData: cData, tableData: tData, groups: allGroups, years: allYears };
  }, [records]);

  if (!chartData.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Baby className="h-5 w-5 text-primary" /> Heifer Pregnancy Rate by Management Group
        </CardTitle>
        <p className="text-sm text-muted-foreground">Overall AI pregnancy rate (AI + Second AI) by heifer group per breeding year.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="year" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
            <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} label={{ value: 'Preg Rate %', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }} />
            <RTooltip
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(v: any, name: string) => [`${v}%`, name]}
            />
            <Legend wrapperStyle={{ color: 'hsl(var(--foreground))' }} />
            {groups.map(g => (
              <Bar key={g} dataKey={g} fill={groupColor(g)} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>1st AI %</TableHead>
                <TableHead>Overall Preg %</TableHead>
                <TableHead>Open %</TableHead>
                <TableHead>n</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.group}</TableCell>
                  <TableCell>{r.year}</TableCell>
                  <TableCell>{r.firstAi}%</TableCell>
                  <TableCell>{r.overallPreg}%</TableCell>
                  <TableCell className={r.openRate > 15 ? 'text-red-400 font-semibold' : ''}>{r.openRate}%</TableCell>
                  <TableCell className="text-muted-foreground">{r.n}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SireHeiferSection({ records, allAnimals }: { records: any[] | undefined; allAnimals: any[] | undefined }) {
  const { scatterData, comparisonData } = useMemo(() => {
    if (!records || !allAnimals) return { scatterData: [], comparisonData: [] };

    const animalYearBorn = new Map<string, number>();
    allAnimals.forEach(a => { if (a.lifetime_id && a.year_born) animalYearBorn.set(a.lifetime_id, a.year_born); });

    const heiferRecs = records.filter(r => isHeiferGroup(r.ultrasound_group) && r.ai_sire_1 && r.ai_date_1);
    const matureRecs = records.filter(r => !isHeiferGroup(r.ultrasound_group) && r.ai_sire_1 && r.ai_date_1);

    type SireBucket = { ai: number; aiTotal: number; bws: number[]; alive: number; calved: number };
    const heiferBySire = new Map<string, SireBucket>();
    const matureBySire = new Map<string, SireBucket>();

    const addTo = (map: Map<string, SireBucket>, sire: string, r: any) => {
      let b = map.get(sire);
      if (!b) { b = { ai: 0, aiTotal: 0, bws: [], alive: 0, calved: 0 }; map.set(sire, b); }
      b.aiTotal++;
      if (r.preg_stage?.toLowerCase() === 'ai') b.ai++;
      if (r.calf_bw != null && r.calf_bw > 0) b.bws.push(r.calf_bw);
      if (r.calf_status) {
        b.calved++;
        if (r.calf_status.toLowerCase() === 'alive') b.alive++;
      }
    };

    heiferRecs.forEach(r => addTo(heiferBySire, r.ai_sire_1!, r));
    matureRecs.forEach(r => addTo(matureBySire, r.ai_sire_1!, r));

    const scatter: { sire: string; avgBW: number; aiRate: number; count: number; quadrant: string }[] = [];
    const comparison: any[] = [];

    heiferBySire.forEach((hb, sire) => {
      if (hb.aiTotal < 10) return;
      const hAiRate = Math.round((hb.ai / hb.aiTotal) * 1000) / 10;
      const hAvgBW = hb.bws.length > 0 ? Math.round((hb.bws.reduce((a, b) => a + b, 0) / hb.bws.length) * 10) / 10 : 0;
      const hSurv = hb.calved > 0 ? Math.round((hb.alive / hb.calved) * 1000) / 10 : 0;

      // Determine quadrant: median splits
      scatter.push({ sire, avgBW: hAvgBW, aiRate: hAiRate, count: hb.aiTotal, quadrant: '' });

      // Mature comparison
      const mb = matureBySire.get(sire);
      const mAiRate = mb && mb.aiTotal > 0 ? Math.round((mb.ai / mb.aiTotal) * 1000) / 10 : null;
      const mAvgBW = mb && mb.bws.length > 0 ? Math.round((mb.bws.reduce((a, b) => a + b, 0) / mb.bws.length) * 10) / 10 : null;
      const mSurv = mb && mb.calved > 0 ? Math.round((mb.alive / mb.calved) * 1000) / 10 : null;

      comparison.push({
        sire,
        heiferN: hb.aiTotal,
        heiferAI: hAiRate,
        heiferBW: hAvgBW,
        heiferSurv: hSurv,
        matureN: mb?.aiTotal ?? 0,
        matureAI: mAiRate,
        matureBW: mAvgBW,
        matureSurv: mSurv,
      });
    });

    // Assign quadrants
    if (scatter.length > 0) {
      const medBW = [...scatter].sort((a, b) => a.avgBW - b.avgBW)[Math.floor(scatter.length / 2)]?.avgBW ?? 80;
      const medAI = [...scatter].sort((a, b) => a.aiRate - b.aiRate)[Math.floor(scatter.length / 2)]?.aiRate ?? 50;
      scatter.forEach(s => {
        if (s.avgBW > medBW && s.aiRate < medAI) s.quadrant = 'bad'; // high BW + low conception
        else if (s.avgBW <= medBW && s.aiRate >= medAI) s.quadrant = 'ideal';
        else s.quadrant = 'neutral';
      });
    }

    return { scatterData: scatter, comparisonData: comparison.sort((a, b) => b.heiferAI - a.heiferAI) };
  }, [records, allAnimals]);

  if (!scatterData.length) return null;

  const dotColor = (q: string) => q === 'bad' ? '#ef4444' : q === 'ideal' ? '#22c55e' : '#eab308';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Baby className="h-5 w-5 text-primary" /> Sire Selection for Heifers
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          AI sires with 10+ heifer breedings. Ideal = low BW + high conception (green). Red = high BW + low conception.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              type="number" dataKey="avgBW" name="Avg Heifer BW"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              label={{ value: 'Avg Heifer Birth Weight (lbs)', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              type="number" dataKey="aiRate" name="AI Rate" domain={[0, 100]}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              label={{ value: 'AI Conception %', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
            />
            <ZAxis type="number" dataKey="count" range={[60, 400]} name="Breedings" />
            <RTooltip
              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(v: any, name: string) => {
                if (name === 'Avg Heifer BW') return [`${v} lbs`, 'Avg BW'];
                if (name === 'AI Rate') return [`${v}%`, 'AI Rate'];
                if (name === 'Breedings') return [v, 'Records'];
                return [v, name];
              }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.sire ?? ''}
            />
            <Scatter data={scatterData} shape="circle">
              {scatterData.map((s, i) => (
                <Cell key={i} fill={dotColor(s.quadrant)} fillOpacity={0.8} />
              ))}
              <LabelList dataKey="sire" position="top" style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>

        {/* Comparison Table */}
        <div className="overflow-x-auto">
          <p className="text-sm font-medium text-foreground mb-2">Heifer vs Mature Cow Performance by Sire</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sire</TableHead>
                <TableHead>Heifer n</TableHead>
                <TableHead>Heifer AI %</TableHead>
                <TableHead>Heifer BW</TableHead>
                <TableHead>Heifer Surv %</TableHead>
                <TableHead>Mature n</TableHead>
                <TableHead>Mature AI %</TableHead>
                <TableHead>Mature BW</TableHead>
                <TableHead>Mature Surv %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisonData.map((r: any) => (
                <TableRow key={r.sire}>
                  <TableCell className="font-medium">{r.sire}</TableCell>
                  <TableCell>{r.heiferN}</TableCell>
                  <TableCell>{r.heiferAI}%</TableCell>
                  <TableCell>{r.heiferBW > 0 ? `${r.heiferBW} lbs` : '—'}</TableCell>
                  <TableCell>{r.heiferSurv > 0 ? `${r.heiferSurv}%` : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{r.matureN || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{r.matureAI != null ? `${r.matureAI}%` : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{r.matureBW != null ? `${r.matureBW} lbs` : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{r.matureSurv != null ? `${r.matureSurv}%` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
