import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentStatus, IncidentRecord, ServiceNode, Turn, ToolExecution, PostMortemData, VoiceEngine, StagedRemediation, ActiveRunbookSession, ServiceTopology } from '../types';
import { useAudioPlayer } from './useAudioPlayer';

export interface LatencyStats { stt_ms: number | null; tool_ms: number | null; llm_ms: number | null; tts_ms: number | null; total_ms: number | null; }
export interface Operator { operator: string; role: string; infrastructure_mode: string; authenticated: boolean; assemblyai_configured: boolean; tts_provider: string; }

export function useVoiceStream() {
  const [operator, setOperator] = useState<Operator | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [activeEngine, setActiveEngine] = useState<VoiceEngine>('custom_stt_v3');
  const [providerState, setProviderState] = useState('idle');
  const [providerMessage, setProviderMessage] = useState('');
  const [reasoningProvider, setReasoningProvider] = useState('scripted');
  const [stagedRemediation, setStagedRemediation] = useState<StagedRemediation | null>(null);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentInterimTranscript, setCurrentInterimTranscript] = useState('');
  const [executedTools, setExecutedTools] = useState<ToolExecution[]>([]);
  const [incident, setIncident] = useState<IncidentRecord | null>(null);
  const [services, setServices] = useState<Record<string, ServiceNode>>({});
  const [topology, setTopology] = useState<ServiceTopology | null>(null);
  const [activeRunbook, setActiveRunbook] = useState<ActiveRunbookSession | null>(null);
  const [postMortem, setPostMortem] = useState<PostMortemData | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [latency, setLatency] = useState<LatencyStats>({ stt_ms: null, tool_ms: null, llm_ms: null, tts_ms: null, total_ms: null });
  const socket = useRef<WebSocket | null>(null);
  const media = useRef<MediaStream | null>(null);
  const captureContext = useRef<AudioContext | null>(null);
  const captureNode = useRef<AudioWorkletNode | null>(null);
  const captureGeneration = useRef(0);
  const wantsRecording = useRef(false);
  const mounted = useRef(true);
  const loginAttempt = useRef(0);
  const audioEpoch = useRef(0);
  const suppressAudio = useRef(false);
  const { enqueueAudio, stopPlayback, getAudioContext, isPlaying } = useAudioPlayer(setError);

  const releaseMicrophone = useCallback(() => {
    captureGeneration.current++;
    wantsRecording.current = false;
    if (captureNode.current) {
      captureNode.current.port.onmessage = null;
      captureNode.current.disconnect();
      captureNode.current = null;
    }
    media.current?.getTracks().forEach(t => t.stop());
    media.current = null;
    if (captureContext.current) void captureContext.current.close().catch(() => {});
    captureContext.current = null;
    setIsRecording(false);
    setAudioLevel(0);
  }, []);

  const send = useCallback((type: string, values: Record<string, unknown> = {}) => {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      setError('The server is disconnected. Reconnect before sending a command.');
      return;
    }
    if (!['ping', 'barge_in'].includes(type)) setBusy(true);
    socket.current.send(JSON.stringify({ type, request_id: crypto.randomUUID(), ...values }));
  }, []);

  const beginCapture = useCallback(async (sampleRate: number) => {
    const gen = captureGeneration.current;
    if (!wantsRecording.current || !media.current) return;
    try {
      const ctx = new AudioContext();
      captureContext.current = ctx;
      await ctx.resume();
      await ctx.audioWorklet.addModule('/audio-processor.js');
      if (gen !== captureGeneration.current || !wantsRecording.current || !media.current) {
        if (ctx.state !== 'closed') await ctx.close();
        return;
      }
      const node = new AudioWorkletNode(ctx, 'pcm-processor', { processorOptions: { targetSampleRate: sampleRate } });
      captureNode.current = node;
      node.port.onmessage = event => {
        if (gen !== captureGeneration.current) return;
        setAudioLevel(Math.min(1, event.data.volume * 6));
        if (socket.current?.readyState === WebSocket.OPEN && socket.current.bufferedAmount < 256000) socket.current.send(event.data.buffer);
      };
      ctx.createMediaStreamSource(media.current).connect(node);
      node.connect(ctx.destination);
      setIsRecording(true);
    } catch {
      releaseMicrophone();
      send('stop_voice');
      setError('Microphone capture could not start. Use a current browser on HTTPS or localhost.');
    }
  }, [releaseMicrophone, send]);

  const login = useCallback(async (accessToken = '') => {
    const attempt = ++loginAttempt.current;
    setError('');
    try {
      const result = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: accessToken }), credentials: 'same-origin' });
      if (!mounted.current || attempt !== loginAttempt.current) return;
      if (!result.ok) {
        if (result.status === 401) { setLoginRequired(true); if (accessToken) setError('That access token was not accepted.'); return; }
        throw new Error((await result.json()).detail || 'Could not open an operator session.');
      }
      const nextOperator = await result.json();
      if (!mounted.current || attempt !== loginAttempt.current) return;
      setOperator(nextOperator);
      setLoginRequired(false);
      setSessionVersion(v => v + 1);
    } catch (err) { if (mounted.current && attempt === loginAttempt.current) setError(err instanceof Error ? err.message : 'Server unavailable. Check that the backend is running.'); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void login();
    return () => { mounted.current = false; loginAttempt.current++; releaseMicrophone(); };
  }, [login, releaseMicrophone]);

  useEffect(() => {
    if (!sessionVersion) return;
    let disposed = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let ws: WebSocket | null = null;
    const connect = () => {
      if (disposed) return;
      const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${scheme}//${location.host}/ws/agent`);
      socket.current = ws;
      ws.onopen = () => {
        if (disposed) return;
        setIsConnected(true); setAgentStatus('listening'); retries = 0;
        audioEpoch.current = 0; suppressAudio.current = false;
        ping = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })); }, 20000);
      };
      ws.onclose = event => {
        clearInterval(ping);
        if (disposed) return;
        releaseMicrophone(); stopPlayback(); setIsConnected(false); setBusy(false); setStagedRemediation(null);
        setProviderState('idle');
        if (event.code === 4401) { setLoginRequired(true); setOperator(null); return; }
        if (event.code === 4409) { setError('This session is open in another tab. Close that connection and reconnect here.'); return; }
        if (retries < 5) timer = setTimeout(connect, Math.min(1000 * 2 ** retries++, 12000));
        else setError('Connection lost. Use Reconnect to try again.');
      };
      ws.onerror = () => { if (!disposed) setError('Unable to reach the incident server.'); };
      ws.onmessage = event => {
        if (disposed) return;
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'engine_sync': setActiveEngine(data.engine); break;
            case 'provider_status':
              setProviderState(data.state); setProviderMessage(data.message || '');
              if (['error', 'unconfigured'].includes(data.state)) releaseMicrophone();
              break;
            case 'voice_ready': void beginCapture(data.sample_rate); break;
            case 'reasoning_status': setReasoningProvider(data.provider); if (data.message) setNotice(data.message); break;
            case 'turn':
              if (data.speaker === 'user' && isPlaying) {
                const words = data.transcript.trim().split(/\s+/);
                const isInterrupt = /^(stop|wait|cancel|hold on|pause|abort|no|hush)\b/i.test(data.transcript.trim());
                if (words.length >= 2 || isInterrupt) {
                  suppressAudio.current = true;
                  stopPlayback();
                  if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'barge_in', request_id: crypto.randomUUID() }));
                  }
                }
              }
              if (data.end_of_turn) {
                setCurrentInterimTranscript('');
                setTurns(prev => [...prev.slice(-199), { id: crypto.randomUUID(), speaker: data.speaker, transcript: data.transcript, end_of_turn: true, timestamp: data.timestamp || Date.now() / 1000 }]);
              } else if (data.speaker === 'user') setCurrentInterimTranscript(data.transcript);
              break;
            case 'cluster_sync':
              setIncident(data.incident); setServices(data.services || {}); setTopology(data.topology); setActiveRunbook(data.active_runbook);
              setOperator(previous => previous ? { ...previous, role: data.rbac_role, infrastructure_mode: data.infrastructure_mode } : previous);
              setAutopilotEnabled(!!data.autopilot_enabled); break;
            case 'staging_sync': setStagedRemediation(data.staged_action || null); break;
            case 'tool_executed':
              setExecutedTools(prev => [...prev.slice(-99), { ...data, id: crypto.randomUUID() }]); break;
            case 'agent_state': setAgentStatus(data.state); break;
            case 'interrupt':
              audioEpoch.current = data.epoch; suppressAudio.current = false; stopPlayback(); break;
            case 'audio_stream':
              if (!suppressAudio.current && data.epoch === audioEpoch.current) enqueueAudio(data); break;
            case 'latency_breakdown': setLatency(data.stats); break;
            case 'postmortem_ready': setPostMortem(data.data); break;
            case 'notice': setNotice(data.message); break;
            case 'error': setError(data.message); break;
            case 'command_complete': setBusy(false); break;
            case 'session_reset':
              releaseMicrophone(); stopPlayback(); setTurns([]); setExecutedTools([]); setPostMortem(null); setStagedRemediation(null);
              setActiveRunbook(null); setNotice('A fresh incident session is ready.'); setCurrentInterimTranscript(''); setAutopilotEnabled(false);
              setLatency({ stt_ms: null, tool_ms: null, llm_ms: null, tts_ms: null, total_ms: null }); break;
          }
        } catch { setError('The server returned an invalid response.'); }
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer); clearInterval(ping);
      if (ws) { ws.onclose = null; ws.onmessage = null; ws.onerror = null; ws.close(); }
      socket.current = null;
      releaseMicrophone(); stopPlayback();
    };
  }, [sessionVersion, beginCapture, enqueueAudio, releaseMicrophone, stopPlayback]);

  const stopRecording = useCallback(() => { releaseMicrophone(); send('stop_voice'); }, [releaseMicrophone, send]);
  const startRecording = useCallback(async () => {
    if (wantsRecording.current) return;
    if (socket.current?.readyState !== WebSocket.OPEN) { setError('Reconnect before starting the microphone.'); return; }
    setError('');
    getAudioContext();
    wantsRecording.current = true;
    const gen = ++captureGeneration.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (!mounted.current || !wantsRecording.current || gen !== captureGeneration.current) { stream.getTracks().forEach(t => t.stop()); return; }
      media.current = stream;
      send('start_voice');
    } catch {
      releaseMicrophone();
      setError('Microphone access was denied or no microphone is available. You can still type a command.');
    }
  }, [getAudioContext, releaseMicrophone, send]);

  const stopAudio = useCallback(() => { suppressAudio.current = true; stopPlayback(); }, [stopPlayback]);
  const command = useCallback((type: string, args: Record<string, unknown> = {}) => {
    getAudioContext(); stopAudio(); send(type, args);
  }, [getAudioContext, stopAudio, send]);

  return { operator, loginRequired, login, reconnect: () => void login(), isConnected, agentStatus, activeEngine,
    providerState, providerMessage, reasoningProvider, stagedRemediation, autopilotEnabled, isRecording, isPlaying,
    turns, currentInterimTranscript, executedTools, incident, services, topology, activeRunbook, postMortem,
    audioLevel, latency, error, notice, busy, clearError: () => setError(''), clearNotice: () => setNotice(''),
    startRecording, stopRecording, toggleRecording: () => (isRecording || wantsRecording.current) ? stopRecording() : void startRecording(),
    sendTextCommand: (text: string) => command('text_command', { text }),
    selectEngine: (engine: VoiceEngine) => { releaseMicrophone(); command('select_engine', { engine }); },
    authorizeRemediation: () => command('authorize_remediation', { action_id: stagedRemediation?.id }),
    cancelRemediation: () => command('cancel_remediation', { action_id: stagedRemediation?.id }),
    resetIncident: () => { releaseMicrophone(); command('reset_incident'); },
    bargeIn: () => command('barge_in'),
    startRunbook: (runbook_id: string) => command('start_runbook', { runbook_id }),
    advanceRunbook: () => command('advance_runbook'), abortRunbook: () => command('abort_runbook'),
    toggleAutopilot: () => command('toggle_autopilot', { enabled: !autopilotEnabled }),
    simulateScenario: (scenario: string) => command('simulate_scenario', { scenario }),
    closePostMortem: () => setPostMortem(null),
  };
}
