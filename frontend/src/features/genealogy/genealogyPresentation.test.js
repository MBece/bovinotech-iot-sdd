import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupPositionsByGeneration, linkStatusLabel } from './genealogyPresentation.js';

const ORDER = [
  'sire', 'dam',
  'sire.sire', 'sire.dam', 'dam.sire', 'dam.dam',
  'sire.sire.sire', 'sire.sire.dam', 'sire.dam.sire', 'sire.dam.dam',
  'dam.sire.sire', 'dam.sire.dam', 'dam.dam.sire', 'dam.dam.dam',
];
const positions = ORDER.map((position) => ({
  position,
  generation: position.split('.').length,
  status: 'VALIDADO',
}));

describe('genealogy presentation - tree', () => {
  it('labels the five link statuses in Spanish', () => {
    assert.equal(linkStatusLabel('VALIDADO'), 'Validado');
    assert.equal(linkStatusLabel('PENDIENTE_VALIDACION'), 'Pendiente de validación');
    assert.equal(linkStatusLabel('NO_REGISTRADO'), 'No registrado');
    assert.equal(linkStatusLabel('CORREGIDO'), 'Corregido');
    assert.equal(linkStatusLabel('RECHAZADO'), 'Rechazado');
  });

  it('groups the 14 positions by generation with Spanish titles and kinship labels', () => {
    const groups = groupPositionsByGeneration(positions);
    assert.deepEqual(groups.map((g) => [g.generation, g.title, g.positions.length]), [
      [1, 'Padres', 2],
      [2, 'Abuelos', 4],
      [3, 'Bisabuelos', 8],
    ]);
    assert.equal(groups[0].positions[0].label, 'Padre');
    assert.equal(groups[1].positions[1].label, 'Abuela paterna');
    assert.equal(groups[2].positions[7].label, 'Bisabuela materna (madre de la abuela materna)');
  });
});

describe('genealogy presentation - inbreeding', async () => {
  const { formatCoefficient, riskTone } = await import('./genealogyPresentation.js');
  const PARTIAL = 'CÁLCULO_PARCIAL_POR_DATOS_INSUFICIENTES';
  const COMPLETE = 'CÁLCULO_COMPLETO';

  it('never renders 0 % for a partial calculation', () => {
    for (const coefficient of [null, 0]) {
      const text = formatCoefficient({ calculationStatus: PARTIAL, coefficient });
      assert.equal(text, 'Datos insuficientes');
      assert.doesNotMatch(text, /(^|\s)0 %/);
    }
  });

  it('renders a partial value as a minimum estimate', () => {
    assert.equal(
      formatCoefficient({ calculationStatus: PARTIAL, coefficient: 0.125 }),
      '≥ 12,5 % (mínimo estimado)',
    );
  });

  it('renders complete values with Spanish decimals', () => {
    assert.equal(formatCoefficient({ calculationStatus: COMPLETE, coefficient: 0.25 }), '25 %');
    assert.equal(formatCoefficient({ calculationStatus: COMPLETE, coefficient: 0.015625 }), '1,5625 %');
    assert.equal(
      formatCoefficient({ calculationStatus: COMPLETE, coefficient: 0 }),
      '0 % (sin ancestros comunes en 3 generaciones)',
    );
    assert.equal(formatCoefficient({ calculationStatus: COMPLETE, coefficient: null }), 'Datos insuficientes');
  });

  it('maps risk levels to tones', () => {
    assert.deepEqual(
      ['ALTO', 'MODERADO', 'BAJO', null].map((level) => riskTone(level).className),
      ['genealogy-risk--high', 'genealogy-risk--moderate', 'genealogy-risk--low', 'genealogy-risk--neutral'],
    );
    assert.equal(riskTone('ALTO').label, 'Riesgo alto');
    assert.equal(riskTone(null).label, 'Sin nivel de riesgo');
  });
});
