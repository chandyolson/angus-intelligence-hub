import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Animal, BreedingCalvingRecord, UltrasoundRecord, BlairCombinedRecord } from '@/types/cattle';
import { useOperation, OperationFilter } from '@/hooks/useOperationContext';

/** Paginated fetch to bypass Supabase's 1000-row default limit */
async function fetchAllRows<T>(table: string, filter?: { column: string; value: string }): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const allRows: any[] = [];
  let from = 0;
  let done = false;

  while (!done) {
    let query = (supabase.from as any)(table).select('*').range(from, from + PAGE_SIZE - 1);
    if (filter) query = query.eq(filter.column, filter.value);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) {
      done = true;
    } else {
      allRows.push(...data);
      if (data.length < PAGE_SIZE) {
        done = true;
      } else {
        from += PAGE_SIZE;
      }
    }
  }

  console.log(`[fetchAllRows] ${table}: ${allRows.length} rows`);
  return allRows as T[];
}

function filterByOperation<T extends { operation?: string | null }>(rows: T[], operation: OperationFilter): T[] {
  if (operation === 'Both') return rows;
  return rows.filter(r => r.operation === operation);
}

export function useAnimals() {
  const { operation } = useOperation();
  return useQuery({
    queryKey: ['animals', operation],
    queryFn: async () => {
      const all = await fetchAllRows<Animal>('animals');
      return filterByOperation(all, operation);
    },
  });
}

export function useActiveAnimals(operationOverride?: string) {
  const { operation } = useOperation();
  const effectiveOp = operationOverride ?? operation;
  return useQuery({
    queryKey: ['animals', 'active', effectiveOp],
    queryFn: async () => {
      const all = await fetchAllRows<Animal>('animals');
      return all.filter(a => {
        if (a.status?.toLowerCase() !== 'active') return false;
        if (effectiveOp && effectiveOp !== 'Both' && a.operation !== effectiveOp) return false;
        return true;
      });
    },
  });
}

export function useBreedingCalvingRecords() {
  const { operation } = useOperation();
  return useQuery({
    queryKey: ['blair_combined', operation],
    queryFn: async () => {
      const all = await fetchAllRows<BreedingCalvingRecord>('blair_combined');
      return filterByOperation(all, operation);
    },
  });
}

export function useUltrasoundRecords(lifetimeId?: string) {
  return useQuery({
    queryKey: ['ultrasound_records', lifetimeId],
    queryFn: async () => {
      try {
        const result = lifetimeId
          ? await fetchAllRows<UltrasoundRecord>('ultrasound', { column: 'lifetime_id', value: lifetimeId })
          : await fetchAllRows<UltrasoundRecord>('ultrasound');
        return result;
      } catch {
        // ultrasound table may not exist
        return [] as UltrasoundRecord[];
      }
    },
    enabled: lifetimeId !== undefined,
  });
}

export function useAnimal(lifetimeId: string) {
  return useQuery({
    queryKey: ['animal', lifetimeId],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*').eq('lifetime_id', lifetimeId).maybeSingle();
      if (error) throw error;
      return data as unknown as Animal | null;
    },
    enabled: !!lifetimeId,
  });
}

export function useCowBreedingRecords(lifetimeId: string) {
  return useQuery({
    queryKey: ['blair_combined', lifetimeId],
    queryFn: () => fetchAllRows<BreedingCalvingRecord>('blair_combined', { column: 'lifetime_id', value: lifetimeId }),
    enabled: !!lifetimeId,
  });
}

export function useRecordCounts() {
  const { operation } = useOperation();
  return useQuery({
    queryKey: ['record_counts', operation],
    queryFn: async () => {
      // Fetch all and filter client-side for consistency
      const [allAnimals, allBcr] = await Promise.all([
        fetchAllRows<Animal>('animals'),
        fetchAllRows<BreedingCalvingRecord>('blair_combined'),
      ]);
      const animals = filterByOperation(allAnimals, operation);
      const bcr = filterByOperation(allBcr, operation);
      let ultrasoundCount = 0;
      try {
        const ultrasound = await (supabase.from as any)('ultrasound').select('*', { count: 'exact', head: true });
        ultrasoundCount = ultrasound.count ?? 0;
      } catch { /* table may not exist */ }
      return {
        animals: animals.length,
        breeding_calving: bcr.length,
        ultrasound: ultrasoundCount,
      };
    },
  });
}

export function useBlairCombined() {
  const { operation } = useOperation();
  return useQuery({
    queryKey: ['blair_combined', operation],
    queryFn: async () => {
      const all = await fetchAllRows<BlairCombinedRecord>('blair_combined');
      return filterByOperation(all, operation);
    },
  });
}
