// Development-only volume generator (quickstart step 11; SC-001, SC-007).
// Fictitious data only. Registered as `window.bovinotechDevSeed` in dev mode.
import { buildCapturedEvent } from './buildCapturedEvent.js';

const NAMES = ['Luna', 'Canela', 'Manchas', 'Estrella', 'Paloma', 'Mora', 'Pinta', 'Bonita'];

export const generateAnimals = (count, offset = 900000) =>
  Array.from({ length: count }, (_, index) => ({
    din: `DIN-DEMO-${String(offset + index).padStart(6, '0')}`,
    name: `${NAMES[index % NAMES.length]} ${index}`,
  }));

export const generateEvents = (count, { animals, session, now = () => new Date() }) =>
  Array.from({ length: count }, (_, index) => {
    const animal = animals[index % animals.length];
    const capturedAt = new Date(now().getTime() - (count - index) * 60_000);
    return buildCapturedEvent({
      form: { eventType: 'CHECKUP', din: animal.din, finding: `Revisión de prueba ${index}` },
      session,
      animal,
      now: () => capturedAt,
    });
  });

export const registerDevSeed = ({ captureRepository, catalogRepository, target = globalThis }) => {
  target.bovinotechDevSeed = async ({ farmId, authorEmail, animals = 5000, events = 1000 }) => {
    const catalog = generateAnimals(animals);
    await catalogRepository.replaceFarm(farmId, catalog, new Date().toISOString());
    const session = { authorEmail, farmId, authorVerificationPending: false };
    for (const event of generateEvents(events, { animals: catalog, session })) {
      await captureRepository.add(event);
    }
    return { animals: catalog.length, events };
  };
};
