import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toast from './Toast';

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  // Restore real timers here (not inline in the auto-dismiss test) so a
  // throwing assertion can never strand fake timers into a later test.
  vi.useRealTimers();
  expect(consoleErrorSpy).not.toHaveBeenCalled();
  expect(consoleWarnSpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('<Toast />', () => {
  it('renders only the viewport when toast is null (root/description/dismiss absent)', () => {
    render(<Toast toast={null} onDismiss={vi.fn()} />);
    expect(screen.queryByTestId('toast-root')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toast-description')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toast-dismiss')).not.toBeInTheDocument();
    expect(screen.getByTestId('toast-viewport')).toBeInTheDocument();
  });

  it('renders the message and a region when a toast is present', () => {
    render(
      <Toast toast={{ message: 'Could not save.', id: '1' }} onDismiss={vi.fn()} />,
    );
    expect(screen.getByTestId('toast-description')).toHaveTextContent(
      'Could not save.',
    );
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('calls onDismiss exactly once when the Dismiss control is clicked', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <Toast toast={{ message: 'boom', id: '1' }} onDismiss={onDismiss} />,
    );
    await user.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when Escape is pressed while the toast is open', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <Toast toast={{ message: 'boom', id: '1' }} onDismiss={onDismiss} />,
    );
    screen.getByTestId('toast-root').focus();
    await user.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalled();
  });

  it('auto-dismisses after the 5000ms duration elapses', async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <Toast toast={{ message: 'boom', id: '1' }} onDismiss={onDismiss} />,
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(onDismiss).toHaveBeenCalled();
    // Real timers restored in afterEach — do not rely on reaching this line.
  });

  it('announces the toast to assistive technology via an aria-live region', () => {
    render(
      <Toast toast={{ message: 'boom', id: '1' }} onDismiss={vi.fn()} />,
    );
    const liveRegion = document.querySelector('[aria-live]');
    expect(liveRegion).not.toBeNull();
  });
});
