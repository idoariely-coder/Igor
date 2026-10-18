// קריאות לשרת
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data.error === 'not_logged_in' && url !== '/api/me') window.dispatchEvent(new Event('igor:logout'));
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};

// הקטנת תמונה לפני העלאה (צילומי אייפון כבדים)
async function shrinkImage(file, maxSide = 1800, quality = 0.85) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob || file;
  } catch {
    return file;
  }
}

export async function uploadFile(file, kind = 'chat') {
  const small = await shrinkImage(file);
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', small, file.name?.replace(/\.\w+$/, '') + (small.type === 'image/jpeg' ? '.jpg' : ''));
  const res = await fetch('/api/uploads', { method: 'POST', body: form, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data; // {id, url}
}

export const uploadUrl = (id) => `/api/uploads/${id}`;

// הזרמת תשובה של איגור (Server-Sent Events על POST)
export async function streamMessage(conversationId, { text, uploadIds }, { onDelta, signal }) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, uploadIds }),
    credentials: 'same-origin',
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, await res.json().catch(() => ({})));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let result = { title: null, error: null };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const event = raw.match(/^event: (.*)$/m)?.[1];
      const data = JSON.parse(raw.match(/^data: (.*)$/m)?.[1] || '{}');
      if (event === 'delta') onDelta(data.text);
      else if (event === 'error') result.error = data.message;
      else if (event === 'done') result.title = data.title;
    }
  }
  return result;
}
