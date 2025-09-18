export interface RealtimeSessionDetails {
  sessionId: string;
  model: string;
  clientSecret: {
    value: string;
    expiresAt: string;
  };
  iceServers: Array<{
    urls: string[];
    username?: string;
    credential?: string;
  }>;
  settings?: {
    requireManualMicEnable?: boolean;
    requireEnglishGreeting?: boolean;
  };
}

export interface GreetingTimeline {
  sessionCreatedAt?: number;
  offerCreatedAt?: number;
  answerReceivedAt?: number;
  audioStartedAt?: number;
  firstTranscriptAt?: number;
}

export interface GreetingSessionHandle {
  close: () => void;
  timeline: GreetingTimeline;
  setMicrophoneEnabled: (enabled: boolean) => void;
  sendImage: (image: Blob) => void;
  sendText: (text: string) => void;
}

export interface StartGreetingOptions {
  session: RealtimeSessionDetails;
  audioElement: HTMLAudioElement;
  onTranscript?: (text: string) => void;
  onStatus?: (message: string) => void;
  onError?: (error: Error) => void;
  onTimelineUpdate?: (timeline: GreetingTimeline) => void;
  onMicrophoneStateChange?: (enabled: boolean) => void;
}

const REALTIME_BASE =
  process.env.NEXT_PUBLIC_OPENAI_REALTIME_BASE ??
  "https://api.openai.com/v1/realtime";
const GREETING_SYSTEM_PROMPT =
  "You are the AI ophthalmology voice assistant greeting a patient under supervision of the on-call ophthalmologist. Keep tone warm, concise, and professional. Respond strictly in English and never switch languages, even if the patient does. Deliver a single concise greeting, confirm consent for an AI-assisted voice visit, and invite the patient to share their reason for today's appointment. After delivering the initial greeting, wait for the patient to respond before speaking again unless they request clarification or provide new information.";

type Speaker = "assistant" | "patient";

interface TranscriptSegment {
  speaker: Speaker;
  text: string;
  responseId?: string;
}

