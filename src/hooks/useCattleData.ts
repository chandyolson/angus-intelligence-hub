import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Animal, BreedingCalvingRecord, UltrasoundRecord, BlairCombinedRecord } from '@/types/cattle';

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

export function useAnimals() {
  return useQuery({
    queryKey: ['animals'],
    queryFn: () => fetchAllRows<Animal>('animals'),
  });
}

export function useActiveAnimals(operation?: string) {
  return useQuery({
    queryKey: ['animals', 'active', operation],
    queryFn: async () => {
      const all = await fetchAllRows<Animal>('animals');
      return all.filter(a => {
        if (a.status?.toLowerCase() !== 'active') return false;
        if (operation && a.operation !== operation) return false;
        return true;
      });
    },
  });
}

export function useBreedingCalvingRecords() {
  return useQuery({
    queryKey: ['blair_combined'],
    queryFn: () => fetchAllRows<BreedingCalvingRecord>('blair_combined'),
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
  return useQuery({
    queryKey: ['record_counts'],
    queryFn: async () => {
      const [animals, bcr] = await Promise.all([
        supabase.from('animals').select('*', { count: 'exact', head: true }),
        supabase.from('blair_combined').select('*', { count: 'exact', head: true }),
      ]);
      let ultrasoundCount = 0;
      try {
        const ultrasound = await (supabase.from as any)('ultrasound').select('*', { count: 'exact', head: true });
        ultrasoundCount = ultrasound.count ?? 0;
      } catch { /* table may not exist */ }
      return {
        animals: animals.count ?? 0,
        breeding_calving: bcr.count ?? 0,
        ultrasound: ultrasoundCount,
      };
    },
  });
}

export function useBlairCombined() {
  return useQuery({
    queryKey: ['blair_combined'],
    queryFn: () => fetchAllRows<BlairCombinedRecord>('blair_combined'),
  });
}
