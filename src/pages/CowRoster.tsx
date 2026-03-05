import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnimals, useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { Animal, BreedingCalvingRecord } from '@/types/cattle';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, ArrowUpDown, Search } from 'lucide-react';

interface CowRow {
  lifetime_id: string;
  tag: string | null;
  year_born: number | null;
  sire: string | null;
  dam_sire: string | null;
  status: string | null;
  total_calves: number;
  avg_bw: number;
  ai_conception_rate: number;
  calf_survival_rate: number;
  composite_score: number;
}

type SortKey = keyof CowRow;

function buildCowRows(animals: Animal[], records: BreedingCalvingRecord[]): CowRow[] {
  const byLid = new Map<string, BreedingCalvingRecord[]>();
  records.forEach(r => {
    if (!r.lifetime_id) return;
    const arr = byLid.get(r.lifetime_id) || [];
    arr.push(r);
    byLid.set(r.lifetime_id, arr);
  });

  return animals.map(a => {
    const recs = byLid.get(a.lifetime_id ?? '') || [];
    const withCalf = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open');
    const totalCalves = withCalf.length;

    const bws = withCalf.map(r => r.calf_bw).filter((v): v is number => v != null && v > 0);
    const avgBw = bws.length > 0 ? Math.round(bws.reduce((a, b) => a + b, 0) / bws.length) : 0;

    const totalBreedings = recs.length;
    const settled = recs.filter(r => r.calf_status && r.calf_status.toLowerCase() !== 'open').length;
    const conceptionRate = totalBreedings > 0 ? (settled / totalBreedings) * 100 : 0;

    const liveCalves = withCalf.filter(r => r.calf_status!.toLowerCase() === 'live').length;
    const survivalRate = withCalf.length > 0 ? (liveCalves / withCalf.length) * 100 : 0;

    // BW consistency
    let bwConsistency = 50;
    if (bws.length >= 2) {
      const mean = bws.reduce((a, b) => a + b, 0) / bws.length;
      const std = Math.sqrt(bws.reduce((a, b) => a + (b - mean) ** 2, 0) / bws.length);
      const cv = mean > 0 ? std / mean : 0;
      bwConsistency = Math.max(0, Math.min(100, (1 - cv) * 100));
    }

    const composite = totalBreedings > 0
      ? Math.round((conceptionRate * 0.4 + survivalRate * 0.35 + bwConsistency * 0.25) * 10) / 10
      : 0;

    return {
      lifetime_id: a.lifetime_id ?? '',
      tag: a.tag,
      year_born: a.year_born,
      sire: a.sire,
      dam_sire: a.dam_sire,
      status: a.status,
      total_calves: totalCalves,
      avg_bw: avgBw,
      ai_conception_rate: Math.round(conceptionRate * 10) / 10,
      calf_survival_rate: Math.round(survivalRate * 10) / 10,
      composite_score: composite,
    };
  });
}

