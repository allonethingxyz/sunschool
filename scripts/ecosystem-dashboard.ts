#!/usr/bin/env ts-node
/**
 * Sunschool Ecosystem Dashboard Generator
 *
 * Probes all Sunschool production services in real-time:
 *   - Health checks (API, SPA, static assets)
 *   - SSL certificate expiry
 *   - Auth chain verification (register, login, token validation)
 *   - AI lesson generation deep probes
 *   - Database connectivity (via API responses)
 *
 * Cross-references Playwright test results from JSON reporter with
 * extracted test names from spec files.
 *
 * Outputs both a terminal table view and a self-contained HTML dashboard.
 *
 * Usage:
 *   npx ts-node scripts/ecosystem-dashboard.ts [--html] [--json]
 *   npx ts-node scripts/ecosystem-dashboard.ts --serve [--port 9090]
 */

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as tls from 'tls';
import * as crypto from 'crypto';

// ── Types ──

interface ProbeResult {
  name: string;
  url: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  statusCode?: number;
  latencyMs: number;
  detail?: string;
  category: 'health' | 'auth' | 'api' | 'ssl' | 'deep';
}

interface SSLInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  protocol: string;
}

interface TestResult {
  name: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  duration?: number;
  error?: string;
}

interface SpecFile {
  path: string;
  basename: string;
  testNames: string[];
}

interface DashboardData {
  timestamp: string;
  probes: ProbeResult[];
  ssl: SSLInfo | null;
  tests: TestResult[];
  specFiles: SpecFile[];
  summary: {
    servicesUp: number;
    servicesDown: number;
    servicesDegraded: number;
    testsTotal: number;
    testsPassed: number;
    testsFailed: number;
    testsSkipped: number;
    avgLatencyMs: number;
  };
}

// ── Config ──

const PROD_BASE = 'https://sunschool.xyz';
const PROD_HOST = 'sunschool.xyz';
const TIMEOUT_MS = 15000;
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── HTTP Probe ──

async function httpProbe(url: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  expectStatus?: number[];
} = {}): Promise<{ statusCode: number; body: string; latencyMs: number }> {
  const { method = 'GET', headers = {}, body, expectStatus } = options;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqFn = parsedUrl.protocol === 'https:' ? https.request : http.request;

    const req = reqFn(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: TIMEOUT_MS,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: data,
          latencyMs: Date.now() - start,
        });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });

    if (body) req.write(body);
    req.end();
  });
}

// ── SSL Check ──

async function checkSSL(host: string): Promise<SSLInfo | null> {
  return new Promise((resolve) => {
    const socket = tls.connect(443, host, { servername: host }, () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) {
        socket.end();
        resolve(null);
        return;
      }

      const validTo = new Date(cert.valid_to);
      const now = new Date();
      const daysUntilExpiry = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      resolve({
        subject: cert.subject?.CN || 'unknown',
        issuer: cert.issuer?.O || 'unknown',
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        daysUntilExpiry,
        protocol: socket.getProtocol() || 'unknown',
      });
      socket.end();
    });

    socket.on('error', () => resolve(null));
    socket.setTimeout(5000, () => { socket.destroy(); resolve(null); });
  });
}

// ── Service Probes ──

