// Talks to start.ng through its hidden connect page (see https://start.ng/docs.md).
const START_NG = 'https://start.ng';
let frame;

function connectFrame() {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.title = 'start.ng';
    el.onload = () => resolve(el);
    el.onerror = reject;
    document.body.append(el);
  });
  return frame;
}

// Sends a message and resolves to start.ng's reply, or null if it didn't answer
// (for example when the game is opened locally instead of on *.start.ng).
export async function askStartNg(message, replyType, timeoutMs = 5000) {
  let el;
  try {
    el = await Promise.race([connectFrame(), new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))]);
  } catch {
    frame = undefined;
    return null;
  }
  if (!el?.contentWindow) return null;
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply) => { clearTimeout(timer); removeEventListener('message', onMessage); resolve(reply); };
    const timer = setTimeout(() => done(null), timeoutMs);
    function onMessage(e) {
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    el.contentWindow.postMessage({ ...message, requestId }, START_NG);
  });
}

// { type, user, guest } or null. Use reply.user ?? reply.guest.
export function whoami(timeoutMs) {
  return askStartNg({ type: 'startng:whoami' }, 'startng:user', timeoutMs);
}

// stats must match startng.json exactly. Signed-in players only.
export function saveScore(stats) {
  return askStartNg({ type: 'startng:score', stats }, 'startng:scoreSaved', 8000);
}

export function leaderboard(limit = 10) {
  return askStartNg({ type: 'startng:leaderboard', limit }, 'startng:leaderboardData', 8000);
}

export function signIn() {
  location.href = `${START_NG}/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

// The homepage opens the game with ?guest when the player chose to play as a guest.
export const choseGuest = new URLSearchParams(location.search).has('guest');

// We use the connect page, so the session start.ng adds after sign-in isn't needed:
// tidy it out of the address bar.
if (location.hash.includes('startng_session=')) {
  history.replaceState(null, '', location.pathname + location.search);
}
