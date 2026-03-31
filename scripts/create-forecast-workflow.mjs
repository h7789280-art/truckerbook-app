/**
 * Creates and activates "TruckerBook — AI Forecast" workflow via n8n API.
 * Run: node scripts/create-forecast-workflow.mjs
 */

const N8N_API_URL = process.env.N8N_API_URL || 'https://etariahubpro.app.n8n.cloud/api/v1';
const N8N_API_KEY = process.env.N8N_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const GEMINI_KEY = process.env.GOOGLE_API_KEY;

if (!N8N_API_KEY || !SUPABASE_URL || !SUPABASE_KEY || !GEMINI_KEY) {
  console.error('Missing required env variables: N8N_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, GOOGLE_API_KEY');
  console.error('Create a .env file or export them before running this script.');
  process.exit(1);
}

// --- Node code strings ---

const fetchAllUsersCode = `
const supabaseUrl = '${SUPABASE_URL}';
const supabaseKey = '${SUPABASE_KEY}';

const resp = await fetch(
  supabaseUrl + '/rest/v1/profiles?select=id,full_name,language&and=(plan.neq.expired,plan.neq.job_seeker)',
  {
    headers: {
      'apikey': supabaseKey,
      'Authorization': 'Bearer ' + supabaseKey
    }
  }
);

if (!resp.ok) {
  throw new Error('Supabase profiles fetch failed: ' + resp.status);
}

const users = await resp.json();

if (!users.length) {
  return [{ json: { _empty: true, message: 'No active users found' } }];
}

return users.map(u => ({ json: u }));
`;

const fetchExpensesCode = `
const supabaseUrl = '${SUPABASE_URL}';
const supabaseKey = '${SUPABASE_KEY}';

const threeMonthsAgo = new Date();
threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
const since = threeMonthsAgo.toISOString();
const headers = {
  'apikey': supabaseKey,
  'Authorization': 'Bearer ' + supabaseKey
};

const results = [];

for (const item of $input.all()) {
  if (item.json._empty) continue;

  const userId = item.json.id;
  const userName = item.json.full_name || 'User';
  const language = item.json.language || 'ru';

  // Fetch fuel entries
  const fuelResp = await fetch(
    supabaseUrl + '/rest/v1/fuel_entries?user_id=eq.' + userId + '&created_at=gte.' + since + '&select=amount,liters,created_at',
    { headers }
  );
  const fuel = fuelResp.ok ? await fuelResp.json() : [];

  // Fetch byt (personal) expenses
  const bytResp = await fetch(
    supabaseUrl + '/rest/v1/byt_expenses?user_id=eq.' + userId + '&created_at=gte.' + since + '&select=amount,category,created_at',
    { headers }
  );
  const byt = bytResp.ok ? await bytResp.json() : [];

  // Fetch service records
  const svcResp = await fetch(
    supabaseUrl + '/rest/v1/service_records?user_id=eq.' + userId + '&created_at=gte.' + since + '&select=cost,type,created_at',
    { headers }
  );
  const svc = svcResp.ok ? await svcResp.json() : [];

  // Collect all months present in data
  const allDates = [
    ...fuel.map(f => f.created_at),
    ...byt.map(b => b.created_at),
    ...svc.map(s => s.created_at)
  ].filter(Boolean);

  const monthsSet = new Set(allDates.map(d => d.substring(0, 7)));

  // Skip users with less than 2 months of data
  if (monthsSet.size < 2) continue;

  // Group expenses by month and category
  const summary = {};

  for (const f of fuel) {
    const m = f.created_at.substring(0, 7);
    if (!summary[m]) summary[m] = {};
    summary[m]['fuel'] = (summary[m]['fuel'] || 0) + (Number(f.amount) || 0);
  }

  for (const b of byt) {
    const m = b.created_at.substring(0, 7);
    if (!summary[m]) summary[m] = {};
    const cat = 'byt_' + (b.category || 'other');
    summary[m][cat] = (summary[m][cat] || 0) + (Number(b.amount) || 0);
  }

  for (const s of svc) {
    const m = s.created_at.substring(0, 7);
    if (!summary[m]) summary[m] = {};
    summary[m]['service'] = (summary[m]['service'] || 0) + (Number(s.cost) || 0);
  }

  results.push({
    json: {
      userId,
      userName,
      language,
      expenses: summary,
      months: Array.from(monthsSet).sort()
    }
  });
}

if (!results.length) {
  return [{ json: { _empty: true, message: 'No users with enough data' } }];
}

return results;
`;

