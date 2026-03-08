import { useState, useMemo } from 'react';
import { useBlairCombined } from '@/hooks/useCattleData';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitMerge, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface SirePair {
  nameA: string;
  nameB: string;
  countA: number;
  countB: number;
  similarity: number;
  reason: string;
}

/** Normalize sire name for comparison */
function normalize(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Levenshtein distance */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

/** Check if two names are fuzzy matches */
function classifyPair(a: string, b: string): { match: boolean; similarity: number; reason: string } {
  // Exact case variant
  if (a.toLowerCase() === b.toLowerCase()) {
    return { match: true, similarity: 100, reason: 'Case variant' };
  }

  const normA = normalize(a);
  const normB = normalize(b);

  // After stripping spaces/punctuation they're identical
  if (normA === normB) {
    return { match: true, similarity: 98, reason: 'Spacing / punctuation variant' };
  }

  // One is a prefix/substring of the other (abbreviation)
  if (normA.length >= 3 && normB.length >= 3) {
    if (normA.startsWith(normB) || normB.startsWith(normA)) {
      const shorter = Math.min(normA.length, normB.length);
      const longer = Math.max(normA.length, normB.length);
      if (shorter / longer >= 0.6) {
        return { match: true, similarity: Math.round((shorter / longer) * 95), reason: 'Abbreviation' };
      }
    }
  }

  // Levenshtein distance for short edits
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen > 0) {
    const dist = levenshtein(normA, normB);
    const sim = Math.round((1 - dist / maxLen) * 100);
    if (dist <= 2 && maxLen >= 4) {
      return { match: true, similarity: sim, reason: 'Typo / edit distance' };
    }
  }

  return { match: false, similarity: 0, reason: '' };
}

export function SireDeduplication() {
  const { data: combined } = useBlairCombined();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const pairs = useMemo(() => {
    if (!combined) return [];

    // Collect all unique sire names and their counts across all 3 columns
    const nameCount = new Map<string, number>();
    combined.forEach(r => {
      [r.ai_sire_1, r.ai_sire_2, r.calf_sire].forEach(name => {
        if (name && name.trim()) {
          const trimmed = name.trim();
          nameCount.set(trimmed, (nameCount.get(trimmed) ?? 0) + 1);
        }
      });
    });

    const names = Array.from(nameCount.keys()).sort();
    const results: SirePair[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i], b = names[j];
        const { match, similarity, reason } = classifyPair(a, b);
        if (match) {
          const key = [a, b].sort().join('|');
          if (!seen.has(key)) {
            seen.add(key);
            // Name A is the one with more records (canonical)
            const cA = nameCount.get(a) ?? 0;
            const cB = nameCount.get(b) ?? 0;
            if (cA >= cB) {
              results.push({ nameA: a, nameB: b, countA: cA, countB: cB, similarity, reason });
            } else {
              results.push({ nameA: b, nameB: a, countA: cB, countB: cA, similarity, reason });
            }
          }
        }
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity || (b.countA + b.countB) - (a.countA + a.countB));
  }, [combined]);

  const visiblePairs = pairs.filter(p => !dismissed.has(`${p.nameA}|${p.nameB}`));

  async function handleMerge(pair: SirePair) {
    const key = `${pair.nameA}|${pair.nameB}`;
    setMerging(key);

    try {
      // Update ai_sire_1
      const { error: e1 } = await (supabase.from('blair_combined') as any)
        .update({ ai_sire_1: pair.nameA })
        .eq('ai_sire_1', pair.nameB);
      if (e1) throw e1;

      // Update ai_sire_2
      const { error: e2 } = await (supabase.from('blair_combined') as any)
        .update({ ai_sire_2: pair.nameA })
        .eq('ai_sire_2', pair.nameB);
      if (e2) throw e2;

      // Update calf_sire
      const { error: e3 } = await (supabase.from('blair_combined') as any)
        .update({ calf_sire: pair.nameA })
        .eq('calf_sire', pair.nameB);
      if (e3) throw e3;

      // Log the merge
      await (supabase.from('corrections_log') as any).insert({
        table_name: 'blair_combined',
        lifetime_id: null,
        breeding_year: null,
        field_name: 'sire_merge',
        original_value: pair.nameB,
        new_value: pair.nameA,
        note: `Merged "${pair.nameB}" (${pair.countB} records) → "${pair.nameA}" (${pair.countA} records). Reason: ${pair.reason}`,
      });

      toast({ title: 'Sire names merged', description: `"${pair.nameB}" → "${pair.nameA}" (${pair.countB} records updated)` });

      // Remove from list and refresh data
      setDismissed(prev => new Set(prev).add(key));
      queryClient.invalidateQueries({ queryKey: ['blair_combined'] });
    } catch (err: any) {
      toast({ title: 'Merge failed', description: err.message, variant: 'destructive' });
    }

    setMerging(null);
  }

  function handleDismiss(pair: SirePair) {
    setDismissed(prev => new Set(prev).add(`${pair.nameA}|${pair.nameB}`));
  }

  if (!combined) return null;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitMerge className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base text-foreground">Sire Name Deduplication</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {visiblePairs.length} potential duplicate{visiblePairs.length !== 1 ? 's' : ''} found across ai_sire_1, ai_sire_2, calf_sire
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary/20 text-primary border-primary/30">{visiblePairs.length}</Badge>
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="pt-0">
          {visiblePairs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No duplicate sire names detected ✓</p>
          ) : (
            <div className="overflow-x-auto rounded border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Sire Name A (keep)</TableHead>
                    <TableHead className="text-xs text-right">Records</TableHead>
                    <TableHead className="text-xs">Sire Name B (merge)</TableHead>
                    <TableHead className="text-xs text-right">Records</TableHead>
                    <TableHead className="text-xs">Similarity</TableHead>
                    <TableHead className="text-xs">Reason</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePairs.map(pair => {
                    const key = `${pair.nameA}|${pair.nameB}`;
                    const isMerging = merging === key;

                    return (
                      <TableRow key={key} className="hover:bg-hover/30">
                        <TableCell className="text-sm font-mono font-medium text-foreground">{pair.nameA}</TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">{pair.countA}</TableCell>
                        <TableCell className="text-sm font-mono text-destructive">{pair.nameB}</TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">{pair.countB}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn('h-full rounded-full', pair.similarity >= 95 ? 'bg-destructive' : pair.similarity >= 80 ? 'bg-[hsl(25,95%,53%)]' : 'bg-[hsl(45,93%,47%)]')}
                                style={{ width: `${pair.similarity}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{pair.similarity}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{pair.reason}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 px-3 text-xs gap-1"
                              onClick={() => handleMerge(pair)}
                              disabled={isMerging}
                            >
                              {isMerging ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
                              Merge
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground"
                              onClick={() => handleDismiss(pair)}
                              disabled={isMerging}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
