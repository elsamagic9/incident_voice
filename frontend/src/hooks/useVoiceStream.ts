import { useState, useEffect, useRef, useCallback } from 'react';
import { AgentStatus, IncidentRecord, ServiceNode, Turn, ToolExecution, PostMortemData, VoiceEngine, StagedRemediation, ActiveRunbookSession, ServiceTopology } from '../types';
import { useAudioPlayer } from './useAudioPlayer';

export interface LatencyStats {
  stt_ms: number;
  tool_ms: number;
  llm_ms: number;
  tts_ms: number;
  total_ms: number;
}

export function useVoiceStream() {
  const [isConnected, setIsConnected] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [activeEngine, setActiveEngine] = useState<VoiceEngine>('custom_stt_v3');
  const [stagedRemediation, setStagedRemediation] = useState<StagedRemediation | null>(null);
  const [dockerActive, setDockerActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentInterimTranscript, setCurrentInterimTranscript] = useState<string>('');
  const [executedTools, setExecutedTools] = useState<ToolExecution[]>([]);
  const [incident, setIncident] = useState<IncidentRecord | null>(null);
  const [services, setServices] = useState<Record<string, ServiceNode>>({});
  const [topology, setTopology] = useState<ServiceTopology | null>(null);
  const [activeRunbook, setActiveRunbook] = useState<ActiveRunbookSession | null>(null);
  const [postMortem, setPostMortem] = useState<PostMortemData | null>(null);
  const [rbacRole, setRbacRole] = useState<string>('SRE_COMMANDER');
  const [clusterProvider, setClusterProvider] = useState<string>('Hybrid (K8s + Docker)');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [latency, setLatency] = useState<LatencyStats>({
    stt_ms: 120,
    tool_ms: 45,
    llm_ms: 110,
    tts_ms: 85,
    total_ms: 360
  });

  const socketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const { enqueueBase64Chunk, stopPlayback } = useAudioPlayer();

  // Web Audio UI feedback beep
  const playSoundEffect = useCallback((freq = 880, type: OscillatorType = 'sine', duration = 0.08) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }, []);

  // Connect WebSocket
  useEffect(() => {
    const customWsBase = (import.meta as any).env?.VITE_WS_URL;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = customWsBase
      ? `${customWsBase}${customWsBase.includes('?') ? '&' : '?'}engine=${activeEngine}`
      : `${protocol}//${host}/ws/agent?engine=${activeEngine}`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    // Heartbeat ping every 25s to keep cloud load balancers (Render/Fly.io) alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);

    ws.onopen = () => {
      console.log('Voice Agent WebSocket connected with engine:', activeEngine);
      setIsConnected(true);
      setAgentStatus('listening');
    };

    ws.onclose = () => {
      console.log('Voice Agent WebSocket disconnected.');
      setIsConnected(false);
      setAgentStatus('idle');
      clearInterval(pingInterval);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setAgentStatus('error');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'engine_sync':
            if (data.engine) {
              setActiveEngine(data.engine);
            }
            break;

          case 'turn':
            if (data.end_of_turn) {
              setCurrentInterimTranscript('');
              setTurns((prev) => [
                ...prev,
                {
                  id: `${Date.now()}-${Math.random()}`,
                  speaker: data.speaker,
                  transcript: data.transcript,
                  end_of_turn: true,
                  confidence: data.confidence,
                  timestamp: data.timestamp || Date.now()
                }
              ]);
            } else {
              // Interim streaming transcript
              setCurrentInterimTranscript(data.transcript);
            }
            break;

          case 'agent_state':
            setAgentStatus(data.state);
            if (data.state === 'speaking') {
              playSoundEffect(587, 'sine', 0.06);
            } else if (data.state === 'interrupted') {
              stopPlayback();
              playSoundEffect(330, 'square', 0.05);
            } else if (data.state === 'awaiting_confirmation') {
              playSoundEffect(740, 'triangle', 0.15);
              if (data.staged_action) {
                setStagedRemediation(data.staged_action);
              }
            } else if (data.state === 'listening' && !data.staged_action) {
              // If returned to normal listening
            }
            break;

          case 'remediation_staged':
            if (data.staged_action) {
              setStagedRemediation(data.staged_action);
              setAgentStatus('awaiting_confirmation');
              playSoundEffect(740, 'triangle', 0.15);
            }
            break;

          case 'tool_executed':
            playSoundEffect(1046, 'sine', 0.08);
            if (data.result?.status === 'staged') {
              setStagedRemediation({
                action: data.result.action || data.arguments?.action,
                service_name: data.result.service_name || data.arguments?.service_name,
                params: data.arguments,
                message: data.result.message
              });
              setAgentStatus('awaiting_confirmation');
            } else {
              // Action was executed -> clear staged state & restore status if needed
              setStagedRemediation(null);
              setAgentStatus((prev) => (prev === 'awaiting_confirmation' ? 'listening' : prev));
            }

            setExecutedTools((prev) => [
              ...prev,
              {
                id: `${Date.now()}-${data.tool_name}`,
                tool_name: data.tool_name,
                arguments: data.arguments,
                result: data.result,
                timestamp: data.timestamp
              }
            ]);
            break;

          case 'cluster_sync':
            if (data.incident) setIncident(data.incident);
            if (data.services) setServices(data.services);
            if (data.docker_active !== undefined) setDockerActive(data.docker_active);
            if (data.topology) setTopology(data.topology);
            if (data.active_runbook !== undefined) setActiveRunbook(data.active_runbook);
            if (data.rbac_role) setRbacRole(data.rbac_role);
            if (data.cluster_provider) setClusterProvider(data.cluster_provider);
            break;

          case 'runbook_sync':
            if (data.session !== undefined) {
              setActiveRunbook(data.session);
            }
            break;

          case 'latency_breakdown':
            if (data.stats) {
              setLatency(data.stats);
            }
            break;

          case 'audio_stream':
            if (data.data) {
              enqueueBase64Chunk(data.data);
            }
            break;

          case 'audio_stream_end':
            break;

          case 'postmortem_ready':
            if (data.data) {
              playSoundEffect(1318, 'triangle', 0.25);
              setPostMortem(data.data);
            }
            break;

          case 'system':
            console.log('System:', data.message);
            break;
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    };

    return () => {
      clearInterval(pingInterval);
      ws.close();
    };
  }, [enqueueBase64Chunk, stopPlayback, playSoundEffect]);

  // Fallback downsampler for ScriptProcessor if AudioWorklet fails
  const downsampleTo16k = (buffer: Float32Array, sampleRate: number): Int16Array => {
    const ratio = sampleRate / 16000;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      const avg = count > 0 ? accum / count : 0;
      const s = Math.max(-1, Math.min(1, avg));
      result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  };

  const startRecording = useCallback(async () => {
    try {
      stopPlayback(); // Instant barge-in if agent was speaking
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);

      // Attempt high-performance AudioWorklet first
      let workletInitialized = false;
      try {
        await audioCtx.audioWorklet.addModule('/audio-processor.js');
        const workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor');
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (e) => {
          if (e.data.type === 'pcm_chunk') {
            setAudioLevel(Math.min(1, e.data.volume * 5));
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              socketRef.current.send(e.data.buffer);
            }
          }
        };

        source.connect(workletNode);
        workletNode.connect(audioCtx.destination);
        workletInitialized = true;
        console.log('Using high-performance AudioWorklet for 16kHz PCM streaming.');
      } catch (workletErr) {
        console.warn('AudioWorklet initialization failed, falling back to ScriptProcessor:', workletErr);
      }

      // Fallback to ScriptProcessor if AudioWorklet was blocked
      if (!workletInitialized) {
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = processor;

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sum / inputData.length);
          setAudioLevel(Math.min(1, rms * 5));

          const pcm16 = downsampleTo16k(inputData, audioCtx.sampleRate);
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(pcm16.buffer);
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      }

      setIsRecording(true);
      setAgentStatus('listening');
      playSoundEffect(784, 'sine', 0.08);
    } catch (err) {
      console.error('Error opening microphone:', err);
    }
  }, [stopPlayback, playSoundEffect]);

  const stopRecording = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setAudioLevel(0);
    playSoundEffect(440, 'sine', 0.05);
  }, [playSoundEffect]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const sendTextCommand = useCallback((text: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      stopPlayback();
      socketRef.current.send(JSON.stringify({
        type: 'text_command',
        text
      }));
    }
  }, [stopPlayback]);

  const selectEngine = useCallback((engine: VoiceEngine) => {
    if (engine === activeEngine) return;
    stopPlayback();
    setActiveEngine(engine);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'select_engine',
        engine
      }));
    }
    playSoundEffect(880, 'sine', 0.1);
  }, [activeEngine, stopPlayback, playSoundEffect]);

  const authorizeRemediation = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      stopPlayback();
      socketRef.current.send(JSON.stringify({ type: 'authorize_remediation' }));
      setStagedRemediation(null);
      playSoundEffect(1046, 'sine', 0.12);
    }
  }, [stopPlayback, playSoundEffect]);

  const cancelRemediation = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      stopPlayback();
      socketRef.current.send(JSON.stringify({ type: 'cancel_remediation' }));
      setStagedRemediation(null);
      playSoundEffect(440, 'sine', 0.08);
    }
  }, [stopPlayback, playSoundEffect]);

  const resetIncident = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'reset_incident' }));
      setTurns([]);
      setExecutedTools([]);
      setPostMortem(null);
      setStagedRemediation(null);
      setActiveRunbook(null);
      setAgentStatus('listening');
      playSoundEffect(659, 'triangle', 0.1);
    }
  }, [playSoundEffect]);

  const bargeIn = useCallback(() => {
    stopPlayback();
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'barge_in' }));
    }
  }, [stopPlayback]);

  const startRunbook = useCallback((runbookId: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      stopPlayback();
      socketRef.current.send(JSON.stringify({
        type: 'start_runbook',
        runbook_id: runbookId
      }));
      playSoundEffect(880, 'sine', 0.1);
    }
  }, [stopPlayback, playSoundEffect]);

  const advanceRunbook = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      stopPlayback();
      socketRef.current.send(JSON.stringify({
        type: 'advance_runbook'
      }));
      playSoundEffect(1046, 'sine', 0.1);
    }
  }, [stopPlayback, playSoundEffect]);

  const abortRunbook = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      stopPlayback();
      socketRef.current.send(JSON.stringify({
        type: 'abort_runbook'
      }));
      setActiveRunbook(null);
      playSoundEffect(440, 'sine', 0.08);
    }
  }, [stopPlayback, playSoundEffect]);

  return {
    isConnected,
    agentStatus,
    activeEngine,
    stagedRemediation,
    dockerActive,
    rbacRole,
    clusterProvider,
    isRecording,
    turns,
    currentInterimTranscript,
    executedTools,
    incident,
    services,
    topology,
    activeRunbook,
    postMortem,
    audioLevel,
    latency,
    startRecording,
    stopRecording,
    toggleRecording,
    sendTextCommand,
    selectEngine,
    authorizeRemediation,
    cancelRemediation,
    resetIncident,
    bargeIn,
    startRunbook,
    advanceRunbook,
    abortRunbook,
    closePostMortem: () => setPostMortem(null)
  };
}