const generateForecastCode = `
const geminiKey = '${GEMINI_KEY}';
const results = [];

for (const item of $input.all()) {
  if (item.json._empty) continue;

  const { userId, userName, language, expenses } = item.json;

  const prompt = 'You are a financial analyst for a trucking business. ' +
    'Based on the expense data below, provide a forecast for next month: ' +
    '1) Expected total expenses 2) Which category is likely to increase 3) One saving tip. ' +
    'Keep it under 100 words. Respond in Russian.\\n\\n' +
    'Driver: ' + userName + '\\n' +
    'Data: ' + JSON.stringify(expenses);

  try {
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + geminiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await resp.json();
    const forecastText = data.candidates?.[0]?.content?.parts?.[0]?.text
      || 'Недостаточно данных для прогноза.';

    results.push({
      json: {
        userId,
        userName,
        forecastText,
        forecastDate: new Date().toISOString().substring(0, 10)
      }
    });
  } catch (err) {
    results.push({
      json: {
        userId,
        userName,
        forecastText: 'Ошибка генерации прогноза: ' + err.message,
        forecastDate: new Date().toISOString().substring(0, 10)
      }
    });
  }
}

if (!results.length) {
  return [{ json: { _empty: true, message: 'Nothing to save' } }];
}

return results;
`;

const saveForecastCode = `
const supabaseUrl = '${SUPABASE_URL}';
const supabaseKey = '${SUPABASE_KEY}';
const results = [];

for (const item of $input.all()) {
  if (item.json._empty) continue;

  const { userId, userName, forecastText, forecastDate } = item.json;

  const resp = await fetch(
    supabaseUrl + '/rest/v1/profiles?id=eq.' + userId,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        forecast_text: forecastText,
        forecast_date: forecastDate
      })
    }
  );

  results.push({
    json: {
      userId,
      userName,
      saved: resp.ok,
      status: resp.status
    }
  });
}

if (!results.length) {
  return [{ json: { message: 'No forecasts to save' } }];
}

return results;
`;

// --- Workflow definition ---

const workflow = {
  name: 'TruckerBook \u2014 AI Forecast',
  nodes: [
    {
      parameters: {
        rule: {
          interval: [
            {
              field: 'cronExpression',
              expression: '0 9 1 * *'
            }
          ]
        }
      },
      name: 'Schedule Trigger',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [250, 300]
    },
    {
      parameters: {
        jsCode: fetchAllUsersCode
      },
      name: 'Fetch All Users',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [480, 300]
    },
    {
      parameters: {
        jsCode: fetchExpensesCode
      },
      name: 'Fetch Expenses per User',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [710, 300]
    },
    {
      parameters: {
        jsCode: generateForecastCode
      },
      name: 'Generate Forecast with Gemini',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [940, 300]
    },
    {
      parameters: {
        jsCode: saveForecastCode
      },
      name: 'Save Forecast',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1170, 300]
    }
  ],
  connections: {
    'Schedule Trigger': {
      main: [
        [{ node: 'Fetch All Users', type: 'main', index: 0 }]
      ]
    },
    'Fetch All Users': {
      main: [
        [{ node: 'Fetch Expenses per User', type: 'main', index: 0 }]
      ]
    },
    'Fetch Expenses per User': {
      main: [
        [{ node: 'Generate Forecast with Gemini', type: 'main', index: 0 }]
      ]
    },
    'Generate Forecast with Gemini': {
      main: [
        [{ node: 'Save Forecast', type: 'main', index: 0 }]
      ]
    }
  },
  settings: {
    executionOrder: 'v1'
  }
};

// --- Create and activate ---

async function main() {
  console.log('Creating workflow "TruckerBook — AI Forecast"...');

  const createResp = await fetch(`${N8N_API_URL}/workflows`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(workflow)
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    console.error('Failed to create workflow:', createResp.status, errText);
    process.exit(1);
  }

  const created = await createResp.json();
  const workflowId = created.id;
  console.log('Workflow created, ID:', workflowId);

  // Activate the workflow
  console.log('Activating workflow...');

  const activateResp = await fetch(`${N8N_API_URL}/workflows/${workflowId}/activate`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY
    }
  });

  if (!activateResp.ok) {
    // Try PATCH method if POST /activate is not available
    const patchResp = await fetch(`${N8N_API_URL}/workflows/${workflowId}`, {
      method: 'PATCH',
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ active: true })
    });

    if (!patchResp.ok) {
      const errText = await patchResp.text();
      console.error('Failed to activate workflow:', patchResp.status, errText);
      process.exit(1);
    }

    const activated = await patchResp.json();
    console.log('Workflow activated via PATCH:', activated.active);
  } else {
    const activated = await activateResp.json();
    console.log('Workflow activated:', activated.active);
  }

  console.log('\nWorkflow TruckerBook AI Forecast created and activated');
  console.log('Schedule: 1st of every month at 09:00 UTC (cron: 0 9 1 * *)');
  console.log('Nodes: Schedule Trigger → Fetch All Users → Fetch Expenses per User → Generate Forecast with Gemini → Save Forecast');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
