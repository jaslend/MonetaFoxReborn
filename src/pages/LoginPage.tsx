import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuthStore } from '@/stores';

/**
 * Phase 3b stub login screen. Renders the "Sign in" affordance the shell's
 * contract pins, plus a dev-only button that flips `useAuthStore` to
 * authenticated so the rest of the app is explorable now. Phase 2 replaces
 * this with the real email/password form (React Hook Form) wired through
 * the crypto + session layer.
 */
export function LoginPage() {
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const navigate = useNavigate();

  const handleDevSignIn = () => {
    setAuthenticated(true);
    navigate('/', { replace: true });
  };

  return (
    <main className="bg-background text-foreground flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>MonetaFox</CardTitle>
          <CardDescription>Welcome back to MonetaFox</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            The real authentication form lands in Phase 2. For now, use the
            button below to explore the app shell.
          </p>
          <Button onClick={handleDevSignIn} data-testid="dev-sign-in">
            Sign in (dev)
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
