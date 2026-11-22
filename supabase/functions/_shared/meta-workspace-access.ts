type WorkspaceAccessClient = {
  rpc(
    name: 'is_workspace_owner' | 'is_workspace_agency',
    args: { _user_id: string; _workspace_id: string },
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Account connections may be managed by a workspace owner or its linked agency. */
export async function canManageMetaAccounts(admin: WorkspaceAccessClient, userId: string, workspaceId: string): Promise<boolean> {
  const [{ data: owner, error: ownerError }, { data: agency, error: agencyError }] = await Promise.all([
    admin.rpc('is_workspace_owner', { _user_id: userId, _workspace_id: workspaceId }),
    admin.rpc('is_workspace_agency', { _user_id: userId, _workspace_id: workspaceId }),
  ]);
  if (ownerError || agencyError) throw new Error('Could not verify workspace authority');
  return Boolean(owner || agency);
}
