import { useMemo } from 'react';
import { searchAnimals } from './animalSearch.js';
import { mergeStyles, styles } from './styles.js';

/** Search by DIN/arete or name with suggestions from the local catalog (FR-009b). */
export function AnimalSearch({ animals, query, selected, onQueryChange, onSelect, error }) {
  const suggestions = useMemo(
    () => (selected ? [] : searchAnimals(animals, query)),
    [animals, query, selected],
  );

  if (animals.length === 0) {
    return (
      <div role="alert" style={styles.warning}>
        No hay animales disponibles en el catálogo de esta finca. Conéctese a internet una vez para
        descargarlo.
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="offline-capture-animal" style={styles.label}>
        Animal (DIN/arete o nombre)
      </label>
      <input
        id="offline-capture-animal"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'offline-capture-animal-error' : undefined}
        style={mergeStyles(styles.input, error && styles.inputError)}
        placeholder="Ej. DIN-DEMO-000001 o Luna"
      />
      {selected && (
        <p style={styles.selectedAnimal} aria-live="polite">
          Seleccionado: {selected.din} · {selected.name}
        </p>
      )}
      {suggestions.length > 0 && (
        <ul style={styles.suggestions} aria-label="Sugerencias de animales">
          {suggestions.map((animal) => (
            <li key={animal.din}>
              <button type="button" style={styles.suggestion} onClick={() => onSelect(animal)}>
                <strong>{animal.din}</strong>
                <span>{animal.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id="offline-capture-animal-error" role="alert" style={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}
