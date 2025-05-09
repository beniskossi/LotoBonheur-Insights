'use client';

import { Loader2 } from 'lucide-react';

export default function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center py-10">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}
