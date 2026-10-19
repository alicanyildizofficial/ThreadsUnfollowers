## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2023-11-20 - Avoid Sort and String ops on Keystroke
**Learning:** In vanilla UIs lacking a Virtual DOM or React-like memoization, running `Array.prototype.sort()` and repeated `.toLowerCase()` string manipulations on each keystroke for large lists causes main thread blocking and noticeable UI jank.
**Action:** Pre-compute lowercase search strings on data load, and pre-sort lists once when fetched so filters naturally return sorted results.
