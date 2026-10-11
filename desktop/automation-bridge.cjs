function bridgeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createRendererCommandBridge({
  createId,
  isReady,
  send,
  ensureReady,
  timeoutMs = 10_000,
}) {
  const pending = new Map();
  let closed = false;

  return {
    async forward(command) {
      if (closed) throw bridgeError("APP_CLOSING", "Clipbox 正在退出");
      // A quiet start has no window yet: let the app open one (hidden) before giving up.
      if (!isReady() && ensureReady) await ensureReady().catch(() => undefined);
      if (closed) throw bridgeError("APP_CLOSING", "Clipbox 正在退出");
      if (!isReady()) throw bridgeError("WINDOW_UNAVAILABLE", "Clipbox 窗口尚未就绪");
      const requestId = createId();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(bridgeError("RENDERER_TIMEOUT", "Clipbox 窗口响应超时"));
        }, timeoutMs);
        pending.set(requestId, { resolve, reject, timer });
        try {
          send({ requestId, command });
        } catch (error) {
          clearTimeout(timer);
          pending.delete(requestId);
          reject(error);
        }
      });
    },
    respond(message) {
      if (!message || typeof message.requestId !== "string") return false;
      const entry = pending.get(message.requestId);
      if (!entry) return false;
      pending.delete(message.requestId);
      clearTimeout(entry.timer);
      entry.resolve(message.response);
      return true;
    },
    close() {
      if (closed) return;
      closed = true;
      const error = bridgeError("APP_CLOSING", "Clipbox 正在退出");
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(error);
      }
      pending.clear();
    },
  };
}

module.exports = { createRendererCommandBridge };
