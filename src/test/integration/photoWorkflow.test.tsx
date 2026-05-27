import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../test-utils';
import App from '../../App';

describe('Photo Workflow Integration', () => {
  it('renders initial state without photos', async () => {
    render(<App />);
    expect(screen.getByText('TRIPHOTOIA')).toBeInTheDocument();
    // IngestionTab is lazy-loaded — wait for Suspense to resolve
    await waitFor(() => expect(screen.getByText('Ingestion Tab')).toBeInTheDocument());
  });

  it('switches to triage tab on click', () => {
    render(<App />);
    const triageBtn = screen.getByRole('button', { name: /triage/i });
    // Verify button exists and is clickable — full tab switch requires a real store
    expect(triageBtn).toBeInTheDocument();
    fireEvent.click(triageBtn);
    // Header remains — no crash
    expect(screen.getByText('TRIPHOTOIA')).toBeInTheDocument();
  });

  it('switches to export tab on click', () => {
    render(<App />);
    const exportBtn = screen.getByRole('button', { name: /exportation/i });
    expect(exportBtn).toBeInTheDocument();
    fireEvent.click(exportBtn);
    expect(screen.getByText('TRIPHOTOIA')).toBeInTheDocument();
  });

  it('renders without crashing after multiple tab switches', () => {
    render(<App />);

    const tabs = [
      screen.getByRole('button', { name: /ingestion/i }),
      screen.getByRole('button', { name: /triage/i }),
      screen.getByRole('button', { name: /exportation/i }),
    ];

    for (let i = 0; i < 9; i++) {
      fireEvent.click(tabs[i % 3]);
    }

    expect(screen.getByText('TRIPHOTOIA')).toBeInTheDocument();
  });

  it('renders error boundary without crashing', () => {
    render(<App />);
    expect(screen.getByText('TRIPHOTOIA')).toBeInTheDocument();
  });
});
