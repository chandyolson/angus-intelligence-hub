import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BreedingCalvingRecord, Animal } from '@/types/cattle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Download, ArrowUpDown } from 'lucide-react';

interface Props {
  records: BreedingCalvingRecord[];
  animals: Animal[];
  sireName: string;
}

interface CowRow {
  tag: string;
  lifetime_id: string;
  breeding_year: number | null;
  service: '1st' | '2nd';
  preg_stage: string | null;
  calving_date: string | null;
  calf_bw: number | null;
  calf_status: string | null;
}

type SortKey = keyof CowRow;

function pregColor(stage: string | null) {
  if (!stage) return '';
  const s = stage.toLowerCase();
  if (s === 'open') return 'text-destructive';
  if (s === 'ai' || s === 'second ai' || s === 'pregnant' || s === 'bred') return 'text-success';
  return '';
}

function calfStatusColor(status: string | null) {
  if (!status) return '';
  const s = status.toLowerCase();
  if (s === 'alive') return 'text-success';
  if (['dead', 'stillborn', 'died'].includes(s)) return 'text-destructive';
  return '';
}

export default function SireCowList({ records, animals, sireName }: Props) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>('breeding_year');
  const [sortAsc, setSortAsc] = useState(false);

  const animalMap = useMemo(() => {
    const m = new Map<string, Animal>();
    animals.forEach(a => { if (a.lifetime_id) m.set(a.lifetime_id, a); });
    return m;
  }, [animals]);

  const rows = useMemo(() => {
    const result: CowRow[] = [];

    records.forEach(r => {
      if (!r.lifetime_id) return;
      const is1st = r.ai_sire_1 === sireName && r.ai_date_1 != null;
      const is2nd = r.ai_sire_2 === sireName && r.ai_date_2 != null;
      if (!is1st && !is2nd) return;

      const animal = animalMap.get(r.lifetime_id);
      const tag = animal?.tag ?? '—';

      if (is1st) {
        result.push({
          tag,
          lifetime_id: r.lifetime_id,
          breeding_year: r.breeding_year,
          service: '1st',
          preg_stage: r.preg_stage,
          calving_date: r.calving_date,
          calf_bw: r.calf_bw,
          calf_status: r.calf_status,
        });
      }
      if (is2nd) {
        result.push({
          tag,
          lifetime_id: r.lifetime_id,
          breeding_year: r.breeding_year,
          service: '2nd',
          preg_stage: r.preg_stage,
          calving_date: r.calving_date,
          calf_bw: r.calf_bw,
          calf_status: r.calf_status,
        });
      }
    });

    return result;
  }, [records, sireName, animalMap]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });
  }, [rows, sortKey, sortAsc]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(true); }
  }, [sortKey]);

  const exportCSV = useCallback(() => {
    const headers = ['Tag', 'Lifetime ID', 'Breeding Year', 'Service', 'Preg Stage', 'Calving Date', 'Calf BW', 'Calf Status'];
    const csvRows = [headers.join(',')];
    sorted.forEach(r => {
      csvRows.push([
        r.tag, r.lifetime_id, r.breeding_year ?? '', r.service,
        r.preg_stage ?? '', r.calving_date ?? '', r.calf_bw ?? '', r.calf_status ?? '',
      ].map(v => `"${v}"`).join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sireName}_cow_list.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sorted, sireName]);

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <TableHead
      className="text-[12px] cursor-pointer hover:text-foreground transition-colors select-none"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
      </span>
    </TableHead>
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-[13px] uppercase tracking-[0.1em] text-primary font-medium">
          Cow List ({rows.length} services)
        </CardTitle>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={exportCSV}>
          <Download className="h-3 w-3" /> CSV
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <EmptyState message="No breeding records found for this sire." /> : (
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar border-border hover:bg-sidebar">
                  <SortHeader label="Tag" field="tag" />
                  <SortHeader label="Lifetime ID" field="lifetime_id" />
                  <SortHeader label="Year" field="breeding_year" />
                  <SortHeader label="Service" field="service" />
                  <SortHeader label="Preg Stage" field="preg_stage" />
                  <SortHeader label="Calving Date" field="calving_date" />
                  <SortHeader label="Calf BW" field="calf_bw" />
                  <SortHeader label="Calf Status" field="calf_status" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r, i) => (
                  <TableRow
                    key={`${r.lifetime_id}-${r.breeding_year}-${r.service}-${i}`}
                    className="border-border text-[13px] cursor-pointer hover:bg-muted/50 transition-colors"
                    style={{ backgroundColor: i % 2 === 1 ? 'hsl(var(--sidebar-background))' : undefined }}
                    onClick={() => navigate(`/cow/${encodeURIComponent(r.lifetime_id)}`)}
                  >
                    <TableCell className="font-medium text-foreground">{r.tag}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.lifetime_id}</TableCell>
                    <TableCell>{r.breeding_year ?? '—'}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${r.service === '1st' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                        {r.service}
                      </span>
                    </TableCell>
                    <TableCell className={pregColor(r.preg_stage)}>{r.preg_stage ?? '—'}</TableCell>
                    <TableCell className="text-xs">{r.calving_date ?? '—'}</TableCell>
                    <TableCell>{r.calf_bw ?? '—'}</TableCell>
                    <TableCell className={calfStatusColor(r.calf_status)}>{r.calf_status ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
