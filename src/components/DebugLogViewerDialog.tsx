
'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface DebugLogViewerDialogProps {
  logs: Record<string, { name: string; logs: string[] }>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DebugLogViewerDialog({ logs, isOpen, onOpenChange }: DebugLogViewerDialogProps) {
  const hasLogs = Object.keys(logs).length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Price Fetch Debug Logs</DialogTitle>
          <DialogDescription>
            Detailed logs from the last price refresh attempt. You can select and copy text from here.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-grow p-1 pr-4"> {/* Ensure pr-4 for scrollbar space if needed */}
          <div className="space-y-4 p-4 bg-muted/50 rounded-md">
            {!hasLogs && <p className="text-muted-foreground">No debug logs available from the last refresh.</p>}
            {Object.entries(logs).map(([id, { name, logs: logArray }], index) => (
              <div key={id}>
                {index > 0 && <Separator className="my-4" />}
                <h4 className="font-semibold text-md mb-1">
                  {name} <span className="text-xs text-muted-foreground">({id})</span>
                </h4>
                <pre className="text-xs whitespace-pre-wrap bg-background p-3 rounded shadow-sm border overflow-x-auto">
                  {logArray.join('\n')}
                </pre>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter className="mt-4 pt-4 border-t"> {/* Added border for separation */}
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
