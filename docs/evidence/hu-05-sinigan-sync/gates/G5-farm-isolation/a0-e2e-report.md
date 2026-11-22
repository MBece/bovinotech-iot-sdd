# G5 — Ejecución E2E fullstack de A0 (D10 aislamiento por finca)

Fecha: 2026-11-22. Entorno local (Windows, sin Docker). Ejecutado por A0 sobre el
árbol de trabajo sin commit (`HEAD = origin/develop = 38096fe`).

## Resultado

`node docs/evidence/hu-05-sinigan-sync/gates/G4-acceptance/e2e-cdp.mjs` → `EXIT_CODE=0`.

```
[2026-11-22T19:04:24.656Z] CDP page target: D64BAA0D1F8E7232521D1886D6F3602A (about:blank)
[2026-11-22T19:04:24.852Z] baseline counts={"field_animal_records":5,"reconciliation_tickets":0,"reconciliation_discrepancies":0,"reconciliation_resolutions":0} fixtureSha256=7db8f53b55c071278868b85bf071ef859a30d84e56c120ad436dfe376100011c
[2026-11-22T19:04:25.881Z] logged in as operario@bovinotech.co
[2026-11-22T19:04:25.887Z] triggered comparison for DIN-DEMO-000001
[2026-11-22T19:04:26.218Z] AC-01 OK
[2026-11-22T19:04:26.827Z] triggered comparison for DIN-DEMO-999999
[2026-11-22T19:04:27.629Z] AC-02 OK
[2026-11-22T19:04:28.143Z] triggered comparison for DIN-DEMO-000002
[2026-11-22T19:04:28.516Z] AC-03 sex OK ticket=1
[2026-11-22T19:04:28.539Z] triggered comparison for DIN-DEMO-000003
[2026-11-22T19:04:28.897Z] AC-03 age group OK ticket=2
[2026-11-22T19:04:29.232Z] logged in as vet@bovinotech.co
[2026-11-22T19:04:30.142Z] AC-04 empty reason blocked by browser validation
[2026-11-22T19:04:30.488Z] AC-04 UI resolution OK (persistent evidence)
[2026-11-22T19:04:30.917Z] AC-04 HTTP 403/409 evidence OK
[2026-11-22T19:04:31.350Z] D10 farm isolation OK ticket=2
[2026-11-22T19:04:31.509Z] No-overwrite evidence OK
[2026-11-22T19:04:31.509Z] E2E PASS
```

Bloque D10 registrado en `e2e-results.json → steps.d10FarmIsolation`:

| Verificación | Resultado |
| --- | --- |
| `vet2` finca 2 · listado | `200`, ticket 2 **no** aparece (`ticketVisible=false`) |
| `vet2` finca 2 · detalle | `404` "Ticket de conciliación no encontrado." |
| `vet2` finca 2 · resolución | `404` (mismo cuerpo, indistinguible) |
| `vet2` finca 1 · listado | `200`, ticket 2 visible, `summaryFarmId=1` |
| `vet2` finca 1 · detalle | `200`, `farmId=1`, estado `OPEN` |
| Material de token en JSON | `false` |

## Verificación independiente de A0

| Comando | Resultado | Artefacto |
| --- | --- | --- |
| `python -m pytest -q` (backend) | **122 passed**, 1 warning, 33.49 s | `a0-pytest.txt` |
| `node --test src/features/sinigan-sync/__tests__/*.test.js` | **20 pass / 0 fail** | `a0-node-test.txt` |
| `npm run lint` | exit 0 | `a0-lint.txt` |
| `npm run build` | `✓ built in 141ms`, exit 0 | `a0-build.txt` |

## Causa raíz de un fallo previo de entorno (no del código)

El primer intento de A0 falló con `Timeout waiting for login form after reload`. El
navegador recibía HTML en `/@vite/client` (404 con `Sec-Fetch-Dest: script`), por lo
que React nunca se montaba. La causa no era D10 ni el driver:

- Los procesos se lanzaron con la ruta corta 8.3 `C:\Users\JUANGU~1\...`.
- Vite 8 resuelve su cliente interno desde `VITE_PACKAGE_DIR` (ruta corta) y lo
  compara contra el `root` real (`C:\Users\Juan Gutierrez\...`), por lo que la carga
  se deniega y el fallback SPA devuelve `index.html`.
- Reproducido con un proyecto Vite mínimo; con la ruta larga `/@vite/client`
  responde `200 text/javascript` (223 211 bytes) y el E2E pasa.

Regla operativa: **lanzar backend, Vite y el driver con la ruta larga**
(`C:\Users\Juan Gutierrez\AppData\Local\Temp\opencode\wt-hu-05-sinigan-sync`).
El `--user-data-dir` de Edge puede seguir usando la ruta corta, pero debe ir
entrecomillado si contiene espacios.

## Reproducción

```powershell
# 1. Puertos libres y DB limpia para el baseline de conteos
# 2. Backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000   # cwd: backend
# 3. Frontend (ruta larga, sin --host para servir en localhost)
npm run dev -- --port 5173 --strictPort                        # cwd: frontend
# 4. Edge headless con CDP
msedge.exe --headless=new --remote-debugging-port=9222 --user-data-dir=<perfil> about:blank
# 5. Driver
node docs/evidence/hu-05-sinigan-sync/gates/G4-acceptance/e2e-cdp.mjs
```

## Artefactos en este gate

`e2e-results.json`, `e2e-cdp.log`, `e2e-run-a0.txt`, `e2e-run-a0-exit-code.txt`,
`e2e-backend.log`, `e2e-frontend.log`, capturas `AC-01.png`…`AC-04.png`,
`a0-pytest.txt`, `a0-node-test.txt`, `a0-lint.txt`, `a0-build.txt` y sus exit codes.

## Pendiente

Nada de D10. Persisten los residuales no bloqueantes R-01…R-04 del reporte previo.
Sin commit ni push.
