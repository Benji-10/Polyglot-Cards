import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

/**
 * useDeckStats — derived statistics for a deck from cached card data
 * Returns counts for new / learning / review / relearning / due today
 */
export function useDeckStats(deckId) {
  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => api.getCards(deckId),
    enabled: !!deckId,
    staleTime: 60000,
  })

  const { data: dueCards = [] } = useQuery({
    queryKey: ['srs', deckId],
    queryFn: () => api.getSRSCards(deckId),
    enabled: !!deckId,
    staleTime: 30000,
  })

  const now = new Date()

  const stats = {
    total: cards.length,
    new: cards.filter(c => c.srs_state === 'new' || (!c.seen && c.repetitions === 0)).length,
    learning: cards.filter(c => c.srs_state === 'learning').length,
    review: cards.filter(c => c.srs_state === 'review').length,
    relearning: cards.filter(c => c.srs_state === 'relearning').length,
    due: dueCards.length,
    seen: cards.filter(c => c.seen).length,
    mature: cards.filter(c => c.interval >= 21).length,
  }

  return { stats, isLoading }
}
