"""KPI Dashboard integration tests — run with PYTHONPATH=."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def login(role="vet"):
    creds = {
        "vet": ("vet@bovinotech.co", "password123"),
        "operario": ("operario@bovinotech.co", "password123"),
    }
    email, password = creds[role]
    resp = client.post("/auth/login", json={"username": email, "password": password})
    return resp.json()["access_token"]

passed = 0
failed = 0
results = []

def check(num, name, condition, detail=""):
    global passed, failed
    ok = bool(condition)
    if ok: passed += 1
    else: failed += 1
    mark = "PASS" if ok else "FAIL"
    results.append(f"TC{num:02d} | {mark} | {name} | {detail}")
    print(f"  TC{num:02d} {mark}: {name} - {detail}")

os.environ["PYTHONIOENCODING"] = "utf-8"
# Force stdout to UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
print("=" * 60)
print("KPI Dashboard -- Integration & Security Tests")
print("=" * 60)

# TC01: Vet KPI defaults
resp = client.get("/dashboard/kpi", headers={"Authorization": f"Bearer {login('vet')}"})
data = resp.json()
check(1, "Vet KPI returns farm 1", 
      resp.status_code == 200 and data["farmId"] == 1,
      f"Status={resp.status_code} farmId={data['farmId']}")

# TC02: Vet KPI full year — GDP=0.44, alerts=1 (farm 1 has 1 OPEN ticket from HU-05)
resp = client.get("/dashboard/kpi?start_date=2026-01-01&end_date=2026-12-31",
                  headers={"Authorization": f"Bearer {login('vet')}"})
data = resp.json()
gdp = data["indicators"]["averageGdp"]
alerts = data["indicators"]["openAlerts"]
check(2, "Vet KPI GDP + alerts correct", 
      gdp == 0.44 and alerts == 1,
      f"GDP={gdp} Alerts={alerts}")

# TC03: Vaccination coverage null (no data in period)
check(3, "Coverage null when no data", 
      data["indicators"]["validatedVaccinationCoverage"] is None)

# TC04: Operario = operationalOnly + restricted fields
resp = client.get("/dashboard/kpi", headers={"Authorization": f"Bearer {login('operario')}"})
data = resp.json()
check(4, "Operario operationalOnly + alerts/gdp null",
      data["operationalOnly"] and data["indicators"]["openAlerts"] is None and data["indicators"]["averageGdp"] is None,
      f"opOnly={data['operationalOnly']}")

# TC05: CRIT-1 check — Operario cannot bypass farm by passing farm_id=2
resp = client.get("/dashboard/kpi?farm_id=2", headers={"Authorization": f"Bearer {login('operario')}"})
data = resp.json()
check(5, "SEC: Operario farm_id forced to own",
      data["farmId"] == 1,
      f"Got farmId={data['farmId']} (expected 1)")

# TC06: CRIT-1 check — Vet trying cross-farm farm_id=99 must be 403
resp = client.get("/dashboard/kpi?farm_id=99", headers={"Authorization": f"Bearer {login('vet')}"})
check(6, "SEC: Vet cross-farm farm_id=99 → 403",
      resp.status_code == 403,
      f"Status={resp.status_code}")

# TC07: RBAC — Operario cannot export audit
resp = client.get("/dashboard/audit-export", headers={"Authorization": f"Bearer {login('operario')}"})
check(7, "SEC: Operario audit-export → 403",
      resp.status_code == 403,
      f"Status={resp.status_code}")

# TC08: No token → 401
resp = client.get("/dashboard/kpi")
check(8, "SEC: No token → 401",
      resp.status_code == 401,
      f"Status={resp.status_code}")

# TC09: Bad date format → 422
resp = client.get("/dashboard/kpi?start_date=not-a-date",
                  headers={"Authorization": f"Bearer {login('vet')}"})
check(9, "SEC: Bad date → 422",
      resp.status_code == 422,
      f"Status={resp.status_code}")

# TC10: Audit export VET works
resp = client.get("/dashboard/audit-export?start_date=2026-01-01&end_date=2026-12-31",
                  headers={"Authorization": f"Bearer {login('vet')}"})
data = resp.json()
check(10, "Audit export VET works",
      resp.status_code == 200 and "exportedBy" in data,
      f"Status={resp.status_code} totalEvents={data.get('totalEvents')}")

# TC11: HIGH-1 check — Vet2 tries completely unrelated farm_id=999 (should be 403)
login_vet2 = client.post("/auth/login", json={"username": "vet2@bovinotech.co", "password": "password123", "farm_id": 2})
token_vet2 = login_vet2.json()["access_token"]
resp = client.get("/dashboard/kpi?farm_id=999",
                  headers={"Authorization": f"Bearer {token_vet2}"})
check(11, "SEC: Vet2 unassigned farm 403",
      resp.status_code == 403,
      f"Status={resp.status_code}")

# TC12: Vet2 can see his own farm (farm=2)
resp = client.get("/dashboard/kpi?farm_id=2",
                  headers={"Authorization": f"Bearer {token_vet2}"})
data = resp.json()
check(12, "Vet2 sees his own farm 2",
      resp.status_code == 200 and data["farmId"] == 2,
      f"Status={resp.status_code} farmId={data.get('farmId')}")

# TC13: Admin (like VET/DIRECTIVO) — should NOT see restricted
login_admin = client.post("/auth/login", json={"username": "admin@bovinotech.co", "password": "password123"})
token_admin = login_admin.json()["access_token"]
resp = client.get("/dashboard/kpi", headers={"Authorization": f"Bearer {token_admin}"})
data = resp.json()
check(13, "Admin KPI (no restricted)",
      resp.status_code == 200 and data.get("farmId") is not None,
      f"Status={resp.status_code}")

print()
print("=" * 60)
print(f"RESULTADOS: {passed}/{passed+failed} passed, {failed} failed")
print("=" * 60)

for r in results:
    print(r)

print()
if failed > 0:
    print("❌ ALGUNOS TESTS FALLARON — Revisar arriba")
    sys.exit(1)
else:
    print("✅ TODOS LOS TESTS PASAN — Seguridad OK")