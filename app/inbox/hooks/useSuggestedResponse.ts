/**
 * Custom hook for AI suggested responses
 */

import { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../constants';

export function useSuggestedResponse(conversationId: number | null) {
  const [suggestedResponse, setSuggestedResponse] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setSuggestedResponse(null);
      return;
    }

    const fetchSuggestedResponse = async () => {
      try {
        const response = await fetch(`${API_ENDPOINTS.SUGGEST_RESPONSE(conversationId)}?userId=1`);
        const result = await response.json();
        setSuggestedResponse(result.suggestedResponse || null);
      } catch (error) {
        console.error('Error fetching suggested response:', error);
        setSuggestedResponse(null);
      }
    };

    fetchSuggestedResponse();
  }, [conversationId]);

  return suggestedResponse;
}

