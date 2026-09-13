import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // Return empty JSON to satisfy Chrome DevTools connection attempt
  // This prevents CSP violations and 404 errors in the console
  return NextResponse.json({}, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Security-Policy': "default-src 'self'; connect-src 'self' http://localhost:* ws://localhost:*;",
    },
  });
}

