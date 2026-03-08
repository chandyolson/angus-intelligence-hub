import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export interface EditPanelProps {
  open: boolean;
  onClose: () => void;
  lifetime_id: string;
  breeding_year: number | null;
  tableSource: 'combined' | 'animals';
  flaggedField: string;
  currentValue: string;
  rule: string;
  onSaved: () => void;
}

// Map rules to their primary flagged field name in the DB
const RULE_FIELD_MAP: Record<string, { table: string; field: string }> = {
  'Null Lifetime ID (animals)': { table: 'animals', field: 'lifetime_id' },
  'Null Lifetime ID (combined)': { table: 'blair_combined', field: 'lifetime_id' },
  'Calving before AI date': { table: 'blair_combined', field: 'calving_date' },
  'AI date without AI sire': { table: 'blair_combined', field: 'ai_sire_1' },
  'Calving without birth weight': { table: 'blair_combined', field: 'calf_bw' },
  'Calving without calf status': { table: 'blair_combined', field: 'calf_status' },
  'Missing preg stage': { table: 'blair_combined', field: 'preg_stage' },
  'Abnormal gestation days': { table: 'blair_combined', field: 'gestation_days' },
  'Birth weight = 0': { table: 'blair_combined', field: 'calf_bw' },
  'Birth weight out of range': { table: 'blair_combined', field: 'calf_bw' },
  'Breeding year ≠ AI date year': { table: 'blair_combined', field: 'breeding_year' },
  'CLEANUP calf with AI preg stage': { table: 'blair_combined', field: 'preg_stage' },
  'Combined LID not in animals': { table: 'animals', field: 'lifetime_id' },
  'AI date 2 without sire 2': { table: 'blair_combined', field: 'ai_sire_2' },
  'Invalid preg stage value': { table: 'blair_combined', field: 'preg_stage' },
  'Missing year born': { table: 'animals', field: 'year_born' },
  'Missing value score': { table: 'animals', field: 'value_score' },
};

const COMBINED_FIELDS = [
  'lifetime_id', 'breeding_year', 'ai_date_1', 'ai_sire_1', 'ai_date_2', 'ai_sire_2',
  'ultrasound_date', 'preg_stage', 'fetal_sex', 'calving_date', 'calf_sire', 'calf_sex',
  'calf_status', 'calf_bw', 'gestation_days', 'cow_sire', 'memo',
];

const ANIMAL_FIELDS = [
  'lifetime_id', 'tag', 'status', 'sex', 'year_born', 'dob', 'sire', 'dam', 'dam_sire',
  'operation', 'bw', 'ww', 'yw', 'value_score', 'value_score_percentile',
  'animal_type', 'cattle_type', 'owner', 'origin',
];

