import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.TARGET === "render"
  ? "https://bovinotech-iot-sdd.onrender.com"
  : "http://host.docker.internal:8000";

const errorRate = new Rate("errors");

const USERS = [
  { username: "vet@bovinotech.co", password: "password123", farm_id: 1 },
  { username: "operario@bovinotech.co", password: "password123", farm_id: 1 },
  { username: "vet2@bovinotech.co", password: "password123", farm_id: 2 },
  { username: "directivo@bovinotech.co", password: "password123", farm_id: 1 },
];

function login(user) {
  const payload = JSON.stringify({
    username: user.username,
    password: user.password,
    farm_id: user.farm_id,
  });
  const res = http.post(`${BASE_URL}/auth/login`, payload, {
    headers: { "Content-Type": "application/json" },
  });
  check(res, { "login 200": (r) => r.status === 200 });
  if (res.status !== 200) return null;
  return res.json().access_token;
}

export default function () {
  const user = USERS[Math.floor(Math.random() * USERS.length)];
  const token = login(user);
  if (!token) return;

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  group("KPI Dashboard", () => {
    // 1. GET /dashboard/kpi with date range
    const kpiRes = http.get(
      `${BASE_URL}/dashboard/kpi?start_date=2026-01-01&end_date=2026-12-31`,
      { headers: authHeaders }
    );
    const kpiOk = check(kpiRes, { "kpi 200": (r) => r.status === 200 });
    if (!kpiOk) errorRate.add(1);

    // 2. GET /dashboard/kpi without params (should use defaults)
    const kpiDefaultRes = http.get(`${BASE_URL}/dashboard/kpi`, {
      headers: authHeaders,
    });
    check(kpiDefaultRes, { "kpi default 200": (r) => r.status === 200 });

    // 3. GET /dashboard/kpi with specific farm (only if vet/directivo)
    if (user.farm_id === 1 && user.username !== "operario@bovinotech.co") {
      const kpiFarmRes = http.get(
        `${BASE_URL}/dashboard/kpi?farm_id=1&start_date=2026-01-01&end_date=2026-12-31`,
        { headers: authHeaders }
      );
      check(kpiFarmRes, { "kpi farm 200": (r) => r.status === 200 });
    }

    sleep(1);
  });
}

export const options = {
  thresholds: {
    errors: ["rate<0.10"],
    http_req_duration: ["p(95)<5000"],
  },
};