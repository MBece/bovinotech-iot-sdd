import { useCallback, useEffect, useRef, useState } from 'react';
import { siniganSyncService } from './siniganSyncService.js';
import {
  SIMULATION_LABEL,
  STATUS_LABELS,
  buildTicketsLoadKey,
  formatActiveFarm,
} from './siniganSyncUtils.js';
import { SiniganComparisonCard } from './SiniganComparisonCard.jsx';
import { SiniganTicketDetail } from './SiniganTicketDetail.jsx';

const formatDateTime = (value) => {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
};

const INITIAL_FILTERS = Object.freeze({ status: '', din: '', limit: 50 });

export function SiniganReconciliation({ token, role, farmId }) {
  const [din, setDin] = useState('DIN-DEMO-000002');
  const [comparison, setComparison] = useState(null);
  const [compareError, setCompareError] = useState(null);
  const [comparing, setComparing] = useState(false);

  const [statusFilter, setStatusFilter] = useState('');
  const [dinFilter, setDinFilter] = useState('');
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [tickets, setTickets] = useState([]);
  const [ticketsError, setTicketsError] = useState(null);
  const [loadingTickets, setLoadingTickets] = useState(true);

  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [notice, setNotice] = useState(null);
  const detailRequestIdRef = useRef(0);

  // Token + finca activa forman la frontera de tenant (D10). Si cambia
  // cualquiera de los dos, el listado debe volver a consultarse.
  const ticketsLoadKey = buildTicketsLoadKey({
    token,
    farmId,
    filters: appliedFilters,
  });

  const loadTickets = useCallback(async () => {
    try {
      const response = await siniganSyncService.listTickets(appliedFilters, token);
      setTickets(response.items ?? []);
      setTicketsError(null);
    } catch (listError) {
      setTicketsError(listError.message);
    } finally {
      setLoadingTickets(false);
    }
  }, [appliedFilters, token]);

  const refreshTickets = useCallback(async () => {
    setLoadingTickets(true);
    setTicketsError(null);
    await loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    // Deferred so the shared loader's state updates do not run synchronously
    // inside the effect body (react-hooks/set-state-in-effect). La clave
    // incluye token y farmId para refrescar al cambiar de finca.
    const timer = setTimeout(loadTickets, 0);
    return () => clearTimeout(timer);
  }, [loadTickets, ticketsLoadKey]);

  const loadDetail = useCallback(
    async (ticketId) => {
      const requestId = ++detailRequestIdRef.current;
      if (!ticketId) {
        setDetail(null);
        setDetailError(null);
        setLoadingDetail(false);
        return;
      }
      setLoadingDetail(true);
      setDetailError(null);
      try {
        const response = await siniganSyncService.getTicket(ticketId, token);
        if (requestId === detailRequestIdRef.current) {
          setDetail(response);
        }
      } catch (ticketError) {
        if (requestId === detailRequestIdRef.current) {
          setDetailError(ticketError.message);
        }
      } finally {
        if (requestId === detailRequestIdRef.current) {
          setLoadingDetail(false);
        }
      }
    },
    [token],
  );

  const handleCompare = async (event) => {
    event.preventDefault();
    detailRequestIdRef.current += 1;
    setLoadingDetail(false);
    setComparing(true);
    setCompareError(null);
    setNotice(null);
    try {
      const response = await siniganSyncService.compare(din, token);
      setComparison(response);
      await refreshTickets();
      if (response.ticket?.id) {
        setSelectedTicketId(response.ticket.id);
        setDetail(null);
        setDetailError(null);
        await loadDetail(response.ticket.id);
      } else {
        setSelectedTicketId(null);
        setDetail(null);
        setDetailError(null);
      }
    } catch (error) {
      detailRequestIdRef.current += 1;
      setCompareError(error.message);
      setComparison(null);
      setSelectedTicketId(null);
      setDetail(null);
      setDetailError(null);
      setLoadingDetail(false);
      setNotice(null);
    } finally {
      setComparing(false);
    }
  };

  const handleFilterSubmit = (event) => {
    event.preventDefault();
    setLoadingTickets(true);
    setTicketsError(null);
    setAppliedFilters({
      status: statusFilter,
      din: dinFilter.trim().toUpperCase(),
      limit: 50,
    });
  };

  const handleSelectTicket = (ticketId) => {
    setSelectedTicketId(ticketId);
    setDetail(null);
    setDetailError(null);
    setNotice(null);
    loadDetail(ticketId);
  };

  const handleResolved = async (result) => {
    setNotice({
      type: 'success',
      text: `Ticket #${result.id} cerrado. La resolución quedó registrada de forma permanente.`,
    });
    setDetail((current) =>
      current && current.id === result.id
        ? {
            ...current,
            status: result.status ?? 'CLOSED',
            closedAt: result.closedAt ?? current.closedAt,
            resolution: result.resolution ?? current.resolution,
          }
        : current,
    );
    await Promise.all([loadDetail(result.id), refreshTickets()]);
  };

  return (
    <section style={styles.card} aria-labelledby="reconciliation-title">
      <div style={styles.headingRow}>
        <div>
          <span style={styles.eyebrow}>Conciliación SINIGÁN V6</span>
          <h2 id="reconciliation-title" style={styles.title}>
            Conciliación oficial vs. registro de campo
          </h2>
          <p style={styles.farmLine}>
            <span data-testid="sinigan-active-farm">
              Finca activa: {formatActiveFarm(farmId)}
            </span>
          </p>
        </div>
        <span style={styles.simulationBadge}>{SIMULATION_LABEL}</span>
      </div>

      <p style={styles.notice}>
        Referencia académica simulada. La ficha oficial nunca se modifica: toda
        diferencia se atiende mediante un ticket y una resolución humana.
      </p>

      <form onSubmit={handleCompare} style={styles.form}>
        <label htmlFor="reconciliation-din" style={styles.label}>DIN a comparar</label>
        <div style={styles.searchRow}>
          <input
            id="reconciliation-din"
            value={din}
            onChange={(event) => setDin(event.target.value.toUpperCase())}
            placeholder="DIN-DEMO-000002"
            pattern="DIN-DEMO-[0-9]{6}"
            style={styles.input}
            required
          />
          <button type="submit" disabled={comparing} style={styles.button}>
            {comparing ? 'Comparando…' : 'Comparar ficha y campo'}
          </button>
        </div>
        <small style={styles.help}>
          Pruebe DIN-DEMO-000001 a DIN-DEMO-000005 para ver casos consistentes y con discrepancia.
        </small>
      </form>

      {compareError && <div role="alert" style={styles.error}>{compareError}</div>}
      {comparison && <SiniganComparisonCard comparison={comparison} />}

      <section style={styles.ticketsSection} aria-labelledby="tickets-title">
        <div style={styles.ticketsHeader}>
          <h3 id="tickets-title" style={styles.sectionTitle}>Tickets de conciliación</h3>
          <span style={styles.counter}>{tickets.length} tickets</span>
        </div>

        <form onSubmit={handleFilterSubmit} style={styles.filterForm}>
          <div style={styles.filterField}>
            <label htmlFor="ticket-status-filter" style={styles.label}>Estado</label>
            <select
              id="ticket-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={styles.select}
            >
              <option value="">Todos</option>
              <option value="OPEN">Abierto</option>
              <option value="CLOSED">Cerrado</option>
            </select>
          </div>
          <div style={styles.filterField}>
            <label htmlFor="ticket-din-filter" style={styles.label}>DIN</label>
            <input
              id="ticket-din-filter"
              value={dinFilter}
              onChange={(event) => setDinFilter(event.target.value.toUpperCase())}
              placeholder="DIN-DEMO-000002"
              style={styles.input}
            />
          </div>
          <div style={styles.filterActions}>
            <button type="submit" style={styles.secondaryButton}>Aplicar filtros</button>
            <button type="button" onClick={refreshTickets} disabled={loadingTickets} style={styles.ghostButton}>
              {loadingTickets ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
        </form>

        {ticketsError && <div role="alert" style={styles.error}>{ticketsError}</div>}
        {loadingTickets && <p style={styles.empty}>Consultando tickets…</p>}
        {!loadingTickets && !ticketsError && tickets.length === 0 && (
          <p style={styles.empty}>No hay tickets que coincidan con los filtros.</p>
        )}

        {tickets.length > 0 && (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <caption style={styles.caption}>
                Listado de tickets de conciliación generados
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={styles.th}>ID</th>
                  <th scope="col" style={styles.th}>DIN</th>
                  <th scope="col" style={styles.th}>Estado</th>
                  <th scope="col" style={styles.th}>Discrepancias</th>
                  <th scope="col" style={styles.th}>Creado</th>
                  <th scope="col" style={styles.th}>Cierre</th>
                  <th scope="col" style={styles.th}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id} style={ticket.id === selectedTicketId ? styles.selectedRow : undefined}>
                    <th scope="row" style={styles.rowHeader}>#{ticket.id}</th>
                    <td style={styles.td}>{ticket.din}</td>
                    <td style={styles.td}>
                      <span style={ticket.status === 'OPEN' ? styles.open : styles.closed}>
                        {STATUS_LABELS[ticket.status] || ticket.status}
                      </span>
                    </td>
                    <td style={styles.td}>{ticket.discrepancyCount}</td>
                    <td style={styles.td}>{formatDateTime(ticket.createdAt)}</td>
                    <td style={styles.td}>{formatDateTime(ticket.closedAt)}</td>
                    <td style={styles.td}>
                      <button
                        type="button"
                        onClick={() => handleSelectTicket(ticket.id)}
                        style={styles.detailButton}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {notice && <div role="status" style={styles.success}>{notice.text}</div>}

        {selectedTicketId && (
          <section style={styles.detailSection} aria-labelledby="ticket-detail-title">
            <div style={styles.ticketsHeader}>
              <h3 id="ticket-detail-title" style={styles.sectionTitle}>
                Detalle del ticket #{selectedTicketId}
              </h3>
              <button
                type="button"
                onClick={() => {
                  detailRequestIdRef.current += 1;
                  setSelectedTicketId(null);
                  setDetail(null);
                  setDetailError(null);
                  setLoadingDetail(false);
                }}
                style={styles.ghostButton}
              >
                Cerrar detalle
              </button>
            </div>

            {loadingDetail && <p style={styles.empty}>Consultando detalle…</p>}
            {detailError && <div role="alert" style={styles.error}>{detailError}</div>}
            {detail && !loadingDetail && (
              <SiniganTicketDetail
                key={detail.id}
                detail={detail}
                role={role}
                token={token}
                onResolved={handleResolved}
              />
            )}
          </section>
        )}
      </section>
    </section>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid #dce7df', borderRadius: 16, padding: 24, textAlign: 'left', color: '#163329' },
  headingRow: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  eyebrow: { color: '#39705a', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' },
  title: { margin: '4px 0 0', color: '#123f30', fontSize: 22, fontWeight: 750 },
  farmLine: { margin: '6px 0 0', color: '#4d6359', fontSize: 13 },
  simulationBadge: { background: '#fff1c2', color: '#7a5200', borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 800 },
  notice: { margin: '16px 0', padding: '10px 12px', borderRadius: 8, background: '#fff9e8', color: '#6b5417', fontSize: 13 },
  form: { display: 'grid', gap: 8 },
  label: { fontSize: 13, fontWeight: 700 },
  searchRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  input: { flex: '1 1 230px', padding: '11px 12px', border: '1px solid #b9cec3', borderRadius: 8, fontSize: 15, textTransform: 'uppercase', boxSizing: 'border-box', width: '100%' },
  select: { padding: '10px 11px', border: '1px solid #b9cec3', borderRadius: 8, fontSize: 14, background: '#fff', fontFamily: 'inherit' },
  button: { padding: '11px 18px', border: 0, borderRadius: 8, background: '#176b4d', color: '#fff', fontWeight: 750, cursor: 'pointer' },
  secondaryButton: { padding: '10px 14px', border: '1px solid #176b4d', borderRadius: 8, background: '#176b4d', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  ghostButton: { padding: '9px 12px', border: '1px solid #b8c8c0', borderRadius: 7, background: '#fff', color: '#4d6359', cursor: 'pointer' },
  detailButton: { padding: '6px 10px', border: '1px solid #176b4d', borderRadius: 7, background: '#fff', color: '#176b4d', fontWeight: 700, cursor: 'pointer' },
  help: { color: '#6d7e76' },
  error: { marginTop: 14, padding: 11, borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: 13 },
  success: { marginTop: 14, padding: 11, borderRadius: 8, background: '#dcfce7', color: '#15803d', fontSize: 13 },
  ticketsSection: { marginTop: 24, borderTop: '1px solid #e5ece8', paddingTop: 20 },
  ticketsHeader: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  sectionTitle: { margin: 0, color: '#173d30', fontSize: 18 },
  counter: { background: '#e7f5ed', color: '#176b4d', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 800 },
  filterForm: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', margin: '14px 0' },
  filterField: { display: 'grid', gap: 5, flex: '1 1 180px' },
  filterActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  empty: { padding: 18, borderRadius: 9, background: '#f7faf8', color: '#71827a', margin: '12px 0' },
  tableWrapper: { overflowX: 'auto', marginTop: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  caption: { textAlign: 'left', color: '#6d7e76', fontSize: 11, paddingBottom: 8 },
  th: { textAlign: 'left', padding: '8px 9px', background: '#eef5f1', color: '#335348', fontSize: 11, borderBottom: '1px solid #dce7df' },
  rowHeader: { textAlign: 'left', padding: '9px', color: '#173d30', fontWeight: 700, borderBottom: '1px solid #edf2ef' },
  td: { padding: '9px', borderBottom: '1px solid #edf2ef', color: '#334f44' },
  selectedRow: { background: '#f2faf5' },
  open: { color: '#805b0b', background: '#fff1c2', padding: '4px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800 },
  closed: { color: '#205a85', background: '#dbeafe', padding: '4px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800 },
  detailSection: { marginTop: 22, borderTop: '1px dashed #cad8d1', paddingTop: 18 },
};
