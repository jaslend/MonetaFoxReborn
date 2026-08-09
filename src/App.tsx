import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from '@/routes';
import { KeyboardShortcuts } from '@/components/shortcuts/KeyboardShortcuts';
import { PwaUpdatePrompt } from '@/components/pwa/PwaUpdatePrompt';
import { useAuthStore } from '@/stores';

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <BrowserRouter>
      {/* Keyboard shortcuts + PWA update prompt live inside the Router so the
       shortcuts handler can navigate via react-router. No routing changes. */}
      <AppRoutes />
      <KeyboardShortcuts />
      <PwaUpdatePrompt />
    </BrowserRouter>
  );
}
