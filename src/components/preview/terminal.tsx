'use client'

import { useEffect, useRef } from 'react'

interface TerminalProps {
  output: string[]
}

// Strip ANSI escape codes and clean up terminal output
function cleanTerminalOutput(text: string): string {
  return text
    // Remove ANSI escape codes (colors, cursor movement, etc.)
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '') // OSC sequences
    .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '') // DCS, SOS, PM, APC sequences
    // Remove carriage returns that would cause line overwrites
    .replace(/\r/g, '')
    // Remove common progress bar artifacts
    .replace(/\[[\d;]*[GK]/g, '')
    // Clean up multiple spaces
    .replace(/  +/g, ' ')
    .trim()
}

// Check if a line is just a spinner or progress noise
function isSpinnerOrNoise(text: string): boolean {
  const cleaned = text.trim()
  // Single character spinners
  if (/^[-\\|/⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/.test(cleaned)) {
    return true
  }
  // Empty or whitespace only
  if (cleaned.length === 0) {
    return true
  }
  // Just dots or dashes
  if (/^[.\-_]+$/.test(cleaned)) {
    return true
  }
  return false
}

export function Terminal({ output }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [output])

  // Process and filter output lines
  const cleanedOutput = output
    .map(line => cleanTerminalOutput(line))
    .filter(line => !isSpinnerOrNoise(line))

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#1a1a1a] rounded-lg p-4 font-mono text-sm overflow-y-auto"
    >
      {cleanedOutput.length === 0 ? (
        <div className="text-zinc-500">Terminal output will appear here...</div>
      ) : (
        cleanedOutput.map((line, index) => (
          <div key={index} className="text-zinc-300 whitespace-pre-wrap break-all">
            {line}
          </div>
        ))
      )}
    </div>
  )
}
