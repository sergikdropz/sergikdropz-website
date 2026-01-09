'use client'

import { useEffect } from 'react'

export default function PageLogger({ pageName, data }: { pageName: string; data?: Record<string, any> }) {
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a346b04a-1680-490e-a42d-0a05edd129a0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:`PageLogger.tsx:${pageName}`,message:`Page component mounted: ${pageName}`,data:{...data,userAgent:typeof window!=='undefined'?window.navigator.userAgent:'server'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
  }, [pageName, data]);

  return null;
}

