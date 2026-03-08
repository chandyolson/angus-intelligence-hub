import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Baby } from 'lucide-react';

export default function Replacements() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Replacement Heifers</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Baby className="h-5 w-5" /> Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Replacement heifer tracking and selection will be displayed here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