async function runProbes(): Promise<ProbeResult[]> {
  const probes: ProbeResult[] = [];

  // 1. Health check
  try {
    const r = await httpProbe(`${PROD_BASE}/api/healthcheck`);
    probes.push({
      name: 'API Healthcheck',
      url: `${PROD_BASE}/api/healthcheck`,
      status: r.statusCode === 200 ? 'up' : 'down',
      statusCode: r.statusCode,
      latencyMs: r.latencyMs,
      category: 'health',
    });
  } catch (e: any) {
    probes.push({
      name: 'API Healthcheck',
      url: `${PROD_BASE}/api/healthcheck`,
      status: 'down',
      latencyMs: TIMEOUT_MS,
      detail: e.message,
      category: 'health',
    });
  }

  // 2. SPA serves index.html
  try {
    const r = await httpProbe(`${PROD_BASE}/welcome`);
    const hasSPA = r.body.includes('<div id="root"') || r.body.includes('SUNSCHOOL');
    probes.push({
      name: 'SPA Frontend',
      url: `${PROD_BASE}/welcome`,
      status: r.statusCode === 200 && hasSPA ? 'up' : 'degraded',
      statusCode: r.statusCode,
      latencyMs: r.latencyMs,
      detail: hasSPA ? undefined : 'SPA markers not found',
      category: 'health',
    });
  } catch (e: any) {
    probes.push({
      name: 'SPA Frontend',
      url: `${PROD_BASE}/welcome`,
      status: 'down',
      latencyMs: TIMEOUT_MS,
      detail: e.message,
      category: 'health',
    });
  }

  // 3. Auth chain: register -> login -> /api/user
  const ts = Date.now();
  const testUser = {
    username: `dashprobe_${ts}`,
    email: `dashprobe_${ts}@test.com`,
    password: 'DashProbe123!',
    name: 'Dashboard Probe',
    role: 'PARENT',
  };
  let authToken: string | null = null;

  try {
    const regResult = await httpProbe(`${PROD_BASE}/register`, {
      method: 'POST',
      body: JSON.stringify(testUser),
    });
    const regData = JSON.parse(regResult.body);
    authToken = regData.token || null;

    probes.push({
      name: 'Auth: Register',
      url: `${PROD_BASE}/register`,
      status: authToken ? 'up' : 'down',
      statusCode: regResult.statusCode,
      latencyMs: regResult.latencyMs,
      detail: authToken ? undefined : `No token: ${regResult.body.slice(0, 100)}`,
      category: 'auth',
    });
  } catch (e: any) {
    probes.push({
      name: 'Auth: Register',
      url: `${PROD_BASE}/register`,
      status: 'down',
      latencyMs: TIMEOUT_MS,
      detail: e.message,
      category: 'auth',
    });
  }

  // Login
  try {
    const loginResult = await httpProbe(`${PROD_BASE}/login`, {
      method: 'POST',
      body: JSON.stringify({ username: testUser.username, password: testUser.password }),
    });
    const loginData = JSON.parse(loginResult.body);
    const loginToken = loginData.token;

    probes.push({
      name: 'Auth: Login',
      url: `${PROD_BASE}/login`,
      status: loginToken ? 'up' : 'down',
      statusCode: loginResult.statusCode,
      latencyMs: loginResult.latencyMs,
      detail: loginToken ? undefined : `No token: ${loginResult.body.slice(0, 100)}`,
      category: 'auth',
    });
    if (loginToken) authToken = loginToken;
  } catch (e: any) {
    probes.push({
      name: 'Auth: Login',
      url: `${PROD_BASE}/login`,
      status: 'down',
      latencyMs: TIMEOUT_MS,
      detail: e.message,
      category: 'auth',
    });
  }

  // Token validation
  if (authToken) {
    try {
      const userResult = await httpProbe(`${PROD_BASE}/api/user`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const userData = JSON.parse(userResult.body);
      probes.push({
        name: 'Auth: Token Validation',
        url: `${PROD_BASE}/api/user`,
        status: userData.id ? 'up' : 'down',
        statusCode: userResult.statusCode,
        latencyMs: userResult.latencyMs,
        category: 'auth',
      });
    } catch (e: any) {
      probes.push({
        name: 'Auth: Token Validation',
        url: `${PROD_BASE}/api/user`,
        status: 'down',
        latencyMs: TIMEOUT_MS,
        detail: e.message,
        category: 'auth',
      });
    }
  }

  // 4. API endpoints
  const apiEndpoints = [
    { name: 'API: Privacy Policy', path: '/privacy' },
    { name: 'API: Terms', path: '/terms' },
  ];

  for (const ep of apiEndpoints) {
    try {
      const r = await httpProbe(`${PROD_BASE}${ep.path}`);
      probes.push({
        name: ep.name,
        url: `${PROD_BASE}${ep.path}`,
        status: r.statusCode === 200 ? 'up' : 'degraded',
        statusCode: r.statusCode,
        latencyMs: r.latencyMs,
        category: 'api',
      });
    } catch (e: any) {
      probes.push({
        name: ep.name,
        url: `${PROD_BASE}${ep.path}`,
        status: 'down',
        latencyMs: TIMEOUT_MS,
        detail: e.message,
        category: 'api',
      });
    }
  }

  // 5. Deep probe: lesson generation (with auth)
  if (authToken) {
    // Create child first
    try {
      const childResult = await httpProbe(`${PROD_BASE}/api/learners`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ name: `ProbeChild_${ts}`, gradeLevel: 5 }),
      });
      const childData = JSON.parse(childResult.body);
      const childId = childData.id;

      probes.push({
        name: 'Deep: Create Learner',
        url: `${PROD_BASE}/api/learners`,
        status: childId ? 'up' : 'down',
        statusCode: childResult.statusCode,
        latencyMs: childResult.latencyMs,
        detail: childId ? `ID: ${childId}` : childResult.body.slice(0, 100),
        category: 'deep',
      });

      if (childId) {
        // Try lesson generation (may take a while)
        try {
          const lessonResult = await httpProbe(`${PROD_BASE}/api/lessons/create`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ learnerId: childId, subject: 'Science', gradeLevel: 5 }),
          });
          const lessonData = JSON.parse(lessonResult.body);
          probes.push({
            name: 'Deep: AI Lesson Gen',
            url: `${PROD_BASE}/api/lessons/create`,
            status: lessonResult.statusCode < 300 ? 'up' : lessonResult.statusCode === 503 ? 'degraded' : 'down',
            statusCode: lessonResult.statusCode,
            latencyMs: lessonResult.latencyMs,
            detail: lessonData.error || (lessonData.id ? `Lesson ${lessonData.id}` : undefined),
            category: 'deep',
          });
        } catch (e: any) {
          probes.push({
            name: 'Deep: AI Lesson Gen',
            url: `${PROD_BASE}/api/lessons/create`,
            status: 'down',
            latencyMs: TIMEOUT_MS,
            detail: e.message,
            category: 'deep',
          });
        }
      }
    } catch (e: any) {
      probes.push({
        name: 'Deep: Create Learner',
        url: `${PROD_BASE}/api/learners`,
        status: 'down',
        latencyMs: TIMEOUT_MS,
        detail: e.message,
        category: 'deep',
      });
    }
  }

  return probes;
}

