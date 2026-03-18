import { useState, useCallback, useRef } from "react";
import { MODEL_PRICING } from "../config";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function useBudget() {
  const [cost, setCost] = useState(0);
  const costRef = useRef(0);
  // Counts addOutputCost calls since the last setCost flush during streaming.
  // We only update the displayed cost every 10 tokens to halve re-render count.
  const pendingOutputTokensRef = useRef(0);

  const addInputCost = useCallback((text: string, model: string) => {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return;
    const tokens = estimateTokens(text);
    const delta = (tokens / 1000) * pricing.input;
    costRef.current += delta;
    setCost(costRef.current);
  }, []);

  const addOutputCost = useCallback((text: string, model: string) => {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return;
    const tokens = estimateTokens(text);
    const delta = (tokens / 1000) * pricing.output;
    costRef.current += delta;
    pendingOutputTokensRef.current++;
    // Flush to state every 10 tokens rather than every single token.
    if (pendingOutputTokensRef.current >= 10) {
      pendingOutputTokensRef.current = 0;
      setCost(costRef.current);
    }
  }, []);

  // Call after streaming ends to ensure the final cost is displayed.
  const flushCost = useCallback(() => {
    pendingOutputTokensRef.current = 0;
    setCost(costRef.current);
  }, []);

  const resetBudget = useCallback(() => {
    costRef.current = 0;
    pendingOutputTokensRef.current = 0;
    setCost(0);
  }, []);

  const hasPricing = useCallback((model: string): boolean => {
    return model in MODEL_PRICING;
  }, []);

  return { cost, addInputCost, addOutputCost, flushCost, resetBudget, hasPricing };
}
