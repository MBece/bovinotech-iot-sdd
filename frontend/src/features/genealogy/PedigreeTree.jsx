import { useState } from 'react';
import { formatCachedAt } from './genealogyCache.js';
import { groupPositionsByGeneration, linkStatusLabel } from './genealogyPresentation.js';
import { GenealogyNetworkError, genealogyService } from './genealogyService.js';
import { resolveDin } from './genealogyValidation.js';

function StatusTag({ status }) {
  return (
    <span className={`genealogy-status genealogy-status--${status}`}>{linkStatusLabel(status)}</span>
  );
}

const sexLabel = (sex) => (sex === 'MACHO' ? 'Macho' : 'Hembra');

/** Three-generation pedigree: 14 fixed positions, collapsible by generation. */
export function PedigreeTree({ tree, cachedAt }) {
  return (
    <section className="genealogy-card" aria-labelledby="genealogy-tree-title">
      <h3 id="genealogy-tree-title">
        Árbol de {tree.name} ({tree.din})
      </h3>
      <p className="genealogy-hint">
        {sexLabel(tree.sex)} · nacimiento {tree.birthDate} · ventana de {tree.generationWindow}{' '}
        generaciones
      </p>
      {cachedAt && (
        <p className="genealogy-cached" role="status">
          Dato en caché del {formatCachedAt(cachedAt)} (sin conexión)
        </p>
      )}
      {tree.isComplete ? (
        <p className="genealogy-success">Árbol completo: {tree.expectedCount} ancestros registrados.</p>
      ) : (
        <p className="genealogy-error">
          Árbol incompleto: faltan {tree.missingCount} de {tree.expectedCount} ancestros.
        </p>
      )}
      {groupPositionsByGeneration(tree.positions).map((group) => (
        <details key={group.generation} className="genealogy-generation" open={group.generation === 1}>
          <summary>
            {group.title} ({group.positions.filter((p) => p.status !== 'NO_REGISTRADO').length}/
            {group.positions.length})
          </summary>
          <ul className="genealogy-positions">
            {group.positions.map((item) => (
              <li
                key={item.position}
                className={`genealogy-position genealogy-position--${item.status}`}
              >
                <div className="genealogy-hint">{item.label}</div>
                {item.animal ? (
                  <div>
                    <strong>{item.animal.name}</strong> · {item.animal.din}
                    <br />
                    {sexLabel(item.animal.sex)} · {item.animal.birthDate}
                  </div>
                ) : (
                  <div>
                    <strong>No registrado</strong>
                  </div>
                )}
                <StatusTag status={item.status} />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}

/** Append-only link history with veterinary actions on pending/current links. */
export function LinkHistory({ links, canCurate, onValidate, onCorrect }) {
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  return (
    <section className="genealogy-card genealogy-history" aria-labelledby="genealogy-history-title">
      <h3 id="genealogy-history-title">Historial de vínculos</h3>
      {links.length === 0 ? (
        <p className="genealogy-hint">No hay vínculos registrados para este animal.</p>
      ) : (
        <ul>
          {links.map((link) => (
            <li key={link.id}>
              <strong>{link.parentRole === 'SIRE' ? 'Padre' : 'Madre'}</strong> {link.parentDin}{' '}
              <StatusTag status={link.status} />
              <div className="genealogy-hint">
                Registro #{link.sequenceNo} · autor {link.authorId} ({link.authorRole}) ·{' '}
                {new Date(link.createdAt).toLocaleString('es-CO')}
                {link.correctionReason && <> · motivo de corrección: {link.correctionReason}</>}
                {link.validation?.reason && <> · motivo: {link.validation.reason}</>}
              </div>
              {canCurate && link.status === 'PENDIENTE_VALIDACION' && (
                <div className="genealogy-actions">
                  <button
                    type="button"
                    className="genealogy-btn genealogy-btn--primary"
                    onClick={() => onValidate(link.id, { decision: 'VALIDADO' })}
                  >
                    Validar
                  </button>
                  <button
                    type="button"
                    className="genealogy-btn genealogy-btn--danger"
                    onClick={() => {
                      setRejecting(link.id);
                      setReason('');
                    }}
                  >
                    Rechazar
                  </button>
                </div>
              )}
              {canCurate && rejecting === link.id && (
                <form
                  className="genealogy-actions"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onValidate(link.id, { decision: 'RECHAZADO', reason: reason.trim() });
                    setRejecting(null);
                  }}
                >
                  <label className="genealogy-field">
                    Motivo del rechazo (obligatorio)
                    <input
                      value={reason}
                      maxLength={500}
                      onChange={(event) => setReason(event.target.value)}
                      required
                    />
                  </label>
                  <button type="submit" className="genealogy-btn genealogy-btn--danger">
                    Confirmar rechazo
                  </button>
                </form>
              )}
              {canCurate && ['VALIDADO', 'PENDIENTE_VALIDACION'].includes(link.status) && (
                <button type="button" className="genealogy-btn" onClick={() => onCorrect(link)}>
                  Corregir
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Search by DIN/number, show the tree and the history (cached when offline). */
export function TreeExplorer({ token, cache, canCurate, onCorrect }) {
  const [query, setQuery] = useState('');
  const [tree, setTree] = useState(null);
  const [links, setLinks] = useState([]);
  const [cachedAt, setCachedAt] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async (din) => {
    setLoading(true);
    setError(null);
    try {
      const [treeData, history] = await Promise.all([
        genealogyService.getTree(din, token),
        genealogyService.getLinks(din, token),
      ]);
      cache.write('tree', din, { tree: treeData, links: history.items });
      setTree(treeData);
      setLinks(history.items);
      setCachedAt(null);
    } catch (err) {
      const cached = err instanceof GenealogyNetworkError ? cache.read('tree', din) : null;
      if (cached) {
        setTree(cached.data.tree);
        setLinks(cached.data.links);
        setCachedAt(cached.savedAt);
      } else {
        setTree(null);
        setLinks([]);
        setError(
          err instanceof GenealogyNetworkError
            ? 'Sin conexión y sin un árbol consultado previamente para este animal.'
            : err.message,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const validate = async (linkId, body) => {
    try {
      await genealogyService.validateLink(linkId, body, token);
      await load(tree.din);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="genealogy-grid">
      <form
        className="genealogy-card"
        onSubmit={(event) => {
          event.preventDefault();
          const din = resolveDin(query);
          if (din) load(din);
        }}
      >
        <label className="genealogy-field">
          Animal (DIN o número)
          <input
            inputMode="numeric"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej. 101"
            required
          />
        </label>
        <button type="submit" className="genealogy-btn genealogy-btn--primary" disabled={loading}>
          {loading ? 'Consultando…' : 'Ver árbol'}
        </button>
        {error && <p className="genealogy-error" role="alert">{error}</p>}
      </form>
      {tree && <PedigreeTree tree={tree} cachedAt={cachedAt} />}
      {tree && (
        <LinkHistory
          links={links}
          canCurate={canCurate && !cachedAt}
          onValidate={validate}
          onCorrect={onCorrect}
        />
      )}
    </div>
  );
}
