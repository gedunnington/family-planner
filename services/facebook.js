const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

export async function fetchFacebookEvents(accessToken) {
  const url = `${GRAPH_BASE}/me/events?fields=name,start_time,place,end_time&time_filter=upcoming&limit=50&access_token=${accessToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Facebook API error: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map(e => ({
    name: e.name,
    date: e.start_time ? e.start_time.split('T')[0] : null,
    start_time: e.start_time
      ? new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null,
    end_time: e.end_time
      ? new Date(e.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null,
    location: e.place?.name || null,
  }));
}

export function getFacebookAuthUrl(appId, redirectUri) {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: 'user_events',
    response_type: 'code',
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
}

export async function exchangeCodeForToken(code, appId, appSecret, redirectUri) {
  const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params}`);
  if (!res.ok) throw new Error('Token exchange failed');
  const data = await res.json();
  const llParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: data.access_token,
  });
  const llRes = await fetch(`${GRAPH_BASE}/oauth/access_token?${llParams}`);
  const llData = await llRes.json();
  return llData.access_token || data.access_token;
}
