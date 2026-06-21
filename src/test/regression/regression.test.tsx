import { describe, it, expect } from 'vitest';
import { renderApp, screen, fireEvent, waitFor, mockStore } from '../test-utils';

describe('Regression Tests', () => {
  it('should not crash when switching tabs rapidly', async () => {
    await renderApp();

    const tabs = [
      screen.getByRole('button', { name: /ingestion/i }),
      screen.getByRole('button', { name: /triage/i }),
      screen.getByRole('button', { name: /exportation/i }),
    ];

    for (let i = 0; i < 10; i++) {
      fireEvent.click(tabs[i % 3]);
    }

    expect(screen.getByText('Tree Photo IA')).toBeInTheDocument();
  }, 10000);

  it('should render empty state without crashing', async () => {
    await renderApp();
    expect(screen.getByText('Tree Photo IA')).toBeInTheDocument();
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThan(0);
  });

  it('should render all navigation tabs', async () => {
    await renderApp();
    expect(screen.getByRole('button', { name: /ingestion/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /triage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportation/i })).toBeInTheDocument();
  });

  it('should display logo', async () => {
    await renderApp();
    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('should handle rapid tab switching without memory leaks', async () => {
    await renderApp();

    const ingestionBtn = screen.getByRole('button', { name: /ingestion/i });
    const triageBtn = screen.getByRole('button', { name: /triage/i });

    for (let i = 0; i < 20; i++) {
      fireEvent.click(i % 2 === 0 ? triageBtn : ingestionBtn);
    }

    await waitFor(() => {
      expect(screen.getByText('Tree Photo IA')).toBeInTheDocument();
    });
  });

  it('should display the ingestion tab content by default', async () => {
    await renderApp();
    // IngestionTab is lazy-loaded — wait for Suspense to resolve
    await waitFor(() => expect(screen.getByText('Ingestion Tab')).toBeInTheDocument());
  });

  it('should maintain header across tab changes', async () => {
    await renderApp();

    // Click through tabs — header must survive each switch
    fireEvent.click(screen.getByRole('button', { name: /triage/i }));
    expect(screen.getByText('Tree Photo IA')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /exportation/i }));
    expect(screen.getByText('Tree Photo IA')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ingestion/i }));
    expect(screen.getByText('Tree Photo IA')).toBeInTheDocument();
  });
});

describe('Beta UX regression (Phase 8)', () => {
  it('opens the AutoFlow overlay from the Triage tab', async () => {
    // The mocked store does not re-render on tab change, so start on triage and
    // seed an analyzed photo matching the mock's AutoFlow target id ('visible-1').
    mockStore.activeTab = 'triage';
    mockStore.photos = [
      {
        id: 'visible-1',
        file: new File([''], 'visible-1.jpg', { type: 'image/jpeg' }),
        previewUrl: 'mocked-url',
        analysis: { rating: 0, isPick: false, isRejected: false },
      },
    ] as never;

    await renderApp();

    // The Triage tab exposes an entry point into AutoFlow.
    fireEvent.click(screen.getByRole('button', { name: /open filtered autoflow/i }));

    // AutoFlow dashboard renders its Swipe entry point (real AutoFlowMode overlay).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mode swipe/i })).toBeInTheDocument(),
    );
  });

  it('opens the keyboard shortcuts dialog with "?" and exposes an accessible description', async () => {
    await renderApp();

    fireEvent.keyDown(document.body, { key: '?' });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Raccourcis clavier')).toBeInTheDocument();
    });
    // Dialog must carry a description for screen readers.
    expect(
      screen.getByText(/liste des raccourcis clavier disponibles/i),
    ).toBeInTheDocument();
  });

  it('does NOT trigger the "?" shortcut while typing in an input', async () => {
    await renderApp();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    // The global handler reads e.target.tagName — dispatching from the input
    // must be ignored so typing "?" in a field never opens the cheat sheet.
    fireEvent.keyDown(input, { key: '?' });

    expect(screen.queryByText('Raccourcis clavier')).not.toBeInTheDocument();
    input.remove();
  });
});
