import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/** Catch-all route page for unknown paths. */
export function NotFoundPage() {
  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-3xl font-bold tracking-tight">Not Found</h1>
      <p className="text-muted-foreground text-sm">
        The page you are looking for does not exist.
      </p>
      <Button asChild>
        <Link to="/">Back to Dashboard</Link>
      </Button>
    </main>
  );
}
