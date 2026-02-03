/**
 * Hook for category learning based on transaction descriptions.
 * Uses localStorage to store keyword -> category_id mappings.
 */

const STORAGE_KEY = 'ofx_category_learning';

interface CategoryMapping {
  keyword: string;
  categoryId: string;
}

interface CategoryLearningData {
  mappings: CategoryMapping[];
}

/**
 * Get stored category mappings from localStorage
 */
function getStoredData(): CategoryLearningData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to parse category learning data:', e);
  }
  return { mappings: [] };
}

/**
 * Save category mappings to localStorage
 */
function saveData(data: CategoryLearningData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save category learning data:', e);
  }
}

/**
 * Extract keywords from a description for matching
 * Uses first meaningful word (ignores very short words)
 */
function extractKeywords(description: string): string[] {
  const words = description
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2); // Only words with 3+ chars
  
  // Return first 3 meaningful words for broader matching
  return words.slice(0, 3);
}

/**
 * Normalize description for comparison
 */
function normalizeDescription(description: string): string {
  return description.toLowerCase().trim();
}

/**
 * Hook for category learning functionality
 */
export function useCategoryLearning() {
  /**
   * Learn a category association from a confirmed transaction
   */
  const learnCategory = (description: string, categoryId: string): void => {
    if (!description || !categoryId) return;
    
    const data = getStoredData();
    const normalizedDesc = normalizeDescription(description);
    const keywords = extractKeywords(normalizedDesc);
    
    if (keywords.length === 0) return;
    
    // Use the first meaningful keyword for learning
    const primaryKeyword = keywords[0];
    
    // Check if this keyword already exists
    const existingIndex = data.mappings.findIndex(
      m => m.keyword === primaryKeyword
    );
    
    if (existingIndex >= 0) {
      // Update existing mapping
      data.mappings[existingIndex].categoryId = categoryId;
    } else {
      // Add new mapping (limit to 500 entries to avoid localStorage bloat)
      if (data.mappings.length >= 500) {
        data.mappings.shift(); // Remove oldest entry
      }
      data.mappings.push({ keyword: primaryKeyword, categoryId });
    }
    
    saveData(data);
  };

  /**
   * Suggest a category based on description matching learned patterns
   */
  const suggestCategory = (description: string): string | null => {
    if (!description) return null;
    
    const data = getStoredData();
    if (data.mappings.length === 0) return null;
    
    const normalizedDesc = normalizeDescription(description);
    const keywords = extractKeywords(normalizedDesc);
    
    // Try to find a match for any of the keywords
    for (const keyword of keywords) {
      const match = data.mappings.find(m => m.keyword === keyword);
      if (match) {
        return match.categoryId;
      }
    }
    
    // Also try partial matching on the full description
    for (const mapping of data.mappings) {
      if (normalizedDesc.includes(mapping.keyword)) {
        return mapping.categoryId;
      }
    }
    
    return null;
  };

  /**
   * Suggest categories for multiple transactions at once
   */
  const suggestCategoriesForTransactions = (
    transactions: Array<{ fitid: string; description: string }>
  ): Record<string, string | null> => {
    const suggestions: Record<string, string | null> = {};
    
    for (const transaction of transactions) {
      suggestions[transaction.fitid] = suggestCategory(transaction.description);
    }
    
    return suggestions;
  };

  /**
   * Clear all learned category mappings
   */
  const clearLearning = (): void => {
    localStorage.removeItem(STORAGE_KEY);
  };

  /**
   * Get count of learned mappings
   */
  const getLearningCount = (): number => {
    return getStoredData().mappings.length;
  };

  return {
    learnCategory,
    suggestCategory,
    suggestCategoriesForTransactions,
    clearLearning,
    getLearningCount,
  };
}
