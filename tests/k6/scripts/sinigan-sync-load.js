import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.TARGET === "render"
  ? "https://bovinotech-iot-sdd.onrender.com"
  : "http://host.docker.internal:8000";

const errorRate = new Rate("errors");

const USERS = [
  { username: "operario@bovinotech.co", password: "password123", farm_id: 1 },
  { username: "vet@bovinotech.co", password: "password123", farm_id: 1 },
  { username: "vet2@bovinotech.co", password: "password123", farm_id: 1 },
  { username: "vet2@bovinotech.co", password: "password123", farm_id: 2 },
];

function login(user) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify(user), {
    headers: { "Content-Type": "application/json" },
  });
  check(res, { "login 200": (r) => r.status === 200 });
  if (res.status !== 200) {
    errorRate.add(1);
    return null;
  }
  return res.json("access_token");
}

function compareDIN(token, din) {
  const res = http.post(`${BASE_URL}/integrations/sinigan-sync/comparisons`,
    JSON.stringify({ din }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } }
  );
  errorRate.add(res.status >= 400 ? 1 : 0);
  return res;
}

function listTickets(token) {
  const res = http.get(`${BASE_URL}/integrations/sinigan-sync/tickets?limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  errorRate.add(res.status >= 400 ? 1 : 0);
  return res;
}

function getTicketDetail(token, ticketId) {
  const res = http.get(`${BASE_URL}/integrations/sinigan-sync/tickets/${ticketId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res;
}

function resolveTicket(token, ticketId) {
  const res = http.post(`${BASE_URL}/integrations/sinigan-sync/tickets/${ticketId}/resolution`,
    JSON.stringify({ decision: "OFICIAL_PREVALECE", reason: "Prueba de carga k6 - resolución automática." }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } }
  );
  return res;
}

export const options = {
  thresholds: {
    errors: ["rate<0.10"],
    http_req_duration: ["p(95)<4000"],
  },
};

export default function () {
  group("Flujo HU-05", () => {
    const user = USERS[Math.floor(Math.random() * USERS.length)];
    const token = login(user);
    if (!token) return;

    const dins = ["DIN-DEMO-000001", "DIN-DEMO-000002", "DIN-DEMO-000003", "DIN-DEMO-999999"];
    const din = dins[Math.floor(Math.random() * dins.length)];
    
    compareDIN(token, din);
    sleep(0.5);

    const listRes = listTickets(token);
    sleep(0.3);

    if (listRes.status === 200) {
      const items = listRes.json("items");
      if (items && items.length > 0) {
        const ticket = items[Math.floor(Math.random() * items.length)];
        getTicketDetail(token, ticket.id);
        sleep(0.3);

        if (user.username.indexOf("vet") !== -1 && Math.random() < 0.3) {
          resolveTicket(token, ticket.id);
        }
      }
    }
  });
}
