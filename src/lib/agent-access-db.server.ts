import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getAdminClient } from "@/lib/supabase-admin.server";

export type AgentConnection = {
  id: string;
  workspace_id: string;
  user_id: string;
  kind: "api_key" | "oauth";
  oauth_client_id: string | null;
  key_hash: string | null;
  key_prefix: string | null;
  label: string;
  scopes: string[];
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

export type AgentOAuthClient = {
  id: string;
  label: string;
  redirect_uris: string[];
  auth_method: "none" | "client_secret_basic" | "client_secret_post";
  secret_hash: string | null;
  created_at: string;
};

export type AgentOAuthRequest = {
  id: string;
  client_id: string;
  redirect_uri: string;
  resource: string;
  state: string;
  challenge: string;
  scopes: string[];
  expires_at: string;
  consumed_at: string | null;
};

type AgentToken = {
  secret_hash: string;
  connection_id: string;
  resource: string;
  kind: "access" | "refresh";
  expires_at: string;
  used_at: string | null;
};

export type AgentPublishingPolicy = {
  id: string;
  workspace_id: string;
  connection_id: string;
  created_by: string;
  account_ids: string[];
  expires_at: string;
  max_count: number;
  publish_now_account_ids: string[];
  publish_now_max_count: number;
  revoked_at: string | null;
  created_at: string;
};

export type AgentRequest = {
  id: string;
  workspace_id: string | null;
  connection_id: string | null;
  operation: string;
  transport: "rest" | "mcp";
  occurred_at: string;
  outcome: string;
  duration_ms: number | null;
  settled_credits: number | null;
};

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

type AgentDatabase = Database & {
  public: {
    Tables: {
      agent_api_connections: Table<
        AgentConnection,
        "workspace_id" | "user_id" | "kind" | "label" | "scopes" | "expires_at"
      >;
      agent_api_oauth_clients: Table<
        AgentOAuthClient,
        "id" | "label" | "redirect_uris" | "auth_method"
      >;
      agent_api_oauth_requests: Table<
        AgentOAuthRequest,
        | "client_id"
        | "redirect_uri"
        | "resource"
        | "state"
        | "challenge"
        | "scopes"
      >;
      agent_api_oauth_tokens: Table<AgentToken>;
      agent_api_requests: Table<AgentRequest, "id" | "operation" | "transport">;
      agent_publishing_policies: Table<AgentPublishingPolicy>;
    };
    Functions: {
      take_agent_api_rate_slot: {
        Args: { p_bucket: string; p_limit: number };
        Returns: boolean;
      };
      authorize_agent_api_request: {
        Args: {
          p_request: string;
          p_user: string;
          p_workspace: string | null;
          p_code_hash: string;
          p_allow: boolean;
        };
        Returns: boolean;
      };
      exchange_agent_api_token: {
        Args: {
          p_kind: string;
          p_secret_hash: string;
          p_client: string;
          p_resource: string;
          p_redirect: string;
          p_challenge: string;
          p_access_hash: string;
          p_refresh_hash: string;
          p_scopes: string[] | null;
        };
        Returns: { expiresIn: number; scopes: string[] } | null;
      };
      rotate_agent_api_key: {
        Args: {
          p_connection: string;
          p_workspace: string;
          p_user: string;
          p_key_hash: string;
          p_key_prefix: string;
        };
        Returns: boolean;
      };
      create_agent_written_draft: {
        Args: {
          p_connection: string;
          p_user: string;
          p_workspace: string;
          p_caption: string;
          p_idempotency: string;
          p_body_hash: string;
        };
        Returns: string | null;
      };
    };
  };
};

export function getAgentDb(): SupabaseClient<AgentDatabase> {
  // These migration-owned additions precede regeneration of the shared DB types.
  return getAdminClient() as unknown as SupabaseClient<AgentDatabase>;
}