// ── Spec File Parser ──

function parseSpecFiles(): SpecFile[] {
  const specDirs = [
    path.join(PROJECT_ROOT, 'tests/e2e/specs'),
    path.join(PROJECT_ROOT, '../sunschool/tests/e2e/specs'),
  ];

  const specFiles: SpecFile[] = [];

  for (const dir of specDirs) {
    if (!fs.existsSync(dir)) continue;
    const walkDir = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) walkDir(fullPath);
        else if (entry.name.endsWith('.spec.ts')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const testNames: string[] = [];
          const regex = /test\s*\(\s*['"`]([^'"`]+)['"`]/g;
          let match;
          while ((match = regex.exec(content)) !== null) {
            testNames.push(match[1]);
          }
          specFiles.push({
            path: path.relative(PROJECT_ROOT, fullPath),
            basename: entry.name,
            testNames,
          });
        }
      }
    };
    walkDir(dir);
  }

  return specFiles;
}

// ── JSON Test Results Parser ──

function parseTestResults(): TestResult[] {
  const resultPaths = [
    path.join(PROJECT_ROOT, 'test-results/results.json'),
    path.join(PROJECT_ROOT, 'tests/e2e/report/results.json'),
    path.join(PROJECT_ROOT, '../sunschool/test-results/results.json'),
  ];

  for (const rp of resultPaths) {
    if (!fs.existsSync(rp)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(rp, 'utf-8'));
      const tests: TestResult[] = [];
      // Playwright JSON format
      if (raw.suites) {
        const walkSuites = (suites: any[], parentFile: string = '') => {
          for (const suite of suites) {
            const file = suite.file || parentFile;
            if (suite.specs) {
              for (const spec of suite.specs) {
                const lastResult = spec.tests?.[0]?.results?.slice(-1)[0];
                tests.push({
                  name: spec.title,
                  file,
                  status: spec.ok ? 'passed' : 'failed',
                  duration: lastResult?.duration,
                  error: lastResult?.error?.message?.slice(0, 200),
                });
              }
            }
            if (suite.suites) walkSuites(suite.suites, file);
          }
        };
        walkSuites(raw.suites);
      }
      return tests;
    } catch { continue; }
  }

  return [];
}

// ── Terminal Table ──

function printTerminalTable(data: DashboardData) {
  const { probes, ssl, tests, summary } = data;

  console.log('\n  SUNSCHOOL ECOSYSTEM DASHBOARD');
  console.log(`  ${data.timestamp}\n`);

  // Service probes
  console.log('  SERVICE PROBES');
  console.log('  ' + '-'.repeat(80));
  console.log('  ' + 'Name'.padEnd(25) + 'Status'.padEnd(12) + 'Code'.padEnd(8) + 'Latency'.padEnd(12) + 'Detail');
  console.log('  ' + '-'.repeat(80));

  for (const p of probes) {
    const statusIcon = p.status === 'up' ? '\x1b[32mUP\x1b[0m' :
      p.status === 'degraded' ? '\x1b[33mDEGR\x1b[0m' : '\x1b[31mDOWN\x1b[0m';
    console.log(
      '  ' +
      p.name.padEnd(25) +
      statusIcon.padEnd(12 + 9) + // ANSI codes add chars
      String(p.statusCode || '-').padEnd(8) +
      `${p.latencyMs}ms`.padEnd(12) +
      (p.detail || '').slice(0, 40)
    );
  }

  // SSL
  if (ssl) {
    console.log('\n  SSL CERTIFICATE');
    console.log('  ' + '-'.repeat(60));
    const expiryColor = ssl.daysUntilExpiry > 30 ? '\x1b[32m' :
      ssl.daysUntilExpiry > 7 ? '\x1b[33m' : '\x1b[31m';
    console.log(`  Subject: ${ssl.subject}`);
    console.log(`  Issuer:  ${ssl.issuer}`);
    console.log(`  Expires: ${ssl.validTo} (${expiryColor}${ssl.daysUntilExpiry} days\x1b[0m)`);
    console.log(`  Protocol: ${ssl.protocol}`);
  }

  // Test summary
  if (tests.length > 0) {
    console.log('\n  TEST RESULTS');
    console.log('  ' + '-'.repeat(60));
    console.log(`  Total: ${summary.testsTotal} | Passed: \x1b[32m${summary.testsPassed}\x1b[0m | Failed: \x1b[31m${summary.testsFailed}\x1b[0m | Skipped: ${summary.testsSkipped}`);

    const failed = tests.filter(t => t.status === 'failed');
    if (failed.length > 0) {
      console.log('\n  FAILED TESTS:');
      for (const t of failed) {
        console.log(`  \x1b[31m  x\x1b[0m ${t.name}`);
        if (t.error) console.log(`      ${t.error.slice(0, 80)}`);
      }
    }
  }

  // Summary
  console.log('\n  SUMMARY');
  console.log('  ' + '-'.repeat(60));
  console.log(`  Services: \x1b[32m${summary.servicesUp} up\x1b[0m / \x1b[33m${summary.servicesDegraded} degraded\x1b[0m / \x1b[31m${summary.servicesDown} down\x1b[0m`);
  console.log(`  Avg Latency: ${summary.avgLatencyMs}ms`);
  console.log('');
}

// ── HTML Generator ──

function generateHTML(data: DashboardData): string {
  const { probes, ssl, tests, specFiles, summary } = data;

  const upPct = summary.servicesUp + summary.servicesDegraded + summary.servicesDown > 0
    ? Math.round((summary.servicesUp / (summary.servicesUp + summary.servicesDegraded + summary.servicesDown)) * 100)
    : 0;
  const testPassPct = summary.testsTotal > 0
    ? Math.round((summary.testsPassed / summary.testsTotal) * 100)
    : 0;

  // Group tests by spec file
  const testsByFile = new Map<string, TestResult[]>();
  for (const t of tests) {
    const key = t.file || 'unknown';
    if (!testsByFile.has(key)) testsByFile.set(key, []);
    testsByFile.get(key)!.push(t);
  }

  // Group spec files with their test results
  const specCards = specFiles.map(sf => {
    const matchedTests = tests.filter(t =>
      t.file?.includes(sf.basename.replace('.spec.ts', '')) ||
      sf.testNames.some(tn => t.name.includes(tn) || tn.includes(t.name))
    );
    return { ...sf, tests: matchedTests };
  });

  const donutSVG = (pct: number, label: string, color: string) => `
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="50" fill="none" stroke="#2a2a3e" stroke-width="10"/>
      <circle cx="60" cy="60" r="50" fill="none" stroke="${color}" stroke-width="10"
        stroke-dasharray="${pct * 3.14} ${(100 - pct) * 3.14}"
        stroke-dashoffset="${25 * 3.14}" stroke-linecap="round"/>
      <text x="60" y="55" text-anchor="middle" fill="#e0e0e0" font-size="24" font-weight="bold">${pct}%</text>
      <text x="60" y="75" text-anchor="middle" fill="#888" font-size="11">${label}</text>
    </svg>`;

  const statusDot = (status: string) => {
    const color = status === 'passed' || status === 'up' ? '#4caf50'
      : status === 'failed' || status === 'down' ? '#f44336'
      : status === 'degraded' ? '#ff9800'
      : '#888';
    return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px"></span>`;
  };

  const latencyBar = (ms: number, max: number = 5000) => {
    const pct = Math.min((ms / max) * 100, 100);
    const color = ms < 500 ? '#4caf50' : ms < 2000 ? '#ff9800' : '#f44336';
    return `<div style="background:#2a2a3e;border-radius:4px;height:8px;width:100%;position:relative">
      <div style="background:${color};height:100%;width:${pct}%;border-radius:4px;transition:width 0.3s"></div>
    </div>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sunschool Ecosystem Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'SF Mono', 'Fira Code', monospace; background: #0d1117; color: #c9d1d9; line-height: 1.6; }
  .container { max-width: 1400px; margin: 0 auto; padding: 24px; }
  h1 { color: #f0f6fc; font-size: 28px; margin-bottom: 4px; }
  .subtitle { color: #6e7681; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; gap: 16px; }
  .grid-2 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .grid-3 { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .card-title { font-size: 14px; font-weight: 600; color: #f0f6fc; text-transform: uppercase; letter-spacing: 0.05em; }
  .donut-row { display: flex; justify-content: center; gap: 40px; padding: 16px 0; }
  .probe-row { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #21262d; gap: 12px; }
  .probe-row:last-child { border-bottom: none; }
  .probe-name { flex: 1; font-size: 13px; }
  .probe-status { font-size: 11px; font-weight: 600; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; }
  .probe-status.up { background: #1b4332; color: #4caf50; }
  .probe-status.down { background: #3b1212; color: #f44336; }
  .probe-status.degraded { background: #3b2e12; color: #ff9800; }
  .probe-latency { width: 80px; font-size: 12px; color: #8b949e; text-align: right; }
  .latency-bar-wrap { width: 100px; }
  .ssl-info { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: 13px; }
  .ssl-label { color: #8b949e; }
  .ssl-value { color: #c9d1d9; }
  .ssl-expiry-ok { color: #4caf50; }
  .ssl-expiry-warn { color: #ff9800; }
  .ssl-expiry-crit { color: #f44336; }
  .test-card { cursor: pointer; }
  .test-card .test-dots { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .test-card .test-list { display: none; margin-top: 12px; font-size: 12px; }
  .test-card.expanded .test-list { display: block; }
  .test-item { padding: 4px 0; display: flex; align-items: center; }
  .test-item .name { flex: 1; }
  .test-item .duration { color: #8b949e; font-size: 11px; }
  .topology { position: relative; min-height: 200px; display: flex; align-items: center; justify-content: center; gap: 32px; flex-wrap: wrap; }
  .topo-node { background: #21262d; border: 2px solid #30363d; border-radius: 12px; padding: 16px 24px; text-align: center; min-width: 140px; }
  .topo-node.active { border-color: #4caf50; }
  .topo-node.warn { border-color: #ff9800; }
  .topo-node.error { border-color: #f44336; }
  .topo-label { font-size: 11px; color: #8b949e; margin-top: 4px; }
  .topo-arrow { color: #30363d; font-size: 24px; }
  .search-bar { width: 100%; padding: 10px 16px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-family: inherit; font-size: 13px; margin-bottom: 16px; }
  .search-bar:focus { outline: none; border-color: #58a6ff; }
  .refresh-btn { background: #238636; color: white; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 13px; }
  .refresh-btn:hover { background: #2ea043; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge-pass { background: #1b4332; color: #4caf50; }
  .badge-fail { background: #3b1212; color: #f44336; }
  .badge-skip { background: #1c1c2e; color: #888; }
</style>
</head>
<body>
<div class="container">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <div>
      <h1>Sunschool Ecosystem</h1>
      <div class="subtitle">Last probed: ${data.timestamp}</div>
    </div>
    <button class="refresh-btn" onclick="location.href='/refresh'">Refresh Probes</button>
  </div>

  <!-- Donut Charts -->
  <div class="card" style="margin-bottom:16px">
    <div class="donut-row">
      ${donutSVG(upPct, 'Services Up', upPct >= 80 ? '#4caf50' : upPct >= 50 ? '#ff9800' : '#f44336')}
      ${donutSVG(testPassPct, 'Tests Pass', testPassPct >= 80 ? '#4caf50' : testPassPct >= 50 ? '#ff9800' : '#f44336')}
      <svg width="120" height="120" viewBox="0 0 120 120">
        <text x="60" y="55" text-anchor="middle" fill="#e0e0e0" font-size="24" font-weight="bold">${summary.avgLatencyMs}ms</text>
        <text x="60" y="75" text-anchor="middle" fill="#888" font-size="11">Avg Latency</text>
      </svg>
    </div>
  </div>

  <!-- Deployment Topology -->
  <div class="card" style="margin-bottom:16px">
    <div class="card-header"><span class="card-title">Deployment Topology</span></div>
    <div class="topology">
      <div class="topo-node ${probes.find(p => p.name === 'SPA Frontend')?.status === 'up' ? 'active' : 'error'}">
        <div>Browser</div>
        <div class="topo-label">React SPA</div>
      </div>
      <div class="topo-arrow">&rarr;</div>
      <div class="topo-node ${probes.find(p => p.name === 'API Healthcheck')?.status === 'up' ? 'active' : 'error'}">
        <div>Railway</div>
        <div class="topo-label">Express API</div>
      </div>
      <div class="topo-arrow">&rarr;</div>
      <div class="topo-node ${probes.find(p => p.name === 'Auth: Login')?.status === 'up' ? 'active' : 'warn'}">
        <div>PostgreSQL</div>
        <div class="topo-label">Railway DB</div>
      </div>
      <div class="topo-arrow">&rarr;</div>
      <div class="topo-node ${probes.find(p => p.name === 'Deep: AI Lesson Gen')?.status === 'up' ? 'active' : probes.find(p => p.name === 'Deep: AI Lesson Gen')?.status === 'degraded' ? 'warn' : 'error'}">
        <div>OpenRouter</div>
        <div class="topo-label">AI Models</div>
      </div>
    </div>
  </div>

  <div class="grid grid-2">
    <!-- Service Probes -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Service Probes</span>
        <span>${summary.servicesUp}/${probes.length} up</span>
      </div>
      ${probes.map(p => `
        <div class="probe-row">
          ${statusDot(p.status)}
          <span class="probe-name">${p.name}</span>
          <span class="probe-status ${p.status}">${p.status}</span>
          <div class="latency-bar-wrap">${latencyBar(p.latencyMs)}</div>
          <span class="probe-latency">${p.latencyMs}ms</span>
        </div>
      `).join('')}
    </div>

    <!-- SSL Certificate -->
    <div class="card">
      <div class="card-header"><span class="card-title">SSL Certificate</span></div>
      ${ssl ? `
        <div class="ssl-info">
          <span class="ssl-label">Subject</span><span class="ssl-value">${ssl.subject}</span>
          <span class="ssl-label">Issuer</span><span class="ssl-value">${ssl.issuer}</span>
          <span class="ssl-label">Valid From</span><span class="ssl-value">${ssl.validFrom}</span>
          <span class="ssl-label">Expires</span><span class="ssl-value ${ssl.daysUntilExpiry > 30 ? 'ssl-expiry-ok' : ssl.daysUntilExpiry > 7 ? 'ssl-expiry-warn' : 'ssl-expiry-crit'}">${ssl.validTo} (${ssl.daysUntilExpiry} days)</span>
          <span class="ssl-label">Protocol</span><span class="ssl-value">${ssl.protocol}</span>
        </div>
      ` : '<p style="color:#8b949e">SSL check failed</p>'}
    </div>
  </div>

  <!-- Test Explorer -->
  ${tests.length > 0 || specFiles.length > 0 ? `
  <div class="card" style="margin-top:16px">
    <div class="card-header">
      <span class="card-title">Test Explorer</span>
      <div>
        <span class="badge badge-pass">${summary.testsPassed} pass</span>
        <span class="badge badge-fail">${summary.testsFailed} fail</span>
        <span class="badge badge-skip">${summary.testsSkipped} skip</span>
      </div>
    </div>
    <input type="text" class="search-bar" placeholder="Search tests..." oninput="filterTests(this.value)">
    <div id="test-cards" class="grid grid-3">
      ${specCards.map(sc => `
        <div class="card test-card" onclick="this.classList.toggle('expanded')" data-tests="${sc.testNames.join(' ').toLowerCase()}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong style="font-size:13px">${sc.basename}</strong>
            <span style="font-size:11px;color:#8b949e">${sc.testNames.length} tests</span>
          </div>
          <div class="test-dots">
            ${sc.tests.length > 0
              ? sc.tests.map(t => `<span title="${t.name}" style="width:8px;height:8px;border-radius:50%;background:${t.status === 'passed' ? '#4caf50' : t.status === 'failed' ? '#f44336' : '#888'}"></span>`).join('')
              : sc.testNames.map(() => '<span style="width:8px;height:8px;border-radius:50%;background:#30363d"></span>').join('')
            }
          </div>
          <div class="test-list">
            ${(sc.tests.length > 0 ? sc.tests : sc.testNames.map(n => ({ name: n, status: 'unknown', duration: undefined }))).map((t: any) => `
              <div class="test-item">
                ${statusDot(t.status)}
                <span class="name">${t.name}</span>
                ${t.duration ? `<span class="duration">${(t.duration / 1000).toFixed(1)}s</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}
</div>

<script>
function filterTests(query) {
  const cards = document.querySelectorAll('.test-card');
  const q = query.toLowerCase();
  cards.forEach(card => {
    const tests = card.getAttribute('data-tests') || '';
    const title = card.querySelector('strong')?.textContent?.toLowerCase() || '';
    card.style.display = (tests.includes(q) || title.includes(q) || !q) ? '' : 'none';
  });
}
</script>
</body>
</html>`;
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const wantHTML = args.includes('--html');
  const wantJSON = args.includes('--json');
  const wantServe = args.includes('--serve');
  const portIdx = args.indexOf('--port');
  const port = portIdx >= 0 ? parseInt(args[portIdx + 1]) : 9090;

  async function generateDashboard(): Promise<DashboardData> {
    console.log('  Probing services...');
    const [probes, ssl] = await Promise.all([runProbes(), checkSSL(PROD_HOST)]);

    const specFiles = parseSpecFiles();
    const tests = parseTestResults();

    const servicesUp = probes.filter(p => p.status === 'up').length;
    const servicesDown = probes.filter(p => p.status === 'down').length;
    const servicesDegraded = probes.filter(p => p.status === 'degraded').length;
    const avgLatencyMs = probes.length > 0
      ? Math.round(probes.reduce((s, p) => s + p.latencyMs, 0) / probes.length)
      : 0;

    return {
      timestamp: new Date().toISOString(),
      probes,
      ssl,
      tests,
      specFiles,
      summary: {
        servicesUp,
        servicesDown,
        servicesDegraded,
        testsTotal: tests.length,
        testsPassed: tests.filter(t => t.status === 'passed').length,
        testsFailed: tests.filter(t => t.status === 'failed').length,
        testsSkipped: tests.filter(t => t.status === 'skipped').length,
        avgLatencyMs,
      },
    };
  }

  if (wantServe) {
    // Token-gated localhost-only HTTP server
    const TOKEN = process.env.DASHBOARD_TOKEN || crypto.randomBytes(16).toString('hex');
    console.log(`\n  Dashboard server starting on http://localhost:${port}`);
    console.log(`  Token: ${TOKEN}\n`);

    const server = http.createServer(async (req, res) => {
      // Localhost only
      const remote = req.socket.remoteAddress;
      if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden: localhost only');
        return;
      }

      const url = new URL(req.url || '/', `http://localhost:${port}`);
      const token = url.searchParams.get('token') || req.headers['x-dashboard-token'] as string;

      if (url.pathname !== '/health' && token !== TOKEN) {
        res.writeHead(401, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="background:#0d1117;color:#c9d1d9;font-family:monospace;padding:40px;text-align:center">
          <h2>Dashboard Token Required</h2>
          <p>Add ?token=${TOKEN} to the URL</p>
        </body></html>`);
        return;
      }

      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (url.pathname === '/refresh' || url.pathname === '/') {
        const data = await generateDashboard();
        printTerminalTable(data);
        const html = generateHTML(data);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }

      if (url.pathname === '/api/data') {
        const data = await generateDashboard();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data, null, 2));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`  Open: http://localhost:${port}?token=${TOKEN}\n`);
    });

    return;
  }

  const data = await generateDashboard();

  if (wantJSON) {
    console.log(JSON.stringify(data, null, 2));
  } else if (wantHTML) {
    const htmlPath = path.join(PROJECT_ROOT, 'ecosystem-dashboard.html');
    fs.writeFileSync(htmlPath, generateHTML(data));
    console.log(`  HTML dashboard written to ${htmlPath}`);
  } else {
    printTerminalTable(data);
  }
}

main().catch(console.error);
