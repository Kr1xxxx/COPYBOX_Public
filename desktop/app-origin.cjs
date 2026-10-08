const WINDOWS_SERVER_PORT = 47183;
const WINDOWS_APP_ORIGIN = `http://127.0.0.1:${WINDOWS_SERVER_PORT}`;
const WINDOWS_APP_URL = `${WINDOWS_APP_ORIGIN}/?clipbox-desktop=win32`;

function isSameOriginUrl(value, expectedOrigin) {
  try {
    return new URL(value).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

function isTrustedWindowsPageUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === WINDOWS_APP_ORIGIN
      && url.pathname === "/"
      && url.searchParams.get("clipbox-desktop") === "win32";
  } catch {
    return false;
  }
}

function isValidServerReadyMessage(message, expectedNonce, expectedPort) {
  return Boolean(message
    && typeof message === "object"
    && message.type === "clipbox:server-ready"
    && message.nonce === expectedNonce
    && message.port === expectedPort);
}

module.exports = {
  WINDOWS_APP_ORIGIN,
  WINDOWS_APP_URL,
  WINDOWS_SERVER_PORT,
  isSameOriginUrl,
  isTrustedWindowsPageUrl,
  isValidServerReadyMessage,
};