export default function CowRoster() {
  const { data: animals, isLoading: la } = useAnimals();
  const { data: records, isLoading: lr } = useBreedingCalvingRecords();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [sireFilter, setSireFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('composite_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const PER_PAGE = 50;

  const cowRows = useMemo(() => {
    if (!animals || !records) return [];
    return buildCowRows(animals, records);
  }, [animals, records]);

  // Quartile thresholds
  const quartiles = useMemo(() => {
    const scores = cowRows.filter(c => c.composite_score > 0).map(c => c.composite_score).sort((a, b) => a - b);
    if (scores.length === 0) return { q25: 0, q75: 0 };
    return {
      q25: scores[Math.floor(scores.length * 0.25)] ?? 0,
      q75: scores[Math.floor(scores.length * 0.75)] ?? 0,
    };
  }, [cowRows]);

  const years = useMemo(() => [...new Set(cowRows.map(c => c.year_born).filter((v): v is number => v != null))].sort((a, b) => b - a), [cowRows]);
  const sires = useMemo(() => [...new Set(cowRows.map(c => c.sire).filter(Boolean) as string[])].sort(), [cowRows]);

  const filtered = useMemo(() => {
    let result = cowRows;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => c.tag?.toLowerCase().includes(q) || c.lifetime_id.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      result = result.filter(c => c.status?.toLowerCase() === statusFilter.toLowerCase());
    }
    if (yearFilter !== 'all') {
      result = result.filter(c => String(c.year_born) === yearFilter);
    }
    if (sireFilter !== 'all') {
      result = result.filter(c => c.sire === sireFilter);
    }
    result = [...result].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [cowRows, search, statusFilter, yearFilter, sireFilter, sortKey, sortDir]);

  const totalFiltered = filtered.length;
  const totalAll = cowRows.length;
  const paginated = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(totalFiltered / PER_PAGE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
    setPage(0);
  };

  const scoreStyle = (score: number): string => {
    if (score <= 0) return '';
    if (score >= quartiles.q75) return 'bg-success/20 text-success';
    if (score <= quartiles.q25) return 'bg-destructive/20 text-destructive';
    return 'bg-yellow-500/20 text-yellow-400';
  };

  const SortIcon = ({ field }: { field: SortKey }) => {
    if (sortKey !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <TableHead className="cursor-pointer select-none hover:text-foreground whitespace-nowrap" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">
        {label}
        <SortIcon field={field} />
      </div>
    </TableHead>
  );

  if (la || lr) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Cow Roster</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tag or lifetime ID..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 bg-card border-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] bg-card border-border"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={v => { setYearFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] bg-card border-border"><SelectValue placeholder="Year Born" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sireFilter} onValueChange={v => { setSireFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px] bg-card border-border"><SelectValue placeholder="Sire" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sires</SelectItem>
            {sires.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">Showing {totalFiltered} of {totalAll} cows</span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar-background border-border hover:bg-sidebar-background">
              <SortHeader label="Tag #" field="tag" />
              <SortHeader label="Lifetime ID" field="lifetime_id" />
              <SortHeader label="Year Born" field="year_born" />
              <SortHeader label="Sire" field="sire" />
              <SortHeader label="Dam Sire" field="dam_sire" />
              <SortHeader label="Total Calves" field="total_calves" />
              <SortHeader label="Avg Birth Wt" field="avg_bw" />
              <SortHeader label="AI Conception %" field="ai_conception_rate" />
              <SortHeader label="Calf Survival %" field="calf_survival_rate" />
              <SortHeader label="Composite Score" field="composite_score" />
              <SortHeader label="Status" field="status" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((cow, i) => (
              <TableRow
                key={cow.lifetime_id}
                className={`cursor-pointer border-border ${i % 2 === 0 ? 'bg-card' : 'bg-background'}`}
                style={{ ['--tw-bg-opacity' as string]: 1 }}
                onClick={() => navigate(`/cow/${encodeURIComponent(cow.lifetime_id)}`)}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1A2A45')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                <TableCell className="font-medium text-foreground">{cow.tag || '—'}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{cow.lifetime_id}</TableCell>
                <TableCell>{cow.year_born || '—'}</TableCell>
                <TableCell>{cow.sire || '—'}</TableCell>
                <TableCell>{cow.dam_sire || '—'}</TableCell>
                <TableCell>{cow.total_calves}</TableCell>
                <TableCell>{cow.avg_bw || '—'}</TableCell>
                <TableCell>{cow.ai_conception_rate}%</TableCell>
                <TableCell>{cow.calf_survival_rate}%</TableCell>
                <TableCell>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${scoreStyle(cow.composite_score)}`}>
                    {cow.composite_score}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    className={`text-xs ${cow.status?.toLowerCase() === 'active'
                      ? 'bg-success/20 text-success border-success/30'
                      : 'bg-muted text-muted-foreground border-border'}`}
                    variant="outline"
                  >
                    {cow.status || '—'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {paginated.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">No cows match your filters.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm rounded bg-card border border-border text-foreground disabled:opacity-40 hover:bg-secondary transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm rounded bg-card border border-border text-foreground disabled:opacity-40 hover:bg-secondary transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
