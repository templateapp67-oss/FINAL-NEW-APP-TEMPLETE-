/**
 * LIVE PREVIEW COMMUNICATION BRIDGE.
 *
 * The builder renders its preview in two different ways and BOTH must stay
 * perfectly in sync with the central edit state:
 *
 *   1. SAME REACT TREE (the default — `PreviewPane`, `StepFullWebsitePreview`).
 *      The preview component is bound DIRECTLY to the central `SalonData`
 *      state held by `App.tsx`: every keystroke re-renders the preview through
 *      props. No serialization, no bridge, no latency.
 *
 *   2. INSIDE AN IFRAME (`LivePreviewFrame` + the `/preview-frame` route).
 *      A separate document cannot read React state, so the editor streams the
 *      state into the frame with `window.postMessage`. The frame renders the
 *      SAME `TemplateRenderer`, so the two paths can never drift visually.
 *
 * The protocol is deliberately tiny and same-origin by default:
 *
 *   editor → frame : { type: 'state', revision, state }   (debounced ~60 ms)
 *   frame  → editor: { type: 'ready' }                    (on mount)
 *   frame  → editor: { type: 'ack',   revision }          (after applying)
 *   either → other : { type: 'error', message }
 *
 * SECURITY
 *   • Every inbound message is checked for the `nexora.preview.v1` marker,
 *     its `type`, and an ALLOWED ORIGIN. A message from an unlisted origin is
 *     dropped — the frame is a renderer, never a privileged surface.
 *   • Outbound `postMessage` always passes an explicit `targetOrigin`
 *     (never `'*'`), so a state payload cannot be intercepted by whatever
 *     document happens to be listening.
 *   • The frame never writes to storage, never calls the API and never
 *     mutates the draft. It is a read-only projection.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncedCallback } from '../hooks/useDebounce';
import type { SalonData } from '../types';

export const PREVIEW_PROTOCOL = 'nexora.preview.v1';

/** Client route rendered inside the preview iframe. */
export const PREVIEW_FRAME_ROUTE = '/preview-frame';

/**
 * Coalescing window for `postMessage` state streaming. Keystrokes arrive in
 * bursts; 60 ms keeps the frame instant while collapsing a burst into one
 * message. (The 800 ms autosave debounce is unrelated and much slower.)
 */
export const PREVIEW_STATE_DEBOUNCE_MS = 60;

export type PreviewMessageType = 'state' | 'ready' | 'ack' | 'error';

/** The payload streamed across frames — the full website draft. */
export type PreviewState = SalonData;

export interface PreviewEnvelope {
  protocol: typeof PREVIEW_PROTOCOL;
  type: PreviewMessageType;
  /** Monotonic counter; the newest message always wins. */
  revision: number;
  state?: PreviewState;
  message?: string;
}

export function createPreviewMessage(
  type: PreviewMessageType,
  payload: { revision?: number; state?: PreviewState; message?: string } = {},
): PreviewEnvelope {
  return {
    protocol: PREVIEW_PROTOCOL,
    type,
    revision: payload.revision ?? 0,
    ...(payload.state !== undefined ? { state: payload.state } : {}),
    ...(payload.message !== undefined ? { message: payload.message } : {}),
  };
}

export function isPreviewEnvelope(value: unknown): value is PreviewEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Record<string, unknown>;
  return (
    envelope.protocol === PREVIEW_PROTOCOL &&
    typeof envelope.type === 'string' &&
    ['state', 'ready', 'ack', 'error'].includes(envelope.type)
  );
}

/** True when this document is running inside a frame. */
export function isEmbeddedPreview(): boolean {
  return typeof window !== 'undefined' && typeof window.parent !== 'undefined'
    ? window.parent !== window
    : false;
}

/**
 * Origins allowed to SEND preview state into a frame. Same-origin by default;
 * add explicit https origins for a split-host deployment.
 */
export function allowedPreviewOrigins(extra: string[] = []): string[] {
  const origins = new Set(extra.filter(Boolean));
  if (typeof window !== 'undefined' && window.location?.origin) origins.add(window.location.origin);
  return Array.from(origins);
}

/**
 * Posts an envelope to `target`.
 *
 * `targetOrigin` defaults to this document's origin (the frame is served from
 * the same app). `'*'` is never used implicitly.
 */
export function postPreviewMessage(
  target: Window | null | undefined,
  message: PreviewEnvelope,
  targetOrigin?: string,
): boolean {
  if (!target || typeof target.postMessage !== 'function') return false;
  const origin = targetOrigin ?? (typeof window !== 'undefined' ? window.location.origin : null);
  if (!origin) return false;
  try {
    target.postMessage(message, origin);
    return true;
  } catch {
    // A detached/cross-origin frame must never break the editor.
    return false;
  }
}

/**
 * Structural check for an inbound state payload. The frame renders whatever it
 * receives, so a malformed payload is dropped rather than half-rendered.
 */
export function sanitizePreviewState(raw: unknown): PreviewState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.services)) return null;
  return raw as PreviewState;
}

export interface UsePreviewHostOptions {
  /** The central edit state shown in the frame. */
  state: PreviewState | null;
  /** The `<iframe>` element that renders `PREVIEW_FRAME_ROUTE`. */
  targetRef: { current: HTMLIFrameElement | null };
  /** Override when the frame is served from another (explicitly trusted) host. */
  targetOrigin?: string;
  enabled?: boolean;
  onAck?: (revision: number) => void;
}

