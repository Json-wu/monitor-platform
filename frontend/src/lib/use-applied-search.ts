"use client";

import { useCallback, useRef, useState } from "react";

/** 搜索框草稿与点击「搜索」后生效的关键词 */
export function useAppliedSearch(initialApplied = "") {
  const [searchDraft, setSearchDraft] = useState(initialApplied);
  const [appliedSearch, setAppliedSearch] = useState(initialApplied);
  const [searchToken, setSearchToken] = useState(0);

  const applySearch = useCallback(() => {
    const next = searchDraft.trim();
    setAppliedSearch(next);
    setSearchToken((t) => t + 1);
    return next;
  }, [searchDraft]);

  return {
    searchDraft,
    setSearchDraft,
    appliedSearch,
    searchToken,
    applySearch,
  };
}

/** 仅在点击搜索触发的请求期间为 true */
export function useSearchLoading() {
  const [searchLoading, setSearchLoading] = useState(false);
  const pendingRef = useRef(false);

  const startSearchLoad = useCallback(() => {
    pendingRef.current = true;
    setSearchLoading(true);
  }, []);

  const finishSearchLoad = useCallback(() => {
    if (pendingRef.current) {
      pendingRef.current = false;
      setSearchLoading(false);
    }
  }, []);

  return { searchLoading, startSearchLoad, finishSearchLoad };
}
