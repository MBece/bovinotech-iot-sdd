// HU-05 fullstack E2E driver over the Edge/Chrome DevTools Protocol.
// No external dependencies: Node 22 global WebSocket + fetch.
//
// It opens the real Vite app, logs in, exercises AC-01..AC-04 through the UI,
// saves real screenshots and records API/database observations as JSON.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..', '..', '..');
const SHOTS = join(REPO, 'docs', 'evidence', 'hu-05-sinigan-sync', 'screenshots');
const LOG_PATH = join(HERE, 'e2e-cdp.log');
const RESULT_PATH = join(HERE, 'e2e-results.json');
const DB_PATH = join(REPO, 'backend', 'bovinotech.db');
const PYTHON = process.env.HU05_PYTHON
  || 'C:\\Users\\Juan Gutierrez\\AppData\\Local\\Temp\\opencode\\hu05-venv\\Scripts\\python.exe';
const OFFICIAL_FIXTURE = join(
  REPO, 'backend', 'app', 'features', 'sinigan', 'fixtures', 'animals.json',
);

const APP_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:8000';
const CDP_URL = 'http://127.0.0.1:9222';
const EXPECTED_LABEL = 'MODO SIMULADO (SINIGÁN V6 MOCK)';
const REASON = 'Se valida la ficha oficial y se solicita corrección del registro de campo.';

mkdirSync(SHOTS, { recursive: true });
writeFileSync(LOG_PATH, '');

const results = {
  startedAt: new Date().toISOString(),
  appUrl: APP_URL,
  apiUrl: API_URL,
  expectedLabel: EXPECTED_LABEL,
  steps: {},
};
const log = (message) => {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  appendFileSync(LOG_PATH, `${line}\n`, 'utf8');
};
const fail = (message) => {
  log(`FAIL: ${message}`);
  throw new Error(message);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// CDP plumbing
// ---------------------------------------------------------------------------
class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      this.ws.addEventListener('open', resolveOpen, { once: true });
      this.ws.addEventListener('error', rejectOpen, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolveCommand, rejectCommand } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          rejectCommand(new Error(JSON.stringify(message.error)));
        } else {
          resolveCommand(message.result ?? {});
        }
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveCommand, rejectCommand) => {
      this.pending.set(id, { resolveCommand, rejectCommand });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function findPageTarget() {
  const response = await fetch(`${CDP_URL}/json/list`);
  const targets = await response.json();
  const page = targets.find((item) => item.type === 'page' && item.url === 'about:blank')
    || targets.find((item) => item.type === 'page');
  if (!page) fail('No page target available in CDP');
  return page;
}

function makeHelpers(cdp) {
  const evaluate = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      fail(`Runtime.evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return result.result?.value;
  };

  const text = () => evaluate('document.body?.innerText ?? ""');

  const waitFor = async (label, predicate, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    let lastValue;
    while (Date.now() < deadline) {
      try {
        lastValue = await predicate();
        if (lastValue) return lastValue;
      } catch (error) {
        lastValue = error.message;
      }
      await sleep(150);
    }
    fail(`Timeout waiting for ${label}; last=${JSON.stringify(lastValue)}`);
  };

  const waitForText = (label, needle, timeoutMs = 15000) => waitFor(
    label,
    async () => (await text()).includes(needle),
    timeoutMs,
  );

  const setValue = (selector, value) => evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const proto = element.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return element.value;
  })()`);

  const clickButton = (label) => evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const target = buttons.find((button) => button.textContent.trim().includes(${JSON.stringify(label)}));
    if (!target) return false;
    target.click();
    return true;
  })()`);

  const clickRowDetail = (ticketId) => evaluate(`(() => {
    const rows = [...document.querySelectorAll('table tbody tr')];
    const row = rows.find((item) => item.querySelector('th')?.textContent.trim() === '#${ticketId}');
    if (!row) return false;
    const button = [...row.querySelectorAll('button')]
      .find((item) => item.textContent.includes('Ver detalle'));
    if (!button) return false;
    button.click();
    return true;
  })()`);

  const screenshot = async (fileName) => {
    const metrics = await cdp.send('Page.getLayoutMetrics');
    const content = metrics.cssContentSize || metrics.contentSize;
    const width = Math.ceil(content.width);
    const height = Math.ceil(content.height);
    const capture = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    const path = join(SHOTS, fileName);
    writeFileSync(path, Buffer.from(capture.data, 'base64'));
    log(`screenshot ${fileName} (${width}x${height})`);
    return { path, width, height };
  };

  return { evaluate, text, waitFor, waitForText, setValue, clickButton, clickRowDetail, screenshot };
}

// ---------------------------------------------------------------------------
// External observations: database counts, fixture hash, API calls
// ---------------------------------------------------------------------------
function dbCounts() {
  const script = `
