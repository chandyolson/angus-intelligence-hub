import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

export default function Reconciliation() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Group Reconciliation</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-5 w-5" /> Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Group reconciliation and tracking will be displayed here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
