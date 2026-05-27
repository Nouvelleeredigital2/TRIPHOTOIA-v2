import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from './test-utils';
import App from '../App';

describe('App', () => {
  it('renders the application title', () => {
    render(<App />);
    expect(screen.getByText('TRIPHOTOIA')).toBeInTheDocument();
  });

  it('renders the logo', () => {
    render(<App />);
    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('renders tab navigation', () => {
    render(<App />);
    // AutoFlow v2 stepper buttons — aria-labels for accessibility
    expect(screen.getByRole('button', { name: /ingestion/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /triage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportation/i })).toBeInTheDocument();
  });

  it('renders the status bar with photo counts', () => {
    render(<App />);
    // Sidebar shows "0 photos au total"
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThan(0);
  });

  it('starts on the ingestion tab', async () => {
    render(<App />);
    // IngestionTab is lazy-loaded — wait for Suspense to resolve
    await waitFor(() => expect(screen.getByText('Ingestion Tab')).toBeInTheDocument());
  });
});
