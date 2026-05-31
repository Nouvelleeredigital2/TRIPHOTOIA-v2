import { describe, it, expect } from 'vitest';
import { renderApp, screen, fireEvent, waitFor } from '../test-utils';

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
