import { useState } from 'react';
import { siniganService } from './siniganService';

export function SiniganAnimalLookup({ token, onAnimalSelected }) {
  const [din, setDin] = useState('DIN-DEMO-000001');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await siniganService.findAnimalByDin(din, token);
      setResult(response);
      onAnimalSelected?.(response.data);
    } catch (lookupError) {
      setError(lookupError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={styles.card} aria-labelledby="sinigan-title">
      <div style={styles.headingRow}>
        <div>
          <span style={styles.eyebrow}>Referencia externa</span>
          <h2 id="sinigan-title" style={styles.title}>Consultar animal por DIN</h2>
        </div>
        <span style={styles.mockBadge}>SIMULACIÓN</span>
      </div>

      <p style={styles.notice}>
        Referencia académica SINIGAN. No corresponde a una consulta oficial del ICA.
      </p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <label htmlFor="sinigan-din" style={styles.label}>DIN</label>
        <div style={styles.searchRow}>
          <input
            id="sinigan-din"
            value={din}
            onChange={(event) => setDin(event.target.value.toUpperCase())}
            placeholder="DIN-DEMO-000001"
            pattern="DIN-DEMO-[0-9]{6}"
            style={styles.input}
            required
          />
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Consultando…' : 'Consultar'}
          </button>
        </div>
        <small style={styles.help}>
          Pruebe desde DIN-DEMO-000001 hasta DIN-DEMO-000005.
        </small>
      </form>

      {error && <div role="alert" style={styles.error}>{error}</div>}

      {result && (
        <div style={styles.result}>
          <div style={styles.animalHeader}>
            <div>
              <strong style={styles.animalName}>{result.data.animalName}</strong>
              <div style={styles.din}>{result.data.din}</div>
            </div>
            <span style={styles.species}>{result.data.species}</span>
          </div>
          <dl style={styles.grid}>
            <div><dt style={styles.term}>Número</dt><dd style={styles.value}>{result.data.animalNumber}</dd></div>
            <div><dt style={styles.term}>Sexo</dt><dd style={styles.value}>{result.data.sex}</dd></div>
            <div><dt style={styles.term}>Grupo etario</dt><dd style={styles.value}>{result.data.ageGroup}</dd></div>
            <div><dt style={styles.term}>Predio</dt><dd style={styles.value}>{result.data.establishment.name}</dd></div>
          </dl>
          <div style={styles.sourceLine}>
            Fuente: {result.meta.sourceSystem} · Contrato {result.meta.contractVersion}
          </div>
        </div>
      )}
    </section>
  );
}

const styles = {
  card: { background: '#fff', border: '1px solid #dce7df', borderRadius: 16, padding: 24, textAlign: 'left', color: '#163329' },
  headingRow: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' },
  eyebrow: { color: '#39705a', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' },
  title: { margin: '4px 0 0', color: '#123f30', fontSize: 22, fontWeight: 750 },
  mockBadge: { background: '#fff1c2', color: '#7a5200', borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 800 },
  notice: { margin: '16px 0', padding: '10px 12px', borderRadius: 8, background: '#fff9e8', color: '#6b5417', fontSize: 13 },
  form: { display: 'grid', gap: 8 },
  label: { fontSize: 13, fontWeight: 700 },
  searchRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  input: { flex: '1 1 230px', padding: '11px 12px', border: '1px solid #b9cec3', borderRadius: 8, fontSize: 15, textTransform: 'uppercase', boxSizing: 'border-box' },
  button: { padding: '11px 18px', border: 0, borderRadius: 8, background: '#176b4d', color: '#fff', fontWeight: 750, cursor: 'pointer' },
  help: { color: '#6d7e76' },
  error: { marginTop: 16, padding: 12, borderRadius: 8, background: '#fee2e2', color: '#991b1b' },
  result: { marginTop: 18, borderTop: '1px solid #e5ece8', paddingTop: 18 },
  animalHeader: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  animalName: { fontSize: 19, color: '#103c2d' },
  din: { color: '#5d7168', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13, marginTop: 3 },
  species: { background: '#dff3e8', color: '#14583f', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 800 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, margin: '18px 0' },
  term: { color: '#6d7e76', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { margin: '4px 0 0', color: '#1c3f33', fontWeight: 650, fontSize: 14 },
  sourceLine: { fontSize: 11, color: '#73827c', borderTop: '1px dashed #cad8d1', paddingTop: 10 },
};