import json, sqlite3
con = sqlite3.connect(r"${DB_PATH}")
tables = [
    "field_animal_records",
    "reconciliation_tickets",
    "reconciliation_discrepancies",
    "reconciliation_resolutions",
]
print(json.dumps({table: con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in tables}))
`;
  return JSON.parse(execFileSync(PYTHON, ['-c', script], { encoding: 'utf8' }).trim());
}

function dbFieldRecords() {
  const script = `
import json, sqlite3
con = sqlite3.connect(r"${DB_PATH}")
con.row_factory = sqlite3.Row
rows = con.execute("""
    SELECT din, species, sex, age_group, sit_code, establishment_name, source
    FROM field_animal_records ORDER BY din
""").fetchall()
print(json.dumps([dict(row) for row in rows], sort_keys=True))
`;
  return JSON.parse(execFileSync(PYTHON, ['-c', script], { encoding: 'utf8' }).trim());
}

function fixtureHash() {
  const script = `
import hashlib
print(hashlib.sha256(open(r"${OFFICIAL_FIXTURE}", "rb").read()).hexdigest())
`;
  return execFileSync(PYTHON, ['-c', script], { encoding: 'utf8' }).trim();
}

async function apiJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function apiLogin(email, farmId = null) {
  const payload = { username: email, password: 'password123' };
  if (farmId !== null && farmId !== undefined) payload.farm_id = farmId;
  const response = await apiJson('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.status !== 200) fail(`API login failed for ${email}: ${JSON.stringify(response)}`);
  if (farmId !== null && farmId !== undefined && response.body.farm_id !== farmId) {
    fail(`API login for ${email} returned farm_id=${response.body.farm_id}, expected ${farmId}`);
  }
  return response.body.access_token;
}

async function listTickets(token, query = '') {
  return apiJson(`/integrations/sinigan-sync/tickets${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function ticketIdFromText(bodyText) {
  const match = bodyText.match(/ticket #(\d+)/i);
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------
const pageTarget = await findPageTarget();
log(`CDP page target: ${pageTarget.id} (${pageTarget.url})`);
const cdp = new Cdp(pageTarget.webSocketDebuggerUrl);
await cdp.connect();
const {
  evaluate, text, waitFor, waitForText, setValue, clickButton, clickRowDetail, screenshot,
} = makeHelpers(cdp);

await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false,
});

const navigate = async (url) => {
  await cdp.send('Page.navigate', { url });
  await waitFor('document ready', async () => (await evaluate('document.readyState')) === 'complete', 20000);
};

const loginThroughUi = async (email) => {
  await waitFor('login email input', async () => (await evaluate('Boolean(document.querySelector("#email"))')), 20000);
  await setValue('#email', email);
  await setValue('#password', 'password123');
  const clicked = await clickButton('Iniciar Sesión');
  if (!clicked) fail('Login submit button not found');
  await waitFor(`dashboard for ${email}`, async () => {
    const bodyText = await text();
    return bodyText.includes(email) && bodyText.includes('Conciliación oficial vs. registro de campo');
  }, 20000);
  log(`logged in as ${email}`);
};

const reloadApp = async () => {
  await cdp.send('Page.reload');
  await sleep(500);
  await waitFor('reload ready', async () => (await evaluate('document.readyState')) === 'complete', 20000);
  await waitFor('reload app shell', async () => (await evaluate('Boolean(document.querySelector("#root"))')), 20000);
};

const compareThroughUi = async (din) => {
  await waitFor('compare form', async () => (await evaluate(`(() => {
    const input = document.querySelector('#reconciliation-din');
    const button = [...document.querySelectorAll('button')]
      .find((item) => item.textContent.includes('Comparar ficha y campo'));
    return Boolean(input && button);
  })()`)), 20000);
  await setValue('#reconciliation-din', din);
  const clicked = await clickButton('Comparar ficha y campo');
  if (!clicked) fail('Compare button not found');
  log(`triggered comparison for ${din}`);
};

try {
  // Initial observations before any comparison.
  const countsBefore = dbCounts();
  const fieldBefore = dbFieldRecords();
  const hashBefore = fixtureHash();
  results.steps.baseline = { countsBefore, fixtureSha256Before: hashBefore };
  log(`baseline counts=${JSON.stringify(countsBefore)} fixtureSha256=${hashBefore}`);

  await navigate(APP_URL);
  await waitFor('app shell', async () => (await evaluate('Boolean(document.querySelector("#root"))')), 20000);
  await evaluate('localStorage.clear()');
  await reloadApp();
  await waitFor('login form after reload', async () => (await evaluate('Boolean(document.querySelector("#email"))')), 20000);

  // -----------------------------------------------------------------------
  // AC-01 — existing DIN with exact simulation label
  // -----------------------------------------------------------------------
  await loginThroughUi('operario@bovinotech.co');
  await compareThroughUi('DIN-DEMO-000001');
  await waitForText('AC-01 consistent result', 'Conciliación consistente', 20000);
  await waitForText('AC-01 exact label', EXPECTED_LABEL);
  const ac01Text = await text();
  if (!ac01Text.includes('Luna') || !ac01Text.includes('SIT-DEMO-001')) {
    fail('AC-01 official sheet values are missing from the UI');
  }
  const ac01Shot = await screenshot('AC-01.png');
  results.steps.ac01 = {
    din: 'DIN-DEMO-000001',
    observed: {
      label: EXPECTED_LABEL,
      resultText: 'Conciliación consistente',
      animalName: 'Luna',
      sitCode: 'SIT-DEMO-001',
      officialSourceLine: ac01Text.includes('Origen oficial:') ? 'visible in ticket detail only' : 'comparison badge visible',
    },
    screenshot: ac01Shot.path,
  };
  log('AC-01 OK');

  // Fresh page so AC-02 shows a clean not-found state.
  await reloadApp();
  await waitForText('reloaded reconciliation panel', 'Conciliación oficial vs. registro de campo', 20000);

  // -----------------------------------------------------------------------
  // AC-02 — unknown DIN, 404, zero writes
  // -----------------------------------------------------------------------
  const ac02Before = dbCounts();
  await compareThroughUi('DIN-DEMO-999999');
  await waitForText(
    'AC-02 not found message',
    'DIN no encontrado en las referencias disponibles.',
    20000,
  );
  await sleep(400);
  const ac02After = dbCounts();
  const ac02Text = await text();
  // HU-01 stores the session (token + claims) under `bovinotech_session`; the
  // old `bovinotech_token` key no longer exists.
  const tokenOperarioUi = await evaluate(`(() => {
    try {
      const session = JSON.parse(localStorage.getItem('bovinotech_session') || '{}');
      return session.token || null;
    } catch {
      return null;
    }
  })()`);
  if (!tokenOperarioUi) {
    fail('AC-02 could not read the token from localStorage.bovinotech_session');
  }
  const ac02Tickets = await listTickets(tokenOperarioUi, '?din=DIN-DEMO-999999');
  if (JSON.stringify(ac02Before) !== JSON.stringify(ac02After)) {
    fail(`AC-02 wrote to the database: before=${JSON.stringify(ac02Before)} after=${JSON.stringify(ac02After)}`);
  }
  if ((ac02Tickets.body?.items ?? []).length !== 0) {
    fail('AC-02 created a ticket for DIN-DEMO-999999');
  }
  const ac02Shot = await screenshot('AC-02.png');
  results.steps.ac02 = {
    din: 'DIN-DEMO-999999',
    observedMessage: 'DIN no encontrado en las referencias disponibles.',
    countsBefore: ac02Before,
    countsAfter: ac02After,
    ticketsForUnknownDin: ac02Tickets.body,
    apiStatusForUnknownDin: ac02Tickets.status,
    screenshot: ac02Shot.path,
  };
  log('AC-02 OK');

  // -----------------------------------------------------------------------
  // AC-03 — sex discrepancy and age-group discrepancy
  // -----------------------------------------------------------------------
  await reloadApp();
  await waitForText('reloaded reconciliation panel for AC-03', 'Conciliación oficial vs. registro de campo', 20000);

  await compareThroughUi('DIN-DEMO-000002');
  await waitForText('AC-03 sex discrepancy', 'Discrepancia detectada', 20000);
  await waitForText('AC-03 sex official value', 'MACHO', 20000);
  await waitFor('AC-03 sex ticket id', async () => ticketIdFromText(await text()) !== null, 20000);
  const ac03SexText = await text();
  const sexTicketId = ticketIdFromText(ac03SexText);
  const ac03SexShot = await screenshot('AC-03-sex.png');
  results.steps.ac03Sex = {
    din: 'DIN-DEMO-000002',
    ticketId: sexTicketId,
    observed: {
      fieldName: 'Sexo',
      officialValue: 'MACHO',
      fieldValue: 'HEMBRA',
      labelVisible: ac03SexText.includes(EXPECTED_LABEL),
      dateColumnVisible: ac03SexText.includes('Detectada'),
      originColumnsVisible: ac03SexText.includes('Origen oficial') && ac03SexText.includes('Origen de campo'),
    },
    screenshot: ac03SexShot.path,
  };
  log(`AC-03 sex OK ticket=${sexTicketId}`);

  await compareThroughUi('DIN-DEMO-000003');
  await waitForText('AC-03 age group official value', 'TERNERO', 20000);
  await waitForText('AC-03 age group field value', 'ADULTO', 20000);
  await waitFor('AC-03 age ticket id', async () => {
    const id = ticketIdFromText(await text());
    return id !== null && id !== sexTicketId;
  }, 20000);
  const ac03AgeText = await text();
  const ageTicketId = ticketIdFromText(ac03AgeText);
  const ac03Shot = await screenshot('AC-03.png');
  results.steps.ac03Age = {
    din: 'DIN-DEMO-000003',
    ticketId: ageTicketId,
    observed: {
      fieldName: 'Grupo etario',
      officialValue: 'TERNERO',
      fieldValue: 'ADULTO',
      labelVisible: ac03AgeText.includes(EXPECTED_LABEL),
      dateColumnVisible: ac03AgeText.includes('Detectada'),
      originColumnsVisible: ac03AgeText.includes('Origen oficial') && ac03AgeText.includes('Origen de campo'),
    },
    screenshot: ac03Shot.path,
  };
  log(`AC-03 age group OK ticket=${ageTicketId}`);

  // -----------------------------------------------------------------------
  // AC-04 — veterinarian resolution, mandatory reason, closure and traceability
  // -----------------------------------------------------------------------
  await clickButton('Cerrar Sesión');
  await waitFor('login form after logout', async () => (await evaluate('Boolean(document.querySelector("#email"))')), 20000);
  await loginThroughUi('vet@bovinotech.co');
  await waitForText('tickets table for vet', 'Tickets de conciliación', 20000);

  const selectedId = sexTicketId;
  const opened = await clickRowDetail(selectedId);
  if (!opened) fail(`Could not open ticket row #${selectedId}`);
  await waitForText(`detail for ticket #${selectedId}`, `Detalle del ticket #${selectedId}`, 20000);
  await waitFor('resolution form visible', async () => (await evaluate('Boolean(document.querySelector("#resolution-reason"))')), 20000);

  const detailBeforeText = await text();
  if (!detailBeforeText.includes('Abierto')) fail('Ticket was not OPEN before resolution');

  // Attempt to submit with an empty reason. HTML required validation must block it.
  await setValue('#resolution-reason', '');
  const emptyValidity = await evaluate(`(() => {
    const field = document.querySelector('#resolution-reason');
    const form = field?.closest('form');
    if (!field || !form) return null;
    field.value = '';
    form.requestSubmit();
    return {
      empty: field.value === '',
      valid: field.checkValidity(),
      validationMessage: field.validationMessage,
      matchesInvalid: field.matches(':invalid'),
    };
  })()`);
  await sleep(500);
  const afterEmptyText = await text();
  if (emptyValidity?.valid !== false) fail('Empty reason was accepted by the browser validation');
  if (afterEmptyText.includes('Resolución registrada')) {
    fail('Ticket was resolved despite the empty reason');
  }
  const ac04EmptyShot = await screenshot('AC-04-empty-reason.png');
  results.steps.ac04EmptyReason = {
    ticketId: selectedId,
    browserValidation: emptyValidity,
    ticketStillOpen: afterEmptyText.includes('Abierto'),
    screenshot: ac04EmptyShot.path,
  };
  log('AC-04 empty reason blocked by browser validation');

  // Resolve with a valid reason.
  await setValue('#resolution-reason', REASON);
  const resolvedClick = await clickButton('Cerrar ticket con resolución');
  if (!resolvedClick) fail('Resolution submit button not found');

  // After resolving, `SiniganReconciliation.handleResolved` reloads the detail.
  // While `loadingDetail` is true the child `SiniganTicketDetail` unmounts and
  // its transient local success message is lost. The durable evidence is the
  // parent notice plus the reloaded resolution block, so assert on those.
  const PARENT_NOTICE = `Ticket #${selectedId} cerrado.`;
  await waitForText(
    `persistent parent notice for ticket #${selectedId}`,
    PARENT_NOTICE,
    20000,
  );
  await waitForText(
    'persistent resolution sentence',
    'La resolución quedó registrada',
    20000,
  );

  const detailSectionText = () => evaluate(`(() => {
    const title = document.querySelector('#ticket-detail-title');
    return title?.closest('section')?.innerText ?? '';
  })()`);
  const resolvedDetailText = await waitFor(
    `reloaded resolved detail for ticket #${selectedId}`,
    async () => {
      const sectionText = await detailSectionText();
      const required = [
        'Resolución registrada',
        'Cerrado',
        'Prevalece la ficha oficial',
        REASON,
        'vet@bovinotech.co',
      ];
      return required.every((needle) => sectionText.includes(needle))
        ? sectionText
        : false;
    },
    20000,
  );

  const ac04Text = await text();
  if (!ac04Text.includes(PARENT_NOTICE)) {
    fail('Persistent parent closure notice missing after detail reload');
  }
  if (!ac04Text.includes('La resolución quedó registrada')) {
    fail('Persistent resolution sentence missing after detail reload');
  }
  if (!resolvedDetailText.includes('Resolución registrada')) {
    fail('Resolution block missing after detail reload');
  }
  if (!resolvedDetailText.includes('Cerrado')) {
    fail('Closed status missing from the ticket detail after reload');
  }
  if (!resolvedDetailText.includes('Prevalece la ficha oficial')) {
    fail('Resolution decision missing after reload');
  }
  if (!resolvedDetailText.includes(REASON)) fail('Resolution reason missing after reload');
  if (!resolvedDetailText.includes('vet@bovinotech.co')) {
    fail('Resolution author missing after reload');
  }
  const ac04Shot = await screenshot('AC-04.png');
  results.steps.ac04 = {
    ticketId: selectedId,
    decision: 'OFICIAL_PREVALECE',
    reason: REASON,
    resolvedBy: 'vet@bovinotech.co',
    observed: {
      successMessage: `${PARENT_NOTICE} La resolución quedó registrada de forma permanente.`,
      status: 'Cerrado',
      decisionLabel: 'Prevalece la ficha oficial',
      reasonVisible: resolvedDetailText.includes(REASON),
      authorVisible: resolvedDetailText.includes('vet@bovinotech.co'),
      dateVisible: /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(ac04Text),
      persistentDetailText: resolvedDetailText,
    },
    screenshot: ac04Shot.path,
  };
  log('AC-04 UI resolution OK (persistent evidence)');

  // HTTP authorization/retry evidence from the real running API.
  const operarioToken = await apiLogin('operario@bovinotech.co');
  const vetToken = await apiLogin('vet@bovinotech.co');
  const operarioResolution = await apiJson(
    `/integrations/sinigan-sync/tickets/${ageTicketId}/resolution`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${operarioToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'OFICIAL_PREVALECE', reason: REASON }),
    },
  );
  const retryResolution = await apiJson(
    `/integrations/sinigan-sync/tickets/${selectedId}/resolution`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vetToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'OFICIAL_PREVALECE', reason: REASON }),
    },
  );
  const closedDetail = await apiJson(`/integrations/sinigan-sync/tickets/${selectedId}`, {
    headers: { Authorization: `Bearer ${vetToken}` },
  });
  if (operarioResolution.status !== 403) {
    fail(`Operario resolution should be 403, got ${operarioResolution.status}`);
  }
  if (retryResolution.status !== 409) {
    fail(`Retry resolution should be 409, got ${retryResolution.status}`);
  }
  if (closedDetail.body?.status !== 'CLOSED') {
    fail('Resolved ticket is not CLOSED in the API');
  }
  results.steps.ac04Http = {
    operarioResolutionStatus: operarioResolution.status,
    operarioResolutionBody: operarioResolution.body,
    retryResolutionStatus: retryResolution.status,
    retryResolutionBody: retryResolution.body,
    closedDetail: closedDetail.body,
  };
  log('AC-04 HTTP 403/409 evidence OK');

  // -----------------------------------------------------------------------
  // D10 — farm isolation on the real running API.
  //
  // `ageTicketId` was created by the farm-one operator (DIN-DEMO-000003) and
  // is still OPEN: the operario resolution above was rejected with 403 and the
  // 409 retry targeted the already-closed `selectedId` ticket.
  // -----------------------------------------------------------------------
  const vet2Farm2Token = await apiLogin('vet2@bovinotech.co', 2);
  const vet2Farm2Headers = { Authorization: `Bearer ${vet2Farm2Token}` };
  const vet2Farm2List = await listTickets(vet2Farm2Token);
  const vet2Farm2Detail = await apiJson(
    `/integrations/sinigan-sync/tickets/${ageTicketId}`,
    { headers: vet2Farm2Headers },
  );
  const vet2Farm2Resolution = await apiJson(
    `/integrations/sinigan-sync/tickets/${ageTicketId}/resolution`,
    {
      method: 'POST',
      headers: {
        ...vet2Farm2Headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'OFICIAL_PREVALECE', reason: REASON }),
    },
  );
  const vet2Farm2ListedIds = (vet2Farm2List.body?.items ?? []).map((item) => item.id);
  if (vet2Farm2List.status !== 200) {
    fail(`D10 farm-2 listing should be 200, got ${vet2Farm2List.status}`);
  }
  if (vet2Farm2ListedIds.includes(ageTicketId)) {
    fail(`D10 farm-2 listing leaked ticket #${ageTicketId}`);
  }
  if (vet2Farm2Detail.status !== 404) {
    fail(`D10 farm-2 detail should be 404, got ${vet2Farm2Detail.status}`);
  }
  if (vet2Farm2Resolution.status !== 404) {
    fail(`D10 farm-2 resolution should be 404, got ${vet2Farm2Resolution.status}`);
  }

  const vet2Farm1Token = await apiLogin('vet2@bovinotech.co', 1);
  const vet2Farm1Headers = { Authorization: `Bearer ${vet2Farm1Token}` };
  const vet2Farm1List = await listTickets(vet2Farm1Token);
  const vet2Farm1ListedIds = (vet2Farm1List.body?.items ?? []).map((item) => item.id);
  const vet2Farm1Summary = (vet2Farm1List.body?.items ?? [])
    .find((item) => item.id === ageTicketId);
  const vet2Farm1Detail = await apiJson(
    `/integrations/sinigan-sync/tickets/${ageTicketId}`,
    { headers: vet2Farm1Headers },
  );
  if (vet2Farm1List.status !== 200) {
    fail(`D10 farm-1 listing should be 200, got ${vet2Farm1List.status}`);
  }
  if (!vet2Farm1ListedIds.includes(ageTicketId)) {
    fail(`D10 farm-1 listing should include ticket #${ageTicketId}`);
  }
  if (vet2Farm1Summary?.farmId !== 1) {
    fail(`D10 farm-1 listing summary should expose farmId=1, got ${JSON.stringify(vet2Farm1Summary)}`);
  }
  if (vet2Farm1Detail.status !== 200) {
    fail(`D10 farm-1 detail should be 200, got ${vet2Farm1Detail.status}`);
  }
  if (vet2Farm1Detail.body?.farmId !== 1) {
    fail(`D10 farm-1 detail should expose farmId=1, got ${vet2Farm1Detail.body?.farmId}`);
  }
  if (vet2Farm1Detail.body?.status !== 'OPEN') {
    fail(`D10 ticket #${ageTicketId} should still be OPEN, got ${vet2Farm1Detail.body?.status}`);
  }

  results.steps.d10FarmIsolation = {
    ticketId: ageTicketId,
    farm2: {
      listingStatus: vet2Farm2List.status,
      listedTicketIds: vet2Farm2ListedIds,
      ticketVisible: vet2Farm2ListedIds.includes(ageTicketId),
      detailStatus: vet2Farm2Detail.status,
      detailBody: vet2Farm2Detail.body,
      resolutionStatus: vet2Farm2Resolution.status,
      resolutionBody: vet2Farm2Resolution.body,
    },
    farm1: {
      listingStatus: vet2Farm1List.status,
      ticketVisible: vet2Farm1ListedIds.includes(ageTicketId),
      summaryFarmId: vet2Farm1Summary?.farmId ?? null,
      detailStatus: vet2Farm1Detail.status,
      detailFarmId: vet2Farm1Detail.body?.farmId ?? null,
      detailTicketStatus: vet2Farm1Detail.body?.status ?? null,
    },
    tokenMaterialStored: false,
  };
  log(`D10 farm isolation OK ticket=${ageTicketId}`);

  // -----------------------------------------------------------------------
  // No-overwrite evidence across the whole E2E run.
  // -----------------------------------------------------------------------
  const countsAfter = dbCounts();
  const fieldAfter = dbFieldRecords();
  const hashAfter = fixtureHash();
  if (hashAfter !== hashBefore) fail('Official SINIGAN fixture changed during E2E');
  if (JSON.stringify(fieldBefore) !== JSON.stringify(fieldAfter)) {
    fail('Field animal records changed during E2E');
  }
  results.steps.noOverwrite = {
    fixtureSha256Before: hashBefore,
    fixtureSha256After: hashAfter,
    fixtureUnchanged: hashAfter === hashBefore,
    fieldRecordsBefore: fieldBefore,
    fieldRecordsAfter: fieldAfter,
    fieldRecordsUnchanged: JSON.stringify(fieldBefore) === JSON.stringify(fieldAfter),
    countsBefore,
    countsAfter,
  };
  log('No-overwrite evidence OK');

  results.finishedAt = new Date().toISOString();
  results.status = 'PASS';
  writeFileSync(RESULT_PATH, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  log(`E2E PASS; results written to ${RESULT_PATH}`);
} catch (error) {
  results.finishedAt = new Date().toISOString();
  results.status = 'FAIL';
  results.error = error.stack || String(error);
  writeFileSync(RESULT_PATH, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  log(`E2E FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  cdp.close();
}
