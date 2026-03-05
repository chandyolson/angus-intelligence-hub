import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Animal, BreedingCalvingRecord, UltrasoundRecord } from '@/types/cattle';

export function useAnimals() {
  return useQuery({
    queryKey: ['animals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*');
      if (error) throw error;
      return data as unknown as Animal[];
    },
  });
}

export function useActiveAnimals() {
  return useQuery({
    queryKey: ['animals', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*');
      if (error) throw error;
      return (data as unknown as Animal[]).filter(a =>
        a.status?.toLowerCase() === 'active'
      );
    },
  });
}

export function useBreedingCalvingRecords() {
  return useQuery({
    queryKey: ['breeding_calving_records'],
    queryFn: async () => {
      const { data, error } = await supabase.from('blair_breeding_calving').select('*');
      if (error) throw error;
      return data as unknown as BreedingCalvingRecord[];
    },
  });
}

export function useUltrasoundRecords(lifetimeId?: string) {
  return useQuery({
    queryKey: ['ultrasound_records', lifetimeId],
    queryFn: async () => {
      let query = supabase.from('ultrasound').select('*');
      if (lifetimeId) query = query.eq('lifetime_id', lifetimeId);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as UltrasoundRecord[];
    },
    enabled: lifetimeId !== undefined,
  });
}

export function useAnimal(lifetimeId: string) {
  return useQuery({
    queryKey: ['animal', lifetimeId],
    queryFn: async () => {
      const { data, error } = await supabase.from('animals').select('*').eq('lifetime_id', lifetimeId).single();
      if (error) throw error;
      return data as unknown as Animal;
    },
    enabled: !!lifetimeId,
  });
}

export function useCowBreedingRecords(lifetimeId: string) {
  return useQuery({
    queryKey: ['breeding_calving_records', lifetimeId],
    queryFn: async () => {
      const { data, error } = await supabase.from('blair_breeding_calving').select('*').eq('lifetime_id', lifetimeId);
      if (error) throw error;
      return data as unknown as BreedingCalvingRecord[];
    },
    enabled: !!lifetimeId,
  });
}

export function useRecordCounts() {
  return useQuery({
    queryKey: ['record_counts'],
    queryFn: async () => {
      const [animals, bcr, ultrasound] = await Promise.all([
        supabase.from('animals').select('*', { count: 'exact', head: true }),
        supabase.from('blair_breeding_calving').select('*', { count: 'exact', head: true }),
        supabase.from('ultrasound').select('*', { count: 'exact', head: true }),
      ]);
      return {
        animals: animals.count ?? 0,
        breeding_calving: bcr.count ?? 0,
        ultrasound: ultrasound.count ?? 0,
      };
    },
  });
}
