import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HeartPulse } from 'lucide-react';

export default function Gestation() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Gestation Analysis</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <HeartPulse className="h-5 w-5" /> Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Gestation length analysis by sire and year will be displayed here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
