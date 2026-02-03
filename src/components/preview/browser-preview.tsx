'use client'

import { RefreshCw, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface BrowserPreviewProps {
  url: string | null
}

export function BrowserPreview({ url }: BrowserPreviewProps) {
  if (!url) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">No preview available</p>
          <p className="text-xs">Run the project to see the preview</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Browser toolbar */}
      <div className="flex items-center gap-2 border-b border-border p-2">
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Input
          value={url}
          readOnly
          className="h-8 text-sm bg-muted"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => window.open(url, '_blank')}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>

      {/* Preview iframe */}
      <div className="flex-1">
        <iframe
          src={url}
          className="h-full w-full border-0 bg-white"
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  )
}
