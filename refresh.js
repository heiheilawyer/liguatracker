export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const body = await req.json();
    const { scholars, journals, existingTitles } = body;

    const scholarList = scholars.map(s => `- ${s.name} (${s.inst})`).join('\n');
    const journalList = journals.map(j => `- ${j.name} (IF: ${j.if||'—'})`).join('\n');
    const existingList = existingTitles.slice(0, 40).join('\n- ');

    const prompt = `You are a research assistant helping a PhD student in linguistics track new publications in the field of technology-mediated interactional competence (IC) assessment.

TRACKED SCHOLARS:
${scholarList}

TARGET JOURNALS:
${journalList}

ALREADY TRACKED PUBLICATIONS (do not suggest these):
- ${existingList}

TASK: Search for and identify real, verifiable publications from 2024-2025 by the tracked scholars in the target journals, OR highly relevant publications in these journals about: spoken dialogue systems, AI/LLM-mediated oral assessment, interactional competence, technology-mediated communication assessment, sensor technologies in language assessment (eye-tracking, fNIRS, EEG), agentic AI in language learning.

Return ONLY a JSON array (no markdown, no explanation) of up to 8 publication objects with this exact structure:
[
  {
    "title": "Full paper title",
    "authors": "Last, F. & Last, F.",
    "year": "2024",
    "journal": "Journal name as listed above",
    "scholarId": "id of matching scholar or 'other'",
    "url": "https://doi.org/... or best available URL",
    "if": "impact factor number as string or —",
    "q": "Q1 or Q2 or —",
    "cite": "~N estimated citations",
    "snip": "One sentence describing the key finding and relevance to IC assessment",
    "tech": ["relevant tech tags from: SDS, Generative AI, LLMs, Eye-tracking, fNIRS, Brain waves, Agentic AI, Computer, Video-mediated, Telephone, Automated scoring"]
  }
]

Scholar IDs to use: ${scholars.map(s=>`${s.name}→${s.id}`).join(', ')}

Be accurate. Only include publications you are confident exist. If uncertain about a detail, use approximate values. Return valid JSON only.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        thinking: { type: 'enabled', budget_tokens: 10000 },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();

    // Extract text from content blocks (skip thinking blocks)
    let text = '';
    if (data.content) {
      for (const block of data.content) {
        if (block.type === 'text') { text = block.text; break; }
      }
    }

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'No valid JSON in response', raw: text.slice(0,500) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const suggestions = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify({ suggestions }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
