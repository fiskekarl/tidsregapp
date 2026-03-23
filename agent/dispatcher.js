'use strict';
/**
 * Time Registration Dispatcher Agent
 *
 * Modtager naturligt sprog og dispatcher til de rigtige
 * CAP-service actions via Claude tool use.
 *
 * Brug:
 *   node agent/dispatcher.js
 *   eller importér dispatchIntent(text, sessionContext) fra din kode
 */

const Anthropic = require('@anthropic-ai/sdk');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

const client = new Anthropic.default();
const BASE_URL = process.env.TIME_SERVICE_URL || 'http://localhost:4004/api/time';

// ---------------------------------------------------------------------------
// Tool-definitioner — spejler CAP TimeService actions
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: 'login',
    description: 'Log en medarbejder ind med RFID-token eller medarbejder-ID. Returner sessionId og medarbejderoplysninger.',
    input_schema: {
      type: 'object',
      properties: {
        token:      { type: 'string', description: 'RFID-token fra scanner' },
        employeeID: { type: 'string', description: 'Medarbejder-ID (alternativ til RFID)' },
      },
    },
  },
  {
    name: 'logout',
    description: 'Log en medarbejder ud og afslut aktiv session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Aktiv session-UUID' },
        reason:    { type: 'string', enum: ['MANUAL', 'TIMEOUT'], description: 'Årsag til logout' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'startEntry',
    description: 'Start en ny tidsregistrering for en session. Typer: CLOCKINOUT (stempel), ORDER (produktionsordre), COSTCENTER (omkostningscenter).',
    input_schema: {
      type: 'object',
      properties: {
        sessionId:    { type: 'string', description: 'Aktiv session-UUID' },
        entryType:    { type: 'string', enum: ['CLOCKINOUT', 'ORDER', 'COSTCENTER'] },
        orderNumber:  { type: 'string', description: 'Produktionsordrenummer (kræves for ORDER)' },
        costCenterNo: { type: 'string', description: 'Omkostningscenternummer (kræves for COSTCENTER)' },
      },
      required: ['sessionId', 'entryType'],
    },
  },
  {
    name: 'stopEntry',
    description: 'Afslut en igangværende tidsregistrering og synkronisér til S/4HANA CATS.',
    input_schema: {
      type: 'object',
      properties: {
        entryId: { type: 'string', description: 'UUID på den tidsregistrering der skal stoppes' },
      },
      required: ['entryId'],
    },
  },
  {
    name: 'keepAlive',
    description: 'Forny en aktiv session for at undgå timeout (kald hvert 60 sekund).',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Aktiv session-UUID' },
      },
      required: ['sessionId'],
    },
  },
];

// ---------------------------------------------------------------------------
// Kald CAP-service
// ---------------------------------------------------------------------------
async function callService(actionName, params) {
  const url = `${BASE_URL}/${actionName}`;
  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(params),
  });

  const body = await resp.json();
  if (!resp.ok) {
    throw new Error(body.error?.message || `HTTP ${resp.status}`);
  }
  return body.value ?? body;
}

// ---------------------------------------------------------------------------
// Udfør tool call fra Claude
// ---------------------------------------------------------------------------
async function executeTool(name, input) {
  try {
    const result = await callService(name, input);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Hoved-dispatcher — naturligt sprog → tool use → svar
// ---------------------------------------------------------------------------
async function dispatchIntent(userText, context = {}) {
  const systemPrompt = `Du er en dispatcher for en SAP BTP tidsregistrerings-kiosk.
Din opgave er at forstå brugerens intention og kalde det rigtige service-endpoint.

Nuværende kontekst:
${JSON.stringify(context, null, 2)}

Regler:
- Brug altid et tool til at udføre handlinger — svar aldrig med gætterier
- Hvis nødvendige parametre mangler (f.eks. sessionId), bed bruger om dem
- Svar kortfattet på dansk
- Ved fejl: forklar hvad der gik galt og hvad brugeren kan gøre`;

  const messages = [{ role: 'user', content: userText }];

  // Agentic loop — kør til Claude stopper med tool calls
  while (true) {
    const response = await client.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 4096,
      thinking:   { type: 'adaptive' },
      system:     systemPrompt,
      tools:      TOOLS,
      messages,
    });

    // Tilføj assistent-svar til historik
    messages.push({ role: 'assistant', content: response.content });

    // Færdig — returner tekst-svar
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      return { reply: textBlock?.text ?? '', messages };
    }

    // Udfør tool calls
    if (response.stop_reason === 'tool_use') {
      const toolResults = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        console.log(`[agent] Kalder: ${block.name}`, block.input);
        const outcome = await executeTool(block.name, block.input);
        console.log(`[agent] Resultat:`, outcome);

        toolResults.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     JSON.stringify(outcome),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Uventet stop — stop loop
    break;
  }

  return { reply: 'Agenten stoppede uventet.', messages };
}

// ---------------------------------------------------------------------------
// CLI — test direkte fra terminal
// ---------------------------------------------------------------------------
if (require.main === module) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let sessionContext = {};

  console.log('Tidsregistrerings-agent klar. Skriv din forespørgsel (Ctrl+C for at afslutte)\n');

  const prompt = () => rl.question('> ', async (input) => {
    if (!input.trim()) return prompt();

    try {
      const { reply } = await dispatchIntent(input, sessionContext);
      console.log('\nAgent:', reply, '\n');
    } catch (err) {
      console.error('Fejl:', err.message);
    }
    prompt();
  });

  prompt();
}

module.exports = { dispatchIntent };
