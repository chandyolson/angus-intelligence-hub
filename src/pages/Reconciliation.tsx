import { useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, Download, Play, Info, ArrowLeftRight } from 'lucide-react';
import { useActiveAnimals, useBlairCombined } from '@/hooks/useCattleData';
import { exportToCSV } from '@/lib/calculations';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate } from 'react-router-dom';

interface SideConfig {
  groups: string[];
  years: number[];
  useAllActive: boolean;
}

const emptySide = (): SideConfig => ({ groups: [], years: [], useAllActive: false });

export default function Reconciliation() {
  const { data: activeAnimals } = useActiveAnimals();
  const { data: records } = useBlairCombined();
  const navigate = useNavigate();

  const [sideA, setSideA] = useState<SideConfig>(emptySide());
  const [sideB, setSideB] = useState<SideConfig>(emptySide());
  const [ran, setRan] = useState(false);

  // Extract available groups and years
  const { allGroups, allYears } = useMemo(() => {
    if (!records) return { allGroups: [] as string[], allYears: [] as number[] };
    const gs = new Set<string>();
    const ys = new Set<number>();
    records.forEach(r => {
      if (r.ultrasound_group) gs.add(r.ultrasound_group);
      if (r.breeding_year) ys.add(r.breeding_year);
    });
    return {
      allGroups: [...gs].sort(),
      allYears: [...ys].sort((a, b) => b - a),
    };
  }, [records]);

  // Build lookup for last known info per lifetime_id
  const lastInfo = useMemo(() => {
    if (!records) return new Map<string, { preg_stage: string; calving_date: string; breeding_year: number }>();
    const map = new Map<string, { preg_stage: string; calving_date: string; breeding_year: number }>();
    // Sort by breeding_year asc so later records overwrite
    const sorted = [...records].sort((a, b) => (a.breeding_year ?? 0) - (b.breeding_year ?? 0));
    sorted.forEach(r => {
      if (!r.lifetime_id) return;
      map.set(r.lifetime_id, {
        preg_stage: r.preg_stage ?? '',
        calving_date: r.calving_date ?? '',
        breeding_year: r.breeding_year ?? 0,
      });
    });
    return map;
  }, [records]);

  // Tag lookup
  const tagMap = useMemo(() => {
    if (!activeAnimals) return new Map<string, string>();
    const m = new Map<string, string>();
    activeAnimals.forEach(a => { if (a.lifetime_id) m.set(a.lifetime_id, a.tag ?? ''); });
    return m;
  }, [activeAnimals]);

  // Resolve a side config to a set of lifetime_ids
  const resolveIds = useCallback((cfg: SideConfig): Set<string> => {
    if (cfg.useAllActive) {
      const s = new Set<string>();
      activeAnimals?.forEach(a => { if (a.lifetime_id) s.add(a.lifetime_id); });
      return s;
    }
    const s = new Set<string>();
    records?.forEach(r => {
      if (!r.lifetime_id) return;
      const gMatch = cfg.groups.length === 0 || (r.ultrasound_group && cfg.groups.includes(r.ultrasound_group));
      const yMatch = cfg.years.length === 0 || (r.breeding_year && cfg.years.includes(r.breeding_year));
      if (gMatch && yMatch) s.add(r.lifetime_id);
    });
    return s;
  }, [records, activeAnimals]);

  const results = useMemo(() => {
    if (!ran) return null;
    const idsA = resolveIds(sideA);
    const idsB = resolveIds(sideB);

    const onlyA = [...idsA].filter(id => !idsB.has(id));
    const onlyB = [...idsB].filter(id => !idsA.has(id));
    const both = [...idsA].filter(id => idsB.has(id));

    return { onlyA, onlyB, both, totalUnique: new Set([...idsA, ...idsB]).size };
  }, [ran, sideA, sideB, resolveIds]);

  const canRun = (sideA.useAllActive || sideA.groups.length > 0 || sideA.years.length > 0) &&
                 (sideB.useAllActive || sideB.groups.length > 0 || sideB.years.length > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Group Reconciliation</h1>

      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm text-foreground">
          <strong>Primary use case:</strong> Select last year's breeding season on Side A and the current year on Side B
          to identify cows that disappeared between seasons — sold, died, or missed processing.
        </AlertDescription>
      </Alert>

      {/* Side-by-side panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SidePanel
          label="Side A"
          config={sideA}
          onChange={c => { setSideA(c); setRan(false); }}
          allGroups={allGroups}
          allYears={allYears}
        />
        <SidePanel
          label="Side B"
          config={sideB}
          onChange={c => { setSideB(c); setRan(false); }}
          allGroups={allGroups}
          allYears={allYears}
        />
      </div>

      <div className="flex justify-center">
        <Button size="lg" disabled={!canRun} onClick={() => setRan(true)}>
          <Play className="h-4 w-4 mr-2" /> Run Reconciliation
        </Button>
      </div>

      {/* Results */}
      {results && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-orange-400">{results.onlyA.length}</p>
              <p className="text-xs text-muted-foreground">Only in A</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-blue-400">{results.onlyB.length}</p>
              <p className="text-xs text-muted-foreground">Only in B</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-green-400">{results.both.length}</p>
              <p className="text-xs text-muted-foreground">In Both</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-foreground">{results.totalUnique}</p>
              <p className="text-xs text-muted-foreground">Total Unique</p>
            </CardContent></Card>
          </div>

          {/* Result Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ResultTable
              title="Only in Side A"
              ids={results.onlyA}
              lastInfo={lastInfo}
              tagMap={tagMap}
              color="text-orange-400"
              filename="reconciliation_only_A.csv"
              navigate={navigate}
            />
            <ResultTable
              title="Only in Side B"
              ids={results.onlyB}
              lastInfo={lastInfo}
              tagMap={tagMap}
              color="text-blue-400"
              filename="reconciliation_only_B.csv"
              navigate={navigate}
            />
          </div>
          <ResultTable
            title="In Both"
            ids={results.both}
            lastInfo={lastInfo}
            tagMap={tagMap}
            color="text-green-400"
            filename="reconciliation_both.csv"
            navigate={navigate}
          />
        </>
      )}
    </div>
  );
}

/* ── Multi-select dropdown with checkboxes ── */
function MultiSelect({ label, options, selected, onChange }: {
  label: string;
  options: (string | number)[];
  selected: (string | number)[];
  onChange: (v: (string | number)[]) => void;
}) {
  const toggle = (val: string | number) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between text-xs h-9">
          <span className="truncate">
            {selected.length === 0 ? label : `${selected.length} selected`}
          </span>
          <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{selected.length}</Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <ScrollArea className="max-h-56 p-2">
          <div className="space-y-1">
            {options.map(opt => (
              <label key={String(opt)} className="flex items-center gap-2 px-2 py-1 hover:bg-muted rounded cursor-pointer text-sm">
                <Checkbox
                  checked={selected.includes(opt)}
                  onCheckedChange={() => toggle(opt)}
                />
                {String(opt)}
              </label>
            ))}
          </div>
        </ScrollArea>
        {selected.length > 0 && (
          <div className="border-t p-1">
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => onChange([])}>
              Clear all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ── Side Panel ── */
function SidePanel({ label, config, onChange, allGroups, allYears }: {
  label: string;
  config: SideConfig;
  onChange: (c: SideConfig) => void;
  allGroups: string[];
  allYears: number[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-primary" /> {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <Checkbox
            checked={config.useAllActive}
            onCheckedChange={(v) => onChange({ ...config, useAllActive: !!v, groups: [], years: [] })}
          />
          Compare Against All Active Cows
        </label>

        {!config.useAllActive && (
          <>
            <MultiSelect
              label="Select groups…"
              options={allGroups}
              selected={config.groups}
              onChange={(v) => onChange({ ...config, groups: v as string[] })}
            />
            <MultiSelect
              label="Select years…"
              options={allYears}
              selected={config.years}
              onChange={(v) => onChange({ ...config, years: v as number[] })}
            />
          </>
        )}

        <p className="text-xs text-muted-foreground">
          {config.useAllActive
            ? 'Will use all active animals from the animals table.'
            : config.groups.length === 0 && config.years.length === 0
              ? 'Select at least one group or year.'
              : `${config.groups.length} group(s), ${config.years.length} year(s) selected.`}
        </p>
      </CardContent>
    </Card>
  );
}

/* ── Result Table ── */
function ResultTable({ title, ids, lastInfo, tagMap, color, filename, navigate }: {
  title: string;
  ids: string[];
  lastInfo: Map<string, { preg_stage: string; calving_date: string; breeding_year: number }>;
  tagMap: Map<string, string>;
  color: string;
  filename: string;
  navigate: (path: string) => void;
}) {
  const rows = ids.map(lid => {
    const info = lastInfo.get(lid);
    return {
      lifetime_id: lid,
      tag: tagMap.get(lid) ?? '',
      preg_stage: info?.preg_stage ?? '',
      calving_date: info?.calving_date ?? '',
      breeding_year: info?.breeding_year ?? 0,
    };
  }).sort((a, b) => a.tag.localeCompare(b.tag));

  const handleExport = () => exportToCSV(rows, filename);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className={`text-sm ${color}`}>{title} ({ids.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3 w-3 mr-1" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">None</p>
        ) : (
          <ScrollArea className="max-h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Lifetime ID</TableHead>
                  <TableHead>Last Preg Stage</TableHead>
                  <TableHead>Last Calving</TableHead>
                  <TableHead>Last Year</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow
                    key={r.lifetime_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/cow/${r.lifetime_id}`)}
                  >
                    <TableCell className="font-medium">{r.tag || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.lifetime_id}</TableCell>
                    <TableCell>{r.preg_stage || '—'}</TableCell>
                    <TableCell>{r.calving_date || '—'}</TableCell>
                    <TableCell>{r.breeding_year || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
