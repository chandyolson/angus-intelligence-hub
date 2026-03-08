import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Scissors } from 'lucide-react';

export default function Culling() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Culling & Retention</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Scissors className="h-5 w-5" /> Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Culling decisions and retention analysis will be displayed here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
