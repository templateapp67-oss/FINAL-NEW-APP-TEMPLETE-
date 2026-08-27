import React, { useState } from 'react';
import { initializeWorkspace, type WorkspaceInitResult } from '../lib/workspace';

export interface WorkspaceInitializerProps {
  onSuccess?: (result: WorkspaceInitResult) => void;
  className?: string;
}

export function WorkspaceInitializer({ onSuccess, className = '' }: WorkspaceInitializerProps) {
  const [name, setName] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkspaceInitResult | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Workspace name is required.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const initResult = await initializeWorkspace(name, inviteToken.trim() || undefined);

      if (!initResult.ok) {
        setError(initResult.error || 'Initialization failed.');
      } else {
        setResult(initResult);
        setName('');
        setInviteToken('');
        onSuccess?.(initResult);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="workspace-initializer-card"
      className={`max-w-md mx-auto p-6 bg-white dark:bg-zinc-900 rounded-xl shadow-md border border-zinc-200 dark:border-zinc-800 ${className}`}
    >
      <div className="mb-6">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Create / Initialize Workspace
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Server-side activation ensures safe membership provisioning without RLS or P0001 errors.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="workspace-name-input"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Workspace Name <span className="text-red-500">*</span>
          </label>
          <input
            id="workspace-name-input"
            name="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Hair & Beauty Studio"
            required
            disabled={loading}
            className="w-full px-3 py-2 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>

        <div>
          <label
            htmlFor="invite-token-input"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Invite Token <span className="text-xs text-zinc-400">(optional)</span>
          </label>
          <input
            id="invite-token-input"
            name="invite"
            type="text"
            value={inviteToken}
            onChange={(e) => setInviteToken(e.target.value)}
            placeholder="e.g. inv_tok_987abc (if joining via invite)"
            disabled={loading}
            className="w-full px-3 py-2 border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm"
        >
          {loading ? 'Initializing Workspace...' : 'Create Workspace'}
        </button>

        {error && (
          <div
            data-testid="workspace-initializer-error"
            className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm rounded-lg"
          >
            <p className="font-semibold">Initialization Error:</p>
            <p>{error}</p>
          </div>
        )}

        {result && result.ok && (
          <div
            data-testid="workspace-initializer-success"
            className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-sm rounded-lg space-y-1"
          >
            <p className="font-semibold">✓ Workspace Initialized Successfully!</p>
            <p>
              Workspace ID: <code className="font-mono text-xs">{result.workspaceId}</code>
            </p>
            <p>
              Membership ID (M_ID):{' '}
              <code className="font-mono text-xs font-bold">{result.membershipId}</code>
            </p>
            <p>
              Role: <span className="capitalize font-medium">{result.role || 'owner'}</span>
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