export interface UsePreviewHostApi {
  /** True once the frame announced itself — state is only streamed after. */
  connected: boolean;
  /** Revision of the last message pushed into the frame. */
  revision: number;
  /** Pushes the current state immediately instead of waiting for the debounce. */
  flush: () => void;
}

/**
 * EDITOR SIDE (parent document). Streams `state` into the preview iframe and
 * re-sends it the moment the frame reports that it is ready.
 */
export function usePreviewHost({
  state,
  targetRef,
  targetOrigin,
  enabled = true,
  onAck,
}: UsePreviewHostOptions): UsePreviewHostApi {
  const [connected, setConnected] = useState(false);
  const revisionRef = useRef(0);
  const [revision, setRevision] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const onAckRef = useRef(onAck);
  onAckRef.current = onAck;

  const pushNow = useCallback(() => {
    const frame = targetRef.current;
    const target = frame?.contentWindow ?? null;
    if (!target || !stateRef.current) return false;
    revisionRef.current += 1;
    const sent = postPreviewMessage(
      target,
      createPreviewMessage('state', { revision: revisionRef.current, state: stateRef.current }),
      targetOrigin,
    );
    if (sent) setRevision(revisionRef.current);
    return sent;
  }, [targetOrigin, targetRef]);

  const push = useDebouncedCallback(pushNow, PREVIEW_STATE_DEBOUNCE_MS);

  // 1. Every change to the central edit state is streamed to the frame.
  useEffect(() => {
    if (!enabled || !connected) return;
    push();
  }, [enabled, connected, state, push]);

  // 2. Listen for the frame's handshake, and ack/error traffic.
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: MessageEvent) => {
      // Origin guard first: only this app (or an explicitly trusted host) may
      // talk to the editor, and only the frame we actually render.
      const allowed = new Set(allowedPreviewOrigins(targetOrigin ? [targetOrigin] : []));
      if (!allowed.has(event.origin)) return;
      const frameWindow = targetRef.current?.contentWindow ?? null;
      if (frameWindow && event.source !== frameWindow) return;
      if (!isPreviewEnvelope(event.data)) return;
      const envelope = event.data;
      if (envelope.type === 'ready') {
        setConnected(true);
        // Send the current state right away — the frame has nothing yet.
        push.cancel();
        pushNow();
        return;
      }
      if (envelope.type === 'ack') {
        onAckRef.current?.(envelope.revision);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [enabled, push, pushNow, targetRef]);

  // 3. A reload/re-navigation of the frame drops the handshake.
  useEffect(() => {
    if (!enabled) return;
    const frame = targetRef.current;
    if (!frame) return;
    const onLoad = () => {
      setConnected(false);
      revisionRef.current = 0;
    };
    frame.addEventListener('load', onLoad);
    return () => frame.removeEventListener('load', onLoad);
  }, [enabled, targetRef]);

  const flush = useCallback(() => {
    push.cancel();
    pushNow();
  }, [push, pushNow]);

  return { connected, revision, flush };
}

export interface UsePreviewClientOptions {
  /** Receives each new state pushed by the editor. */
  onState: (state: PreviewState, revision: number) => void;
  /** Origins allowed to send state (defaults to this document's origin). */
  allowedOrigins?: string[];
  /** Where the `ready`/`ack` handshake is posted. Defaults to `window.parent`. */
  parentOrigin?: string;
  enabled?: boolean;
}

export interface UsePreviewClientApi {
  /** True once the first state has been applied. */
  connected: boolean;
  revision: number;
  error: string | null;
}

/**
 * FRAME SIDE (child document). Announces itself, validates every inbound
 * message, and hands sanitized state to the renderer.
 */
export function usePreviewClient({
  onState,
  allowedOrigins,
  parentOrigin,
  enabled = true,
}: UsePreviewClientOptions): UsePreviewClientApi {
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  const originsRef = useRef<string[]>(allowedPreviewOrigins(allowedOrigins ?? []));
  originsRef.current = allowedPreviewOrigins(allowedOrigins ?? []);

  // 1. Announce readiness so the editor pushes its current state immediately.
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (!isEmbeddedPreview()) return;
    postPreviewMessage(window.parent, createPreviewMessage('ready'), parentOrigin);
  }, [enabled, parentOrigin]);

  // 2. Apply every validated state message.
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const handler = (event: MessageEvent) => {
      if (!originsRef.current.includes(event.origin)) return;
      if (!isPreviewEnvelope(event.data)) return;
      const envelope = event.data;
      if (envelope.type === 'error') {
        setError(envelope.message ?? 'The preview could not be updated.');
        return;
      }
      if (envelope.type !== 'state') return;

      const state = sanitizePreviewState(envelope.state);
      if (!state) {
        setError('The editor sent an incomplete preview.');
        postPreviewMessage(
          event.source as Window | null,
          createPreviewMessage('error', { message: 'Incomplete preview payload.' }),
          event.origin,
        );
        return;
      }
      setError(null);
      setConnected(true);
      setRevision((previous) => (envelope.revision >= previous ? envelope.revision : previous));
      onStateRef.current(state, envelope.revision);
      postPreviewMessage(
        event.source as Window | null,
        createPreviewMessage('ack', { revision: envelope.revision }),
        event.origin,
      );
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [enabled]);

  return { connected, revision, error };
}
