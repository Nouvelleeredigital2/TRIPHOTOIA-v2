import { describe, it, expect } from 'vitest';
import { fireEvent, mockStore, render, screen, waitFor } from './test-utils';
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
  it('opens AutoFlow with the filtered photo ids provided by the triage grid', async () => {
    mockStore.activeTab = 'triage';
    mockStore.photos = [
      {
        id: 'visible-1',
        file: new File([''], 'VISIBLE.JPG', { type: 'image/jpeg' }),
        previewUrl: 'visible-preview',
        analysis: { sharpnessScore: 0.7 },
      },
      {
        id: 'hidden-1',
        file: new File([''], 'HIDDEN.JPG', { type: 'image/jpeg' }),
        previewUrl: 'hidden-preview',
        analysis: { sharpnessScore: 0.7 },
      },
    ];

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /open filtered autoflow/i }));
    fireEvent.click(await screen.findByRole('button', { name: /mode swipe/i }));

    expect(screen.getByText('VISIBLE.JPG')).toBeInTheDocument();
    expect(screen.queryByText('HIDDEN.JPG')).not.toBeInTheDocument();
  });

  it('opens the real export workflow from the AutoFlow dashboard picks action', async () => {
    mockStore.setActiveTab.mockClear();
    mockStore.setPendingExportFilterMode.mockClear();
    mockStore.photos = [
      {
        id: 'pick-1',
        file: new File(['original'], 'PICK.JPG', { type: 'image/jpeg' }),
        previewUrl: 'pick-preview',
        analysis: { sharpnessScore: 0.9, isPick: true, rating: 4 },
      },
    ];

    render(<App />);

    fireEvent.click(await screen.findByTitle('Ouvrir AutoFlow v2'));
    fireEvent.click(await screen.findByRole('button', { name: /^exporter les picks$/i }));

    expect(mockStore.setPendingExportFilterMode).toHaveBeenCalledWith('picks-only');
    expect(mockStore.setActiveTab).toHaveBeenCalledWith('export');
    await waitFor(() => expect(screen.getByText('Export Tab')).toBeInTheDocument());
  });
});
