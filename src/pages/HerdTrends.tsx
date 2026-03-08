import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

export default function HerdTrends() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Herd Trends</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-5 w-5" /> Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Historical herd trend analysis will be displayed here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
