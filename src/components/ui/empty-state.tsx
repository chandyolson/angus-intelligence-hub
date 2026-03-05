import { Inbox } from 'lucide-react';

export function EmptyState({ message = 'No records found.' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Inbox className="h-8 w-8 mb-2 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
