import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';

export default function CalvingInterval() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Calving Interval Analysis</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-5 w-5" /> Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Calving interval analysis and trends will be displayed here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
