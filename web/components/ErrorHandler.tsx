'use client'

import { useEffect } from 'react'

export default function ErrorHandler() {
  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      // Log errors to console in production
      console.error('Unhandled JavaScript error:', event.error || event.message)
    };
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      // Log promise rejections to console in production
      console.error('Unhandled promise rejection:', event.reason)
    };
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);
    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    };
  }, []);

  return null;
}

