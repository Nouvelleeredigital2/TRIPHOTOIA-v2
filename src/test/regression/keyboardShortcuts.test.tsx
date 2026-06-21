import { describe, it, expect } from 'vitest';
import { renderApp, screen, fireEvent, waitFor } from '../test-utils';

// The global "?" shortcut toggles the keyboard cheat sheet, but must stay inert
// while the user is typing in an input/textarea (App.tsx handleGlobalHelp guard).

describe('global "?" keyboard shortcut', () => {
  it('opens the shortcuts dialog with an accessible description', async () => {
    await renderApp();

    fireEvent.keyDown(document.body, { key: '?' });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Raccourcis clavier')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/liste des raccourcis clavier disponibles/i),
    ).toBeInTheDocument();
  });

  it('does NOT open while typing "?" in an input field', async () => {
    await renderApp();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: '?' });

    expect(screen.queryByText('Raccourcis clavier')).not.toBeInTheDocument();
    input.remove();
  });
});
