import { useState, useCallback, useRef } from "react";
import { MODEL_PRICING } from "../config";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function useBudget() {
  const [cost, setCost] = useState(0);
  const costRef = useRef(0);

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
    setCost(costRef.current);
  }, []);

  const resetBudget = useCallback(() => {
    costRef.current = 0;
    setCost(0);
  }, []);

  const hasPricing = useCallback((model: string): boolean => {
    return model in MODEL_PRICING;
  }, []);

  return { cost, addInputCost, addOutputCost, resetBudget, hasPricing };
}
