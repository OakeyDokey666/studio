
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

interface DebugLogViewerDialogProps {
  logs: Record<string, { name: string; logs: string[] }>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DebugLogViewerDialog({ logs, isOpen, onOpenChange }: DebugLogViewerDialogProps) {
  const hasLogs = Object.keys(logs).length > 0;

  let allLogsString = "";
  if (hasLogs) {
    allLogsString = Object.entries(logs)
      .map(([id, { name, logs: logArray }]) => {
        const holdingName = name || 'Unknown Holding';
        // Use id (which is ISIN) for a more stable identifier if name is missing
        const holdingIdentifier = `${holdingName} (ID: ${id})`; 
        return `--- ${holdingIdentifier} ---\n${logArray.join('\n')}\n\n`;
      })
      .join('');
  } else {
    allLogsString = "No debug logs available from the last refresh.";
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Price Fetch Debug Logs</DialogTitle>
          <DialogDescription>
            Detailed logs from the last price refresh attempt. You can select and copy text from here.
          </DialogDescription>
        </DialogHeader>
        {/* Wrapper div to control flex-grow and provide context for ScrollArea height */}
        <div className="flex-grow min-h-0 overflow-hidden py-2"> 
          <ScrollArea className="h-full w-full rounded-md border p-2 bg-muted/30">
            <pre className="text-xs whitespace-pre-wrap p-2">
              {allLogsString}
            </pre>
          </ScrollArea>
        </div>
        <DialogFooter className="mt-4 pt-4 border-t">
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
