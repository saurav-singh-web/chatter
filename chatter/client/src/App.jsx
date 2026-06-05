import { useEffect, useRef, useState, useCallback } from 'react'
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom'
import './App.css'
import blurBg from './assets/blur.jpeg'
import clearBg from './assets/clear.jpeg'
import EmojiPicker from 'emoji-picker-react';



function formatTime(timestamp) {
  const now = Date.now();
  const diff = Math.floor((now - timestamp) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

  return new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function formatLastActive(timestamp) {
  if (!timestamp) return "active recently";
  const date = new Date(timestamp);

  // Format exact time (12-hour AM/PM style)
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return `active today at ${timeStr}`;
  }
  if (isYesterday) {
    return `active yesterday at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `active on ${dateStr} at ${timeStr}`;
}

function MessageTicks({ msg, username }) {
  const isMe = msg.from === username || msg.username === username;
  if (!isMe) return null;

  const isRead = Array.isArray(msg.readBy) && msg.readBy.length > 0;
  const isDelivered = msg.received === true;
  const isSent = msg.delivered === true;
  const isPending = !isSent && !isDelivered && !isRead;

  return (
    <span className="ml-1 flex items-center">
      {isRead ? (
        // blue double tick
        <span className="text-sky-400 text-[12px] font-bold">✓✓</span>
      ) : isDelivered ? (
        // grey double tick
        <span className="text-white/60 text-[12px] font-bold">✓✓</span>
      ) : isSent ? (
        // grey single tick
        <span className="text-white/60 text-[12px] font-bold">✓</span>
      ) : (
        // pending clock
        <span className="text-white/40 text-[11px]">🕐</span>
      )}
    </span>
  );
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const socketRef = useRef(null);
  const audioCtxRef = useRef(null);
  const [username, setUsername] = useState(() => localStorage.getItem("chatter_user") || "");
  const [avatar, setAvatar] = useState(() => localStorage.getItem("chatter_avatar") || "");
  const [joined, setJoined] = useState(() => !!localStorage.getItem("chatter_user"));
  const [messages, setMessages] = useState({ general: [], });
  const [text, setText] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioPreview, setAudioPreview] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const bottomRef = useRef(null);
  const [typingUser, setTypingUser] = useState("");
  const typingTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [activeChat, setActiveChat] = useState(() => localStorage.getItem("chatter_active_chat") || "general");
  const [unreadCounts, setUnreadCounts] = useState({});
  const activeChatRef = useRef(localStorage.getItem("chatter_active_chat") || "general");
  const messagesContainerRef = useRef(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const isPrependingRef = useRef(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const touchTimeoutRef = useRef(null);
  const touchStartPosRef = useRef({ x: 0, y: 0 });
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [facingMode, setFacingMode] = useState("user");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState(() => {
    return ("Notification" in window) ? Notification.permission : "default";
  });

  useEffect(() => {
    const initAudio = () => {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
    };

    window.addEventListener("click", initAudio);
    window.addEventListener("keydown", initAudio);
    return () => {
      window.removeEventListener("click", initAudio);
      window.removeEventListener("keydown", initAudio);
    };
  }, []);

  useEffect(() => {
    if (joined && "Notification" in window) {
      if (Notification.permission === "default") {
        setTimeout(() => {
          setShowNotificationModal(true);
        }, 0);
      }
    }
  }, [joined]);

  const requestNotificationPermission = () => {
    if (!("Notification" in window)) return;

    Notification.requestPermission().then((permission) => {
      setPermissionStatus(permission);
      if (permission === "granted") {
        setShowNotificationModal(false);
        new Notification("Notifications Enabled! 🎉", {
          body: "You will now receive alerts for incoming messages, even in the background!",
          icon: "/favicon.svg"
        });
      } else if (permission === "denied") {
        setShowNotificationModal(false);
        setShowTutorialModal(true);
      }
    });
  };

  const playNotificationSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }

      const ctx = audioCtxRef.current;
      if (!ctx) return;

      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(659.25, now + 0.08);
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.setValueAtTime(0, now + 0.08);
      gain2.gain.linearRampToValueAtTime(0.12, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.4);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.5);
    } catch (e) {
      console.error("Audio playback failed:", e);
    }
  }, []);

  const triggerLocalNotification = useCallback((title, body, sender) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const options = {
      body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: `chat-${sender}`,
      data: { sender },
      requireInteraction: false
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, options);
      }).catch((err) => {
        console.error("SW not ready for notification:", err);
        try {
          new Notification(title, options);
        } catch (e) {
          console.error("Local notification constructor error:", e);
        }
      });
    } else {
      try {
        const notification = new Notification(title, options);
        notification.onclick = () => {
          window.focus();
          navigate(`/chat/${sender}`);
          notification.close();
        };
      } catch (e) {
        console.error("Local notification constructor error:", e);
      }
    }
  }, [navigate]);

  useEffect(() => {
    activeChatRef.current = activeChat;
    localStorage.setItem("chatter_active_chat", activeChat);
  }, [activeChat]);

  // Sync active chat state when the URL path changes directly
  useEffect(() => {
    if (!joined) return;

    const match = location.pathname.match(/^\/chat\/([^/]+)$/);
    if (match) {
      const chatId = match[1];
      if (chatId !== activeChat) {
        setActiveChat(chatId);
        setUnreadCounts((prev) => ({ ...prev, [chatId]: 0 }));
        if (chatId !== "general") {
          fetchPrivateHistory(chatId);
        }
      }
    }
  }, [location.pathname, joined, activeChat]);

  // Handle click navigation messages sent from Service Worker
  useEffect(() => {
    const handleSWMessage = (event) => {
      if (event.data && event.data.type === "navigate") {
        const chat = event.data.chat;
        navigate(`/chat/${chat}`);
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSWMessage);
    }
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSWMessage);
      }
    };
  }, [navigate]);
  const [authMode, setAuthMode] = useState("login");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const usernameRef = useRef("");
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let socket;
    let reconnectTimeout = null;
    let isComponentMounted = true;

    function connect() {
      if (!isComponentMounted) return;

      console.log("Connecting to WebSocket...");
      socket = new WebSocket(
        import.meta.env.VITE_WS_URL ||
        `ws${location.protocol === 'https:' ? 's' : ''}://${location.host}`
      );
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("Connected to Chatter server! ✅");

        const savedUser = localStorage.getItem("chatter_user");
        const isFreshLogin = localStorage.getItem("chatter_fresh_login");

        if (savedUser) {
          setUsername(savedUser);
          setAvatar(localStorage.getItem("chatter_avatar") || "");
          usernameRef.current = savedUser;
          setJoined(true);
          socket.send(JSON.stringify({ type: "join", username: savedUser, showNotification: isFreshLogin === "true" }));

          localStorage.removeItem("chatter_fresh_login");

          const currentActiveChat = localStorage.getItem("chatter_active_chat") || "general";
          if (currentActiveChat !== "general") {
            fetchPrivateHistory(currentActiveChat);
          }
        }
      };

      socket.onmessage = async (event) => {
        const raw = event.data instanceof Blob ? await event.data.text() : event.data;
        if (!raw || raw.trim() === "") return;

        const parsed = JSON.parse(raw);
        console.log("All incoming:", parsed);

        if (parsed.type === "auth_invalid") {
          console.warn("Authentication failed or user deleted:", parsed.error);
          localStorage.removeItem("chatter_user");
          localStorage.removeItem("chatter_avatar");
          localStorage.removeItem("chatter_fresh_login");
          localStorage.removeItem("chatter_active_chat");
          setJoined(false);
          setUsername("");
          setPassword("");
          setMessages({ general: [] });
          setActiveChat("general");
          setOnlineUsers([]);
          navigate("/");
          return;
        }

        if (parsed.type === "messages_read") {
          console.log("🔵 MESSAGES READ EVENT:", parsed);
        }

        if (parsed.type === "users_list") {
          setOnlineUsers(parsed.users);
        } else if (parsed.type === "all_users_list") {
          setAllUsers(parsed.users);
        } else if (parsed.type === "typing") {
          setTypingUser(parsed.username);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setTypingUser(""), 2000);
        } else if (parsed.type === "history") {
          setMessages((prev) => ({ ...prev, general: parsed.messages }));
        } else if (parsed.type === "message") {
          setMessages((prev) => ({
            ...prev,
            general: [...(prev.general || []), parsed],
          }));
          if (parsed.username !== usernameRef.current) {
            const notifText = parsed.text
              ? `${parsed.username}: ${parsed.text}`
              : parsed.image
                ? `${parsed.username}: 📷 Sent a photo`
                : parsed.audio
                  ? `${parsed.username}: 🎙️ Sent a voice note`
                  : `${parsed.username}: 📁 Shared a file`;
            if (document.visibilityState === "hidden") {
              triggerLocalNotification(`New message in #general`, notifText, "general");
            } else {
              playNotificationSound();
              if (activeChatRef.current !== "general") {
                triggerLocalNotification(`New message in #general`, notifText, "general");
              }
            }
          }
        } else if (parsed.type === "message_delivered") {
          setMessages((prev) => {
            const updated = { ...prev };
            Object.keys(updated).forEach((chatKey) => {
              updated[chatKey] = (updated[chatKey] || []).map((m) =>
                m._id === parsed._id ? { ...m, received: true } : m
              );
            });
            return updated;
          });
        }
        else if (parsed.type === "private_message") {
          const chatKey = parsed.from === usernameRef.current ? parsed.to : parsed.from;

          setMessages((prev) => {
            const existingMessages = prev[chatKey] || [];
            const alreadyExists = existingMessages.some((m) => m._id === parsed._id);

            return {
              ...prev,
              [chatKey]: alreadyExists
                ? existingMessages
                : [...existingMessages, { ...parsed, readBy: parsed.readBy || [] }],
            };
          });

          // ✅ Auto mark as read if:
          // 1. Message is FROM someone else (not me)
          // 2. That chat is currently open
          // 3. Tab is visible and focused
          if (
            parsed.from !== usernameRef.current &&
            activeChatRef.current === parsed.from &&
            document.visibilityState === "visible"
          ) {
            console.log("✅ Chat is open — auto marking as read immediately");
            if (socketRef.current?.readyState === 1) {
              socketRef.current.send(JSON.stringify({
                type: "mark_read",
                chatWith: parsed.from,
              }));
            }
          }

          // notifications and unread count
          if (parsed.from !== usernameRef.current) {
            const notifText = parsed.text
              ? parsed.text
              : parsed.image ? "📷 Sent a photo"
                : parsed.audio ? "🎙️ Sent a voice note"
                  : "📁 Shared a file";

            if (document.visibilityState === "hidden") {
              triggerLocalNotification(`Message from @${parsed.from}`, notifText, parsed.from);
            } else {
              playNotificationSound();
              if (activeChatRef.current !== parsed.from) {
                triggerLocalNotification(`Message from @${parsed.from}`, notifText, parsed.from);
              }
            }

            // only increment unread if chat is NOT open
            if (activeChatRef.current !== chatKey) {
              setUnreadCounts((prev) => ({
                ...prev,
                [chatKey]: (prev[chatKey] || 0) + 1,
              }));
            }
          }
        } else if (parsed.type === "notification") {
          setMessages((prev) => ({
            ...prev,
            general: [...(prev.general || []), parsed],
          }));
        } else if (parsed.type === "message_edited") {
          setMessages((prev) => {
            const chatKey = parsed.chatType === "message" ? "general" : activeChatRef.current;
            return {
              ...prev,
              [chatKey]: (prev[chatKey] || []).map((m) =>
                m._id === parsed._id ? { ...m, text: parsed.text, edited: true } : m
              ),
            };
          });
        } else if (parsed.type === "message_deleted") {
          setMessages((prev) => {
            const chatKey = parsed.chatType === "message" ? "general" : activeChatRef.current;
            return {
              ...prev,
              [chatKey]: (prev[chatKey] || []).filter((m) => m._id !== parsed._id),
            };
          });
        } else if (parsed.type === "message_sent") {
          setMessages((prev) => {
            const updated = { ...prev };
            Object.keys(updated).forEach((chatKey) => {
              updated[chatKey] = (updated[chatKey] || []).map((m) =>
                m._id === parsed.tempId
                  ? { ...m, _id: parsed._id, delivered: true, readBy: m.readBy || [] }
                  : m
              );
            });
            return updated;
          });
        } else if (parsed.type === "messages_read") {
          console.log("messages_read received:", parsed);

          const isMeReader = parsed.by === usernameRef.current;
          const chatKey = isMeReader ? parsed.chatWith : parsed.by;

          if (isMeReader) {
            setUnreadCounts((prev) => ({
              ...prev,
              [chatKey]: 0,
            }));
          }

          setMessages((prev) => {
            return {
              ...prev,
              [chatKey]: (prev[chatKey] || []).map((m) => {
                const shouldMarkRead = isMeReader
                  ? (m.from === chatKey || m.username === chatKey)
                  : (m.from === usernameRef.current || m.username === usernameRef.current);

                if (shouldMarkRead) {
                  return { ...m, readBy: [...new Set([...(m.readBy || []), parsed.by])] };
                }
                return m;
              }),
            };
          });
        }
      };

      socket.onclose = () => {
        console.log("Disconnected from server ❌");
        if (isComponentMounted) {
          console.log("Scheduling reconnect in 3s...");
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      isComponentMounted = false;
      if (socket) socket.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [triggerLocalNotification, playNotificationSound]);

  useEffect(() => {
    if (!isPrependingRef.current && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
    isPrependingRef.current = false;
  }, [messages, activeChat]);

  useEffect(() => {
    if (!joined || activeChat === "general") return;

    const sendMarkRead = () => {
      if (socketRef.current?.readyState === 1) {
        console.log("✅ Sending mark_read for:", activeChat);
        socketRef.current.send(JSON.stringify({
          type: "mark_read",
          chatWith: activeChat,
        }));
      } else {
        console.log("❌ Socket not ready, retrying...");
        setTimeout(sendMarkRead, 500); // retry after 500ms
      }
    };

    sendMarkRead();
  }, [activeChat, joined])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (socketRef.current?.readyState === 1 && joined && username) {
        socketRef.current.send(JSON.stringify({
          type: "visibility",
          username,
          status: document.visibilityState,
        }));
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [joined, username]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const handleScroll = async () => {
    if (!messagesContainerRef.current) return;

    if (messagesContainerRef.current.scrollTop === 0 && !loadingHistory) {
      const chatMessages = messages[activeChat] || [];
      if (chatMessages.length === 0) return;

      const oldestMessage = chatMessages[0];
      setLoadingHistory(true);

      try {
        let endpoint = `${import.meta.env.VITE_API_URL || ''}/history/group?before=${oldestMessage.timestamp}`;
        if (activeChat !== "general") {
          endpoint = `${import.meta.env.VITE_API_URL || ''}/history/private?user1=${usernameRef.current}&user2=${activeChat}&before=${oldestMessage.timestamp}`;
        }

        const res = await fetch(endpoint);
        const olderMessages = await res.json();

        if (Array.isArray(olderMessages) && olderMessages.length > 0) {
          isPrependingRef.current = true;
          const previousHeight = messagesContainerRef.current.scrollHeight;

          setMessages((prev) => ({
            ...prev,
            [activeChat]: [...olderMessages, ...(prev[activeChat] || [])],
          }));

          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight - previousHeight;
            }
          }, 0);
        }
      } catch (err) {
        console.error("Error fetching older messages", err);
      }
      setLoadingHistory(false);
    }
  };

  const handleAuth = async () => {
    if (!username.trim() || !password.trim()) {
      setAuthError("All fields are required");
      return;
    }

    if (authMode === "register") {
      const usernameRegex = /^[a-zA-Z0-9_-]{3,15}$/;
      if (!usernameRegex.test(username)) {
        setAuthError("Username must be 3-15 characters and contain only letters, numbers, underscores, or hyphens");
        return;
      }
      if (password.length < 6) {
        setAuthError("Password must be at least 6 characters long");
        return;
      }
    }

    const endpoint = authMode === "login" ? "/login" : "/register";

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}${endpoint}`, {

        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (data.error) {
        setAuthError(data.error);
        return;
      }


      localStorage.setItem("chatter_user", data.username);
      localStorage.setItem("chatter_avatar", data.avatar || "");
      localStorage.setItem("chatter_fresh_login", "true");

      setUsername(data.username);   // set state
      setAvatar(data.avatar || "");
      usernameRef.current = data.username;
      setJoined(true);
      // success — join the WebSocket chat
      socketRef.current.send(JSON.stringify({
        type: "join",
        username: data.username,
        showNotification: true,
      }));
      navigate("/chats");
    } catch (err) {
      console.error("Auth error:", err);
      setAuthError("Something went wrong. Try again.");
    }
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      alert("Image must be under 4MB!");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target.result;
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/user/avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, avatar: base64 }),
        });
        const data = await res.json();
        if (data.success) {
          setAvatar(data.avatar);
          localStorage.setItem("chatter_avatar", data.avatar);
        } else {
          console.error("Avatar upload failed:", data.error);
        }
      } catch (err) {
        console.error("Avatar upload error:", err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert("Image must be under 8MB!");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert("File size must be under 15MB!");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedFile({
        name: file.name,
        type: file.type,
        size: file.size,
        data: event.target.result,
      });
    };
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        const previewUrl = URL.createObjectURL(blob);
        setAudioPreview(previewUrl);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions!");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };
  const handleSend = () => {
    if (!text.trim() && !selectedImage && !selectedFile && !audioBlob) return;

    const tempId = "temp-" + Date.now();

    // Staged Live Audio Note Case
    if (audioBlob) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Audio = reader.result;
        if (activeChat === "general") {
          const message = {
            _id: tempId,
            type: "message",
            username,
            text: text.trim(),
            audio: base64Audio,
            timestamp: Date.now(),
          };
          socketRef.current.send(JSON.stringify({ type: "message", text: text.trim(), audio: base64Audio, tempId }));
          setMessages((prev) => ({
            ...prev,
            general: [...(prev.general || []), message],
          }));
        } else {
          const message = {
            _id: tempId,
            type: "private_message",
            from: username,
            to: activeChat,
            text: text.trim(),
            audio: base64Audio,
            timestamp: Date.now(),
          };
          socketRef.current.send(JSON.stringify({
            type: "private_message",
            to: activeChat,
            text: text.trim(),
            audio: base64Audio,
            tempId,
          }));
          setMessages((prev) => ({
            ...prev,
            [activeChat]: [...(prev[activeChat] || []), message],
          }));
        }
        setAudioBlob(null);
        setAudioPreview(null);
        setText("");
      };
      reader.readAsDataURL(audioBlob);
      setReplyTo(null);
      return;
    }

    if (activeChat === "general") {
      const message = {
        _id: tempId,
        type: "message",
        username,
        text,
        image: selectedImage || "",
        file: selectedFile || null,
        timestamp: Date.now(),
        replyTo: replyTo || null,
        readBy: [],
      };
      socketRef.current.send(JSON.stringify({ type: "message", text, image: selectedImage || "", file: selectedFile || null, replyTo, tempId }));
      setMessages((prev) => ({
        ...prev,
        general: [...(prev.general || []), message],
      }));
    } else {
      const message = {
        _id: tempId,
        type: "private_message",
        from: username,
        to: activeChat,
        text,
        image: selectedImage || "",
        file: selectedFile || null,
        timestamp: Date.now(),
        replyTo: replyTo || null,
        readBy: [],
      };
      socketRef.current.send(JSON.stringify({
        type: "private_message",
        to: activeChat,
        text,
        image: selectedImage || "",
        file: selectedFile || null,
        replyTo,
        tempId,
      }));
      setMessages((prev) => ({
        ...prev,
        [activeChat]: [...(prev[activeChat] || []), message],
      }));
    }

    setReplyTo(null);
    setText("");
    setSelectedImage(null);
    setSelectedFile(null);
  };

  async function fetchPrivateHistory(otherUser) {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/history/private?user1=${usernameRef.current}&user2=${otherUser}`
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages((prev) => ({
          ...prev,
          [otherUser]: data,
        }));
      } else {
        console.error("Invalid history response (not an array):", data);
      }
    } catch (err) {
      console.error("Error fetching private history:", err);
    }
  }
  const handleRightClick = (e, msg) => {
    e.preventDefault(); // stop browser context menu
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      msg,
    });
  };

  const handleIconClick = (e, msg) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const isMe = msg.username === username || msg.from === username;

    setContextMenu({
      x: isMe
        ? rect.left + window.scrollX - 130
        : rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 5,
      msg,
    });
  };

  const handleTouchStart = (e, msg) => {
    if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);

    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    touchTimeoutRef.current = setTimeout(() => {
      setContextMenu({
        x: Math.min(touch.clientX, window.innerWidth - 180),
        y: touch.clientY + 10,
        msg,
      });

      if (navigator.vibrate) {
        navigator.vibrate(40); // 40ms high-fidelity haptic vibration
      }
    }, 550); // 550ms tap-and-hold
  };

  const handleTouchMove = (e) => {
    if (!touchTimeoutRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPosRef.current.x;
    const dy = touch.clientY - touchStartPosRef.current.y;

    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL || ''}/message/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      setContextMenu(null);
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleEditSubmit = async () => {
    if (!editText.trim()) return;

    try {
      await fetch(`${import.meta.env.VITE_API_URL || ''}/message/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editText, username }),
      });
      setEditingId(null);
      setEditText("");
    } catch (err) {
      console.error("Edit error:", err);
    }
  };

  const openCamera = async (facing = facingMode) => {
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      setCameraStream(stream);
      setShowCamera(true);
      setCapturedPhoto(null);
    } catch (err) {
      console.error("Camera error:", err);
      alert("Could not access camera. Please check permissions!");
    }
  };
  const flipCamera = () => {
    const newFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newFacing);
    openCamera(newFacing);
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
    setCapturedPhoto(null);
  };
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream, showCamera]);

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const photo = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedPhoto(photo);

    // stop the stream after capture
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const sendCapturedPhoto = () => {
    if (!capturedPhoto) return;
    setSelectedImage(capturedPhoto);
    closeCamera();
  };

  const onEmojiClick = (emojiData) => {
    setText((prev) => prev + emojiData.emoji);
  };

  const AuthUI = (
    <div
      className="relative min-h-screen w-full flex flex-col items-center justify-center px-6 py-12 overflow-hidden bg-[#07030e]"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Top right glow */}
      <div className="absolute top-[-25%] right-[-15%] w-[80%] h-[80%] rounded-full blur-[140px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(217,70,239,0.15) 0%, rgba(147,51,234,0.12) 40%, transparent 70%)' }}></div>
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[90px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(217,70,239,0.25) 0%, transparent 60%)' }}></div>

      {/* Bottom left glow */}
      <div className="absolute bottom-[-20%] left-[-20%] w-[70%] h-[70%] rounded-full blur-[130px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,45,85,0.15) 0%, transparent 70%)' }}></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[80px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,45,85,0.2) 0%, transparent 60%)' }}></div>

      {/* Tiny stars */}
      <div className="absolute top-[20%] right-[15%] w-[3px] h-[3px] bg-white rounded-full shadow-[0_0_8px_2px_rgba(255,255,255,0.8)] opacity-80"></div>
      <div className="absolute top-[32%] right-[22%] w-[2px] h-[2px] bg-[#ff2d55] rounded-full shadow-[0_0_6px_2px_rgba(255,45,85,0.6)] opacity-70"></div>
      <div className="absolute bottom-[28%] right-[15%] w-[2px] h-[2px] bg-white rounded-full shadow-[0_0_5px_1px_rgba(255,255,255,0.5)] opacity-40"></div>
      <div className="absolute bottom-[8%] right-[28%] w-[3px] h-[3px] bg-[#d946ef] rounded-full shadow-[0_0_8px_2px_rgba(217,70,239,0.8)] opacity-80"></div>
      <div className="absolute top-[45%] left-[8%] w-[2px] h-[2px] bg-white rounded-full opacity-30"></div>

      {/* Glowing edges overlay */}
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full border-[1px] border-[rgba(255,255,255,0.02)] pointer-events-none" style={{ boxShadow: 'inset 0 0 40px rgba(217,70,239,0.1)' }}></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full border-[1px] border-[rgba(255,255,255,0.02)] pointer-events-none" style={{ boxShadow: 'inset 0 0 40px rgba(255,45,85,0.1)' }}></div>

      <div className="relative z-10 w-full max-w-[400px] mx-auto flex flex-col justify-center items-center gap-7 py-8">

        {/* Header Section */}
        <div className="flex items-center justify-center gap-4 mb-2 w-full">
          {/* Logo */}
          <div className="w-[48px] h-[48px] bg-[#160f22] rounded-[14px] flex items-center justify-center border border-[#271b38] shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="url(#logo-grad)" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff2d55" />
                  <stop offset="50%" stopColor="#c026d3" />
                  <stop offset="100%" stopColor="#9333ea" />
                </linearGradient>
              </defs>
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-white text-[26px] font-bold tracking-[-0.03em] leading-none mb-2">Chatter</h1>
            <p className="text-[#84799f] text-[14px] leading-relaxed">Premium conversations.</p>
          </div>
        </div>

        {/* Hero Text */}
        <div className="space-y-4 text-center w-full">
          <h2 className="text-white text-[34px] sm:text-[38px] font-bold leading-[1.08] tracking-[-0.03em]">
            Private messaging,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff2d55] to-[#c026d3]">elevated.</span>
          </h2>
          <p className="text-[#84799f] text-[15px] mt-4 leading-[1.65]">
            A cleaner, more premium way to stay connected.
          </p>
        </div>

        {/* Auth Toggle */}
        <div className="w-full flex bg-[#0f0817] rounded-[18px] p-[4px] h-[56px] border border-[#26173b] shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] relative">
          <button
            onClick={() => { setAuthMode('login'); setAuthError(''); }}
            className={`flex-1 h-full flex items-center justify-center gap-2 rounded-[14px] text-[16px] font-bold transition-all duration-300 relative z-10 ${authMode === 'login' ? 'text-white' : 'text-[#84799f] hover:text-[#a599c2]'}`}
          >
            {authMode === 'login' && (
              <div className="absolute inset-0 bg-gradient-to-r from-[#ff2d55] via-[#c026d3] to-[#9333ea] rounded-full shadow-[0_2px_12px_rgba(192,38,211,0.4)] z-[-1]"></div>
            )}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            Login
          </button>
          <button
            onClick={() => { setAuthMode('register'); setAuthError(''); }}
            className={`flex-1 h-full flex items-center justify-center gap-2 rounded-[14px] text-[16px] font-bold transition-all duration-300 relative z-10 ${authMode === 'register' ? 'text-white' : 'text-[#84799f] hover:text-[#a599c2]'}`}
          >
            {authMode === 'register' && (
              <div className="absolute inset-0 bg-gradient-to-r from-[#ff2d55] via-[#c026d3] to-[#9333ea] rounded-full shadow-[0_2px_12px_rgba(192,38,211,0.4)] z-[-1]"></div>
            )}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            Register
          </button>
        </div>

        {/* Form */}
        <div className="space-y-6 w-full">
          <div>
            <label className="block text-[#84799f] text-[10px] font-bold tracking-[0.16em] mb-2 text-center">USERNAME</label>
            <div className="relative flex items-center">
              <div className="absolute left-[16px] text-[#84799f]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#110a1a] border border-[#221533] rounded-[16px] h-[52px] text-white placeholder-[#584d72] focus:outline-none focus:border-[#a855f7] focus:ring-1 focus:ring-[#a855f7] transition-all text-[14px]"
                style={{ paddingLeft: '48px', paddingRight: '16px' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-[#84799f] text-[10px] font-bold tracking-[0.16em] mb-2 text-center">PASSWORD</label>
            <div className="relative flex items-center">
              <div className="absolute left-[16px] text-[#84799f]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </div>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAuth();
                }}
                className="w-full bg-[#110a1a] border border-[#221533] rounded-[16px] h-[52px] text-white placeholder-[#584d72] focus:outline-none focus:border-[#a855f7] focus:ring-1 focus:ring-[#a855f7] transition-all text-[14px]"
                style={{ paddingLeft: '48px', paddingRight: '48px' }}
              />
              <button className="absolute right-[16px] text-[#84799f] hover:text-[#a599c2] transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
            </div>
          </div>

          {authError && (
            <div className="flex items-center gap-3 bg-[#240b15] border border-[#4a1224] rounded-[12px] p-3 mt-1">
              <div className="text-[#ff3b5c] shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              </div>
              <p className="text-[#ff3b5c] text-[13px] font-medium">{authError}</p>
            </div>
          )}
        </div>

        <button
          onClick={handleAuth}
          className="w-full bg-gradient-to-r from-[#ff2d55] via-[#c026d3] to-[#9333ea] text-white rounded-[16px] h-[54px] font-bold text-[15px] mt-4 flex items-center justify-center gap-2 hover:opacity-95 transition-opacity shadow-[0_6px_20px_rgba(192,38,211,0.3)]"
        >
          Continue to Chatter
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>

        <div className="mt-2 w-full flex items-center justify-center gap-2 text-[#84799f] text-[12px] font-medium">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          Your privacy is our priority.
        </div>
      </div>
    </div>
  );

  const SidebarUI = (
    <div
      className="w-full h-screen bg-[#07030e] flex flex-col relative overflow-hidden"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {permissionStatus === "denied" && (
        <div className="shrink-0 bg-gradient-to-r from-[#ef4444]/15 to-[#ff2d55]/15 border-b border-[#ef4444]/30 px-6 py-2.5 flex items-center justify-between text-xs font-bold text-[#ff6b8b] relative z-20 animate-pulse">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>Notifications are blocked. You will miss messages!</span>
          </div>
          <button
            onClick={() => setShowTutorialModal(true)}
            className="underline hover:text-white transition-colors cursor-pointer"
          >
            Enable Now
          </button>
        </div>
      )}
      {/* Blurred Galaxy Hearts Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-[0.28] pointer-events-none z-0"
        style={{ backgroundImage: `url(${blurBg})` }}
      ></div>

      {/* Subtle top left ambient glow inside sidebar */}
      <div className="absolute top-[-10%] left-[-15%] w-[200px] h-[200px] rounded-full blur-[80px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(217,70,239,0.06) 0%, transparent 70%)' }}></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[150px] h-[150px] rounded-full blur-[70px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,45,85,0.04) 0%, transparent 70%)' }}></div>

      {/* Brand Header */}
      <div className="shrink-0 relative z-10 h-[80px] px-6 border-b border-[#1c122e] bg-[#07030e]/60 backdrop-blur-md flex justify-between items-center">
        <div className="flex items-center gap-3">
          {/* Logo Icon */}
          <div className="w-10 h-10 bg-gradient-to-tr from-[#ff2d55] to-[#c026d3] rounded-xl flex items-center justify-center shadow-[0_4px_14px_rgba(255,45,85,0.4)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <span className="text-white font-extrabold text-xl tracking-tight">Chatter</span>
        </div>
        {/* Logout Button */}
        <button
          onClick={() => {
            if (socketRef.current?.readyState === 1) {
              socketRef.current.send(JSON.stringify({ type: "logout" }));
            }
            localStorage.removeItem("chatter_user");
            localStorage.removeItem("chatter_avatar");
            localStorage.removeItem("chatter_fresh_login");
            localStorage.removeItem("chatter_active_chat");
            setJoined(false);
            setUsername("");
            setPassword("");
            setMessages({ general: [] });
            setActiveChat("general");
            setOnlineUsers([]);
            navigate("/");
          }}
          className="text-[#84799f] hover:text-[#ff2d55] p-2.5 rounded-xl hover:bg-[#ff2d55]/10 transition-all flex items-center justify-center"
          title="Logout"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>

      {/* Styled Profile Section */}
      <div className="relative z-10 px-6 py-10 border-b border-[#1c122e] bg-gradient-to-b from-[#0a0514]/40 to-[#07030e]/40 flex flex-col items-center text-center gap-4">
        {/* Large Glowing Profile Avatar */}
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-tr from-[#ff2d55] to-[#c026d3] rounded-[2rem] blur-[12px] opacity-75 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="relative w-20 h-20 rounded-[2rem] bg-[#130b20] border border-[#2c1b4d] flex items-center justify-center text-white text-3xl font-black shadow-xl overflow-hidden">
            {avatar ? (
              <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              username ? username[0].toUpperCase() : "?"
            )}
            {/* Edit Camera Overlay */}
            <label className="absolute inset-0 flex flex-col items-center justify-center bg-[#07030e]/75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer text-[10px] font-bold text-white gap-1 select-none">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#ff2d55]">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              <span>CHANGE</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </label>
          </div>
          {/* Active Online Indicator Dot */}
          <span className="absolute bottom-[-2px] right-[-2px] w-5 h-5 bg-[#10b981] border-[3px] border-[#07030e] rounded-full shadow-md z-20"></span>
        </div>

        {/* Big and Clean Username */}
        <div className="mt-2">
          <h2 className="text-white text-2xl font-bold tracking-tight leading-tight">
            @ {username}
          </h2>
          <p className="text-[#84799f] text-[11px] font-bold tracking-widest uppercase mt-2 bg-[#130b20] px-4 py-1.5 rounded-full border border-[#2a1a45] inline-block">
            Active Session
          </p>
        </div>
      </div>

      {/* Chats List */}
      <div className="relative z-10 flex-1 overflow-y-auto py-5 px-4 space-y-2">
        {/* General Room */}
        <div
          onClick={() => {
            setActiveChat("general");
            navigate("/chat/general");
          }}
          className={`group px-5 py-4 rounded-xl cursor-pointer flex items-center gap-4 transition-all duration-200 mb-6 ${activeChat === "general"
            ? "bg-[#130b20] border border-[#2a1a45] shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
            : "border border-transparent hover:bg-[#110a1c]/60"
            }`}
        >
          <div className="w-12 h-12 rounded-[1.25rem] bg-gradient-to-tr from-[#ff2d55] to-[#c026d3] flex items-center justify-center text-white text-base font-bold shadow-[0_3px_12px_rgba(255,45,85,0.3)] shrink-0">
            G
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline">
              <p className="text-white text-[15px] font-bold tracking-tight">General Room</p>
              <span className="text-[11px] text-[#5c507c] font-semibold">Active</span>
            </div>
            <p className="text-[#84799f] text-[13px] truncate mt-0.5 font-medium">Broadcast to everyone</p>
          </div>
        </div>

        {/* Divider */}
        <p className="text-[#5c507c] text-xs font-bold tracking-[0.16em] uppercase px-4 mt-8 mb-4">Contacts</p>

        {/* Users */}
        {allUsers.length <= 1 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[#5c507c] text-[13px] font-medium italic">No other contacts registered</p>
          </div>
        ) : (
          allUsers
            .filter((u) => (typeof u === "string" ? u : u.username) !== username)
            .map((u) => {
              const user = typeof u === "string" ? u : u.username;
              const lastActive = typeof u === "string" ? null : u.lastActive;
              const isOnline = onlineUsers.includes(user);
              return (
                <div
                  key={user}
                  onClick={() => {
                    setActiveChat(user);
                    setUnreadCounts((prev) => ({ ...prev, [user]: 0 }));
                    fetchPrivateHistory(user);
                    navigate(`/chat/${user}`);

                    if (socketRef.current?.readyState === 1) {
                      console.log("Sending mark_read for:", user);
                      socketRef.current.send(JSON.stringify({
                        type: "mark_read",
                        chatWith: user,
                      }));
                    }
                  }}
                  className={`group px-5 py-4 rounded-xl cursor-pointer flex items-center gap-4 transition-all duration-200 relative ${activeChat === user
                    ? "bg-[#130b20] border border-[#2a1a45] shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
                    : "border border-transparent hover:bg-[#110a1c]/60"
                    }`}
                >
                  {/* User Avatar */}
                  <div className="w-12 h-12 rounded-[1.25rem] bg-gradient-to-tr from-[#2563eb] to-[#a855f7] flex items-center justify-center text-white text-base font-bold shadow-sm shrink-0 relative">
                    {user[0].toUpperCase()}
                    {/* Status dot */}
                    <span className={`absolute bottom-[-1px] right-[-1px] w-4 h-4 border-[2px] border-[#07030e] rounded-full shadow-sm transition-all duration-300 ${isOnline ? "bg-[#10b981]" : "bg-[#5c507c]"}`}></span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[15px] font-bold tracking-tight truncate">{user}</p>
                    <p className={`text-[12px] font-semibold mt-0.5 transition-all duration-300 ${isOnline ? "text-[#10b981]" : "text-[#5c507c]"}`}>
                      {isOnline ? "online" : `offline (${formatLastActive(lastActive)})`}
                    </p>
                  </div>

                  {unreadCounts[user] > 0 && (
                    <div className="min-w-[24px] h-6 rounded-full bg-[#ff2d55] flex items-center justify-center px-2 shadow-[0_0_10px_rgba(255,45,85,0.4)] shrink-0 animate-pulse">
                      <span className="text-white text-[12px] font-bold">{unreadCounts[user]}</span>
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>
    </div>
  );

  const activeUserObj = allUsers.find(
    (u) => (typeof u === "string" ? u : u.username) === activeChat
  );
  const activeUserLastActive = activeUserObj && typeof activeUserObj !== "string" ? activeUserObj.lastActive : null;
  const activeUserAvatar = activeUserObj && typeof activeUserObj !== "string" ? activeUserObj.avatar : "";

  const ChatWindowUI = (
    <div
      className="w-full h-dvh flex flex-col bg-[#0a0514] relative overflow-hidden"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Clear Galaxy Hearts Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-[0.24] pointer-events-none z-0"
        style={{ backgroundImage: `url(${clearBg})` }}
      ></div>

      {/* Subtle top right ambient glow inside chat room */}
      <div className="absolute top-[-10%] right-[-10%] w-[300px] h-[300px] rounded-full blur-[100px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(217,70,239,0.06) 0%, transparent 70%)' }}></div>
      <div className="absolute bottom-[-10%] left-[-5%] w-[250px] h-[250px] rounded-full blur-[90px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,45,85,0.04) 0%, transparent 70%)' }}></div>

      {/* Main Centered Messaging Column (Guarantees perfect readability and centering on wide displays) */}
      <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col min-h-0 relative z-10 border-x border-[#1c122e]/30 bg-[#0a0514]/20 backdrop-blur-sm">
        {/* Premium Glassmorphic Header */}
        <div className="shrink-0 relative z-20 h-[80px] bg-gradient-to-b from-[#0a0514]/90 to-[#07030e]/80 backdrop-blur-xl px-4 md:px-6 border-b border-[#1c122e] flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-3 md:gap-5">
            {/* Back Button */}
            <button
              onClick={() => navigate('/chats')}
              className="text-[#84799f] hover:text-white bg-[#130b20] border border-[#2a1a45] hover:border-[#ff2d55] hover:shadow-[0_0_15px_rgba(255,45,85,0.3)] transition-all shrink-0 w-10 h-10 rounded-xl flex items-center justify-center group"
              title="Back to Users"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>

            {/* Glowing Avatar */}
            <div className="relative group shrink-0">
              <div className="absolute inset-0 bg-gradient-to-tr from-[#ff2d55] to-[#c026d3] rounded-2xl blur-[8px] opacity-60"></div>
              <div className="relative w-12 h-12 rounded-2xl bg-[#130b20] border border-[#2c1b4d] flex items-center justify-center text-white text-lg font-black shadow-lg overflow-hidden">
                {activeChat === "general" ? (
                  "G"
                ) : activeUserAvatar ? (
                  <img src={activeUserAvatar} alt={activeChat} className="w-full h-full object-cover" />
                ) : (
                  activeChat[0].toUpperCase()
                )}
              </div>
              {/* Active Online Indicator Dot */}
              <span className={`absolute bottom-[-2px] right-[-2px] w-3.5 h-3.5 border-2 border-[#07030e] rounded-full transition-all duration-300 ${activeChat === "general" || onlineUsers.includes(activeChat) ? "bg-[#10b981]" : "bg-[#5c507c]"}`}></span>
            </div>

            {/* User Info */}
            <div className="flex flex-col justify-center">
              <h2 className="text-white font-black text-[17px] md:text-lg tracking-tight leading-tight flex items-center gap-2">
                {activeChat === "general" ? "General Room" : `@${activeChat}`}
              </h2>
              {activeChat === "general" ? (
                <p className="text-[#10b981] text-[11px] font-bold mt-1 flex items-center gap-1.5 uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse"></span>
                  {onlineUsers.length} online
                </p>
              ) : onlineUsers.includes(activeChat) ? (
                <p className="text-[#10b981] text-[11px] font-bold mt-1 flex items-center gap-1.5 uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse"></span>
                  Active Now
                </p>
              ) : (
                <p className="text-[#5c507c] text-[11.5px] font-bold mt-1 flex items-center gap-1.5 uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5c507c]"></span>
                  offline ({formatLastActive(activeUserLastActive)})
                </p>
              )}
            </div>
          </div>

          {/* Optional Right Action (e.g. Call or Options) */}
          <button className="text-[#84799f] hover:text-white transition-colors p-2 rounded-xl hover:bg-[#1c122e] hidden md:flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="12" cy="5" r="1"></circle>
              <circle cx="12" cy="19" r="1"></circle>
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-6 flex flex-col gap-4 relative z-10"
          ref={messagesContainerRef}
          onScroll={handleScroll}
        >
          {loadingHistory && (
            <div className="flex justify-center py-2 shrink-0">
              <p className="text-[#84799f] text-xs font-semibold italic animate-pulse">Loading older messages...</p>
            </div>
          )}

          {/* Spacer to push messages to the bottom initially */}
          <div className="flex-1 min-h-[10px] pointer-events-none"></div>

          {(messages[activeChat] || []).map((msg, index) => {
            if (msg.type === "message") {
              const isMe = msg.username === username;
              const senderObj = allUsers.find(
                (u) => (typeof u === "string" ? u : u.username) === msg.username
              );
              const senderAvatar = senderObj && typeof senderObj !== "string" ? senderObj.avatar : "";

              return (
                <div key={index} className={`flex min-w-0 px-2 ${isMe ? "justify-end" : "justify-start"} py-1`}>
                  <div className="flex items-end gap-2.5 group/msg max-w-full">
                    {!isMe && (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#ff2d55] to-[#c026d3] flex items-center justify-center text-white text-[11px] font-black shrink-0 relative overflow-hidden mb-1 shadow-md">
                        {senderAvatar ? (
                          <img src={senderAvatar} alt={msg.username} className="w-full h-full object-cover" />
                        ) : (
                          msg.username[0].toUpperCase()
                        )}
                      </div>
                    )}

                    {isMe && (
                      <button
                        onClick={(e) => handleIconClick(e, msg)}
                        className="opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200 w-8 h-8 rounded-lg bg-[#130b20]/70 border border-[#2a1a45] hover:border-[#ff2d55] hover:shadow-[0_0_12px_rgba(255,45,85,0.2)] text-[#84799f] hover:text-white flex items-center justify-center shadow-md shrink-0 self-center"
                        title="Message actions"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="1"></circle>
                          <circle cx="19" cy="12" r="1"></circle>
                          <circle cx="5" cy="12" r="1"></circle>
                        </svg>
                      </button>
                    )}

                    <div
                      onContextMenu={(e) => handleRightClick(e, msg)}
                      onTouchStart={(e) => handleTouchStart(e, msg)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      style={{ padding: '16px 22px 10px 22px' }}
                      className={`rounded-2xl min-w-[80px] max-w-[70vw] md:max-w-[420px] w-fit flex flex-col gap-1.5 cursor-pointer relative transition-all shadow-lg overflow-visible ${isMe
                        ? "bg-gradient-to-br from-[#ff2d55] to-[#c026d3] text-white rounded-tr-sm shadow-[0_2px_12px_rgba(192,38,211,0.25)]"
                        : "bg-[#130b20] border border-[#23153d] text-white rounded-tl-sm"
                        }`}
                    >
                      {!isMe && (
                        <p className="text-[#c026d3] text-[11.5px] font-bold tracking-tight mb-0.5">{msg.username}</p>
                      )}

                      {editingId === msg._id ? (
                        <div className="flex gap-2 items-center min-w-[200px] max-w-full">
                          <input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditSubmit();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="bg-transparent border-b border-white text-white text-[15px] outline-none flex-1 py-1 min-w-0"
                            autoFocus
                          />
                          <button onClick={handleEditSubmit} className="text-sm text-green-400 hover:text-green-300 font-bold shrink-0">✓</button>
                          <button onClick={() => setEditingId(null)} className="text-sm text-red-400 hover:text-red-300 font-bold shrink-0">✕</button>
                        </div>
                      ) : (
                        <>
                          {msg.replyTo && (
                            <div className="border-l-[3px] border-white/40 pl-3 mb-2 opacity-90 bg-white/5 py-1.5 px-3 rounded-md">
                              <p className="text-[11px] font-bold">{msg.replyTo.username}</p>
                              <p className="text-[13px] truncate">{msg.replyTo.text}</p>
                            </div>
                          )}
                          {msg.image && (
                            <div className="relative group/img-preview mb-2.5 rounded-xl overflow-hidden border border-white/10 shadow-md max-w-sm">
                              <img
                                src={msg.image}
                                alt="Shared Attachment"
                                className="w-full max-h-[260px] object-cover cursor-pointer hover:scale-[1.02] active:scale-[1] transition-transform duration-300"
                                onClick={() => window.open(msg.image, "_blank")}
                              />
                            </div>
                          )}
                          {msg.audio && (
                            <div className="mb-2.5 max-w-sm w-[260px] md:w-[300px] bg-[#07030e]/80 border border-[#2a1a45] rounded-xl p-3 shadow-md flex flex-col gap-2 relative text-white">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#ff2d55]/10 border border-[#ff2d55]/30 flex items-center justify-center text-[#ff2d55] shrink-0">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                    <line x1="12" y1="19" x2="12" y2="23"></line>
                                    <line x1="8" y1="23" x2="16" y2="23"></line>
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-xs font-bold truncate">Voice Message</p>
                                  <p className="text-[#84799f] text-[10px] tracking-wider uppercase mt-0.5">Recorded Audio</p>
                                </div>
                              </div>
                              <audio src={msg.audio} controls className="w-full h-8 mt-1 outline-none text-[#ff2d55]" style={{ filter: "invert(90%) hue-rotate(290deg) contrast(150%)" }} />
                            </div>
                          )}
                          {msg.file && msg.file.data && (
                            <div className="mb-2.5 max-w-sm w-[260px] md:w-[300px] bg-[#07030e]/80 border border-[#2a1a45] rounded-xl p-3.5 shadow-md flex items-center justify-between gap-3 text-white">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-[#c026d3]/10 border border-[#c026d3]/30 flex items-center justify-center text-[#c026d3] shrink-0">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                  </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-white text-[13px] font-bold truncate" title={msg.file.name}>{msg.file.name}</p>
                                  <p className="text-[#84799f] text-[10px] uppercase mt-0.5 font-semibold">{(msg.file.size / 1024).toFixed(1)} KB</p>
                                </div>
                              </div>
                              <a
                                href={msg.file.data}
                                download={msg.file.name}
                                className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 hover:border-[#c026d3] hover:text-[#c026d3] flex items-center justify-center text-[#84799f] transition-all shrink-0 active:scale-95 shadow-sm hover:shadow-[0_0_12px_rgba(192,38,211,0.2)]"
                                title="Download File"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                  <polyline points="7 10 12 15 17 10"></polyline>
                                  <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                              </a>
                            </div>
                          )}
                          {msg.text && (
                            <p className="text-[15px] leading-[1.6] break-words break-all whitespace-pre-wrap">{msg.text}</p>
                          )}
                          {msg.edited && <p className="text-[10px] opacity-60 text-right mt-1 italic">edited</p>}
                        </>
                      )}
                      <div
                        className={`mt-2 flex items-center justify-end gap-1 text-[10px] font-medium ${isMe
                          ? "text-white/80"
                          : "text-[#84799f]"
                          }`}
                      >
                        <span>
                          {formatTime(msg.timestamp)}
                        </span>

                        <MessageTicks
                          msg={msg}
                          username={username}
                        />
                      </div>
                    </div>

                    {!isMe && (
                      <button
                        onClick={(e) => handleIconClick(e, msg)}
                        className="opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200 w-8 h-8 rounded-lg bg-[#130b20]/70 border border-[#2a1a45] hover:border-[#c026d3] hover:shadow-[0_0_12px_rgba(192,38,211,0.2)] text-[#84799f] hover:text-white flex items-center justify-center shadow-md shrink-0 self-center"
                        title="Message actions"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="1"></circle>
                          <circle cx="19" cy="12" r="1"></circle>
                          <circle cx="5" cy="12" r="1"></circle>
                        </svg>
                      </button>
                    )}

                    {isMe && (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#ff2d55] to-[#c026d3] flex items-center justify-center text-white text-[11px] font-black shrink-0 relative overflow-hidden mb-1 shadow-md">
                        {avatar ? (
                          <img src={avatar} alt="Me" className="w-full h-full object-cover" />
                        ) : (
                          username[0].toUpperCase()
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (msg.type === "private_message") {
              const isMe = msg.from === username;
              const senderObj = allUsers.find(
                (u) => (typeof u === "string" ? u : u.username) === msg.from
              );
              const senderAvatar = senderObj && typeof senderObj !== "string" ? senderObj.avatar : "";

              return (
                <div key={index} className={`flex min-w-0 px-2 ${isMe ? "justify-end" : "justify-start"} py-1`}>
                  <div className="flex items-end gap-2.5 group/msg max-w-full">
                    {!isMe && (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#2563eb] to-[#a855f7] flex items-center justify-center text-white text-[11px] font-black shrink-0 relative overflow-hidden mb-1 shadow-md">
                        {senderAvatar ? (
                          <img src={senderAvatar} alt={msg.from} className="w-full h-full object-cover" />
                        ) : (
                          msg.from[0].toUpperCase()
                        )}
                      </div>
                    )}

                    {isMe && (
                      <button
                        onClick={(e) => handleIconClick(e, msg)}
                        className="opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200 w-8 h-8 rounded-lg bg-[#130b20]/70 border border-[#2a1a45] hover:border-[#ff2d55] hover:shadow-[0_0_12px_rgba(255,45,85,0.2)] text-[#84799f] hover:text-white flex items-center justify-center shadow-md shrink-0 self-center"
                        title="Message actions"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="1"></circle>
                          <circle cx="19" cy="12" r="1"></circle>
                          <circle cx="5" cy="12" r="1"></circle>
                        </svg>
                      </button>
                    )}

                    <div
                      onContextMenu={(e) => handleRightClick(e, msg)}
                      onTouchStart={(e) => handleTouchStart(e, msg)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      style={{ padding: '16px 22px 10px 22px' }}
                      className={`rounded-2xl min-w-[100px] flex flex-col gap-1.5 cursor-pointer relative transition-all shadow-lg ${isMe
                        ? "bg-gradient-to-br from-[#2563eb] to-[#a855f7] text-white rounded-tr-sm shadow-[0_2px_12px_rgba(168,85,247,0.25)]"
                        : "bg-[#130b20] border border-[#23153d] text-white rounded-tl-sm"
                        }`}
                    >
                      {editingId === msg._id ? (
                        <div className="flex gap-2 items-center min-w-[200px] max-w-full">
                          <input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditSubmit();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="bg-transparent border-b border-white text-white text-[15px] outline-none flex-1 py-1 min-w-0"
                            autoFocus
                          />
                          <button onClick={handleEditSubmit} className="text-sm text-green-400 hover:text-green-300 font-bold shrink-0">✓</button>
                          <button onClick={() => setEditingId(null)} className="text-sm text-red-400 hover:text-red-300 font-bold shrink-0">✕</button>
                        </div>
                      ) : (
                        <>
                          {msg.replyTo && (
                            <div className="border-l-[3px] border-white/40 pl-3 mb-2 opacity-90 bg-white/5 py-1.5 px-3 rounded-md">
                              <p className="text-[11px] font-bold">{msg.replyTo.username}</p>
                              <p className="text-[13px] truncate">{msg.replyTo.text}</p>
                            </div>
                          )}
                          {msg.image && (
                            <div className="relative group/img-preview mb-2.5 rounded-xl overflow-hidden border border-white/10 shadow-md max-w-sm">
                              <img
                                src={msg.image}
                                alt="Shared Attachment"
                                className="w-full max-h-[260px] object-cover cursor-pointer hover:scale-[1.02] active:scale-[1] transition-transform duration-300"
                                onClick={() => window.open(msg.image, "_blank")}
                              />
                            </div>
                          )}
                          {msg.audio && (
                            <div className="mb-2.5 max-w-sm w-[260px] md:w-[300px] bg-[#07030e]/80 border border-[#2a1a45] rounded-xl p-3 shadow-md flex flex-col gap-2 relative">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#ff2d55]/10 border border-[#ff2d55]/30 flex items-center justify-center text-[#ff2d55] shrink-0">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                    <line x1="12" y1="19" x2="12" y2="23"></line>
                                    <line x1="8" y1="23" x2="16" y2="23"></line>
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-xs font-bold truncate">Voice Message</p>
                                  <p className="text-[#84799f] text-[10px] tracking-wider uppercase mt-0.5">Recorded Audio</p>
                                </div>
                              </div>
                              <audio src={msg.audio} controls className="w-full h-8 mt-1 outline-none text-[#ff2d55]" style={{ filter: "invert(90%) hue-rotate(290deg) contrast(150%)" }} />
                            </div>
                          )}
                          {msg.file && msg.file.data && (
                            <div className="mb-2.5 max-w-sm w-[260px] md:w-[300px] bg-[#07030e]/80 border border-[#2a1a45] rounded-xl p-3.5 shadow-md flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-[#c026d3]/10 border border-[#c026d3]/30 flex items-center justify-center text-[#c026d3] shrink-0">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                  </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-white text-[13px] font-bold truncate" title={msg.file.name}>{msg.file.name}</p>
                                  <p className="text-[#84799f] text-[10px] uppercase mt-0.5 font-semibold">{(msg.file.size / 1024).toFixed(1)} KB</p>
                                </div>
                              </div>
                              <a
                                href={msg.file.data}
                                download={msg.file.name}
                                className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 hover:border-[#c026d3] hover:text-[#c026d3] flex items-center justify-center text-[#84799f] transition-all shrink-0 active:scale-95 shadow-sm hover:shadow-[0_0_12px_rgba(192,38,211,0.2)]"
                                title="Download File"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                  <polyline points="7 10 12 15 17 10"></polyline>
                                  <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                              </a>
                            </div>
                          )}
                          {msg.text && (
                            <p className="text-[15px] leading-[1.6] break-words break-all whitespace-pre-wrap">{msg.text}</p>
                          )}
                          {msg.edited && <p className="text-[10px] opacity-60 text-right mt-1 italic">edited</p>}
                        </>
                      )}
                      <div
                        className={`mt-2 flex items-center justify-end gap-1 text-[10px] font-medium ${isMe
                          ? "text-white/80"
                          : "text-[#84799f]"
                          }`}
                      >
                        <span>
                          {formatTime(msg.timestamp)}
                        </span>

                        <MessageTicks
                          msg={msg}
                          username={username}
                        />
                      </div>
                    </div>

                    {!isMe && (
                      <button
                        onClick={(e) => handleIconClick(e, msg)}
                        className="opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200 w-8 h-8 rounded-lg bg-[#130b20]/70 border border-[#2a1a45] hover:border-[#c026d3] hover:shadow-[0_0_12px_rgba(192,38,211,0.2)] text-[#84799f] hover:text-white flex items-center justify-center shadow-md shrink-0 self-center"
                        title="Message actions"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="1"></circle>
                          <circle cx="19" cy="12" r="1"></circle>
                          <circle cx="5" cy="12" r="1"></circle>
                        </svg>
                      </button>
                    )}

                    {isMe && (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#2563eb] to-[#a855f7] flex items-center justify-center text-white text-[11px] font-black shrink-0 relative overflow-hidden mb-1 shadow-md">
                        {avatar ? (
                          <img src={avatar} alt="Me" className="w-full h-full object-cover" />
                        ) : (
                          username[0].toUpperCase()
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (msg.type === "notification") {
              return (
                <div key={index} className="flex justify-center my-2 min-w-0">
                  <span className="bg-[#160f22] border border-[#271b38] px-4 py-1.5 rounded-full text-[#84799f] text-[11.5px] font-semibold shadow-sm max-w-[85%] text-center break-words">
                    {msg.text}
                  </span>
                </div>
              );
            }

            return null;
          })}
          <div ref={bottomRef} />
        </div>
        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div
            className="absolute bottom-[80px] left-4 z-50 hidden md:block"
            onClick={(e) => e.stopPropagation()}
          >
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              theme="dark"
              searchDisabled={false}
              skinTonesDisabled
              height={350}
              width={300}
              previewConfig={{ showPreview: false }}
            />
          </div>
        )}

        {/* Typing Indicator */}
        <div className="shrink-0 relative z-10 w-[95%] mx-auto px-4 h-5 bg-transparent flex items-center mb-1">
          {typingUser && (
            <p className="text-[#84799f] text-xs font-semibold italic animate-pulse">{typingUser} is typing...</p>
          )}
        </div>

        {/* Reply Container - Premium floating dock style */}
        {replyTo && (
          <div className="shrink-0 relative z-10 w-[95%] mx-auto bg-[#130b20]/90 backdrop-blur-md border-t border-x border-[#2a1a45] rounded-t-2xl px-5 py-3 flex justify-between items-center shadow-lg">
            <div className="border-l-4 border-[#ff2d55] pl-3">
              <p className="text-[#ff2d55] text-xs font-bold uppercase tracking-wider">Replying to {replyTo.username}</p>
              <p className="text-[#84799f] text-[13px] truncate mt-0.5 max-w-xs md:max-w-md">{replyTo.text}</p>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="text-[#84799f] hover:text-white transition-colors p-1.5 hover:bg-white/5 rounded-lg"
            >
              ✕
            </button>
          </div>
        )}

        {/* Selected Image Preview Container - Premium floating dock style */}
        {selectedImage && (
          <div className={`shrink-0 relative z-10 w-[95%] mx-auto bg-[#130b20]/90 backdrop-blur-md border-x border-[#2a1a45] px-5 py-4 flex items-center justify-between shadow-lg ${replyTo ? "border-t border-[#2a1a45]/30" : "border-t rounded-t-2xl"}`}>
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-[#2a1a45] shadow-md shrink-0">
                <img src={selectedImage} alt="Attachment Preview" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-white text-sm font-bold">Image Attachment</p>
                <p className="text-[#84799f] text-[11px] uppercase tracking-wider mt-0.5">Ready to send</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedImage(null)}
              className="text-[#84799f] hover:text-[#ff2d55] transition-colors w-8 h-8 rounded-lg bg-white/5 hover:bg-[#ff2d55]/10 flex items-center justify-center border border-transparent hover:border-[#ff2d55]/20 shadow-sm"
              title="Remove Attachment"
            >
              ✕
            </button>
          </div>
        )}

        {/* Selected Generic File Preview Container - Premium floating dock style */}
        {selectedFile && (
          <div className={`shrink-0 relative z-10 w-[95%] mx-auto bg-[#130b20]/90 backdrop-blur-md border-x border-[#2a1a45] px-5 py-4 flex items-center justify-between shadow-lg ${replyTo || selectedImage ? "border-t border-[#2a1a45]/30" : "border-t rounded-t-2xl"}`}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#c026d3]/10 border border-[#c026d3]/30 flex items-center justify-center text-[#c026d3] shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-bold truncate max-w-xs md:max-w-md">{selectedFile.name}</p>
                <p className="text-[#84799f] text-[11px] uppercase tracking-wider mt-0.5">{(selectedFile.size / 1024).toFixed(1)} KB • Ready to send</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedFile(null)}
              className="text-[#84799f] hover:text-[#ff2d55] transition-colors w-8 h-8 rounded-lg bg-white/5 hover:bg-[#ff2d55]/10 flex items-center justify-center border border-transparent hover:border-[#ff2d55]/20 shadow-sm"
              title="Remove File Attachment"
            >
              ✕
            </button>
          </div>
        )}

        {/* Selected Live Audio Preview Container - Premium floating dock style */}
        {audioPreview && (
          <div className={`shrink-0 relative z-10 w-[95%] mx-auto bg-[#130b20]/90 backdrop-blur-md border-x border-[#2a1a45] px-5 py-4 flex items-center justify-between shadow-lg ${replyTo || selectedImage || selectedFile ? "border-t border-[#2a1a45]/30" : "border-t rounded-t-2xl"}`}>
            <div className="flex items-center gap-4 flex-1">
              <div className="w-12 h-12 rounded-full bg-[#ff2d55]/10 border border-[#ff2d55]/30 flex items-center justify-center text-[#ff2d55] shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-bold">Voice Note Recording</p>
                <audio src={audioPreview} controls className="w-full h-8 mt-1.5 outline-none text-[#ff2d55]" style={{ filter: "invert(90%) hue-rotate(290deg) contrast(150%)" }} />
              </div>
            </div>
            <div className="flex items-center gap-2.5 ml-4">
              <button
                onClick={() => {
                  setAudioBlob(null);
                  setAudioPreview(null);
                }}
                className="text-[#84799f] hover:text-[#ff2d55] transition-colors w-8 h-8 rounded-lg bg-white/5 hover:bg-[#ff2d55]/10 flex items-center justify-center border border-transparent hover:border-[#ff2d55]/20 shadow-sm shrink-0"
                title="Discard Recording"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Floating Glassmorphic Input Bar (95% wide, rounded) */}
        <div className={`shrink-0 relative z-10 w-[96%] mx-auto mb-3 bg-[#0a0514]/60 backdrop-blur-xl border border-[#2a1a45] px-2 md:px-4 py-2 md:py-3 flex gap-1.5 md:gap-3 items-center shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all ${replyTo || selectedImage || selectedFile || audioPreview ? "rounded-b-2xl border-t-0" : "rounded-3xl"}`}>
          {recording ? (
            <div className="flex-1 flex items-center gap-3 bg-[#ff2d55]/10 border border-[#ff2d55]/30 rounded-2xl h-[46px] px-5 text-white">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff2d55] animate-ping shrink-0"></span>
              <p className="text-white font-bold text-sm tracking-wide flex-1">Recording Live Voice Note...</p>
              <button
                onClick={stopRecording}
                className="bg-[#ff2d55] hover:bg-[#e0244c] text-white px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all active:scale-95 shadow-md shrink-0"
              >
                Stop & Preview
              </button>
            </div>
          ) : (
            <>
              {/* Photo Upload Attachment Button */}
              <label className="text-[#84799f] hover:text-[#ff2d55] hover:bg-[#ff2d55]/10 w-[38px] h-[38px] md:w-[46px] md:h-[46px] rounded-full border border-[#2a1a45] hover:border-[#ff2d55]/30 flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 shadow-sm" title="Share Photo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </label>


              {/* Universal File Upload Button */}
              <label className="text-[#84799f] hover:text-[#c026d3] hover:bg-[#c026d3]/10 w-[38px] h-[38px] md:w-[46px] md:h-[46px] rounded-full border border-[#2a1a45] hover:border-[#c026d3]/30 flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 shadow-sm" title="Share Any File (Audio, Pre-recorded, Docs...)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
                <input
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>

              <input
                type="text"
                placeholder={`Write a message to ${activeChat === "general" ? "General Room" : activeChat}...`}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  const now = Date.now();
                  if (now - lastTypingSentRef.current > 2000) {
                    if (socketRef.current?.readyState === 1) {
                      socketRef.current.send(JSON.stringify({ type: "typing", username }));
                      lastTypingSentRef.current = now;
                    }
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                className="flex-1 min-w-0 bg-[#110a1a]/80 border border-[#221533] rounded-2xl h-[42px] md:h-[46px] px-3 md:px-5 text-white placeholder-[#584d72] focus:outline-none focus:border-[#c026d3] focus:ring-1 focus:ring-[#c026d3] transition-all text-[13px] md:text-[14.5px]"
              />

              {/* Record Voice Note Button */}
              <button
                onClick={startRecording}
                className="text-[#84799f] hover:text-[#c026d3] hover:bg-[#c026d3]/10 w-[36px] h-[36px] md:w-[46px] md:h-[46px] rounded-full border border-[#2a1a45] hover:border-[#c026d3]/30 flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 shadow-sm"
                title="Record Voice Note"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              </button>
              {/* Camera Button */}
              <button
                onClick={openCamera}
                className="text-[#84799f] hover:text-[#c026d3] hover:bg-[#c026d3]/10 w-[36px] h-[36px] md:w-[46px] md:h-[46px] rounded-full border border-[#2a1a45] hover:border-[#c026d3]/30 flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 shadow-sm"
                title="Take a Photo"
              >

                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
              </button>
              {/* Emoji Picker Button */}
              <button
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className="text-[#84799f] hover:text-yellow-400 hover:bg-yellow-400/10 w-[46px] h-[46px] rounded-full border border-[#2a1a45] hover:border-yellow-400/30 items-center justify-center shrink-0 cursor-pointer transition-all active:scale-95 shadow-sm hidden md:flex"
                title="Emoji Picker"
              >
                😀
              </button>
              <button
                onClick={handleSend}
                className="bg-gradient-to-tr from-[#ff2d55] to-[#c026d3] hover:opacity-95 text-white w-[46px] h-[46px] rounded-full flex items-center justify-center shadow-[0_4px_14px_rgba(192,38,211,0.3)] shrink-0 transition-all active:scale-95"
                title="Send Message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-[2px] mt-[-1px]">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Context Menu - Premium Luxury Dark Neon Design */}
      {contextMenu && (
        <div
          className="fixed bg-[#07030e]/95 border border-[#2a1a45] rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-3 z-50 w-[195px] flex flex-col gap-2.5 overflow-hidden backdrop-blur-2xl transition-all duration-150 animate-in fade-in zoom-in-95"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Reply */}
          <button
            onClick={() => {
              setReplyTo({
                username: contextMenu.msg.username || contextMenu.msg.from,
                text: contextMenu.msg.text,
              });
              setContextMenu(null);
            }}
            className="w-full px-3.5 py-3 text-left text-[13.5px] font-bold text-[#84799f] bg-[#130b20]/40 border border-[#2a1a45]/60 rounded-xl hover:bg-[#ff2d55]/10 hover:border-[#ff2d55]/60 hover:text-white flex items-center gap-3.5 transition-all duration-200"
          >
            <div className="w-7 h-7 rounded-lg bg-[#ff2d55]/10 border border-[#ff2d55]/20 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#ff2d55]">
                <polyline points="9 17 4 12 9 7"></polyline>
                <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
              </svg>
            </div>
            Reply
          </button>

          {/* Copy */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.msg.text);
              setContextMenu(null);
            }}
            className="w-full px-3.5 py-3 text-left text-[13.5px] font-bold text-[#84799f] bg-[#130b20]/40 border border-[#2a1a45]/60 rounded-xl hover:bg-[#c026d3]/10 hover:border-[#c026d3]/60 hover:text-white flex items-center gap-3.5 transition-all duration-200"
          >
            <div className="w-7 h-7 rounded-lg bg-[#c026d3]/10 border border-[#c026d3]/20 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#c026d3]">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </div>
            Copy Text
          </button>

          {/* Edit */}
          {(contextMenu.msg.username === username || contextMenu.msg.from === username) && (
            <button
              onClick={() => {
                setEditingId(contextMenu.msg._id);
                setEditText(contextMenu.msg.text);
                setContextMenu(null);
              }}
              className="w-full px-3.5 py-3 text-left text-[13.5px] font-bold text-[#84799f] bg-[#130b20]/40 border border-[#2a1a45]/60 rounded-xl hover:bg-[#3b82f6]/10 hover:border-[#3b82f6]/60 hover:text-white flex items-center gap-3.5 transition-all duration-200"
            >
              <div className="w-7 h-7 rounded-lg bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#3b82f6]">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </div>
              Edit
            </button>
          )}

          {/* Unsend */}
          {(contextMenu.msg.username === username || contextMenu.msg.from === username) && (
            <button
              onClick={() => handleDelete(contextMenu.msg._id)}
              className="w-full px-3.5 py-3 text-left text-[13.5px] font-bold text-[#ef4444] bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-xl hover:bg-[#ef4444]/15 hover:border-[#ef4444]/55 flex items-center gap-3.5 transition-all duration-200"
            >
              <div className="w-7 h-7 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/20 flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#ef4444]">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </div>
              Unsend
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="min-h-screen min-h-dvh w-full overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, #0f0a1a 0%, #1a0a2e 50%, #0f0a1a 100%)'
      }}>
      <Routes>
        <Route path="/" element={!joined ? AuthUI : <Navigate to="/chats" replace />} />

        {/* Chats List Route */}
        <Route path="/chats" element={
          joined ? (
            <div className="flex h-screen w-full overflow-hidden">
              {/* Sidebar is always full-screen on mobile, but w-85 on desktop */}
              <div className="w-full md:w-[350px] shrink-0 h-full border-r border-[#1c122e] relative z-20">
                {SidebarUI}
              </div>
              {/* Desktop Placeholder for selected chat */}
              <div className="hidden md:flex flex-1 h-full bg-[#0a0514] flex-col items-center justify-center p-6 text-center relative">
                {/* Top glow */}
                <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full blur-[120px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(217,70,239,0.06) 0%, transparent 70%)' }}></div>

                <div className="w-16 h-16 bg-[#160f22] rounded-2xl flex items-center justify-center border border-[#271b38] shadow-[0_4px_16px_rgba(0,0,0,0.5)] mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="url(#logo-grad-placeholder)" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="logo-grad-placeholder" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#ff2d55" />
                        <stop offset="50%" stopColor="#c026d3" />
                        <stop offset="100%" stopColor="#9333ea" />
                      </linearGradient>
                    </defs>
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                </div>
                <h3 className="text-white text-lg font-bold tracking-tight">Select a conversation</h3>
                <p className="text-[#84799f] text-[14px] mt-2 max-w-[280px] leading-[1.6]">Choose a contact or the general room from the sidebar to start premium chatting.</p>
              </div>
            </div>
          ) : <Navigate to="/" replace />
        } />

        {/* Individual Chat Route */}
        <Route path="/chat/:id" element={
          joined ? (
            <div className="flex h-screen w-full overflow-hidden">
              {/* Sidebar is hidden on mobile inside a specific chat, but visible on desktop */}
              <div className="hidden md:block md:w-[350px] shrink-0 h-full border-r border-[#1c122e]">
                {SidebarUI}
              </div>
              {/* Chat room fills the screen on mobile, and remaining space on desktop */}
              <div className="flex-1 min-w-0 h-full">
                {ChatWindowUI}
              </div>
            </div>
          ) : <Navigate to="/" replace />
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Enable Notifications Modal Overlay */}
      {showNotificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07030e]/80 backdrop-blur-md transition-all duration-300 animate-fadeIn">
          <div className="max-w-md w-[90%] bg-[#130b20] border border-[#2a1a45] rounded-3xl p-8 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden group">
            {/* Top decorative pink glow */}
            <div className="absolute top-[-30%] left-[20%] w-[60%] h-[60%] rounded-full blur-[70px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,45,85,0.12) 0%, transparent 70%)' }}></div>

            {/* Infinite Pulsing Glowing Bell Container */}
            <div className="w-20 h-20 bg-gradient-to-tr from-[#ff2d55]/10 to-[#c026d3]/10 border border-[#ff2d55]/30 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
              <svg width="36" height="36" fill="none" stroke="url(#bell-gradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-wiggle">
                <defs>
                  <linearGradient id="bell-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ff2d55" />
                    <stop offset="100%" stopColor="#c026d3" />
                  </linearGradient>
                </defs>
                <path d="M18 8A6 6 0 0 0 12 14c0 7-3 9-3 9h18s-3-2-3-9a6 6 0 0 0-6-6zM13.73 21a3 3 0 0 0 5.74 0"></path>
              </svg>
            </div>

            <h3 className="text-white text-2xl font-black tracking-tight mb-3">Enable Notifications</h3>
            <p className="text-[#84799f] text-[14px] leading-relaxed mb-8">
              Never miss a direct message or group mention. Receive real-time native alerts even when Chatter is minimized or running in the background.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={requestNotificationPermission}
                className="w-full bg-gradient-to-r from-[#ff2d55] via-[#c026d3] to-[#9333ea] text-white rounded-2xl h-[54px] font-bold text-[15px] flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all shadow-[0_6px_20px_rgba(192,38,211,0.3)] cursor-pointer"
              >
                Allow Notifications
              </button>
              <button
                onClick={() => setShowNotificationModal(false)}
                className="w-full text-[#84799f] hover:text-white rounded-2xl h-[52px] font-bold text-[14px] flex items-center justify-center border border-[#2a1a45] hover:border-[#ff2d55]/30 active:scale-[0.98] transition-all cursor-pointer bg-[#0a0514]/40"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Browser Unlock Tutorial Modal */}
      {showTutorialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07030e]/80 backdrop-blur-md transition-all duration-300 animate-fadeIn">
          <div className="max-w-md w-[90%] bg-[#130b20] border border-[#2a1a45] rounded-3xl p-8 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
            {/* Top decorative blue glow */}
            <div className="absolute top-[-30%] left-[20%] w-[60%] h-[60%] rounded-full blur-[70px] pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)' }}></div>

            <div className="w-16 h-16 bg-[#2563eb]/10 border border-[#2563eb]/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg width="28" height="28" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>

            <h3 className="text-white text-xl font-bold tracking-tight mb-2">How to Enable Notifications</h3>
            <p className="text-[#84799f] text-[13px] leading-relaxed mb-6">
              Notifications are currently blocked by your browser settings. Follow these simple steps to allow them:
            </p>

            <div className="text-left space-y-4 mb-8 bg-[#0a0514]/40 border border-[#2a1a45]/60 rounded-2xl p-5">
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-[#ff2d55]/10 border border-[#ff2d55]/30 flex items-center justify-center shrink-0 text-[11px] font-bold text-[#ff2d55]">1</div>
                <p className="text-[#84799f] text-[13px] leading-normal font-medium">Click the <strong className="text-white">lock icon 🔒</strong> next to the web address at the top-left of your browser.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-[#c026d3]/10 border border-[#c026d3]/30 flex items-center justify-center shrink-0 text-[11px] font-bold text-[#c026d3]">2</div>
                <p className="text-[#84799f] text-[13px] leading-normal font-medium">Find <strong className="text-white">Notifications</strong> in the settings dropdown menu.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-[#9333ea]/10 border border-[#9333ea]/30 flex items-center justify-center shrink-0 text-[11px] font-bold text-[#9333ea]">3</div>
                <p className="text-[#84799f] text-[13px] leading-normal font-medium">Switch the toggle or selection to <strong className="text-white">Allow</strong>.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-[#2563eb]/10 border border-[#2563eb]/30 flex items-center justify-center shrink-0 text-[11px] font-bold text-[#2563eb]">4</div>
                <p className="text-[#84799f] text-[13px] leading-normal font-medium">Refresh the page to sync and activate notifications!</p>
              </div>
            </div>

            <button
              onClick={() => setShowTutorialModal(false)}
              className="w-full bg-[#2563eb] text-white rounded-2xl h-[54px] font-bold text-[15px] flex items-center justify-center hover:bg-[#1d4ed8] active:scale-[0.98] transition-all shadow-[0_6px_20px_rgba(37,99,235,0.3)] cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {showCamera && (
        <div className="fixed inset-0 z-50 bg-[#07030e]/95 backdrop-blur-xl flex flex-col items-center justify-center p-4">

          {/* Header */}
          <div className="w-full max-w-lg flex justify-between items-center mb-4">
            <h3 className="text-white font-bold text-lg">Take a Photo</h3>
            <button
              onClick={closeCamera}
              className="text-[#84799f] hover:text-white w-10 h-10 rounded-xl bg-[#130b20] border border-[#2a1a45] flex items-center justify-center transition-all"
            >
              ✕
            </button>
          </div>

          {/* Camera Preview or Captured Photo */}
          <div className="w-full max-w-lg rounded-3xl overflow-hidden border border-[#2a1a45] shadow-2xl bg-[#130b20] relative">
            {!capturedPhoto ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full object-cover"
                  style={{ maxHeight: '60vh' }}
                />

                {/* Flip Camera Button */}
                {!capturedPhoto && (
                  <button
                    onClick={flipCamera}
                    className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-[#07030e]/70 border border-[#2a1a45] flex items-center justify-center text-white hover:bg-[#130b20] transition-all"
                    title="Flip Camera"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 4v6h6"></path>
                      <path d="M23 20v-6h-6"></path>
                      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                    </svg>
                  </button>
                )}
                {/* Capture Button */}
                <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                  <button
                    onClick={takePhoto}
                    className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center shadow-xl transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #ff2d55, #c026d3)' }}
                  >
                    <div className="w-10 h-10 rounded-full bg-white opacity-90" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <img
                  src={capturedPhoto}
                  alt="Captured"
                  className="w-full object-cover"
                  style={{ maxHeight: '60vh' }}
                />
              </>
            )}
          </div>

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6 w-full max-w-lg">
            {capturedPhoto ? (
              <>
                <button
                  onClick={() => {
                    setCapturedPhoto(null);
                    openCamera();
                  }}
                  className="flex-1 py-3 rounded-2xl text-white font-bold border border-[#2a1a45] bg-[#130b20] hover:bg-[#1c122e] transition-all"
                >
                  Retake
                </button>
                <button
                  onClick={sendCapturedPhoto}
                  className="flex-1 py-3 rounded-2xl text-white font-bold transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #ff2d55, #c026d3)' }}
                >
                  Use Photo 💗
                </button>
              </>
            ) : (
              <button
                onClick={closeCamera}
                className="flex-1 py-3 rounded-2xl text-white font-bold border border-[#2a1a45] bg-[#130b20] hover:bg-[#1c122e] transition-all"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;