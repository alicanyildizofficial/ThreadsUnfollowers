## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.
## 2026-10-15 - Optimize Search Render by Pre-Sorting and Lowercasing
**Learning:** In threads-unfollowers.js, rendering lists with search runs synchronously on input keystrokes. Performing `list.sort(localeCompare)` and dynamic string `.toLowerCase()` allocations inside the render loop causes `O(N log N)` overhead and excessive GC pressure on each keystroke.
**Action:** Always pre-sort large lists once during initial collection and pre-compute/cache fields used heavily in search conditions (like lowercased usernames) to ensure `O(N)` linear search without overhead.
