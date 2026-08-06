import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface PagePlaceholderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

/**
 * Shared scaffolding for the Phase 3b route stubs. Each section page renders
 * an <h1> with its section name (the testable seam) plus a boring Card
 * placeholder so the shell is explorable now; real screens land in later
 * phases.
 */
export function PagePlaceholder({
  title,
  description,
  children,
}: PagePlaceholderProps) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {children ?? (
            <p className="text-muted-foreground text-sm">
              This screen is part of the Phase 3b app shell. Real content lands
              in a later phase.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
