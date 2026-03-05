import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveAnimals, useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { computeCowStats, computeCompositeScores, getQuartile } from '@/lib/calculations';
import { CowStats } from '@/types/cattle';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown, Search } from 'lucide-react';

type SortKey = keyof CowStats;

export default function CowRoster() {
  const { data: animals, isLoading: la } = useActiveAnimals();
  const { data: records, isLoading: lr } = useBreedingCalvingRecords();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sireFilter, setSireFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('composite_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const PER_PAGE = 50;

  const cowStats = useMemo(() => {
    if (!animals || !records) return [];
    const raw = animals.map(a => computeCowStats(a, records));
    return computeCompositeScores(raw);
  }, [animals, records]);

  const allScores = useMemo(() => cowStats.filter(s => s.composite_score > 0).map(s => s.composite_score), [cowStats]);

  const sires = useMemo(() => [...new Set(cowStats.map(c => c.sire).filter(Boolean) as string[])].sort(), [cowStats]);

  const filtered = useMemo(() => {
    let result = cowStats;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => c.tag?.toLowerCase().includes(q) || c.lifetime_id.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      result = result.filter(c => c.status?.toLowerCase() === statusFilter.toLowerCase());
    }
    if (sireFilter !== 'all') {
      result = result.filter(c => c.sire === sireFilter);
    }
    result.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return result;
  }, [cowStats, search, statusFilter, sireFilter, sortKey, sortDir]);

  const paginated = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
    setPage(0);
  };

  const scoreColor = (score: number) => {
    const q = getQuartile(score, allScores);
    if (q === 'top') return 'bg-success/20 text-success';
    if (q === 'upper') return 'bg-[hsl(50,80%,50%)]/20 text-[hsl(50,80%,50%)]';
    if (q === 'lower') return 'bg-[hsl(35,80%,50%)]/20 text-[hsl(35,80%,50%)]';
    return 'bg-destructive/20 text-destructive';
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </TableHead>
  );

  if (la || lr) return <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Cow Roster</h1>
        <span className="text-sm text-muted-foreground">Showing {paginated.length} of {filtered.length} cows</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tag or ID..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9 bg-card border-card-border" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] bg-card border-card-border"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sireFilter} onValueChange={v => { setSireFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px] bg-card border-card-border"><SelectValue placeholder="Sire" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sires</SelectItem>
            {sires.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-card-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar border-card-border hover:bg-sidebar">
              <SortHeader label="Tag" field="tag" />
              <SortHeader label="Lifetime ID" field="lifetime_id" />
              <SortHeader label="Year Born" field="year_born" />
              <SortHeader label="Sire" field="sire" />
              <TableHead>Dam Sire</TableHead>
              <SortHeader label="Calves" field="total_calves" />
              <SortHeader label="Avg BW" field="avg_bw" />
              <SortHeader label="AI Conc %" field="ai_conception_rate" />
              <SortHeader label="Survival %" field="calf_survival_rate" />
              <SortHeader label="Score" field="composite_score" />
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((cow, i) => (
              <TableRow
                key={cow.lifetime_id}
                className={`cursor-pointer hover:bg-hover border-card-border ${i % 2 === 0 ? 'bg-card' : 'bg-background'}`}
                onClick={() => navigate(`/cow/${encodeURIComponent(cow.lifetime_id)}`)}
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
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${scoreColor(cow.composite_score)}`}>
                    {cow.composite_score}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={cow.status?.toLowerCase() === 'active' ? 'default' : 'secondary'} className="text-xs">
                    {cow.status || '—'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1 text-sm rounded bg-card border border-card-border text-foreground disabled:opacity-40 hover:bg-hover">
            Previous
          </button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="px-3 py-1 text-sm rounded bg-card border border-card-border text-foreground disabled:opacity-40 hover:bg-hover">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
