import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import StreamList from './StreamList';
import { streamHealthMonitor, streamKeyFor } from '@/lib/streamHealth';
import type { Stream } from '@/types/api';

const streams: Stream[] = [
  { url: 'https://a.com/1', source: 'alpha', language: 'en', quality: 'HD' },
  { url: 'https://b.com/2', source: 'beta', language: 'es', quality: 'SD' },
];

beforeEach(() => {
  streamHealthMonitor.clearAllEntries();
});

describe('StreamList health rendering', () => {
  it('renders every stream as untested before anything is observed', () => {
    render(<StreamList streams={streams} currentStreamId={null} onSelectStream={() => {}} />);
    // One label per row, plus one in the legend.
    expect(screen.getAllByText('Untested')).toHaveLength(3);
  });

  it('re-renders when health changes without any other prop change', () => {
    render(<StreamList streams={streams} currentStreamId={null} onSelectStream={() => {}} />);
    expect(screen.queryByLabelText(/from alpha — status: Live/)).toBeNull();

    act(() => {
      streamHealthMonitor.reportSustained(streamKeyFor(streams[0]));
    });

    // This is the defect the rework fixes: previously the dot stayed grey because
    // the component read a plain Map with no subscription.
    expect(screen.getByLabelText(/from alpha — status: Live/)).toBeTruthy();
    expect(screen.getByLabelText(/from beta — status: Untested/)).toBeTruthy();
  });

  it('reflects the offline transition after repeated failures', () => {
    render(<StreamList streams={streams} currentStreamId={null} onSelectStream={() => {}} />);
    const key = streamKeyFor(streams[1]);

    act(() => { streamHealthMonitor.reportFailed(key, 'timeout'); });
    expect(screen.getByLabelText(/from beta — status: Unstable/)).toBeTruthy();

    act(() => { streamHealthMonitor.reportFailed(key, 'error'); });
    expect(screen.getByLabelText(/from beta — status: Offline/)).toBeTruthy();
  });
});
