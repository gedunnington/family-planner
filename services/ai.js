import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Claude sometimes wraps JSON in preamble ("Here's the info: {...}"). Prefilling
// the assistant turn with `{` forces JSON-only output; the fallback recovers
// anyway if the model somehow still adds text around it.
function parseJsonResponse(rawText, fallback, label) {
  const withBrace = '{' + rawText;
  try {
    return JSON.parse(withBrace);
  } catch {
    const match = withBrace.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    console.error(`[ai] ${label}: could not parse JSON. Raw response:`, rawText);
    return fallback;
  }
}

export async function extractDateFromPage(pageText, timingNotes) {
  const prompt = `Given this webpage content and the note that this event typically occurs "${timingNotes}", extract these event basics.

Webpage content:
${pageText}

Return ONLY valid JSON with this shape: {"name": "Event title or null", "location": "City, venue, or address or null", "date": "YYYY-MM-DD or null", "start_time": "H:MM AM/PM or null", "end_time": "H:MM AM/PM or null", "drive_time_mins": integer or null}
Notes:
- "name" should be the event's title (not the website or organization name)
- "location" should be a venue, address, or at least a city — null if not on the page
- "date" is the next upcoming date — null if not found
- "drive_time_mins" is your best estimate of one-way driving time in minutes from Verona, WI (a suburb southwest of Madison) to the event location. Round to a sensible number (15, 30, 45, 60, 90, 120, 180, 240, etc). Null if location is unknown or if you truly can't estimate.`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '{' },
    ],
  });

  return parseJsonResponse(
    msg.content[0].text,
    { name: null, location: null, date: null, start_time: null, end_time: null, drive_time_mins: null },
    'extractDateFromPage'
  );
}

export async function suggestThemesAndMessage(eventName, pageText, allThemes) {
  const themeList = allThemes.map(t =>
    `ID ${t.id}: "${t.name}" (${t.source}) — ${t.description}`
  ).join('\n');

  const prompt = `You are helping a parent in Verona, WI plan intentional activities with their kids.

Event: ${eventName}
Page summary: ${pageText.slice(0, 2000)}

Available themes:
${themeList}

1. Which theme IDs apply to this event? Return only IDs that clearly fit.
2. Write a 2-4 sentence "message for today" — something the parent could say to their kids before or during this event, connecting it to the matched themes. Make it warm, specific, and grounded in the event's actual story or character.

Return ONLY valid JSON: {"theme_ids": [1, 2], "message": "..."}`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '{' },
    ],
  });

  return parseJsonResponse(
    msg.content[0].text,
    { theme_ids: [], message: '' },
    'suggestThemesAndMessage'
  );
}
