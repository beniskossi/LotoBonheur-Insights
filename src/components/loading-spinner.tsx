'use client';

import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col justify-center items-center py-10 space-y-2">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      {message && <p className="text-muted-foreground">{message}</p>}
    </div>
  );
}
