import { useMemo, useState } from 'react';
import { useActiveAnimals, useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { exportToCSV } from '@/lib/calculations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Search, TrendingUp, AlertTriangle, ArrowUp, ArrowDown, BarChart3 } from 'lucide-react';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { useNavigate } from 'react-router-dom';

interface IntervalRow {
  lifetime_id: string;
  tag: string | null;
  avgInterval: number;
  medianInterval: number;
  latestInterval: number;
  records: number;
  flag: 'HIGH' | 'WATCH' | null;
  slope: number;
}

interface OpenCowRow {
  lifetime_id: string;
  tag: string | null;
  year_born: number | null;
  totalOpen: number;
  yearsOpen: number[];
  mostRecentYear: number;
  status: string | null;
}

type IntervalSortKey = 'tag' | 'avgInterval' | 'medianInterval' | 'latestInterval' | 'records';
type OpenSortKey = 'tag' | 'totalOpen' | 'mostRecentYear' | 'year_born';

export default function CalvingInterval() {
  const { data: animals, isLoading: la, error: ae } = useActiveAnimals();
  const { data: records, isLoading: lr, error: re } = useBreedingCalvingRecords();
  const navigate = useNavigate();

  const [search1, setSearch1] = useState('');
  const [sort1, setSort1] = useState<{ key: IntervalSortKey; asc: boolean }>({ key: 'avgInterval', asc: false });
  const [search2, setSearch2] = useState('');
  const [sort2, setSort2] = useState<{ key: OpenSortKey; asc: boolean }>({ key: 'totalOpen', asc: false });

  const intervalRows = useMemo(() => {
    if (!animals || !records) return [];
    const activeIds = new Set(animals.map(a => a.lifetime_id).filter(Boolean));
    const tagMap = new Map(animals.map(a => [a.lifetime_id, a.tag]));

    // Group calving dates by cow
    const byCow = new Map<string, string[]>();
    records.forEach(r => {
      if (r.lifetime_id && r.calving_date && activeIds.has(r.lifetime_id)) {
        const arr = byCow.get(r.lifetime_id) || [];
        arr.push(r.calving_date);
        byCow.set(r.lifetime_id, arr);
      }
    });

    const rows: IntervalRow[] = [];
    byCow.forEach((dates, lid) => {
      if (dates.length < 2) return;
      const sorted = dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const days = Math.round((new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000);
        if (days > 200 && days < 800) intervals.push(days);
      }
      if (intervals.length === 0) return;

      const avg = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
      const sortedIntervals = [...intervals].sort((a, b) => a - b);
      const median = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
      const latest = intervals[intervals.length - 1];

      // Slope: linear regression on interval index
      let slope = 0;
      if (intervals.length >= 2) {
        const n = intervals.length;
        const xMean = (n - 1) / 2;
        const yMean = intervals.reduce((a, b) => a + b, 0) / n;
        let num = 0, den = 0;
        intervals.forEach((y, x) => { num += (x - xMean) * (y - yMean); den += (x - xMean) ** 2; });
        slope = den > 0 ? num / den : 0;
      }

      let flag: IntervalRow['flag'] = null;
      if (slope > 0 && latest > 390) flag = 'HIGH';
      else if (slope > 0 && latest >= 366) flag = 'WATCH';

      rows.push({ lifetime_id: lid, tag: tagMap.get(lid) ?? null, avgInterval: avg, medianInterval: median, latestInterval: latest, records: intervals.length, flag, slope });
    });

    return rows;
  }, [animals, records]);

  const openCowRows = useMemo(() => {
    if (!animals || !records) return [];
    const tagMap = new Map(animals.map(a => [a.lifetime_id, { tag: a.tag, year_born: a.year_born, status: a.status }]));

    const byCow = new Map<string, number[]>();
    records.forEach(r => {
      if (!r.lifetime_id || !r.breeding_year) return;
      const stage = r.preg_stage?.toLowerCase();
      const status = r.calf_status?.toLowerCase();
      if (stage === 'open' || status === 'open') {
        const arr = byCow.get(r.lifetime_id) || [];
        if (!arr.includes(r.breeding_year)) arr.push(r.breeding_year);
        byCow.set(r.lifetime_id, arr);
      }
    });

    const rows: OpenCowRow[] = [];
    byCow.forEach((years, lid) => {
      const info = tagMap.get(lid);
      const sorted = years.sort((a, b) => a - b);
      rows.push({
        lifetime_id: lid,
        tag: info?.tag ?? null,
        year_born: info?.year_born ?? null,
        totalOpen: sorted.length,
        yearsOpen: sorted,
        mostRecentYear: sorted[sorted.length - 1],
        status: info?.status ?? null,
      });
    });
    return rows;
  }, [animals, records]);

  // Filtered & sorted interval rows
  const filteredIntervals = useMemo(() => {
    let rows = intervalRows;
    if (search1.trim()) {
      const q = search1.trim().toLowerCase();
      rows = rows.filter(r => r.tag?.toLowerCase().includes(q) || r.lifetime_id.toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      const aVal = a[sort1.key] ?? '';
      const bVal = b[sort1.key] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') return sort1.asc ? aVal - bVal : bVal - aVal;
      return sort1.asc ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return rows;
  }, [intervalRows, search1, sort1]);

  // Filtered & sorted open cow rows
  const filteredOpen = useMemo(() => {
    let rows = openCowRows;
    if (search2.trim()) {
      const q = search2.trim().toLowerCase();
      rows = rows.filter(r => r.tag?.toLowerCase().includes(q) || r.lifetime_id.toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      const aVal = a[sort2.key] ?? '';
      const bVal = b[sort2.key] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') return sort2.asc ? aVal - bVal : bVal - aVal;
      return sort2.asc ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return rows;
  }, [openCowRows, search2, sort2]);

  const handleSort1 = (key: IntervalSortKey) => setSort1(prev => prev.key === key ? { key, asc: !prev.asc } : { key, asc: false });
  const handleSort2 = (key: OpenSortKey) => setSort2(prev => prev.key === key ? { key, asc: !prev.asc } : { key, asc: false });
  const arrow1 = (key: IntervalSortKey) => sort1.key === key ? (sort1.asc ? ' ↑' : ' ↓') : '';
  const arrow2 = (key: OpenSortKey) => sort2.key === key ? (sort2.asc ? ' ↑' : ' ↓') : '';

  const intervalColor = (avg: number) => {
    if (avg < 366) return 'text-success';
    if (avg <= 390) return 'text-yellow-400';
    return 'text-destructive';
  };

  const exportIntervals = () => {
    exportToCSV(filteredIntervals.map(r => ({
      Tag: r.tag ?? '', Lifetime_ID: r.lifetime_id, Avg_Interval: r.avgInterval,
      Median_Interval: r.medianInterval, Latest_Interval: r.latestInterval,
      Records: r.records, Flag: r.flag ?? '',
    })), `calving_intervals_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportOpen = () => {
    exportToCSV(filteredOpen.map(r => ({
      Tag: r.tag ?? '', Lifetime_ID: r.lifetime_id, Year_Born: r.year_born ?? '',
      Total_Open: r.totalOpen, Years_Open: r.yearsOpen.join(', '),
      Most_Recent_Year: r.mostRecentYear, Status: r.status ?? '',
    })), `open_cows_${new Date().toISOString().split('T')[0]}.csv`);
  };

  // Summary stats for cards
  const summaryStats = useMemo(() => {
    if (intervalRows.length === 0) return null;
    const sorted = [...intervalRows].sort((a, b) => a.avgInterval - b.avgInterval);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];
    const avg = Math.round(intervalRows.reduce((s, r) => s + r.avgInterval, 0) / intervalRows.length);
    const avgCows = intervalRows.filter(r => Math.abs(r.avgInterval - avg) <= 10);
    return { lowest, highest, avg, avgCows };
  }, [intervalRows]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogCows, setDialogCows] = useState<IntervalRow[]>([]);

  const openDialog = (title: string, cows: IntervalRow[]) => {
    setDialogTitle(title);
    setDialogCows(cows);
    setDialogOpen(true);
  };

  if (la || lr) return (
    <div className="space-y-6">
      <ShimmerSkeleton className="h-8 w-60" />
      <ShimmerSkeleton className="h-96" />
    </div>
  );
  if (ae || re) return <ErrorBox />;

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-semibold text-foreground">Calving Interval Analysis</h1>

      {/* Summary Cards */}
      {summaryStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            className="bg-card border-l-4 border-destructive/60 cursor-pointer hover:ring-1 hover:ring-destructive/40 transition-all"
            onClick={() => openDialog(
              `Highest Interval — ${summaryStats.highest.tag || summaryStats.highest.lifetime_id}`,
              [summaryStats.highest]
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUp className="h-4 w-4 text-destructive" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Highest Interval</span>
              </div>
              <p className="text-2xl font-bold text-destructive">{summaryStats.highest.avgInterval} days</p>
              <p className="text-xs text-muted-foreground mt-1">{summaryStats.highest.tag || summaryStats.highest.lifetime_id}</p>
            </CardContent>
          </Card>

          <Card
            className="bg-card border-l-4 border-success/60 cursor-pointer hover:ring-1 hover:ring-success/40 transition-all"
            onClick={() => openDialog(
              `Lowest Interval — ${summaryStats.lowest.tag || summaryStats.lowest.lifetime_id}`,
              [summaryStats.lowest]
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowDown className="h-4 w-4 text-success" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Lowest Interval</span>
              </div>
              <p className="text-2xl font-bold text-success">{summaryStats.lowest.avgInterval} days</p>
              <p className="text-xs text-muted-foreground mt-1">{summaryStats.lowest.tag || summaryStats.lowest.lifetime_id}</p>
            </CardContent>
          </Card>

          <Card
            className="bg-card border-l-4 border-primary/40 cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all"
            onClick={() => openDialog(
              `Cows Near Herd Average (${summaryStats.avg} ± 10 days)`,
              summaryStats.avgCows
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Herd Average</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{summaryStats.avg} days</p>
              <p className="text-xs text-muted-foreground mt-1">{summaryStats.avgCows.length} cows within ±10 days</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog for showing cows */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">{dialogTitle}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                <TableHead className="text-[12px]">Tag</TableHead>
                <TableHead className="text-[12px]">Lifetime ID</TableHead>
                <TableHead className="text-[12px]">Avg Interval</TableHead>
                <TableHead className="text-[12px]">Latest</TableHead>
                <TableHead className="text-[12px]">Records</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dialogCows.map(r => (
                <TableRow key={r.lifetime_id} className="border-border text-[13px] cursor-pointer hover:bg-muted/30"
                  onClick={() => { setDialogOpen(false); navigate(`/cow/${encodeURIComponent(r.lifetime_id)}`); }}>
                  <TableCell className="font-medium text-foreground">{r.tag || '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.lifetime_id}</TableCell>
                  <TableCell className={intervalColor(r.avgInterval)}>{r.avgInterval} d</TableCell>
                  <TableCell className={intervalColor(r.latestInterval)}>{r.latestInterval} d</TableCell>
                  <TableCell>{r.records}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* Section 1: Calving Interval per Cow */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
            Calving Interval per Cow ({filteredIntervals.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search…" value={search1} onChange={e => setSearch1(e.target.value)}
                className="pl-8 h-8 w-40 bg-background border-border text-xs" />
            </div>
            <Button variant="outline" size="sm" onClick={exportIntervals} className="border-border">
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                  <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort1('tag')}>Tag{arrow1('tag')}</TableHead>
                  <TableHead className="text-[12px]">Lifetime ID</TableHead>
                  <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort1('avgInterval')}>Avg Interval{arrow1('avgInterval')}</TableHead>
                  <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort1('medianInterval')}>Median{arrow1('medianInterval')}</TableHead>
                  <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort1('latestInterval')}>Latest{arrow1('latestInterval')}</TableHead>
                  <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort1('records')}>Records{arrow1('records')}</TableHead>
                  <TableHead className="text-[12px]">Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIntervals.map((r, i) => (
                  <TableRow key={r.lifetime_id} className="border-border text-[13px] cursor-pointer"
                    style={{ backgroundColor: i % 2 === 1 ? '#0E1528' : undefined }}
                    onClick={() => navigate(`/cow/${encodeURIComponent(r.lifetime_id)}`)}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1A2A45')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 1 ? '#0E1528' : '')}>
                    <TableCell className="font-medium text-foreground">{r.tag || '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{r.lifetime_id}</TableCell>
                    <TableCell className={`font-semibold ${intervalColor(r.avgInterval)}`}>{r.avgInterval} d</TableCell>
                    <TableCell>{r.medianInterval} d</TableCell>
                    <TableCell className={intervalColor(r.latestInterval)}>{r.latestInterval} d</TableCell>
                    <TableCell>{r.records}</TableCell>
                    <TableCell>
                      {r.flag === 'HIGH' && (
                        <Badge variant="outline" className="text-[10px] bg-destructive/20 text-destructive border-destructive/30">
                          <AlertTriangle className="h-3 w-3 mr-0.5" /> HIGH
                        </Badge>
                      )}
                      {r.flag === 'WATCH' && (
                        <Badge variant="outline" className="text-[10px] bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                          <TrendingUp className="h-3 w-3 mr-0.5" /> WATCH
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Open Cow Report */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
            Open Cow Report ({filteredOpen.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search…" value={search2} onChange={e => setSearch2(e.target.value)}
                className="pl-8 h-8 w-40 bg-background border-border text-xs" />
            </div>
            <Button variant="outline" size="sm" onClick={exportOpen} className="border-border">
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                  <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort2('tag')}>Tag{arrow2('tag')}</TableHead>
                  <TableHead className="text-[12px]">Lifetime ID</TableHead>
                  <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort2('year_born')}>Year Born{arrow2('year_born')}</TableHead>
                  <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort2('totalOpen')}>Times Open{arrow2('totalOpen')}</TableHead>
                  <TableHead className="text-[12px]">Years Open</TableHead>
                  <TableHead className="text-[12px] cursor-pointer" onClick={() => handleSort2('mostRecentYear')}>Most Recent{arrow2('mostRecentYear')}</TableHead>
                  <TableHead className="text-[12px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOpen.map((r, i) => (
                  <TableRow key={r.lifetime_id} className="border-border text-[13px] cursor-pointer"
                    style={{ backgroundColor: i % 2 === 1 ? '#0E1528' : undefined }}
                    onClick={() => navigate(`/cow/${encodeURIComponent(r.lifetime_id)}`)}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1A2A45')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 1 ? '#0E1528' : '')}>
                    <TableCell className={`font-medium ${r.totalOpen > 1 ? 'text-destructive font-bold' : 'text-foreground'}`}>{r.tag || '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{r.lifetime_id}</TableCell>
                    <TableCell>{r.year_born ?? '—'}</TableCell>
                    <TableCell className={r.totalOpen > 1 ? 'text-destructive font-bold' : ''}>{r.totalOpen}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.yearsOpen.join(', ')}</TableCell>
                    <TableCell>{r.mostRecentYear}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${r.status?.toLowerCase() === 'active' ? 'bg-success/20 text-success border-success/30' : 'bg-muted text-muted-foreground border-border'}`}>
                        {r.status || '—'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
