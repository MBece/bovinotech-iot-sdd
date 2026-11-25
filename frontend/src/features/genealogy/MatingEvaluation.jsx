import { useState } from 'react';
import { formatCachedAt } from './genealogyCache.js';
import { CALCULATION_PARTIAL } from './genealogyConstants.js';
import { formatCoefficient, formatPercent, positionLabel, riskTone } from './genealogyPresentation.js';
import { GenealogyNetworkError, genealogyService } from './genealogyService.js';
import { resolveDin } from './genealogyValidation.js';

const candidateLabel = (candidate) => (candidate === 'SIRE' ? 'Macho' : 'Hembra');

function AssessmentResult({ result, cachedAt }) {
  const tone = riskTone(result.riskLevel);
  const partial = result.calculationStatus === CALCULATION_PARTIAL;
  return (
    <section className="genealogy-card" aria-labelledby="genealogy-assessment-title" aria-live="polite">
      <h3 id="genealogy-assessment-title">
        {result.subject === 'ANIMAL'
          ? `Indicador de consanguinidad de ${result.din}`
          : `Cruce ${result.sireDin} × ${result.damDin}`}
      </h3>
      {cachedAt && (
        <p className="genealogy-cached" role="status">
          Dato en caché del {formatCachedAt(cachedAt)} (sin conexión)
        </p>
      )}
      <div className={`genealogy-risk ${tone.className}`} role={result.warning ? 'alert' : undefined}>
        <div>
          {result.warning ? '⚠️ Advertencia de consanguinidad · ' : ''}
          {tone.label}
        </div>
        <div>
          Coeficiente estimado: <strong>{formatCoefficient(result)}</strong>
        </div>
        <div>
          Estado del cálculo: <strong>{result.calculationStatus}</strong>
        </div>
      </div>
      <p>{result.message}</p>
      {result.includesPendingLinks && (
        <p className="genealogy-hint">
          Incluye vínculos pendientes de validación veterinaria: revise el historial antes de decidir.
        </p>
      )}
      {result.commonAncestors.length > 0 && (
        <>
          <h4>Ancestros comunes</h4>
          <ul>
            {result.commonAncestors.map((ancestor) => (
              <li key={ancestor.din}>
                <strong>
                  {ancestor.name} ({ancestor.din})
                </strong>{' '}
                · aporte {formatPercent(ancestor.contribution)} %
                <ul>
                  {ancestor.paths.map((path) => (
                    <li key={`${path.sirePath.join('>')}|${path.damPath.join('>')}`} className="genealogy-hint">
                      Macho: {path.sirePath.join(' → ')} ({path.sireGenerations} gen.) · Hembra:{' '}
                      {path.damPath.join(' → ')} ({path.damGenerations} gen.)
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
      {partial && result.missingAncestors.length > 0 && (
        <details>
          <summary className="genealogy-hint">
            Ancestros no registrados ({result.missingAncestors.length})
          </summary>
          <ul>
            {result.missingAncestors.map((item) => (
              <li key={`${item.candidate}-${item.position}`}>
                {candidateLabel(item.candidate)}: {positionLabel(item.position)}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="genealogy-hint">
        La advertencia es preventiva: la decisión reproductiva corresponde al veterinario.
      </p>
    </section>
  );
}

export function MatingEvaluation({ token, animals, cache }) {
  const males = animals.filter((animal) => animal.sex === 'MACHO');
  const females = animals.filter((animal) => animal.sex === 'HEMBRA');
  const [sireDin, setSireDin] = useState('');
  const [damDin, setDamDin] = useState('');
  const [animalText, setAnimalText] = useState('');
  const [result, setResult] = useState(null);
  const [cachedAt, setCachedAt] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async (cacheKey, request) => {
    setLoading(true);
    setError(null);
    try {
      const data = await request();
      cache.write('assessment', cacheKey, data);
      setResult(data);
      setCachedAt(null);
    } catch (err) {
      const cached = err instanceof GenealogyNetworkError ? cache.read('assessment', cacheKey) : null;
      if (cached) {
        setResult(cached.data);
        setCachedAt(cached.savedAt);
      } else {
        setResult(null);
        setError(
          err instanceof GenealogyNetworkError
            ? 'Evaluación no disponible sin conexión.'
            : err.message,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="genealogy-grid">
      <form
        className="genealogy-card"
        onSubmit={(event) => {
          event.preventDefault();
          run(`${sireDin}|${damDin}`, () => genealogyService.evaluateMating(sireDin, damDin, token));
        }}
      >
        <h3>Evaluar cruce propuesto</h3>
        <label className="genealogy-field">
          Macho
          <select value={sireDin} onChange={(event) => setSireDin(event.target.value)} required>
            <option value="">Seleccione…</option>
            {males.map((animal) => (
              <option key={animal.din} value={animal.din}>
                {animal.din} · {animal.name}
              </option>
            ))}
          </select>
        </label>
        <label className="genealogy-field">
          Hembra
          <select value={damDin} onChange={(event) => setDamDin(event.target.value)} required>
            <option value="">Seleccione…</option>
            {females.map((animal) => (
              <option key={animal.din} value={animal.din}>
                {animal.din} · {animal.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="genealogy-btn genealogy-btn--primary" disabled={loading}>
          Evaluar cruce
        </button>
      </form>
      <form
        className="genealogy-card"
        onSubmit={(event) => {
          event.preventDefault();
          const din = resolveDin(animalText);
          if (din) run(`animal:${din}`, () => genealogyService.getInbreeding(din, token));
        }}
      >
        <h3>Indicador individual</h3>
        <label className="genealogy-field">
          Animal (DIN o número)
          <input
            inputMode="numeric"
            value={animalText}
            onChange={(event) => setAnimalText(event.target.value)}
            placeholder="Ej. 118"
            required
          />
        </label>
        <button type="submit" className="genealogy-btn" disabled={loading}>
          Consultar indicador
        </button>
      </form>
      {error && <p className="genealogy-error" role="alert">{error}</p>}
      {result && <AssessmentResult result={result} cachedAt={cachedAt} />}
    </div>
  );
}
