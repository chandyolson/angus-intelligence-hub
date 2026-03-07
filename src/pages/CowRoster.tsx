import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBreedingCalvingRecords } from '@/hooks/useCattleData';
import { Animal, BreedingCalvingRecord } from '@/types/cattle';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, ArrowUpDown, Search, Crown, Calendar, ChevronDown, ChevronUp, AlertTriangle, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ShimmerSkeleton, ShimmerTableRows } from '@/components/ui/shimmer-skeleton';
import { ErrorBox } from '@/components/ui/error-box';
import { EmptyState } from '@/components/ui/empty-state';
import { computeCompositeFromRecords } from '@/lib/calculations';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
  first_service_rate: number;
  second_service_rate: number;
  calf_survival_rate: number | null;
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
    const withAiDate1 = recs.filter(r => r.ai_date_1 != null);
    const aiConceived = recs.filter(r => r.preg_stage?.toLowerCase() === 'ai' || r.preg_stage?.toLowerCase() === 'second ai');
    const conceptionRate = withAiDate1.length > 0 ? (aiConceived.length / withAiDate1.length) * 100 : 0;
    const firstServiceConceived = recs.filter(r => r.preg_stage?.toLowerCase() === 'ai');
    const firstServiceRate = withAiDate1.length > 0 ? (firstServiceConceived.length / withAiDate1.length) * 100 : 0;
    const withAiDate2 = recs.filter(r => r.ai_date_2 != null);
    const secondServiceConceived = recs.filter(r => r.preg_stage?.toLowerCase() === 'second ai');
    const secondServiceRate = withAiDate2.length > 0 ? (secondServiceConceived.length / withAiDate2.length) * 100 : 0;
    const liveCalves = withCalf.filter(r => r.calf_status?.toLowerCase() === 'alive').length;
    const survivalRate = withCalf.length > 0 ? (liveCalves / withCalf.length) * 100 : 0;
    const composite = computeCompositeFromRecords(recs, a.year_born);

    const sire = a.sire || null;
    const damSire = a.dam_sire || null;

    return {
      lifetime_id: a.lifetime_id ?? '',
      tag: a.tag,
      year_born: a.year_born,
      sire,
      dam_sire: damSire,
      status: a.status,
      total_calves: totalCalves,
      avg_bw: avgBw,
      ai_conception_rate: Math.round(conceptionRate * 10) / 10,
      first_service_rate: Math.round(firstServiceRate * 10) / 10,
      second_service_rate: Math.round(secondServiceRate * 10) / 10,
      calf_survival_rate: Math.round(survivalRate * 10) / 10,
      composite_score: composite,
    };
  });
}

