// app/test-shadcn/page.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

export default function TestShadcn() {
  const [on, setOn] = useState(false);
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="space-y-6 w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Shadcn + Slate + Brand</CardTitle>
            <CardDescription>Vérifie couleurs, focus, dark mode.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge className="rounded-2xl">Badge</Badge>
              <Badge variant="secondary" className="rounded-2xl">Secondary</Badge>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button>Primary (devrait être #0030A8)</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={on} onCheckedChange={setOn} />
              <span>Switch: {on ? 'ON' : 'OFF'}</span>
            </div>
          </CardContent>
        </Card>
        <div className="text-sm text-muted-foreground">
          Astuce: ajoute <code>className="dark"</code> sur le &lt;html&gt; pour tester le mode sombre.
        </div>
      </div>
    </div>
  );
}
