"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./page.module.css";
import { createRealtimeSession, login } from "../lib/api";
import {
  GreetingSessionHandle,
  GreetingTimeline,
  startRealtimeGreeting,
} from "../lib/realtime";

type SessionStage = "signedOut" | "ready" | "connecting" | "connected";

const initialFormState = {
  username: "",
  password: "",
  dob: "",
};

export default function HomePage() {
  const [formState, setFormState] = useState(initialFormState);
  const [sessionStage, setSessionStage] = useState<SessionStage>("signedOut");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "Sign in to start your voice visit.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [timeline, setTimeline] = useState<GreetingTimeline>({});
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micControlAvailable, setMicControlAvailable] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [chatInput, setChatInput] = useState("");

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionHandleRef = useRef<GreetingSessionHandle | null>(null);

  useEffect(() => {
    return () => {
      sessionHandleRef.current?.close();
    };
  }, []);

  const updateFormField =
    (field: keyof typeof initialFormState) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setFormState((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleAuthentication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage("Authenticating...");
    try {
      const response = await login({
        username: formState.username,
        password: formState.password,
        dob: formState.dob,
      });
      setAuthToken(response.accessToken);
      setSessionStage("ready");
      setStatusMessage(
        "Authenticated. When you are ready, connect to your voice assistant.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to authenticate.",
      );
      setStatusMessage("Sign in to start your voice visit.");
    } finally {
      setLoading(false);
    }
  };

  const handleRealtimeError = useCallback((error: Error) => {
    setErrorMessage(error.message);
    setStatusMessage("Session interrupted. You can reconnect when ready.");
    if (sessionHandleRef.current) {
      sessionHandleRef.current.setMicrophoneEnabled(false);
      sessionHandleRef.current.close();
    }
    sessionHandleRef.current = null;
    setSessionStage("ready");
    setMicControlAvailable(false);
    setMicEnabled(false);
  }, []);

  const handleStartSession = async () => {
    if (!authToken || !audioRef.current || !videoRef.current) {
      setErrorMessage("Audio or video device or authentication missing.");
      return;
    }

    setSessionStage("connecting");
    setStatusMessage("Requesting voice session...");
    setErrorMessage(null);
    setTranscript("");
    setTimeline({});
    setMicControlAvailable(false);
    setMicEnabled(false);

    try {
      const realtimeSession = await createRealtimeSession(authToken);
      const requireManualMic =
        realtimeSession.settings?.requireManualMicEnable ?? true;
      const handle = await startRealtimeGreeting({
        session: realtimeSession,
        audioElement: audioRef.current,
        videoElement: videoRef.current,
        onTranscript: (text) => setTranscript(text),
        onStatus: (message) => setStatusMessage(message),
        onError: handleRealtimeError,
        onTimelineUpdate: (currentTimeline) => setTimeline(currentTimeline),
        onMicrophoneStateChange: (enabled) => {
          setMicEnabled(enabled);
          if (!requireManualMic) {
            setStatusMessage(
              enabled
                ? "Microphone live. You can speak with the assistant."
                : "Microphone muted.",
            );
          }
        },
      });

      setTimeline({ ...handle.timeline });
      sessionHandleRef.current = handle;
      handle.setMicrophoneEnabled(false);
      setMicControlAvailable(requireManualMic);
      setMicEnabled(false);
      setSessionStage("connected");
      setStatusMessage(
        requireManualMic
          ? "Assistant connected. The greeting will play shortly. Enable the microphone when you're ready to speak."
          : "Assistant connected. The greeting will play shortly. Your microphone will turn on automatically after the greeting.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to start voice session.",
      );
      setStatusMessage("Unable to open voice session. Please try again.");
      setSessionStage("ready");
      setMicControlAvailable(false);
      setMicEnabled(false);
    }
  };

  const handleStopSession = () => {
    if (sessionHandleRef.current) {
      sessionHandleRef.current.setMicrophoneEnabled(false);
      sessionHandleRef.current.close();
    }
    sessionHandleRef.current = null;
    setSessionStage("ready");
    setStatusMessage("Session closed. Connect again when ready.");
    setMicControlAvailable(false);
    setMicEnabled(false);
  };

  const toggleMicrophone = () => {
    if (!sessionHandleRef.current) {
      return;
    }
    const nextState = !micEnabled;
    sessionHandleRef.current.setMicrophoneEnabled(nextState);
    setStatusMessage(
      nextState
        ? "Microphone live. You can speak with the assistant."
        : "Microphone muted. Press enable when you're ready to speak.",
    );
  };

  const sessionMetrics = useMemo(() => {
    const base = timeline.sessionCreatedAt ?? 0;
    const formatDelta = (value?: number) => {
      if (!value || !base) return "--";
      return `${((value - base) / 1000).toFixed(2)}s`;
    };

    return [
      { label: "Offer Created", value: formatDelta(timeline.offerCreatedAt) },
      {
        label: "Answer Received",
        value: formatDelta(timeline.answerReceivedAt),
      },
      { label: "Audio Started", value: formatDelta(timeline.audioStartedAt) },
      {
        label: "Text First Byte",
        value: formatDelta(timeline.firstTranscriptAt),
      },
    ];
  }, [timeline]);

  const handleCaptureImage = () => {
    if (!videoRef.current || !sessionHandleRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        sessionHandleRef.current?.sendImage(blob);
      }
    }, "image/jpeg");
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDocumentUpload = async () => {
    if (!selectedFile || !sessionHandleRef.current) {
      return;
    }

    const pdfjs = await import("pdfjs-dist/build/pdf");
    pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result) {
        const pdf = await pdfjs.getDocument({ data: event.target.result as ArrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        }
        sessionHandleRef.current?.sendText(text);
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleSendChat = () => {
    if (!chatInput || !sessionHandleRef.current) {
      return;
    }
    sessionHandleRef.current.sendText(chatInput);
    setChatInput("");
  };

  return (
    <main className={styles.main}>
      <section className={`${styles.card} ${styles.title}`}>
        <h1>Ophthalmology Voice Assistant Spike</h1>
        <p>{statusMessage}</p>
      </section>

      <section className={styles.layout}>
        <div className={styles.card}>
          {sessionStage === "signedOut" ? (
            <form className={styles.form} onSubmit={handleAuthentication}>
              <div className={styles.fieldset}>
                <label className={styles.label} htmlFor="username">
                  Username (email)
                </label>
                <input
                  id="username"
                  name="username"
                  type="email"
                  autoComplete="email"
                  className={styles.input}
                  value={formState.username}
                  onChange={updateFormField("username")}
                  required
                />
              </div>

              <div className={styles.fieldset}>
                <label className={styles.label} htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className={styles.input}
                  value={formState.password}
                  onChange={updateFormField("password")}
                  required
                />
              </div>

              <div className={styles.fieldset}>
                <label className={styles.label} htmlFor="dob">
                  Date of birth
                </label>
                <input
                  id="dob"
                  name="dob"
                  type="date"
                  className={styles.input}
                  value={formState.dob}
                  onChange={updateFormField("dob")}
                  required
                />
              </div>

              <button
                className={styles.buttonPrimary}
                type="submit"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <div className={styles.status}>
              <div className={styles.statusRow}>
                <span>Stage</span>
                <span>{sessionStage}</span>
              </div>
              <div className={styles.statusRow}>
                <span>Transcript</span>
                <span>{transcript ? "Streaming" : "Waiting"}</span>
              </div>

              <div>
                <button
                  className={styles.buttonPrimary}
                  type="button"
                  onClick={handleStartSession}
                  disabled={sessionStage !== "ready"}
                >
                  {sessionStage === "connecting"
                    ? "Connecting..."
                    : sessionStage === "connected"
                      ? "Connected"
                      : "Connect to Voice Session"}
                </button>
                {sessionStage === "connected" && (
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    onClick={handleStopSession}
                    style={{ marginLeft: "0.75rem" }}
                  >
                    End Session
                  </button>
                )}
                {sessionStage === "connected" && micControlAvailable && (
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    onClick={toggleMicrophone}
                    style={{ marginLeft: "0.75rem" }}
                  >
                    {micEnabled ? "Mute Microphone" : "Enable Microphone"}
                  </button>
                )}
                {sessionStage === "connected" && (
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    onClick={handleCaptureImage}
                    style={{ marginLeft: "0.75rem" }}
                  >
                    Capture Image
                  </button>
                )}
                <div style={{ marginTop: "1rem" }}>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                  />
                  <button
                    className={styles.buttonSecondary}
                    onClick={handleDocumentUpload}
                    disabled={!selectedFile || sessionStage !== "connected"}
                  >
                    Upload Document
                  </button>
                </div>
              </div>
            </div>
          )}

          {errorMessage && <p className={styles.error}>{errorMessage}</p>}

          <audio className={styles.audioControl} ref={audioRef} controls />
          <video
            className={styles.videoControl}
            ref={videoRef}
            autoPlay
            playsInline
            muted
          />
        </div>

        <div className={styles.card}>
          <h2>Assistant Transcript</h2>
          <div className={styles.transcript}>
            {transcript ||
              "Assistant transcript will appear here once the greeting begins."}
          </div>
          <div className={styles.chatInputContainer}>
            <input
              type="text"
              className={styles.chatInput}
              placeholder="Type a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
            />
            <button
              className={styles.buttonSecondary}
              onClick={handleSendChat}
              disabled={!chatInput || sessionStage !== "connected"}
            >
              Send
            </button>
          </div>

          <h3 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>
            Latency Metrics
          </h3>
          <div className={styles.metrics}>
            {sessionMetrics.map((metric) => (
              <div className={styles.metricCard} key={metric.label}>
                <span className={styles.metricLabel}>{metric.label}</span>
                <span className={styles.metricValue}>{metric.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
