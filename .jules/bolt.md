## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-18 - Avoid Sorting and Iterating Arrays on Keypress
**Learning:** In threads-unfollowers.js, synchronous keystroke rendering triggered `.sort()` and intermediate `.filter()` array allocations in `visibleUsers()`, as well as a full $O(N)$ loop in `tabCounts()`. This caused performance jank due to high computation and memory allocation on every keypress.
**Action:** Sort lists *once* after fetching. Combine filters into a single pass to avoid intermediate arrays. Memoize heavy computations like `tabCounts()` using simple dependency keys (like array lengths) to avoid recalculating on keystrokes.
