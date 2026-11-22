import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ListResearchAction, ListResearchReport, type ListResearchData } from './ListResearch';

const start = vi.fn();
const research = vi.fn();
const skip = vi.fn();
vi.mock('@/lib/list-research.functions', () => ({ startListResearch: (...args: unknown[]) => start(...args), researchListBusiness: (...args: unknown[]) => research(...args), skipListBusiness: (...args: unknown[]) => skip(...args) }));
vi.mock('./pendingRequest', () => ({ acquirePendingRequest: vi.fn(async () => ({ id: 'ed529c52-2e4b-443c-b100-dcedd1fc1cbb', key: 'test' })), completePendingRequest: vi.fn() }));

const pending: ListResearchData = { list_name: 'Bradford', status: 'running', checked_at: '2026-11-14T12:00:00Z', businesses: [{ name: 'Restaurant', address: 'Bradford', status: 'pending', profiles: [], warnings: [] }] };
const completed: ListResearchData = { ...pending, status: 'complete', businesses: [{ ...pending.businesses[0]!, status: 'complete', profiles: [{ platform: 'instagram', handle: '@cafe', url: 'https://www.instagram.com/cafe/', source: 'ai_candidate', posts: [{ url: 'https://www.instagram.com/p/example/', caption: 'Food' }], warning: 'Verify ownership.' }] }] };

describe('list research', () => {
  it('filters saved business posts by date', () => {
    const item = completed.businesses[0]!;
    const data = { ...completed, businesses: [{ ...item, profiles: [{ ...item.profiles[0]!, posts: [{ url: 'https://www.instagram.com/p/today/', caption: 'Fresh post', published_at: new Date().toISOString() }, { url: 'https://www.instagram.com/p/undated/', caption: 'Undated post' }] }] }] };
    render(<ListResearchReport data={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(screen.getByText('Fresh post')).toBeInTheDocument();
    expect(screen.queryByText('Undated post')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(screen.getByText('Undated post')).toBeInTheDocument();
  });
  it('requires confirmation and records progress before opening a saved report', async () => {
    start.mockReset(); research.mockReset();
    start.mockResolvedValue({ id: 'report-id', data: pending });
    research.mockResolvedValue({ id: 'report-id', data: completed });
    const open = vi.fn();
    render(<ListResearchAction workspaceId="workspace" listId="list-id" businessCount={1} onOpenReport={open} />);
    fireEvent.click(screen.getByRole('button', { name: 'Research this list' }));
    expect(start).not.toHaveBeenCalled();
    expect(screen.getByText(/Estimated Virlo usage/)).toHaveTextContent('$0.08');
    fireEvent.click(screen.getByRole('button', { name: 'Start research' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ confirmed: true, list_id: 'list-id' }) })));
    expect(await screen.findByText(/Research complete · 1 of 1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View saved research' }));
    expect(open).toHaveBeenCalledWith({ id: 'report-id', data: completed });
  });
  it('reports the active business and starts an individual report with identity checks', async () => {
    start.mockReset(); research.mockReset();
    start.mockResolvedValue({ id: 'report-id', data: pending });
    research.mockResolvedValue({ id: 'report-id', data: completed });
    const progress = vi.fn();
    render(<ListResearchAction workspaceId="workspace" listId="list-id" businessCount={1} businessIndex={4} businessName="Restaurant" businessAddress="Bradford" onProgress={progress} onOpenReport={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Research business' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start research' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ business_index: 4, business_name: 'Restaurant', business_address: 'Bradford' }) })));
    await waitFor(() => expect(progress).toHaveBeenCalledWith(expect.objectContaining({ activeIndex: 4, running: true })));
    expect(await screen.findByText(/Research complete/)).toBeInTheDocument();
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ activeIndex: null, running: false, result: { id: 'report-id', data: completed } }));
  });
  it('labels suggested matches and filters channels without fabricating profile ownership', () => {
    render(<ListResearchReport data={completed} />);
    fireEvent.click(screen.getByText('Profiles and research status'));
    expect(screen.getByText('AI-suggested match · verify ownership')).toBeInTheDocument();
    expect(screen.getByText('Verify ownership.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open post/ })).toHaveAttribute('href', 'https://www.instagram.com/p/example/');
    fireEvent.click(screen.getByRole('button', { name: 'View larger' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: /Open post/ })).toHaveAttribute('href', 'https://www.instagram.com/p/example/');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'instagram' }));
    expect(screen.getByText('Food')).toBeInTheDocument();
  });
  it('shows a combined gallery newest first and filters specific businesses', () => {
    const item = completed.businesses[0]!;
    const data: ListResearchData = { ...completed, businesses: [
      { ...item, name: 'First', profiles: [{ ...item.profiles[0]!, source: 'website', posts: [{ url: 'https://www.instagram.com/p/old/', caption: 'Older', published_at: '2025-01-01', media_type: 'image', thumbnail_url: 'https://auth.virlo.ai/storage/v1/object/public/media/old.jpg' }, { url: 'https://www.instagram.com/p/unknown/', caption: 'Undated' }] }] },
      { ...item, name: 'Second', profiles: [{ ...item.profiles[0]!, platform: 'tiktok', url: 'https://www.tiktok.com/@second', posts: [{ url: 'https://www.tiktok.com/@second/video/123456', caption: 'Newest', published_at: '2026-02-01', width: 1080, height: 1920 }] }] },
    ] };
    render(<ListResearchReport data={data} />);
    const gallery = screen.getByRole('list', { name: 'Social post gallery' });
    const rows = within(gallery).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Newest'); expect(rows[1]).toHaveTextContent('Older'); expect(rows[2]).toHaveTextContent('Undated');
    expect(within(rows[0]!).getByTitle('Second tiktok post')).toHaveAttribute('src', 'https://www.tiktok.com/embed/v2/123456');
    expect(within(rows[1]!).getByRole('img')).toHaveAttribute('src', 'https://auth.virlo.ai/storage/v1/object/public/media/old.jpg');
    fireEvent.click(screen.getByText('Filter businesses'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Second' }));
    expect(within(gallery).queryByText('Newest')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));
    expect(within(gallery).getByText('Newest')).toBeInTheDocument();
    expect(within(gallery).queryByText('Older')).not.toBeInTheDocument();
  });
  it('offers an explicitly confirmed skip after a business request fails', async () => {
    research.mockReset(); skip.mockReset();
    research.mockRejectedValue(new Error('This business outcome needs checking.'));
    skip.mockResolvedValue({ id: 'report-id', data: { ...completed, businesses: [{ ...completed.businesses[0], status: 'partial', profiles: [], warnings: ['Research was skipped.'] }] } });
    render(<ListResearchAction workspaceId="workspace" businessCount={1} existingReport={{ id: 'report-id', data: pending }} onOpenReport={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume research' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start research' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip this business' }));
    expect(skip).not.toHaveBeenCalled();
    expect(screen.getByText(/provider charges may still apply/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm skip' }));
    await waitFor(() => expect(skip).toHaveBeenCalledWith({ data: { workspace_id: 'workspace', result_id: 'report-id', index: 0 } }));
    expect(await screen.findByText(/Research complete · 1 of 1/)).toBeInTheDocument();
  });
});
