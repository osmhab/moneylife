// app/_components/ThemeToggle.tsx
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    dark ? root.classList.add('dark') : root.classList.remove('dark');
  }, [dark]);
  return (
    <Button variant="outline" onClick={() => setDark(d => !d)}>
      Toggle {dark ? 'Light' : 'Dark'}
    </Button>
  );
}
