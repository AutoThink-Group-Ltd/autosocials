import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefResearch, BriefResearchReport } from './BriefResearch';

const { run, save, saveList, discard, get } = vi.hoisted(() => ({ run: vi.fn(), save: vi.fn(), saveList: vi.fn(), discard: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/brief-research.functions', () => ({ runBriefResearch: run, saveBriefList: saveList, discardBriefResearch: discard }));
vi.mock('@/lib/virlo.functions', () => ({ saveVirloResearch: save, getVirloResearchResult: get }));
vi.mock('./pendingRequest', () => ({ acquirePendingRequest: vi.fn(async () => ({ id: 'request', key: 'key' })), completePendingRequest: vi.fn() }));
const data = { summary: 'Summary', checked_at: '2026-11-15T12:00:00Z', limitations: [], lists: [{ title: 'Ideas', description: '', items: [{ title: 'Item', detail: 'Detail', sources: [{ title: 'Good', url: 'https://example.com/' }, { title: 'Bad', url: 'javascript:alert(1)' }] }] }] };
const result = { id: 'result', title: 'Report', kind: 'brief_research', data };
const mount = () => render(<QueryClientProvider client={new QueryClient()}><BriefResearch workspaceId="workspace" /></QueryClientProvider>);

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); run.mockResolvedValue(result); save.mockResolvedValue({}); saveList.mockResolvedValue({ id: 'list' }); discard.mockResolvedValue({ ok: true }); get.mockResolvedValue(result); });
describe('brief research', () => {
  it('filters gallery posts by date and restores undated posts', () => {
    const post = { url: 'https://www.instagram.com/reel/abc/', platform: 'instagram', handle: 'creator', views: null, likes: null, comments: null };
    render(<BriefResearchReport data={{ mode: 'gallery', warnings: [], groups: [{ title: 'Ideas', posts: [{ ...post, caption: 'Today post', published_at: new Date().toISOString() }, { ...post, caption: 'Undated post', published_at: null }] }] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByText('Today post')).toBeInTheDocument();
    expect(screen.queryByText('Undated post')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(screen.getByText('Undated post')).toBeInTheDocument();
  });
  it('renders gallery posts and filters platforms without report sections', () => {
    render(<BriefResearchReport data={{ mode: 'gallery', checked_at: '2026-11-15T12:00:00Z', warnings: [], groups: [{ title: 'Ideas', posts: [{ url: 'https://www.tiktok.com/@creator/video/123', platform: 'tiktok', caption: 'A useful post', handle: 'creator', published_at: null, views: 1500, likes: 20, comments: 2 }, { url: 'https://www.instagram.com/reel/abc/', platform: 'instagram', caption: 'Another post', handle: 'other', published_at: null, views: null, likes: null, comments: null }] }] }} />);
    expect(screen.getByText('A useful post')).toBeInTheDocument();
    expect(screen.getByTitle('tiktok post by creator')).toHaveAttribute('src', 'https://www.tiktok.com/embed/v2/123');
    expect(screen.queryByRole('heading', { name: 'Executive summary' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'View larger' })[0]!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTitle('Larger tiktok post by creator')).toHaveAttribute('src', 'https://www.tiktok.com/embed/v2/123');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Instagram' }));
    expect(screen.queryByText('A useful post')).not.toBeInTheDocument();
    expect(screen.getByText('Another post')).toBeInTheDocument();
  });
  it('shows the executive summary with its source links', () => {
    render(<BriefResearchReport data={{ ...data, summary_sources: [{ title: 'Summary source', url: 'https://example.com/evidence' }] }} />);
    expect(screen.getByRole('heading', { name: 'Executive summary' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Summary source/ })).toHaveAttribute('href', 'https://example.com/evidence');
  });
  it('renders only safe links', () => {
    render(<BriefResearchReport data={data} />);
    expect(screen.getByRole('link', { name: /Good/ })).toHaveAttribute('href', 'https://example.com/');
    expect(screen.queryByRole('link', { name: /Bad/ })).not.toBeInTheDocument();
  });
  it('confirms the request, saves a list and discards the draft', async () => {
    mount(); fireEvent.change(screen.getByLabelText('Your Prompt'), { target: { value: 'Research this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find posts' })); expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start research' }));
    await screen.findByText('Summary'); expect(run).toHaveBeenCalledWith({ data: expect.objectContaining({ confirmed: true, request_id: 'request' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Save this list' })); await waitFor(() => expect(saveList).toHaveBeenCalledWith({ data: { workspace_id: 'workspace', result_id: 'result', list_index: 0 } }));
    await screen.findByText(/Topic saved/); fireEvent.click(screen.getByRole('button', { name: 'Discard draft' })); await waitFor(() => expect(discard).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Summary')).not.toBeInTheDocument());
  });
  it('collapses the brief for results and lets the user reopen it', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Your Prompt'), { target: { value: 'Research this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find posts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start research' }));
    await screen.findByText('Summary');
    expect(screen.queryByRole('textbox', { name: 'Your Prompt' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show brief' }));
    expect(screen.getByRole('textbox', { name: 'Your Prompt' })).toHaveValue('Research this');
    fireEvent.click(screen.getByRole('button', { name: 'Hide brief' }));
    expect(screen.queryByRole('textbox', { name: 'Your Prompt' })).not.toBeInTheDocument();
  });
  it('recovers and saves an unsaved report after reload', async () => {
    sessionStorage.setItem('as:brief-result:workspace', 'result'); mount(); expect(screen.queryByText('Summary')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Open previous report draft' })); await screen.findByText('Summary');
    fireEvent.click(screen.getByRole('button', { name: 'Save full research' })); await waitFor(() => expect(save).toHaveBeenCalled());
    await screen.findByRole('button', { name: 'Research saved' }); expect(sessionStorage.getItem('as:brief-result:workspace')).toBeNull();
  });
});
