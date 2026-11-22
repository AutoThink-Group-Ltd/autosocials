import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessLists, LocalBusinessResearch } from './LocalBusinessResearch';

const search = vi.fn();
const saveList = vi.fn();
const listResults = vi.fn(async () => [] as { id: string; title: string; data: { businesses: unknown[] } }[]);
const create = vi.fn();
const remove = vi.fn();
const removeBusiness = vi.fn();
vi.mock('@/lib/local-business.functions', () => ({ searchLocalBusinesses: (...args: unknown[]) => search(...args), listBusinessLists: () => listResults(), saveBusinessList: (...args: unknown[]) => saveList(...args), createBusinessList: (...args: unknown[]) => create(...args), deleteBusinessList: (...args: unknown[]) => remove(...args), removeBusinessFromList: (...args: unknown[]) => removeBusiness(...args) }));
vi.mock('@/lib/virlo.functions', () => ({ saveVirloResearch: vi.fn(), listSavedVirloResearch: vi.fn(async () => []) }));
vi.mock('./pendingRequest', () => ({ acquirePendingRequest: vi.fn(async () => ({ id: 'e80ca30f-119c-4a42-bdf4-5c5fc7568739', key: 'test' })), completePendingRequest: vi.fn() }));

describe('local business research', () => {
  beforeEach(() => search.mockReset());
  it('searches a radius and hands a chosen business to social discovery', async () => {
    search.mockResolvedValue({ id: 'id', data: { location_label: 'Bradford, UK', radius_miles: 5, warnings: [], businesses: [{ name: 'Example restaurant', address: 'Bradford', distance_miles: 1.2 }] } });
    const find = vi.fn();
    const openList = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><LocalBusinessResearch workspaceId="workspace" onFindSocial={find} onOpenList={openList} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText('Business category'), { target: { value: 'restaurants' } });
    fireEvent.change(screen.getByLabelText('Town, city, country or address'), { target: { value: 'Bradford, UK' } });
    fireEvent.click(screen.getByLabelText('Within a mile radius'));
    fireEvent.change(screen.getByLabelText(/Radius in miles/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find businesses' }));
    await screen.findByText('Example restaurant');
    await waitFor(() => expect(search).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ query: 'restaurants', location: 'Bradford, UK', radius_miles: 5 }) })));
    expect(screen.getByText(/Resolved search centre/)).toHaveTextContent('Bradford, UK');
    fireEvent.click(screen.getByRole('button', { name: 'Find social profiles' }));
    expect(find).toHaveBeenCalledWith('Example restaurant');
    fireEvent.click(screen.getByLabelText('Select Example restaurant'));
    fireEvent.change(screen.getByLabelText('List name'), { target: { value: 'Bradford competitors' } });
    saveList.mockResolvedValue({ id: 'list' });
    fireEvent.click(screen.getByRole('button', { name: 'Save selected' }));
    await waitFor(() => expect(saveList).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: 'Bradford competitors', indexes: [0] }) })));
    expect(await screen.findByText('1 business saved to Bradford competitors.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View list' }));
    expect(openList).toHaveBeenCalledWith('list');
  });
  it('creates a list and requires confirmation before deleting it', async () => {
    listResults.mockResolvedValue([{ id: 'list-id', title: 'Competitors', data: { businesses: [] } }]);
    create.mockResolvedValue({ id: 'list-id' });
    remove.mockResolvedValue({ ok: true });
    render(<QueryClientProvider client={new QueryClient()}><BusinessLists workspaceId="workspace" onFindSocial={vi.fn()} onOpenResearch={vi.fn()} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText('New list name'), { target: { value: 'Competitors' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create list' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    const deleteButton = await screen.findByRole('button', { name: 'Delete list' });
    fireEvent.click(deleteButton);
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ data: { workspace_id: 'workspace', list_id: 'list-id' } }));
  });
  it('confirms removal of a specific business from its list', async () => {
    listResults.mockResolvedValue([{ id: 'list-id', title: 'Competitors', data: { businesses: [{ name: 'Example', address: 'Bradford' }] } }]);
    removeBusiness.mockResolvedValue({ ok: true });
    render(<QueryClientProvider client={new QueryClient()}><BusinessLists workspaceId="workspace" onFindSocial={vi.fn()} onOpenResearch={vi.fn()} initialListId="list-id" /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from list' }));
    expect(removeBusiness).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));
    await waitFor(() => expect(removeBusiness).toHaveBeenCalledWith({ data: { workspace_id: 'workspace', list_id: 'list-id', index: 0, name: 'Example', address: 'Bradford' } }));
  });
});