function extractTextDelta(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const base = payload as Record<string, unknown>;

  if (base.type === "response.output_text.delta") {
    const delta = base.delta;
    return typeof delta === "string" ? delta : undefined;
  }

  if (base.type === "response.audio_transcript.delta") {
    const delta = base.delta;
    return typeof delta === "string" ? delta : undefined;
  }

  if (base.type === "response.delta") {
    const rawDelta = base.delta;
    if (!rawDelta) {
      return undefined;
    }

    const pieces = Array.isArray(rawDelta) ? rawDelta : [rawDelta];
    return pieces
      .filter(
        (piece) =>
          piece &&
          typeof piece === "object" &&
          (piece as { type?: string }).type === "output_text_delta",
      )
      .map((piece) => (piece as { text?: string }).text ?? "")
      .join("");
  }

  if (base.type === "response.updated" && base.response) {
    const response = base.response as {
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    const textContent =
      response.output?.flatMap((item) => item.content ?? []) ?? [];
    return textContent
      .filter(
        (block) =>
          block.type === "output_text" && typeof block.text === "string",
      )
      .map((block) => block.text)
      .join("");
  }

  return undefined;
}

export async function startRealtimeGreeting({
  session,
  audioElement,
  onTranscript,
  onStatus,
  onError,
  onTimelineUpdate,
  onMicrophoneStateChange,
}: StartGreetingOptions): Promise<GreetingSessionHandle> {
  const timeline: GreetingTimeline = {
    sessionCreatedAt: performance.now(),
  };

  const notifyTimeline = () => {
    onTimelineUpdate?.({ ...timeline });
  };
  notifyTimeline();

  const requireManualMic = session.settings?.requireManualMicEnable ?? true;
  const autoEnableMic = !requireManualMic;

  const transcriptSegments: TranscriptSegment[] = [];
  const assistantSegmentIndexByResponse = new Map<string, number>();

  const shouldInsertSpace = (previous: string, next: string) => {
    if (!previous) {
      return false;
    }
    const lastChar = previous.slice(-1);
    if (/\s|[\(\[\{\"]/.test(lastChar)) {
      return false;
    }
    if (!next) {
      return false;
    }
    if (/^[,.;!?%)\]\}]/.test(next)) {
      return false;
    }
    return true;
  };

  const sanitizeText = (value: string) => value.replace(/\s+/g, " ").trim();

  const updateTranscriptOutput = () => {
    if (!onTranscript) {
      return;
    }
    const formatted = transcriptSegments
      .map((segment) => {
        const speakerLabel =
          segment.speaker === "assistant" ? "Assistant" : "Patient";
        return `${speakerLabel}: ${segment.text.trim()}`;
      })
      .join("\n\n");
    onTranscript(formatted);
  };

  const appendTranscript = (
    speaker: Speaker,
    fragment: string,
    responseId?: string,
  ) => {
    const normalized = sanitizeText(fragment);
    if (!normalized) {
      return;
    }

    const lastSegment = transcriptSegments[transcriptSegments.length - 1];
    if (
      lastSegment &&
      lastSegment.speaker === speaker &&
      (!responseId || lastSegment.responseId === responseId)
    ) {
      lastSegment.text = shouldInsertSpace(lastSegment.text, normalized)
        ? `${lastSegment.text} ${normalized}`
        : `${lastSegment.text}${normalized}`;
    } else {
      transcriptSegments.push({ speaker, text: normalized, responseId });
      if (speaker === "assistant" && responseId) {
        assistantSegmentIndexByResponse.set(
          responseId,
          transcriptSegments.length - 1,
        );
      }
    }

    updateTranscriptOutput();
  };

  const setAssistantTranscript = (responseId: string, text: string) => {
    const normalized = sanitizeText(text);
    if (!normalized) {
      return;
    }

    const segmentIndex = assistantSegmentIndexByResponse.get(responseId);
    if (segmentIndex === undefined) {
      transcriptSegments.push({
        speaker: "assistant",
        text: normalized,
        responseId,
      });
      assistantSegmentIndexByResponse.set(
        responseId,
        transcriptSegments.length - 1,
      );
    } else {
      transcriptSegments[segmentIndex].text = normalized;
    }
    updateTranscriptOutput();
  };

  const extractUserText = (item: unknown): string | undefined => {
    if (!item || typeof item !== "object") {
      return undefined;
    }

    const candidate = item as {
      content?: unknown[];
      formatted?: { text?: string; transcript?: string };
    };

    const collected: string[] = [];

    if (Array.isArray(candidate.content)) {
      for (const part of candidate.content) {
        if (!part || typeof part !== "object") {
          continue;
        }
        const record = part as Record<string, unknown>;
        if (typeof record.transcript === "string") {
          collected.push(record.transcript);
          continue;
        }
        if (Array.isArray(record.transcript)) {
          const joined = (record.transcript as unknown[])
            .filter((chunk): chunk is string => typeof chunk === "string")
            .join(" ");
          if (joined) {
            collected.push(joined);
            continue;
          }
        }
        if (typeof record.text === "string") {
          collected.push(record.text);
          continue;
        }
        if (typeof record.value === "string") {
          collected.push(record.value);
        }
      }

      if (collected.length === 0) {
        const firstPart = candidate.content[0];
        if (firstPart && typeof firstPart === "object") {
          const record = firstPart as Record<string, unknown>;
          const nested = record.content as unknown[] | undefined;
          if (Array.isArray(nested)) {
            const nestedText = nested
              .map((entry) => {
                if (!entry || typeof entry !== "object") {
                  return undefined;
                }
                const nestedRecord = entry as Record<string, unknown>;
                if (typeof nestedRecord.transcript === "string") {
                  return nestedRecord.transcript;
                }
                if (typeof nestedRecord.text === "string") {
                  return nestedRecord.text;
                }
                if (typeof nestedRecord.value === "string") {
                  return nestedRecord.value;
                }
                return undefined;
              })
              .filter((entry): entry is string => Boolean(entry))
              .join(" ");

            if (nestedText) {
              collected.push(nestedText);
            }
          }
        }
      }
    }

    if (collected.length > 0) {
      return sanitizeText(collected.join(" "));
    }

    if (candidate.formatted) {
      if (typeof candidate.formatted.transcript === "string") {
        return sanitizeText(candidate.formatted.transcript);
      }
      if (typeof candidate.formatted.text === "string") {
        return sanitizeText(candidate.formatted.text);
      }
    }

    return undefined;
  };

  const pc = new RTCPeerConnection({
    iceServers: session.iceServers,
  });

  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  const remoteStream = new MediaStream();
  pc.ontrack = (event) => {
    event.streams[0]
      .getTracks()
      .forEach((track) => remoteStream.addTrack(track));
    audioElement.srcObject = remoteStream;
    audioElement.play().catch(() => {
      onStatus?.("Click the play button to hear the assistant.");
    });
    if (!timeline.audioStartedAt) {
      timeline.audioStartedAt = performance.now();
      notifyTimeline();
    }
  };

  let transcriptBuffer = "";
  let controlChannel: RTCDataChannel | null = null;
  let localTracksEnabled = true;

  const disableLocalTracks = () => {
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    localTracksEnabled = false;
  };

  const enableLocalTracks = () => {
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    localTracksEnabled = true;
  };

  const setLocalMicState = (enabled: boolean, notify = true) => {
    if (enabled) {
      enableLocalTracks();
    } else {
      disableLocalTracks();
    }
    if (notify) {
      onMicrophoneStateChange?.(enabled);
    }
  };

  setLocalMicState(false, false);

  const sendGreetingSequence = () => {
    if (!controlChannel || controlChannel.readyState !== "open") {
      return;
    }

    const initEvents = [
      {
        type: "session.update",
        session: {
          instructions: GREETING_SYSTEM_PROMPT,
          modalities: ["text", "audio"],
        },
      },
      {
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          conversation: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: GREETING_SYSTEM_PROMPT,
                },
              ],
            },
          ],
          instructions:
            "Deliver the prepared ophthalmology greeting, confirm consent for the voice consult, and invite the patient to describe their symptoms. Respond strictly in English.",
        },
      },
    ];

    initEvents.forEach((eventPayload) =>
      controlChannel?.send(JSON.stringify(eventPayload)),
    );
  };

  const attachChannelListeners = (channel: RTCDataChannel) => {
    controlChannel = channel;

    channel.addEventListener("open", () => {
      onStatus?.("Voice channel open. Awaiting greeting...");
      sendGreetingSequence();
    });

    channel.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.debug("Realtime event", payload.type, payload);

        const responseId =
          typeof (payload as { response_id?: unknown }).response_id === "string"
            ? (payload as { response_id: string }).response_id
            : undefined;

        const delta = extractTextDelta(payload);
        if (delta) {
          appendTranscript("assistant", delta, responseId);
          if (!timeline.firstTranscriptAt) {
            timeline.firstTranscriptAt = performance.now();
            notifyTimeline();
          }
        }
        if (
          payload.type === "response.completed" ||
          payload.type === "response.finalized"
        ) {
          onStatus?.("Greeting delivered.");
        }
        if (
          payload.type === "response.audio_transcript.done" &&
          typeof payload.transcript === "string" &&
          responseId
        ) {
          setAssistantTranscript(responseId, payload.transcript);
          if (autoEnableMic && !localTracksEnabled) {
            setLocalMicState(true);
            onStatus?.("Greeting complete. Your microphone is live.");
          }
        }
        if (
          payload.type === "conversation.item.created" &&
          payload.item &&
          (payload.item as { role?: string }).role === "user"
        ) {
          const userText = extractUserText(payload.item);
          if (userText) {
            appendTranscript("patient", userText);
          }
        }
      } catch (error) {
        console.debug("Non-JSON event", event.data);
      }
    });

    channel.addEventListener("error", () => {
      onError?.(new Error("Realtime channel error"));
    });
  };

  const proactiveChannel = pc.createDataChannel("oai-events");
  attachChannelListeners(proactiveChannel);

  pc.ondatachannel = (event) => {
    if (
      event.channel.label === "oai-events" &&
      controlChannel !== event.channel
    ) {
      attachChannelListeners(event.channel);
    }
  };

  pc.onconnectionstatechange = () => {
    onStatus?.(`Connection state: ${pc.connectionState}`);
    if (
      pc.connectionState === "failed" ||
      pc.connectionState === "disconnected"
    ) {
      onError?.(new Error(`Connection ${pc.connectionState}`));
    }
  };

  const cleanup = () => {
    try {
      controlChannel?.close();
    } catch (error) {
      /* noop */
    }
    setLocalMicState(false);
    pc.close();
    localStream.getTracks().forEach((track) => track.stop());
  };

  try {
    const offer = await pc.createOffer();
    timeline.offerCreatedAt = performance.now();
    notifyTimeline();
    await pc.setLocalDescription(offer);

    const sdpResponse = await fetch(
      `${REALTIME_BASE}?model=${encodeURIComponent(session.model)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.clientSecret.value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      },
    );

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text();
      throw new Error(`Failed to complete WebRTC handshake: ${errorText}`);
    }

    const answer = await sdpResponse.text();
    timeline.answerReceivedAt = performance.now();
    notifyTimeline();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });

    if (!controlChannel) {
      const waitForChannel = await new Promise<boolean>((resolve) => {
        const started = performance.now();
        const timeoutMs = 5000;

        const poll = () => {
          if (controlChannel) {
            resolve(true);
            return;
          }
          if (performance.now() - started > timeoutMs) {
            resolve(false);
            return;
          }
          setTimeout(poll, 50);
        };

        poll();
      });

      if (waitForChannel) {
        sendGreetingSequence();
      } else {
        onStatus?.("Realtime channel unavailable.");
      }
    }
  } catch (error) {
    cleanup();
    throw error;
  }

  const sendImage = (image: Blob) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Image = (reader.result as string).split(",")[1];
      const event = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_image",
              image: base64Image,
              detail: "high",
            },
          ],
        },
      };
      controlChannel?.send(JSON.stringify(event));
    };
    reader.readAsDataURL(image);
  };

  const sendText = (text: string) => {
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text,
          },
        ],
      },
    };
    controlChannel?.send(JSON.stringify(event));
  };

  return {
    close: cleanup,
    timeline,
    setMicrophoneEnabled: (enabled: boolean) => {
      setLocalMicState(enabled);
    },
    sendImage,
    sendText,
  };
}
