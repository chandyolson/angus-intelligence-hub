import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Ban } from 'lucide-react';

export default function OpenCows() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Open Cows</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Ban className="h-5 w-5" /> Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Open cow tracking and analysis will be displayed here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