export function RecordEditPanel({ open, onClose, lifetime_id, breeding_year, tableSource, flaggedField, currentValue, rule, onSaved }: EditPanelProps) {
  const [record, setRecord] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) { setRecord(null); setEdits({}); return; }
    fetchRecord();
  }, [open, lifetime_id, breeding_year, tableSource]);

  async function fetchRecord() {
    setLoading(true);
    try {
      if (tableSource === 'combined') {
        let query = supabase.from('blair_combined').select('*').eq('lifetime_id', lifetime_id);
        if (breeding_year != null) query = query.eq('breeding_year', breeding_year);
        const { data, error } = await query.limit(1).single();
        if (error) throw error;
        setRecord(data);
      } else {
        const { data, error } = await supabase.from('animals').select('*').eq('lifetime_id', lifetime_id).limit(1).single();
        if (error) throw error;
        setRecord(data);
      }
    } catch (e: any) {
      toast({ title: 'Failed to load record', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!record || Object.keys(edits).length === 0) return;
    setSaving(true);

    try {
      const tableName = tableSource === 'combined' ? 'blair_combined' : 'animals';
      const fields = Object.keys(edits);

      // Build update payload - coerce types
      const updatePayload: Record<string, any> = {};
      fields.forEach(f => {
        const val = edits[f];
        if (val === '') { updatePayload[f] = null; }
        else if (['calf_bw', 'gestation_days', 'breeding_year', 'year_born', 'bw', 'ww', 'yw', 'value_score', 'value_score_percentile', 'dog'].includes(f)) {
          updatePayload[f] = Number(val);
        } else {
          updatePayload[f] = val;
        }
      });

      // Update record
      if (tableSource === 'combined') {
        let query = (supabase.from('blair_combined') as any).update(updatePayload).eq('lifetime_id', lifetime_id);
        if (breeding_year != null) query = query.eq('breeding_year', breeding_year);
        const { error } = await query;
        if (error) throw error;
      } else {
        const { error } = await supabase.from('animals').update(updatePayload).eq('lifetime_id', lifetime_id);
        if (error) throw error;
      }

      // Log corrections
      for (const field of fields) {
        await (supabase.from('corrections_log') as any).insert({
          table_name: tableName,
          lifetime_id,
          breeding_year,
          field_name: field,
          original_value: String(record[field] ?? ''),
          new_value: edits[field],
        });
      }

      toast({ title: 'Record updated', description: `${fields.length} field(s) corrected` });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  }

  const displayFields = tableSource === 'combined' ? COMBINED_FIELDS : ANIMAL_FIELDS;
  const ruleFieldInfo = RULE_FIELD_MAP[rule];
  const highlightField = ruleFieldInfo?.field ?? flaggedField;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-card border-border">
        <SheetHeader>
          <SheetTitle className="text-foreground">
            Edit Record: <span className="font-mono text-primary">{lifetime_id}</span>
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            {tableSource === 'combined' ? 'blair_combined' : 'animals'} · Year: {breeding_year ?? '—'} · Rule: {rule}
          </p>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : record ? (
          <div className="space-y-4 mt-6">
            {displayFields.map(field => {
              const originalVal = String(record[field] ?? '');
              const isHighlighted = field === highlightField;
              const editedVal = edits[field];

              return (
                <div key={field} className={cn('space-y-1 p-2 rounded', isHighlighted && 'bg-destructive/10 ring-1 ring-destructive/40')}>
                  <Label className={cn('text-xs', isHighlighted ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                    {field} {isHighlighted && '⚠ flagged'}
                  </Label>
                  <Input
                    value={editedVal !== undefined ? editedVal : originalVal}
                    onChange={e => setEdits(prev => ({ ...prev, [field]: e.target.value }))}
                    className={cn(
                      'text-sm font-mono bg-background',
                      editedVal !== undefined && editedVal !== originalVal && 'border-primary',
                    )}
                  />
                  {editedVal !== undefined && editedVal !== originalVal && (
                    <p className="text-[10px] text-muted-foreground">
                      Original: <span className="font-mono">{originalVal || '(empty)'}</span>
                    </p>
                  )}
                </div>
              );
            })}

            <div className="flex gap-3 pt-4 border-t border-border">
              <Button onClick={handleSave} disabled={saving || Object.keys(edits).length === 0} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">No record found</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

export interface ReviewPanelProps {
  open: boolean;
  onClose: () => void;
  rule: string;
  lifetime_id: string;
  breeding_year: number | null;
  onSaved: () => void;
}

export function MarkReviewedDialog({ open, onClose, rule, lifetime_id, breeding_year, onSaved }: ReviewPanelProps) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleMarkReviewed() {
    setSaving(true);
    try {
      await (supabase.from('reviewed_flags') as any).upsert({
        rule,
        lifetime_id,
        breeding_year,
        note: note || 'Reviewed - no action needed',
      }, { onConflict: 'rule,lifetime_id,breeding_year' });

      toast({ title: 'Flagged as reviewed', description: 'This violation will be suppressed' });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-card border-border">
        <SheetHeader>
          <SheetTitle className="text-foreground">Mark as Reviewed</SheetTitle>
          <p className="text-xs text-muted-foreground">{rule} · {lifetime_id} · Year: {breeding_year ?? '—'}</p>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div>
            <Label className="text-xs text-muted-foreground">Note (optional)</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Why this record is correct despite the flag..."
              className="mt-1 bg-background"
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={handleMarkReviewed} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Reviewed
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
