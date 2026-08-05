import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';

describe('<App />', () => {
  it('renders the heading and welcome banner', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /MonetaFox Reborn/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('welcome-banner')).toBeInTheDocument();
  });

  it('increments the counter via the Zustand-backed Button', async () => {
    const user = userEvent.setup();
    render(<App />);

    const countButton = screen.getByRole('button', { name: /Count: 0/i });
    await user.click(countButton);
    await user.click(countButton);

    expect(
      screen.getByRole('button', { name: /Count: 2/i }),
    ).toBeInTheDocument();
  });

  it('toggles the welcome banner with the outline Button', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId('welcome-banner')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Hide welcome/i }));
    expect(screen.queryByTestId('welcome-banner')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Show welcome/i }));
    expect(screen.getByTestId('welcome-banner')).toBeInTheDocument();
  });
});
