'use client';

import { useEffect } from 'react';
import marketingScript from '../script.js?raw';

export default function MarketingInteractions() {
  useEffect(() => {
    const script = document.createElement('script');
    script.dataset.sfsMarketing = 'true';
    script.textContent = marketingScript;
    document.body.appendChild(script);
    return () => { script.remove(); };
  }, []);
  return null;
}
