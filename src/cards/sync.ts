import { fetchCards, pushCards }            from '../api.js';
import { getCards, setCards, getTombstones, setTombstones } from './store.js';
import { mergeCards }                       from './merge.js';
import { setSyncState }                     from '../ui/toast.js';
import { renderCards }                      from '../ui/cards.js';

/**
 * Pull remote state, merge with local (tombstones included), push merged
 * state back, then re-render the card grid.
 *
 * Called on login, on app open, and whenever the page becomes visible again.
 */
export async function syncOnOpen(): Promise<void> {
  setSyncState('syncing', 'Syncing…');
  try {
    const { cards: remoteCards, tombstones: remoteTombstones, error } = await fetchCards();
    if (error) throw new Error(error);

    const { cards, tombstones } = mergeCards(
      getCards(),
      remoteCards      ?? [],
      getTombstones(),
      remoteTombstones ?? [],
    );

    setCards(cards);
    setTombstones(tombstones);

    // Re-render immediately so the UI reflects what we just pulled —
    // without this the grid stays stale until the user does something.
    renderCards();

    await pushToRemote();
    setSyncState('synced', 'Synced');
  } catch {
    setSyncState('error', 'Offline');
  }
}

/**
 * Push current local cards + tombstones to the server.
 * Called after every card add / edit / delete.
 */
export async function pushToRemote(): Promise<void> {
  setSyncState('syncing', 'Saving…');
  try {
    const { error } = await pushCards(getCards(), getTombstones());
    if (error) throw new Error(error);
    setSyncState('synced', 'Synced');
  } catch {
    setSyncState('error', 'Sync failed');
  }
}
