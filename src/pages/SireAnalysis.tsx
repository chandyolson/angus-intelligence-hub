import { useMemo, useState } from 'react';
import { useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { BreedingCalvingRecord } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { EmptyState } from '@/components/ui/empty-state';
import { Trophy, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis, LabelList } from 'recharts';

interface SireRow {
  sire: string;
  rate: number;
  sampleSize: number;
  avgBW: number;
  survivalRate: number;
  badge: 'ELITE' | 'STRONG' | 'AVERAGE' | 'BELOW AVG';
}

type SortKey = 'rate' | 'sampleSize' | 'avgBW';

const rateColor = (rate: number) => {
  if (rate >= 95) return 'hsl(142, 71%, 45%)';
  if (rate >= 88) return 'hsl(82, 85%, 45%)';
  if (rate >= 80) return 'hsl(48, 96%, 53%)';
  return 'hsl(0, 72%, 51%)';
};

const badgeStyle = (badge: string) => {
  switch (badge) {
    case 'ELITE': return 'bg-success/20 text-success border-success/30';
    case 'STRONG': return 'bg-lime-500/20 text-lime-400 border-lime-500/30';
    case 'AVERAGE': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'BELOW AVG': return 'bg-destructive/20 text-destructive border-destructive/30';
    default: return '';
  }
};

const getBadge = (rate: number): SireRow['badge'] => {
  if (rate >= 95) return 'ELITE';
  if (rate >= 88) return 'STRONG';
  if (rate >= 80) return 'AVERAGE';
  return 'BELOW AVG';
};

function computeServiceTable(
  records: BreedingCalvingRecord[],
  service: '1st' | '2nd',
  minRecords = 10
): SireRow[] {
  const sireMap = new Map<string, { aiDates: number; conceived: number; bws: number[]; alive: number; withCalf: number }>();
  const isCleanup = (s: string) => s.toLowerCase().includes('cleanup');

  records.forEach(r => {
    const sire = service === '1st' ? r.ai_sire_1 : r.ai_sire_2;
    const aiDate = service === '1st' ? r.ai_date_1 : r.ai_date_2;
    const targetStage = service === '1st' ? 'ai' : 'second ai';

    if (!sire || isCleanup(sire) || !aiDate) return;

    const entry = sireMap.get(sire) || { aiDates: 0, conceived: 0, bws: [], alive: 0, withCalf: 0 };
    entry.aiDates++;
    if (r.preg_stage?.toLowerCase() === targetStage) entry.conceived++;

    // Calf-side stats (only from records where this sire is the calf_sire too, or from all records of this sire)
    if (r.calf_status && r.calf_status.toLowerCase() !== 'open') {
      entry.withCalf++;
      if (r.calf_status.toLowerCase() === 'alive') entry.alive++;
      if (r.calf_bw != null && r.calf_bw > 0) entry.bws.push(r.calf_bw);
    }

    sireMap.set(sire, entry);
  });

  const rows: SireRow[] = [];
  sireMap.forEach((data, sire) => {
    if (data.aiDates < minRecords) return;
    const rate = Math.round((data.conceived / data.aiDates) * 1000) / 10;
    const avgBW = data.bws.length > 0 ? Math.round(data.bws.reduce((a, b) => a + b, 0) / data.bws.length) : 0;
    const survivalRate = data.withCalf > 0 ? Math.round((data.alive / data.withCalf) * 1000) / 10 : 0;
    rows.push({ sire, rate, sampleSize: data.aiDates, avgBW, survivalRate, badge: getBadge(rate) });
  });

  return rows;
}

function SireServiceTable({
  title,
  rows,
  sortKey,
  sortAsc,
  onSort,
}: {
  title: string;
  rows: SireRow[];
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const sorted = useMemo(() => {
    const s = [...rows];
    s.sort((a, b) => sortAsc ? (a[sortKey] as number) - (b[sortKey] as number) : (b[sortKey] as number) - (a[sortKey] as number));
    return s;
  }, [rows, sortKey, sortAsc]);

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '';

  const sortCols: { key: SortKey; label: string }[] = [
    { key: 'rate', label: 'Rate' },
    { key: 'sampleSize', label: 'Usage' },
    { key: 'avgBW', label: 'BW' },
  ];

  if (rows.length === 0) return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent><EmptyState message="No sires with sufficient records." /></CardContent>
    </Card>
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">{title}</CardTitle>
        <div className="flex gap-1">
          {sortCols.map(col => (
            <button
              key={col.key}
              onClick={() => onSort(col.key)}
              className={`px-3 py-1 text-xs rounded transition-colors ${sortKey === col.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
            >
              {col.label}{arrow(col.key)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[500px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                <TableHead className="text-[12px]">Sire</TableHead>
                <TableHead className="text-[12px] cursor-pointer" onClick={() => onSort('rate')}>Conception Rate{arrow('rate')}</TableHead>
                <TableHead className="text-[12px] cursor-pointer" onClick={() => onSort('sampleSize')}>Sample Size{arrow('sampleSize')}</TableHead>
                <TableHead className="text-[12px] cursor-pointer" onClick={() => onSort('avgBW')}>Avg BW (lbs){arrow('avgBW')}</TableHead>
                <TableHead className="text-[12px]">Survival %</TableHead>
                <TableHead className="text-[12px]">Grade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s, i) => (
                <TableRow key={s.sire} className="border-border text-[13px]" style={{ backgroundColor: i % 2 === 1 ? '#0E1528' : undefined }}>
                  <TableCell className="font-medium text-foreground">{s.sire}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="relative w-16 h-3 rounded-full bg-muted overflow-hidden">
                        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(s.rate, 100)}%`, backgroundColor: rateColor(s.rate) }} />
                      </div>
                      <span className="font-semibold text-xs" style={{ color: rateColor(s.rate) }}>{s.rate}%</span>
                    </div>
                  </TableCell>
                  <TableCell>{s.sampleSize}</TableCell>
                  <TableCell>{s.avgBW > 0 ? s.avgBW : '—'}</TableCell>
                  <TableCell>{s.survivalRate}%</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${badgeStyle(s.badge)}`}>{s.badge}</Badge>
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

export default function SireAnalysis() {
  const { data: records, isLoading, error } = useBreedingCalvingRecords();
  const [sort1st, setSort1st] = useState<{ key: SortKey; asc: boolean }>({ key: 'rate', asc: false });
  const [sort2nd, setSort2nd] = useState<{ key: SortKey; asc: boolean }>({ key: 'rate', asc: false });

  const firstServiceRows = useMemo(() => records ? computeServiceTable(records, '1st') : [], [records]);
  const secondServiceRows = useMemo(() => records ? computeServiceTable(records, '2nd') : [], [records]);

  const topPerformer = useMemo(() => {
    const eligible = firstServiceRows.filter(s => s.sampleSize >= 25);
    if (eligible.length === 0) return null;
    return eligible.reduce((a, b) => a.rate > b.rate ? a : b);
  }, [firstServiceRows]);

  const mostUsedBelowAvg = useMemo(() => {
    const eligible = firstServiceRows.filter(s => s.rate < 88);
    if (eligible.length === 0) return null;
    return eligible.reduce((a, b) => a.sampleSize > b.sampleSize ? a : b);
  }, [firstServiceRows]);

  const handleSort1st = (key: SortKey) => {
    setSort1st(prev => prev.key === key ? { key, asc: !prev.asc } : { key, asc: false });
  };
  const handleSort2nd = (key: SortKey) => {
    setSort2nd(prev => prev.key === key ? { key, asc: !prev.asc } : { key, asc: false });
  };

  if (isLoading) return (
    <div className="space-y-6">
      <ShimmerSkeleton className="h-8 w-48" />
      <ShimmerSkeleton className="h-96" />
    </div>
  );

  if (error) return <ErrorBox />;

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-foreground">Sire Analysis</h1>

      {/* 1st Service Table */}
      <SireServiceTable
        title="First Service AI Rate"
        rows={firstServiceRows}
        sortKey={sort1st.key}
        sortAsc={sort1st.asc}
        onSort={handleSort1st}
      />

      {/* 2nd Service Table */}
      <SireServiceTable
        title="Second Service AI Rate"
        rows={secondServiceRows}
        sortKey={sort2nd.key}
        sortAsc={sort2nd.asc}
        onSort={handleSort2nd}
      />

      {/* Highlight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topPerformer && (
          <Card className="bg-card border-success/40">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="h-5 w-5 text-success" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Top Performer (25+ records)</span>
              </div>
              <p className="text-xl font-bold text-foreground">{topPerformer.sire}</p>
              <p className="text-3xl font-bold mt-1" style={{ color: rateColor(topPerformer.rate) }}>{topPerformer.rate}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">1st Service AI Rate</p>
              <p className="text-sm text-muted-foreground mt-3">
                {topPerformer.sampleSize} units · {topPerformer.avgBW > 0 ? `${topPerformer.avgBW} lbs avg BW · ` : ''}{topPerformer.survivalRate}% survival
              </p>
            </CardContent>
          </Card>
        )}
        {mostUsedBelowAvg && (
          <Card className="bg-card border-destructive/40">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Most Used Below Average (&lt;88%)</span>
              </div>
              <p className="text-xl font-bold text-foreground">{mostUsedBelowAvg.sire}</p>
              <p className="text-3xl font-bold mt-1" style={{ color: rateColor(mostUsedBelowAvg.rate) }}>{mostUsedBelowAvg.rate}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">1st Service AI Rate</p>
              <p className="text-sm text-muted-foreground mt-3">
                {mostUsedBelowAvg.sampleSize} units · {mostUsedBelowAvg.avgBW > 0 ? `${mostUsedBelowAvg.avgBW} lbs avg BW · ` : ''}{mostUsedBelowAvg.survivalRate}% survival
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
