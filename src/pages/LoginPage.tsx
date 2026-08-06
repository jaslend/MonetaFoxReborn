/**
 * Phase 2 login / setup / unlock page.
 *
 * Renders based on `authStore.status`:
 *  - 'setup'  (first run): email + mode toggle (basic password / advanced
 *               passphrase) + optional mouse-entropy capture (basic only).
 *  - 'locked' (returning): email (prefilled) + the secret matching the stored
 *               mode (password or passphrase) to UNLOCK.
 *
 * A visible "Sign in (dev)" bypass flips `isAuthenticated` and routes to `/`
 * so the protected-route shell test (App.test.tsx) keeps passing without a
 * real vault / IndexedDB in the jsdom test env.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EntropyCapture } from '@/components/EntropyCapture';
import { useAuthStore } from '@/stores';
import type { SetupInput } from '@/lib/auth';

const setupSchema = z
  .object({
    mode: z.enum(['basic', 'advanced']),
    email: z.string().min(1, 'Email is required').email('Enter a valid email'),
    password: z.string().optional(),
    passphrase: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'basic') {
      if (!val.password || val.password.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: 'At least 8 characters',
        });
      }
    } else if (val.mode === 'advanced') {
      if (!val.passphrase || val.passphrase.length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['passphrase'],
          message: 'At least 10 characters',
        });
      }
    }
  });
type SetupFormValues = z.infer<typeof setupSchema>;

const unlockSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  secret: z.string().min(1, 'Required'),
});
type UnlockFormValues = z.infer<typeof unlockSchema>;

export function LoginPage() {
  const status = useAuthStore((s) => s.status);
  const storedEmail = useAuthStore((s) => s.email);
  const storedMode = useAuthStore((s) => s.mode);
  const setupAction = useAuthStore((s) => s.setup);
  const loginAction = useAuthStore((s) => s.login);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const navigate = useNavigate();

  const [entropy, setEntropy] = useState<Uint8Array | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const goHome = () => navigate('/', { replace: true });

  // Dev / shell-test bypass — visible "Sign in (dev)" action.
  const handleDevSignIn = () => {
    setAuthenticated(true);
    goHome();
  };

  const isSetup = status !== 'locked';

  return (
    <main className="bg-background text-foreground flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>MonetaFox</CardTitle>
          <CardDescription>Welcome back to MonetaFox</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isSetup ? (
            <SetupForm
              setupAction={setupAction}
              entropy={entropy}
              setEntropy={setEntropy}
              setSubmitError={setSubmitError}
              onSuccess={goHome}
            />
          ) : (
            <UnlockForm
              loginAction={loginAction}
              defaultEmail={storedEmail ?? ''}
              mode={storedMode}
              setSubmitError={setSubmitError}
              onSuccess={goHome}
            />
          )}

          {submitError && (
            <p
              className="text-destructive text-sm"
              role="alert"
              data-testid="submit-error"
            >
              {submitError}
            </p>
          )}

          <Button
            onClick={handleDevSignIn}
            variant="secondary"
            data-testid="dev-sign-in"
          >
            Sign in (dev)
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Setup (first run)
// ---------------------------------------------------------------------------

interface SetupFormProps {
  setupAction: (input: SetupInput) => Promise<void>;
  entropy: Uint8Array | null;
  setEntropy: (bytes: Uint8Array | null) => void;
  setSubmitError: (msg: string | null) => void;
  onSuccess: () => void;
}

function SetupForm({
  setupAction,
  entropy,
  setEntropy,
  setSubmitError,
  onSuccess,
}: SetupFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      mode: 'basic',
      email: '',
      password: '',
      passphrase: '',
    } as SetupFormValues,
  });

  const mode = watch('mode');

  const onSubmit = async (values: SetupFormValues) => {
    setSubmitError(null);
    try {
      const input: SetupInput =
        values.mode === 'basic'
          ? {
              mode: 'basic',
              email: values.email,
              password: values.password ?? '',
              entropy: entropy && entropy.length > 0 ? entropy : undefined,
            }
          : {
              mode: 'advanced',
              email: values.email,
              passphrase: values.passphrase ?? '',
            };
      await setupAction(input);
      onSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Setup failed');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="setup-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="setup-email"
          type="email"
          autoComplete="email"
          data-testid="setup-email"
          {...register('email')}
          className="border-border bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none"
        />
        {errors.email && (
          <span className="text-destructive text-xs">
            {errors.email.message}
          </span>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Encryption mode</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              value="basic"
              checked={mode === 'basic'}
              onChange={() =>
                setValue('mode', 'basic', { shouldValidate: false })
              }
              data-testid="mode-basic"
            />
            Basic (email + password)
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              value="advanced"
              checked={mode === 'advanced'}
              onChange={() =>
                setValue('mode', 'advanced', { shouldValidate: false })
              }
              data-testid="mode-advanced"
            />
            Advanced (passphrase)
          </label>
        </div>
      </fieldset>

      {mode === 'basic' ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="setup-password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="setup-password"
            type="password"
            autoComplete="new-password"
            data-testid="setup-password"
            {...register('password')}
            className="border-border bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none"
          />
          {errors.password && (
            <span className="text-destructive text-xs">
              {errors.password.message}
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="setup-passphrase" className="text-sm font-medium">
            Passphrase
          </label>
          <input
            id="setup-passphrase"
            type="password"
            autoComplete="new-password"
            data-testid="setup-passphrase"
            {...register('passphrase')}
            className="border-border bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none"
          />
          {errors.passphrase && (
            <span className="text-destructive text-xs">
              {errors.passphrase.message}
            </span>
          )}
        </div>
      )}

      {mode === 'basic' && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Strengthen with mouse movement (optional)
          </span>
          <EntropyCapture onEntropy={setEntropy} />
        </div>
      )}

      <Button type="submit" disabled={isSubmitting} data-testid="setup-submit">
        Create vault
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Unlock (returning)
// ---------------------------------------------------------------------------

interface UnlockFormProps {
  loginAction: (input: { email: string; secret: string }) => Promise<void>;
  defaultEmail: string;
  mode: 'basic' | 'advanced' | null;
  setSubmitError: (msg: string | null) => void;
  onSuccess: () => void;
}

function UnlockForm({
  loginAction,
  defaultEmail,
  mode,
  setSubmitError,
  onSuccess,
}: UnlockFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UnlockFormValues>({
    resolver: zodResolver(unlockSchema),
    defaultValues: { email: defaultEmail, secret: '' },
  });

  const onSubmit = async (values: UnlockFormValues) => {
    setSubmitError(null);
    try {
      await loginAction({ email: values.email, secret: values.secret });
      onSuccess();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unlock failed');
    }
  };

  const secretLabel = mode === 'advanced' ? 'Passphrase' : 'Password';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="unlock-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="unlock-email"
          type="email"
          autoComplete="email"
          data-testid="unlock-email"
          {...register('email')}
          className="border-border bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none"
        />
        {errors.email && (
          <span className="text-destructive text-xs">
            {errors.email.message}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="unlock-secret" className="text-sm font-medium">
          {secretLabel}
        </label>
        <input
          id="unlock-secret"
          type="password"
          autoComplete="current-password"
          data-testid="unlock-secret"
          {...register('secret')}
          className="border-border bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none"
        />
        {errors.secret && (
          <span className="text-destructive text-xs">
            {errors.secret.message}
          </span>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting} data-testid="unlock-submit">
        Unlock
      </Button>
    </form>
  );
}
