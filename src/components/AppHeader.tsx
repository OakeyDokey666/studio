import { Briefcase } from 'lucide-react';

export function AppHeader() {
  return (
    <header className="bg-card border-b border-border shadow-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center">
          <Briefcase className="h-8 w-8 text-primary mr-3" />
          <h1 className="text-2xl font-headline font-semibold text-foreground">
            InvestoTrack
          </h1>
        </div>
        {/* Placeholder for potential actions like a Refresh button or Theme Toggle */}
      </div>
    </header>
  );
}
