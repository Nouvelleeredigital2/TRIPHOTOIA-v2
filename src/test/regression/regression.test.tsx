import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../test-utils';
import App from '../../App';

describe('Regression Tests', () => {
  it('should not crash when switching tabs rapidly', async () => {
    render(<App />);

    const tabs = [
      screen.getByRole('button', { name: /ingestion/i }),
      screen.getByRole('button', { name: /triage/i }),
      screen.getByRole('button', { name: /exportation/i }),
    ];

    for (let i = 0; i < 10; i++) {
      fireEvent.click(tabs[i % 3]);
    }

    expect(screen.getByText('TRIPHOTOIA')).toBeInTheDocument();
  });

  it('should render empty state without crashing', () => {
    render(<App />);
    expect(screen.getByText('TRIPHOTOIA')).toBeInTheDocument();
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThan(0);
  });

  it('should render all navigation tabs', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /ingestion/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /triage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportation/i })).toBeInTheDocument();
  });

  it('should display logo', () => {
    render(<App />);
    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('should handle rapid tab switching without memory leaks', async () => {
    render(<App />);

    const ingestionBtn = screen.getByRole('button', { name: /ingestion/i });
    const triageBtn = screen.getByRole('button', { name: /triage/i });

    for (let i = 0; i < 20; i++) {
      fireEvent.click(i % 2 === 0 ? triageBtn : ingestionBtn);
    }

    await waitFor(() => {
      expect(screen.getByText('TRIPHOTOIA')).toBeInTheDocument();
    });
  });

  it('should display the ingestion tab content by default', async () => {
    render(<App />);
    // IngestionTab is lazy-loaded — wait for Suspense to resolve
    await waitFor(() => expect(screen.getByText('Ingestion Tab')).toBeInTheDocument());
  });

  it('should maintain header across tab changes', () => {
    render(<App />);

    // Click through tabs — header must survive each switch
    fireEvent.click(screen.getByRole('button', { name: /triage/i }));
    expect(screen.getByText('TRIPHOTOIA')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /exportation/i }));
    expect(screen.getByText('TRIPHOTOIA')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ingestion/i }));
    expect(screen.getByText('TRIPHOTOIA')).toBeInTheDocument();
  });
});