export default function CowRoster() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [sireFilter, setSireFilter] = useState('all');
  const [operationFilter, setOperationFilter] = useState('Blair');
  const [sortKey, setSortKey] = useState<SortKey>('composite_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [tableOpen, setTableOpen] = useState(true);
  const PER_PAGE = 50;

  // Server-side paginated animal fetch with ALL filters applied server-side
  const { data: animalPage, isLoading: la, error: animalsError } = useQuery({
    queryKey: ['animals_page', page, operationFilter, statusFilter, yearFilter, sireFilter, search],
    queryFn: async () => {
      const from = page * PER_PAGE;
      const to = from + PER_PAGE - 1;
      let pageQuery = supabase.from('animals').select('*').range(from, to);
      let countQuery = supabase.from('animals').select('*', { count: 'exact', head: true });
      if (operationFilter !== 'all') {
        pageQuery = pageQuery.eq('operation', operationFilter);
        countQuery = countQuery.eq('operation', operationFilter);
      }
      if (statusFilter !== 'all') {
        pageQuery = pageQuery.eq('status', statusFilter);
        countQuery = countQuery.eq('status', statusFilter);
      }
      if (yearFilter !== 'all') {
        pageQuery = pageQuery.eq('year_born', parseInt(yearFilter));
        countQuery = countQuery.eq('year_born', parseInt(yearFilter));
      }
      if (sireFilter !== 'all') {
        pageQuery = pageQuery.eq('sire', sireFilter);
        countQuery = countQuery.eq('sire', sireFilter);
      }
      if (search) {
        pageQuery = pageQuery.or(`tag.ilike.%${search}%,lifetime_id.ilike.%${search}%`);
        countQuery = countQuery.or(`tag.ilike.%${search}%,lifetime_id.ilike.%${search}%`);
      }
      const [pageResult, countResult] = await Promise.all([pageQuery, countQuery]);
      if (pageResult.error) throw pageResult.error;
      return {
        animals: pageResult.data as unknown as Animal[],
        totalCount: countResult.count ?? 0,
      };
    },
  });

  const { data: records, isLoading: lr, error: recordsError } = useBreedingCalvingRecords();

  // Fetch distinct filter options from the database for the current operation
  const { data: filterOptions } = useQuery({
    queryKey: ['animal_filter_options', operationFilter],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      const allRows: { sire: string | null; year_born: number | null; status: string | null }[] = [];
      let from = 0;
      let done = false;

      while (!done) {
        let q = supabase.from('animals').select('sire, year_born, status').range(from, from + PAGE_SIZE - 1);
        if (operationFilter !== 'all') q = q.eq('operation', operationFilter);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length < PAGE_SIZE) {
          allRows.push(...(data ?? []));
          done = true;
        } else {
          allRows.push(...data);
          from += PAGE_SIZE;
        }
      }

      const sires = [...new Set(allRows.map(r => r.sire).filter(Boolean))].sort() as string[];
      const years = [...new Set(allRows.map(r => r.year_born).filter(Boolean))].sort((a, b) => b - a) as number[];
      const statuses = [...new Set(allRows.map(r => r.status).filter(Boolean))].sort() as string[];

      // Compute card stats
      const activeRows = allRows.filter(r => r.status?.toLowerCase() === 'active');
      const sireCounts = new Map<string, number>();
      activeRows.forEach(r => { if (r.sire) sireCounts.set(r.sire, (sireCounts.get(r.sire) || 0) + 1); });
      let topSire: { name: string; count: number } | null = null;
      sireCounts.forEach((count, name) => { if (!topSire || count > topSire.count) topSire = { name, count }; });

      const currentYear = new Date().getFullYear();
      const ages = activeRows.map(r => r.year_born ? currentYear - r.year_born : null).filter((v): v is number => v != null && v >= 0);
      const avgAge = ages.length > 0 ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : 0;

      return { sires, years, statuses, topSire, avgAge, activeCowCount: activeRows.length };
    },
  });

  const allYears = filterOptions?.years ?? [];
  const allSires = filterOptions?.sires ?? [];
  const allStatuses = filterOptions?.statuses ?? [];

  const cowRows = useMemo(() => {
    if (!animalPage?.animals || !records) return [];
    return buildCowRows(animalPage.animals, records);
  }, [animalPage, records]);

  // Sort only — all filtering is server-side
  const sorted = useMemo(() => {
    return [...cowRows].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [cowRows, sortKey, sortDir]);

  const totalAll = animalPage?.totalCount ?? 0;
  const totalPages = Math.ceil(totalAll / PER_PAGE);

  const alerts = useMemo(() => {
    const items: { label: string; count: number; severity: 'warning' | 'info' }[] = [];
    const tooYoung = sorted.filter(c => c.year_born != null && c.year_born >= 2024);
    if (tooYoung.length > 0) items.push({ label: 'Too young to score (born ≥ 2024)', count: tooYoung.length, severity: 'info' });
    const noCalves = sorted.filter(c => c.total_calves === 0 && (c.year_born == null || c.year_born < 2024));
    if (noCalves.length > 0) items.push({ label: 'No calving records found', count: noCalves.length, severity: 'warning' });
    const missingSire = sorted.filter(c => !c.sire);
    if (missingSire.length > 0) items.push({ label: 'Missing sire data', count: missingSire.length, severity: 'warning' });
    const lowScore = sorted.filter(c => c.composite_score > 0 && c.composite_score < 25);
    if (lowScore.length > 0) items.push({ label: 'Low composite score (< 25)', count: lowScore.length, severity: 'warning' });
    return items;
  }, [sorted]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const scoreStyle = (score: number): string => {
    if (score <= 0) return '';
    if (score >= 75) return 'bg-success/20 text-success';
    if (score >= 50) return 'bg-yellow-500/20 text-yellow-400';
    if (score >= 25) return 'bg-orange-500/20 text-orange-400';
    return 'bg-destructive/20 text-destructive';
  };

  const SortIcon = ({ field }: { field: SortKey }) => {
    if (sortKey !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <TableHead className="cursor-pointer select-none hover:text-foreground whitespace-nowrap text-[13px] uppercase tracking-[0.1em] text-primary" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">
        {label}
        <SortIcon field={field} />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-[20px] font-semibold text-foreground">Cow Roster</h1>

      {/* Summary Cards */}
      {filterOptions && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filterOptions.topSire && (
            <Card className="bg-card border-border" style={{ background: 'linear-gradient(135deg, hsl(224, 52%, 14%) 0%, hsl(40, 40%, 16%) 100%)' }}>
              <CardContent className="p-4 flex items-start gap-3">
                <Crown className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sire with Most Active Dams</p>
                  <p className="text-lg font-bold text-foreground">{filterOptions.topSire.name}</p>
                  <p className="text-sm text-primary font-semibold">{filterOptions.topSire.count} active daughters</p>
                </div>
              </CardContent>
            </Card>
          )}
          <Card className="bg-card border-border" style={{ background: 'linear-gradient(135deg, hsl(224, 52%, 14%) 0%, hsl(190, 40%, 18%) 100%)' }}>
            <CardContent className="p-4 flex items-start gap-3">
              <Calendar className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Cow Age</p>
                <p className="text-lg font-bold text-foreground">{filterOptions.avgAge} years</p>
                <p className="text-sm text-muted-foreground">{filterOptions.activeCowCount} active cows</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alerts / Flags Bar */}
      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border text-[13px] ${
                alert.severity === 'warning'
                  ? 'bg-destructive/10 border-destructive/30 text-destructive'
                  : 'bg-primary/10 border-primary/30 text-primary'
              }`}
            >
              {alert.severity === 'warning' ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Info className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="font-semibold">{alert.count}</span>
              <span>{alert.label}</span>
            </div>
          ))}
        </div>
      )}

      {(animalsError || recordsError) && <ErrorBox />}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tag or lifetime ID..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9 bg-card border-border text-[13px]" />
        </div>
        <Select value={operationFilter} onValueChange={v => { setOperationFilter(v); setStatusFilter('all'); setYearFilter('all'); setSireFilter('all'); setPage(0); }}>
          <SelectTrigger className="w-[140px] bg-card border-border text-[13px]"><SelectValue placeholder="Operation" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Operations</SelectItem>
            <SelectItem value="Blair">Blair</SelectItem>
            <SelectItem value="Snyder">Snyder</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] bg-card border-border text-[13px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {allStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={v => { setYearFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] bg-card border-border text-[13px]"><SelectValue placeholder="Year Born" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {allYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sireFilter} onValueChange={v => { setSireFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px] bg-card border-border text-[13px]"><SelectValue placeholder="Sire" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sires</SelectItem>
            {allSires.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[12px] text-muted-foreground ml-auto">Showing {sorted.length} of {totalAll} cows</span>
      </div>

      {/* Collapsible Table */}
      <Collapsible open={tableOpen} onOpenChange={setTableOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 w-full px-4 py-2.5 rounded-t-lg bg-sidebar border border-border text-[13px] font-semibold text-foreground hover:bg-secondary transition-colors">
            {tableOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            Cow Roster Table
            <span className="text-muted-foreground font-normal ml-1">({totalAll} total)</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-b-lg border border-t-0 border-border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                  <SortHeader label="Tag #" field="tag" />
                  <SortHeader label="Lifetime ID" field="lifetime_id" />
                  <SortHeader label="Year Born" field="year_born" />
                  <SortHeader label="Sire" field="sire" />
                  <SortHeader label="Dam Sire" field="dam_sire" />
                  <SortHeader label="Total Calves" field="total_calves" />
                  <SortHeader label="Avg Birth Wt" field="avg_bw" />
                  <SortHeader label="Overall AI %" field="ai_conception_rate" />
                  <SortHeader label="1st Service %" field="first_service_rate" />
                  <SortHeader label="2nd Service %" field="second_service_rate" />
                  <SortHeader label="Calf Survival %" field="calf_survival_rate" />
                  <SortHeader label="Composite Score" field="composite_score" />
                  <SortHeader label="Status" field="status" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(la || lr) ? (
                  <ShimmerTableRows rows={10} cols={13} />
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={13}><EmptyState message="No cows match your filters." /></td></tr>
                ) : (
                  sorted.map((cow, i) => (
                    <TableRow
                      key={cow.lifetime_id}
                      className="cursor-pointer border-border text-[13px]"
                      style={{ backgroundColor: i % 2 === 0 ? undefined : '#0E1528' }}
                      onClick={() => navigate(`/cow/${encodeURIComponent(cow.lifetime_id)}`)}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1A2A45')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? '' : '#0E1528')}
                    >
                      <TableCell className="font-medium text-foreground">{cow.tag || '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{cow.lifetime_id}</TableCell>
                      <TableCell>{cow.year_born || '—'}</TableCell>
                      <TableCell>{cow.sire || '—'}</TableCell>
                      <TableCell>{cow.dam_sire || '—'}</TableCell>
                      <TableCell>{cow.total_calves}</TableCell>
                      <TableCell>{cow.avg_bw || '—'}</TableCell>
                      <TableCell>{cow.ai_conception_rate}%</TableCell>
                      <TableCell>{cow.first_service_rate}%</TableCell>
                      <TableCell>{cow.second_service_rate}%</TableCell>
                      <TableCell>
                        {cow.total_calves === 0 || cow.calf_survival_rate === null
                          ? '—'
                          : `${cow.calf_survival_rate}%`}
                      </TableCell>
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
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
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
